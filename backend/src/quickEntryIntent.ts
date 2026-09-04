export type QuickEntryType = 'anniversary' | 'todo' | 'diary'

/**
 * 用户明确说出的记录类型拥有最高优先级。
 * “提醒、通知、别忘了”等词只描述提醒需求，不能据此把日期改判为待办。
 */
export function resolveQuickEntryType(
  modelType: unknown,
  sourceText: string,
): QuickEntryType {
  const text = String(sourceText || '').replace(/\s+/g, '')

  const explicitlyRequestsDate =
    /(?:记录|记下|记|添加|新增|新建|保存)(?:一?个|这?个|一?条)?(?:重要)?(?:日期|日子|纪念日)/.test(text)
  if (explicitlyRequestsDate) return 'anniversary'

  const explicitlyRequestsTodo =
    /(?:记录|记下|记|添加|新增|新建|保存)(?:一?个|这?个|一?条)?(?:待办|任务)/.test(text)
  if (explicitlyRequestsTodo) return 'todo'

  // 即使用户同时要求提醒，生日等日期事实仍然属于重要日子。
  if (/(?:生日|纪念日|周年|倒数日|节日)/.test(text)) return 'anniversary'

  return modelType === 'anniversary' || modelType === 'todo' || modelType === 'diary'
    ? modelType
    : 'diary'
}
