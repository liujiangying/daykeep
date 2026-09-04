import { Router } from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { clientMessage } from '../lib/clientError.js'

/**
 * 时间胶囊已并入随手记（t_entry.capsule_*）。
 * 本路由仅保留本地通知用的 pending-unlock，查询 t_entry。
 */
export const capsuleRouter = Router()
capsuleRouter.use(requireAuth)

/**
 * GET /api/capsules/pending-unlock
 * 获取即将解锁的胶囊（供前端注册本地通知）
 */
capsuleRouter.get('/pending-unlock', async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, title, capsule_unlock_at AS "unlockAt"
         FROM t_entry
        WHERE user_id = $1
          AND deleted = FALSE
          AND capsule_unlock_at IS NOT NULL
          AND COALESCE(capsule_unlock_mode, 'scheduled') <> 'random'
          AND capsule_unlocked = FALSE
          AND capsule_unlock_at > now()
          AND capsule_unlock_at <= now() + interval '30 days'
        ORDER BY capsule_unlock_at ASC`,
      [req.userId],
    )
    return res.json({ code: 0, data: rows })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})
