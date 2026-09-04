const lastSentAt = new Map<string, number>()
const ALERT_THROTTLE_MS = 10 * 60_000

/** 可选企业微信群机器人告警；失败不反向影响业务进程。 */
export async function notifyOperationalAlert(key: string, title: string, detail: unknown) {
  const webhook = String(process.env.ALERT_WEBHOOK_URL || '').trim()
  if (!webhook) return
  const now = Date.now()
  if (now - (lastSentAt.get(key) || 0) < ALERT_THROTTLE_MS) return
  lastSentAt.set(key, now)
  const environment = String(process.env.NODE_ENV || 'unknown')
  const message = detail instanceof Error ? detail.message : String(detail || 'unknown error')
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: {
          content: `[在乎告警] ${title}\n环境：${environment}\n详情：${message.slice(0, 500)}`,
        },
      }),
    })
  } catch (error) {
    console.warn('[alert] webhook notification failed', error)
  }
}
