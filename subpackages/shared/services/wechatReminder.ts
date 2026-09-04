export const WX_REMINDER_TEMPLATE_ID =
  '0zdo_07WIQpOPDcIXpeAg7mNiiPm6sIm1fWc754GuBc'

export type WeChatSubscribeResult = 'accepted' | 'rejected' | 'unsupported'

/** 必须在用户点击的同步事件链中直接调用（不要先 await 其它异步）。 */
export async function requestWechatReminderSubscription(): Promise<WeChatSubscribeResult> {
  // #ifdef MP-WEIXIN
  try {
    const result = await new Promise<Record<string, string>>((resolve, reject) => {
      ;(uni as any).requestSubscribeMessage({
        tmplIds: [WX_REMINDER_TEMPLATE_ID],
        success: resolve,
        fail: reject,
      })
    })
    return result[WX_REMINDER_TEMPLATE_ID] === 'accept' ? 'accepted' : 'rejected'
  } catch (error: any) {
    const message = String(error?.errMsg || error?.message || error || '')
    if (/cancel|reject|拒绝|取消/i.test(message)) return 'rejected'
    // 开发者工具、未配置模板、主开关关闭等：不当成硬错误抛出
    if (
      /not supported|不支持|开发者工具|tmplIds|template|20004|10001|10002|10005/i.test(
        message,
      )
    ) {
      return 'unsupported'
    }
    console.warn('[wechatReminder] subscribe failed', message)
    return 'unsupported'
  }
  // #endif

  // #ifndef MP-WEIXIN
  return 'unsupported'
  // #endif
}
