import { Router } from 'express'
import { getPool, query, queryOne } from '../db.js'
import { verifyRefresh } from '../jwt.js'
import { bumpTokenVersion, issueTokensAfterLogin, issueTokensForRefresh } from '../lib/session.js'
import { requireAuth } from '../auth.js'
import {
  defaultUserPrefs,
  mergeUserPrefs,
  normalizeUserPrefs,
  type UserPrefs,
} from '../lib/prefs.js'
import { clientMessage } from '../lib/clientError.js'
import { normalizeUserAsset } from '../cos.js'
import { maskPhone } from '../lib/phone.js'

type PublicUser = {
  id: string
  nickname: string
  avatarUrl: string
  phone: string
  createdAt: string
}

function toPublicUser(row: PublicUser): PublicUser {
  return { ...row, phone: maskPhone(row.phone) }
}

export const authRouter = Router()

let wxMiniAccessTokenCache: { token: string; expiresAt: number } | null = null

// ────────────────────────────────────────────────────────────────
// 微信开放平台 App OAuth（移动应用）
// 前端 uni.login 获取 code → 后端用 code 换 access_token + openid
// ────────────────────────────────────────────────────────────────

async function wxAppCode2Token(code: string): Promise<{ openid: string; unionid?: string; nickname?: string; avatar?: string }> {
  const appid = process.env.WX_APP_ID        // 微信开放平台移动应用 AppID
  const secret = process.env.WX_APP_SECRET   // 微信开放平台移动应用 AppSecret
  if (!appid || !secret) {
    throw new Error('WX_APP_ID / WX_APP_SECRET not configured')
  }

  // Step 1: code 换 access_token
  const tokenUrl =
    `https://api.weixin.qq.com/sns/oauth2/access_token` +
    `?appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}` +
    `&code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`
  const tokenResp = await fetch(tokenUrl)
  const tokenData = (await tokenResp.json()) as {
    access_token?: string
    openid?: string
    unionid?: string
    errcode?: number
    errmsg?: string
  }
  if (!tokenData.access_token || !tokenData.openid) {
    throw new Error(tokenData.errmsg || `wx oauth failed: ${tokenData.errcode}`)
  }

  // Step 2: 获取用户信息（头像、昵称）
  let nickname: string | undefined
  let avatar: string | undefined
  try {
    const infoUrl =
      `https://api.weixin.qq.com/sns/userinfo` +
      `?access_token=${tokenData.access_token}` +
      `&openid=${tokenData.openid}`
    const infoResp = await fetch(infoUrl)
    const infoData = (await infoResp.json()) as {
      nickname?: string
      headimgurl?: string
      unionid?: string
    }
    nickname = infoData.nickname
    avatar = infoData.headimgurl
    // unionid 可能在 userinfo 里才返回
    if (infoData.unionid && !tokenData.unionid) {
      tokenData.unionid = infoData.unionid
    }
  } catch {
    // 获取用户信息失败不阻断登录
  }

  return {
    openid: tokenData.openid,
    unionid: tokenData.unionid,
    nickname,
    avatar,
  }
}

// 小程序登录（兼容保留）
async function wxMiniCode2Session(code: string): Promise<{ openid: string; unionid?: string }> {
  const appid = process.env.WX_APPID
  const secret = process.env.WX_SECRET
  if (!appid || !secret) {
    throw new Error('WX_APPID / WX_SECRET not configured')
  }
  const url =
    `https://api.weixin.qq.com/sns/jscode2session` +
    `?appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`
  const resp = await fetch(url)
  const data = (await resp.json()) as {
    openid?: string
    unionid?: string
    errcode?: number
    errmsg?: string
  }
  if (!data.openid) {
    throw new Error(data.errmsg || `jscode2session failed: ${data.errcode}`)
  }
  return { openid: data.openid, unionid: data.unionid }
}

async function wxMiniAccessToken(): Promise<string> {
  const cached = wxMiniAccessTokenCache
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const appid = process.env.WX_APPID
  const secret = process.env.WX_SECRET
  if (!appid || !secret) throw new Error('WX_APPID / WX_SECRET not configured')

  const url =
    `https://api.weixin.qq.com/cgi-bin/token` +
    `?grant_type=client_credential` +
    `&appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}`
  const resp = await fetch(url)
  const data = (await resp.json()) as {
    access_token?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
  }
  if (!data.access_token) throw new Error(data.errmsg || `wx access_token failed: ${data.errcode}`)
  wxMiniAccessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000,
  }
  return data.access_token
}

async function wxMiniPhoneNumber(code: string): Promise<string> {
  const accessToken = await wxMiniAccessToken()
  const resp = await fetch(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    },
  )
  const data = (await resp.json()) as {
    errcode?: number
    errmsg?: string
    phone_info?: { phoneNumber?: string; purePhoneNumber?: string; countryCode?: string }
  }
  if (data.errcode && data.errcode !== 0) throw new Error(data.errmsg || `getuserphonenumber failed: ${data.errcode}`)
  const raw = String(data.phone_info?.purePhoneNumber || data.phone_info?.phoneNumber || '').trim()
  const phone = raw.replace(/^\+?86/, '').replace(/\D/g, '')
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('微信未返回有效手机号')
  return phone
}

async function bindPhoneToUser(userId: string | number, phone: string) {
  const owner = await queryOne<{ id: string }>(
    `SELECT id FROM t_user WHERE phone = $1 AND id <> $2`,
    [phone, userId],
  )
  if (owner) {
    const error = new Error('该手机号已绑定其他账号') as Error & { status?: number }
    error.status = 409
    throw error
  }
  return queryOne<{
    id: string
    nickname: string
    avatarUrl: string
    phone: string
    createdAt: string
  }>(
    `UPDATE t_user
        SET phone = $2,
            updated_at = now()
      WHERE id = $1
      RETURNING id, nickname, avatar_url AS "avatarUrl", COALESCE(phone, '') AS phone, created_at AS "createdAt"`,
    [userId, phone],
  )
}

// ────────────────────────────────────────────────────────────────
// 短信验证码存储（内存，生产环境建议用 Redis）
// ────────────────────────────────────────────────────────────────

interface SmsCode {
  code: string
  expiresAt: number
  attempts: number
}
const smsStore = new Map<string, SmsCode>()

// 清理过期验证码
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of smsStore) {
    if (val.expiresAt < now) smsStore.delete(key)
  }
}, 60_000)

async function sendSmsCode(phone: string): Promise<void> {
  // 频率限制：60秒内不能重复发送
  const existing = smsStore.get(phone)
  if (existing && existing.expiresAt - 4 * 60 * 1000 > Date.now()) {
    throw new Error('验证码已发送，请60秒后重试')
  }

  const code = String(Math.floor(100000 + Math.random() * 900000)) // 6位数字

  // 腾讯云 SMS 发送
  const smsSdkAppId = process.env.SMS_SDK_APP_ID
  const smsSecretId = process.env.SMS_SECRET_ID
  const smsSecretKey = process.env.SMS_SECRET_KEY
  const smsSignName = process.env.SMS_SIGN_NAME || '有日可记'
  const smsTemplateId = process.env.SMS_TEMPLATE_ID

  if (smsSdkAppId && smsSecretId && smsSecretKey && smsTemplateId) {
    // 调用腾讯云 SMS API
    await sendTencentSms({
      phone,
      code,
      sdkAppId: smsSdkAppId,
      secretId: smsSecretId,
      secretKey: smsSecretKey,
      signName: smsSignName,
      templateId: smsTemplateId,
    })
  } else {
    // 开发模式：打印到控制台
    console.log(`[sms:dev] phone=${phone} code=${code}`)
  }

  smsStore.set(phone, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5分钟有效
    attempts: 0,
  })
}

function verifySmsCode(phone: string, code: string): boolean {
  const record = smsStore.get(phone)
  if (!record) return false
  if (record.expiresAt < Date.now()) {
    smsStore.delete(phone)
    return false
  }
  record.attempts++
  if (record.attempts > 5) {
    smsStore.delete(phone)
    return false
  }
  if (record.code !== code) return false
  smsStore.delete(phone)
  return true
}

// 腾讯云 SMS 发送实现
async function sendTencentSms(opts: {
  phone: string
  code: string
  sdkAppId: string
  secretId: string
  secretKey: string
  signName: string
  templateId: string
}) {
  const { createHmac, createHash } = await import('node:crypto')

  const host = 'sms.tencentcloudapi.com'
  const service = 'sms'
  const action = 'SendSms'
  const version = '2021-01-11'
  const region = 'ap-guangzhou'

  const phoneNumber = opts.phone.startsWith('+') ? opts.phone : `+86${opts.phone}`
  const payload = JSON.stringify({
    SmsSdkAppId: opts.sdkAppId,
    SignName: opts.signName,
    TemplateId: opts.templateId,
    PhoneNumberSet: [phoneNumber],
    TemplateParamSet: [opts.code, '5'], // 验证码, 有效分钟数
  })

  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const hashedPayload = createHash('sha256').update(payload).digest('hex')
  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:application/json\nhost:${host}\n`,
    'content-type;host',
    hashedPayload,
  ].join('\n')

  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')

  const secretDate = createHmac('sha256', `TC3${opts.secretKey}`).update(date).digest()
  const secretService = createHmac('sha256', secretDate).update(service).digest()
  const secretSigning = createHmac('sha256', secretService).update('tc3_request').digest()
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  const authorization =
    `TC3-HMAC-SHA256 Credential=${opts.secretId}/${credentialScope}, ` +
    `SignedHeaders=content-type;host, Signature=${signature}`

  const resp = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': host,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': region,
      'Authorization': authorization,
    },
    body: payload,
  })

  const result = (await resp.json()) as any
  if (result?.Response?.Error) {
    throw new Error(`SMS send failed: ${result.Response.Error.Code} - ${result.Response.Error.Message}`)
  }
}

// ────────────────────────────────────────────────────────────────
// 用户 upsert
// ────────────────────────────────────────────────────────────────

async function upsertWechatUser(
  provider: 'wechat_mp' | 'wechat_app',
  openid: string,
  unionid?: string,
  nickname?: string,
  avatar?: string,
) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    // 相同 unionid 的多端首次登录串行处理，避免 App 与小程序并发创建两个用户。
    if (unionid) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [unionid])
    }

    let userId: string | undefined

    const identity = await client.query<{ user_id: string }>(
      `SELECT user_id FROM t_user_identity WHERE provider = $1 AND subject = $2`,
      [provider, openid],
    )
    userId = identity.rows[0]?.user_id

    // 兼容升级前仅保存在 t_user.openid 的小程序账号。
    if (!userId) {
      const legacy = await client.query<{ id: string }>(
        `SELECT id FROM t_user WHERE openid = $1`,
        [openid],
      )
      userId = legacy.rows[0]?.id
    }

    // App 与小程序 openid 不同，使用同一开放平台提供的 unionid 找回原用户。
    if (!userId && unionid) {
      const unionOwner = await client.query<{ user_id: string }>(
        `SELECT user_id FROM t_wechat_union WHERE union_id = $1`,
        [unionid],
      )
      userId = unionOwner.rows[0]?.user_id
    }

    if (!userId && unionid) {
      const legacyUnion = await client.query<{ id: string }>(
        `SELECT id FROM t_user WHERE union_id = $1 ORDER BY id ASC LIMIT 1`,
        [unionid],
      )
      userId = legacyUnion.rows[0]?.id
    }

    if (!userId) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO t_user (openid, union_id, nickname, avatar_url)
         VALUES ($1, $2::text, COALESCE(NULLIF(btrim($3::text), ''), '微信用户'), COALESCE($4::text, ''))
         ON CONFLICT (openid) DO UPDATE SET updated_at = now()
         RETURNING id`,
        [openid, unionid || null, nickname || null, avatar || null],
      )
      userId = created.rows[0].id
    }

    if (unionid) {
      const userBeforeUnionBinding = userId
      const unionOwner = await client.query<{ user_id: string }>(
        `INSERT INTO t_wechat_union (union_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (union_id) DO UPDATE SET updated_at = now()
         RETURNING user_id`,
        [unionid, userId],
      )
      // 已有映射永远优先，不能把 UnionID 从一个用户静默转移给另一个用户。
      const mappedUserId = unionOwner.rows[0].user_id
      if (userBeforeUnionBinding && mappedUserId !== userBeforeUnionBinding) {
        throw new Error('检测到历史账号数据冲突，请联系管理员完成账号合并')
      }
      userId = mappedUserId
    }

    await client.query(
      `INSERT INTO t_user_identity (user_id, provider, subject, union_id)
       VALUES ($1, $2, $3, $4::text)
       ON CONFLICT (provider, subject) DO UPDATE
          SET union_id = COALESCE(EXCLUDED.union_id, t_user_identity.union_id),
              updated_at = now()`,
      [userId, provider, openid, unionid || null],
    )

    // 显式 ::text，避免 nickname/avatar 为 null 时 PG 无法推断参数类型。
    await client.query(
      `UPDATE t_user SET
         union_id = COALESCE($2::text, union_id),
         nickname = CASE
           WHEN $3::text IS NOT NULL AND btrim($3::text) <> '' THEN btrim($3::text)
           ELSE nickname
         END,
         avatar_url = CASE
           WHEN $4::text IS NOT NULL AND btrim($4::text) <> '' THEN btrim($4::text)
           ELSE avatar_url
         END,
         updated_at = now()
       WHERE id = $1`,
      [userId, unionid || null, nickname || null, avatar || null],
    )

    await client.query('COMMIT')
    return Number(userId)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function upsertUserByPhone(phone: string) {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM t_user WHERE phone = $1`,
    [phone],
  )
  if (existing) {
    await queryOne(
      `UPDATE t_user SET updated_at = now() WHERE id = $1 RETURNING id`,
      [existing.id],
    )
    return Number(existing.id)
  }
  const row = await queryOne<{ id: string }>(
    `INSERT INTO t_user (openid, phone, nickname) VALUES ($1, $2, '手机用户') RETURNING id`,
    [`phone_${phone}`, phone],
  )
  return Number(row!.id)
}

async function readUserPrefs(userId: number | string): Promise<UserPrefs> {
  const row = await queryOne<{ prefs: unknown }>(
    `SELECT COALESCE(prefs, '{}'::jsonb) AS prefs FROM t_user WHERE id = $1`,
    [userId],
  )
  if (!row) return defaultUserPrefs()
  return normalizeUserPrefs(row.prefs)
}

// ────────────────────────────────────────────────────────────────
// 路由
// ────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/wx-login
 * body: { code, platform?: 'app' | 'mp' }
 * - platform=app → 微信开放平台 OAuth（移动应用，需 WX_APP_ID / WX_APP_SECRET）
 * - platform=mp  → 微信小程序 jscode2session（需 WX_APPID / WX_SECRET）
 * - 默认 mp（当前主端是小程序）
 */
authRouter.post('/wx-login', async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim()
    if (!code) return res.status(400).json({ code: 400, msg: 'code required' })

    const platform = String(req.body?.platform || 'mp').toLowerCase() === 'app' ? 'app' : 'mp'

    let openid: string
    let unionid: string | undefined
    let nickname: string | undefined
    let avatar: string | undefined

    if (platform === 'mp') {
      // 小程序登录
      const session = await wxMiniCode2Session(code)
      openid = session.openid
      unionid = session.unionid
    } else {
      // App 微信登录
      const result = await wxAppCode2Token(code)
      openid = result.openid
      unionid = result.unionid
      nickname = result.nickname
      avatar = result.avatar
    }

    const provider = platform === 'app' ? 'wechat_app' : 'wechat_mp'
    const uid = await upsertWechatUser(provider, openid, unionid, nickname, avatar)
    // 登录只签发新 token，不踢掉手机/开发者工具等其他已登录端。
    const tokens = await issueTokensAfterLogin(uid)
    return res.json({
      code: 0,
      data: tokens,
    })
  } catch (e: any) {
    console.error('[auth/wx-login]', e)
    const raw = String(e?.message || 'login failed')
    const msg = /WX_APP_ID|WX_APP_SECRET/.test(raw)
      ? 'App 微信登录未配置，请使用小程序登录或联系管理员'
      : /WX_APPID|WX_SECRET/.test(raw)
        ? '小程序微信登录未配置，请联系管理员'
        : raw
    return res.status(500).json({ code: 500, msg })
  }
})

/**
 * POST /api/auth/dev-login
 * body: { phone? }
 *
 * 开发者一键登录：仅用于本地/测试环境联调（小程序开发者工具里 wx.login 常因 AppID
 * 权限不匹配而失败，短信通道又未配齐，没有这个入口就完全登不进去）。
 *
 * 三重门禁，任何一条不满足都当作路由不存在（404，不回显任何线索）：
 *   1. NODE_ENV !== 'production'
 *   2. ALLOW_DEV_LOGIN === '1'
 *   3. phone 命中测试号白名单 DEV_LOGIN_PHONES
 * 这样即使生产误带 ALLOW_DEV_LOGIN，也无法借此登录任意账号。
 */
const DEV_LOGIN_PHONES = ['13900000001', '13900000002'] as const
const DEV_LOGIN_DEFAULT_PHONE = DEV_LOGIN_PHONES[0]

function devLoginEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOGIN === '1'
}

authRouter.post('/dev-login', async (req, res) => {
  if (!devLoginEnabled()) {
    return res.status(404).json({ code: 404, msg: 'not found' })
  }
  try {
    const raw = String(req.body?.phone || '').trim()
    const phone = raw || DEV_LOGIN_DEFAULT_PHONE
    if (!(DEV_LOGIN_PHONES as readonly string[]).includes(phone)) {
      // 白名单外的号码一律按路由不存在处理，避免被当成任意账号登录接口
      return res.status(404).json({ code: 404, msg: 'not found' })
    }
    const uid = await upsertUserByPhone(phone)
    const tokens = await issueTokensAfterLogin(uid)
    console.warn(`[auth/dev-login] 开发者登录已使用 phone=${phone} userId=${uid}`)
    return res.json({
      code: 0,
      data: tokens,
    })
  } catch (e: any) {
    console.error('[auth/dev-login]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'login failed') })
  }
})

/**
 * GET /api/auth/dev-login
 * 前端用来判断是否展示「开发者登录」按钮；关闭时同样 404。
 */
authRouter.get('/dev-login', (_req, res) => {
  if (!devLoginEnabled()) {
    return res.status(404).json({ code: 404, msg: 'not found' })
  }
  return res.json({ code: 0, data: { phones: DEV_LOGIN_PHONES } })
})

/**
 * POST /api/auth/sms-send
 * body: { phone }
 * 发送短信验证码
 */
authRouter.post('/sms-send', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim()
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ code: 400, msg: '请输入正确的手机号' })
    }
    await sendSmsCode(phone)
    return res.json({ code: 0, msg: '验证码已发送' })
  } catch (e: any) {
    console.error('[auth/sms-send]', e)
    return res.status(400).json({ code: 400, msg: clientMessage(e, '发送失败') })
  }
})

/**
 * POST /api/auth/sms-login
 * body: { phone, code }
 * 手机号验证码登录
 */
authRouter.post('/sms-login', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim()
    const code = String(req.body?.code || '').trim()
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ code: 400, msg: '请输入正确的手机号' })
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ code: 400, msg: '请输入6位验证码' })
    }

    if (!verifySmsCode(phone, code)) {
      return res.status(400).json({ code: 400, msg: '验证码错误或已过期' })
    }

    // 写库失败必须让本次登录失败，绝不能回落到固定用户，否则会造成账号串号和数据越权。
    const uid = await upsertUserByPhone(phone)
    const tokens = await issueTokensAfterLogin(uid)
    return res.json({
      code: 0,
      data: tokens,
    })
  } catch (e: any) {
    console.error('[auth/sms-login]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'login failed') })
  }
})

authRouter.post('/refresh', async (req, res) => {
  try {
    const token = String(req.body?.refreshToken || '').trim()
    if (!token) return res.status(400).json({ code: 400, msg: 'refreshToken required' })
    const payload = verifyRefresh(token)
    const uid = Number(payload.uid)
    if (!Number.isFinite(uid)) return res.status(401).json({ code: 401, msg: 'invalid refresh token' })
    const tokens = await issueTokensForRefresh(uid, payload.ver)
    return res.json({ code: 0, data: tokens })
  } catch (e: any) {
    return res.status(401).json({ code: 401, msg: 'invalid refresh token' })
  }
})

/**
 * POST /api/auth/logout
 * 递增 token_version，服务端作废该用户全部未过期 JWT（含已泄漏的扫描复用 token）。
 */
authRouter.post('/logout', requireAuth, async (req, res) => {
  try {
    await bumpTokenVersion(Number(req.userId))
    return res.json({ code: 0, data: { ok: true } })
  } catch (e: any) {
    console.error('[auth/logout]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'logout failed') })
  }
})

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const row = await queryOne<{
      id: string
      nickname: string
      avatarUrl: string
      phone: string
      createdAt: string
    }>(
      `SELECT id, nickname, avatar_url AS "avatarUrl", COALESCE(phone, '') AS phone, created_at AS "createdAt"
       FROM t_user WHERE id = $1`,
      [req.userId],
    )
    if (!row) return res.status(404).json({ code: 404, msg: 'user not found' })
    if (!row.nickname || !String(row.nickname).trim()) {
      row.nickname = '微信用户'
    }
    return res.json({ code: 0, data: toPublicUser(row) })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * POST /api/auth/bind-phone
 * body: { code }
 * 小程序手机号授权：前端 button open-type="getPhoneNumber" 拿到 code 后提交。
 */
authRouter.post('/bind-phone', requireAuth, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim()
    if (!code) return res.status(400).json({ code: 400, msg: '手机号授权已失效，请重新授权' })
    const phone = await wxMiniPhoneNumber(code)
    const row = await bindPhoneToUser(req.userId!, phone)
    if (!row) return res.status(404).json({ code: 404, msg: 'user not found' })
    return res.json({ code: 0, data: toPublicUser(row) })
  } catch (e: any) {
    console.error('[auth/bind-phone]', e)
    const status = Number(e?.status) || 500
    const fallback = status === 409 ? '该手机号已绑定其他账号' : '手机号绑定失败'
    return res.status(status).json({ code: status, msg: clientMessage(e, fallback) })
  }
})

authRouter.patch('/me', requireAuth, async (req, res) => {
  try {
    let nickname: string | undefined
    if (req.body?.nickname != null) {
      const n = String(req.body.nickname).trim().slice(0, 64)
      nickname = n || '微信用户'
    }
    const avatarUrl = req.body?.avatarUrl != null
      ? normalizeUserAsset(req.body.avatarUrl, req.userId!, ['avatar'])
      : undefined
    if (avatarUrl == null) {
      return res.status(400).json({ code: 400, msg: '头像地址不合法' })
    }
    const row = await queryOne(
      `UPDATE t_user SET
         nickname = COALESCE($2, nickname),
         avatar_url = COALESCE($3, avatar_url),
         updated_at = now()
       WHERE id = $1
       RETURNING id, nickname, avatar_url AS "avatarUrl", COALESCE(phone, '') AS phone, created_at AS "createdAt"`,
      [req.userId, nickname ?? null, avatarUrl ?? null],
    )
    // 圈子页读的是成员快照；改资料后必须同步，否则别人仍看到加入时的空头像。
    await query(
      `UPDATE t_space_member SET
         nickname = COALESCE($2, nickname),
         avatar_url = COALESCE($3, avatar_url),
         updated_at = now()
       WHERE user_id = $1`,
      [req.userId, nickname ?? null, avatarUrl ?? null],
    )
    return res.json({ code: 0, data: row ? toPublicUser(row as PublicUser) : row })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/** 读取登录用户偏好（全年节日等） */
authRouter.get('/prefs', requireAuth, async (req, res) => {
  try {
    const prefs = await readUserPrefs(req.userId!)
    return res.json({ code: 0, data: prefs })
  } catch (e: any) {
    console.error('[auth/prefs:get]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/** 部分更新偏好；未传字段保持原值 */
authRouter.put('/prefs', requireAuth, async (req, res) => {
  try {
    const current = await readUserPrefs(req.userId!)
    const next = mergeUserPrefs(current, req.body || {})
    const row = await queryOne<{ prefs: unknown }>(
      `UPDATE t_user
          SET prefs = $2::jsonb,
              updated_at = now()
        WHERE id = $1
        RETURNING COALESCE(prefs, '{}'::jsonb) AS prefs`,
      [req.userId, JSON.stringify(next)],
    )
    if (!row) return res.status(404).json({ code: 404, msg: 'user not found' })
    return res.json({ code: 0, data: normalizeUserPrefs(row.prefs) })
  } catch (e: any) {
    console.error('[auth/prefs:put]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})
