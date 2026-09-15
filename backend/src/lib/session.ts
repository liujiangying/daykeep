import { queryOne } from '../db.js'
import { signAccess, signRefresh } from '../jwt.js'

export async function readTokenVersion(userId: number): Promise<number | null> {
  const row = await queryOne<{ tokenVersion: string }>(
    `SELECT token_version::text AS "tokenVersion" FROM t_user WHERE id = $1`,
    [userId],
  )
  if (!row) return null
  const ver = Number(row.tokenVersion)
  return Number.isFinite(ver) ? ver : null
}

/** 登录/登出时递增，使已泄漏的 access/refresh 立刻全部失效 */
export async function bumpTokenVersion(userId: number): Promise<number> {
  const row = await queryOne<{ tokenVersion: string }>(
    `UPDATE t_user
        SET token_version = token_version + 1, updated_at = now()
      WHERE id = $1
      RETURNING token_version::text AS "tokenVersion"`,
    [userId],
  )
  if (!row) throw new Error('user not found')
  return Number(row.tokenVersion)
}

export async function assertTokenVersion(userId: number, ver: number): Promise<void> {
  const current = await readTokenVersion(userId)
  if (current == null || current !== ver) {
    throw new Error('token revoked')
  }
}

/**
 * 登录成功：使用当前 version 签发 token，允许手机、开发者工具等多端同时登录。
 * 只有用户主动退出时才通过 bumpTokenVersion 作废所有旧会话。
 */
export async function issueTokensAfterLogin(userId: number) {
  const ver = await readTokenVersion(userId)
  if (ver == null) throw new Error('user not found')
  return {
    userId,
    accessToken: signAccess(userId, ver),
    refreshToken: signRefresh(userId, ver),
  }
}

/** refresh：version 必须仍有效，续期时不递增（避免正常使用被踢） */
export async function issueTokensForRefresh(userId: number, ver: number) {
  await assertTokenVersion(userId, ver)
  return {
    userId,
    accessToken: signAccess(userId, ver),
    refreshToken: signRefresh(userId, ver),
  }
}
