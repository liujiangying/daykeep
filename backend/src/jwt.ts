import jwt from 'jsonwebtoken'

function secret() {
  const value = process.env.JWT_SECRET
  if (!value || value.length < 32) {
    throw new Error('JWT_SECRET must be set and >= 32 chars')
  }
  return value
}

export interface TokenPayload {
  uid: string
  /** 与 t_user.token_version 对齐；登录/登出递增后旧 token 全部失效 */
  ver: number
}

/** access 短命：即使泄漏，窗口也远小于原来的 7 天 */
export function signAccess(uid: string | number, ver: number, expiresIn = '2h'): string {
  return jwt.sign(
    { uid: String(uid), ver: Number(ver) },
    secret(),
    { expiresIn } as jwt.SignOptions,
  )
}

export function signRefresh(uid: string | number, ver: number, expiresIn = '14d'): string {
  return jwt.sign(
    { uid: String(uid), ver: Number(ver), typ: 'refresh' },
    secret(),
    { expiresIn } as jwt.SignOptions,
  )
}

export function verifyAccess(token: string): TokenPayload {
  const payload = jwt.verify(token, secret()) as TokenPayload & { typ?: string }
  if (payload.typ === 'refresh') throw new Error('refresh token not allowed')
  const ver = Number(payload.ver)
  if (!Number.isFinite(ver) || ver < 1) throw new Error('missing token version')
  return { uid: String(payload.uid), ver }
}

export function verifyRefresh(token: string): TokenPayload {
  const payload = jwt.verify(token, secret()) as TokenPayload & { typ?: string }
  if (payload.typ !== 'refresh') throw new Error('not a refresh token')
  const ver = Number(payload.ver)
  if (!Number.isFinite(ver) || ver < 1) throw new Error('missing token version')
  return { uid: String(payload.uid), ver }
}
