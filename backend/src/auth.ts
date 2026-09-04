import type { Request, Response, NextFunction } from 'express'
import { verifyAccess } from './jwt.js'
import { assertTokenVersion } from './lib/session.js'

declare global {
  namespace Express {
    interface Request {
      userId?: number
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.header('authorization') || req.header('Authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  if (!m) {
    return res.status(401).json({ code: 401, msg: 'missing bearer token' })
  }
  void (async () => {
    try {
      const payload = verifyAccess(m[1])
      const uid = Number(payload.uid)
      if (!Number.isFinite(uid)) {
        return res.status(401).json({ code: 401, msg: 'invalid uid' })
      }
      await assertTokenVersion(uid, payload.ver)
      req.userId = uid
      next()
    } catch {
      // 不回 detail：过期、签名不符、已被登出作废，对客户端都是未登录。
      return res.status(401).json({ code: 401, msg: 'invalid token' })
    }
  })()
}

/**
 * 官网反馈允许匿名提交；小程序已登录时尽量关联用户，令后续排查更准确。
 * Token 无效不阻断匿名反馈，避免用户因登录状态过期无法报告问题。
 */
export function attachOptionalAuth(req: Request) {
  const auth = req.header('authorization') || req.header('Authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  if (!m) return
  try {
    const payload = verifyAccess(m[1])
    const uid = Number(payload.uid)
    if (!Number.isFinite(uid)) return
    // 可选鉴权不做 DB version 校验，避免反馈接口被会话抖动拖垮；
    // 写操作仍走 requireAuth 的严格校验。
    req.userId = uid
  } catch {
    /* anonymous feedback */
  }
}
