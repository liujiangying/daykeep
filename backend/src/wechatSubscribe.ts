const DEFAULT_TEMPLATE_ID = '0zdo_07WIQpOPDcIXpeAg7mNiiPm6sIm1fWc754GuBc'

type TokenCache = {
  value: string
  expiresAt: number
}

let tokenCache: TokenCache | null = null

function config() {
  const appid = process.env.WX_APPID || ''
  const secret = process.env.WX_SECRET || ''
  const templateId = process.env.WX_SUBSCRIBE_TEMPLATE_ID || DEFAULT_TEMPLATE_ID
  if (!appid || !secret || !templateId) {
    throw new Error('WX_APPID / WX_SECRET / WX_SUBSCRIBE_TEMPLATE_ID not configured')
  }
  return { appid, secret, templateId }
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 5 * 60_000) {
    return tokenCache.value
  }

  const { appid, secret } = config()
  const response = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credential',
      appid,
      secret,
      force_refresh: false,
    }),
  })
  const data = (await response.json()) as {
    access_token?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
  }
  if (!data.access_token) {
    throw new Error(`WeChat access token failed: ${data.errcode || ''} ${data.errmsg || ''}`.trim())
  }

  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(300, Number(data.expires_in) || 7200) * 1000,
  }
  return data.access_token
}

function truncate(value: string, max: number) {
  return Array.from(value.trim()).slice(0, max).join('')
}

export type SubscribeMessageInput = {
  openid: string
  entryId: string
  title: string
  eventDate: string
  daysRemaining: number
  reminderText: string
}

export class WeChatSubscribeError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

/** 发送「日程提醒」一次性订阅消息。关键词 ID 来自微信模板详情接口。 */
export async function sendScheduleSubscribeMessage(input: SubscribeMessageInput) {
  const token = await getAccessToken()
  const { templateId } = config()
  const response = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: input.openid,
        template_id: templateId,
        page: `pages/notes/edit?id=${encodeURIComponent(input.entryId)}`,
        miniprogram_state: process.env.WX_MINIPROGRAM_STATE || 'formal',
        lang: 'zh_CN',
        data: {
          thing5: { value: truncate(input.title || '日程提醒', 20) },
          date4: { value: input.eventDate.slice(0, 10) },
          number42: { value: String(Math.max(0, Math.trunc(input.daysRemaining))) },
          thing2: { value: truncate(input.reminderText || '请及时查看日程安排', 20) },
        },
      }),
    },
  )
  const data = (await response.json()) as {
    errcode?: number
    errmsg?: string
    msgid?: number
  }
  if (Number(data.errcode || 0) !== 0) {
    // token 非法时清缓存，让后续重试重新获取。
    if (data.errcode === 40001 || data.errcode === 40014 || data.errcode === 42001) {
      tokenCache = null
    }
    throw new WeChatSubscribeError(
      Number(data.errcode || -1),
      data.errmsg || 'subscribe message failed',
    )
  }
  return { msgid: data.msgid }
}
