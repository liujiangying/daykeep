const DAY_MS = 24 * 60 * 60 * 1000

function parseDateKey(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return { year, month, day }
}

/**
 * 洞察里的日期不能复用时间轴“过期后滚到下一年”的宽松口径：
 * 只有明确重复的日子才按周年计算，一次性约定过期后必须返回负数。
 */
export function insightDaysUntil(
  eventDate: string,
  recurring: boolean,
  repeatRule: string,
  todayKey: string,
) {
  const event = parseDateKey(eventDate)
  const today = parseDateKey(todayKey)
  if (!event || !today) return Number.NaN
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day)
  const repeats = recurring || repeatRule !== 'none'
  let targetUtc = repeats
    ? Date.UTC(today.year, event.month - 1, event.day)
    : Date.UTC(event.year, event.month - 1, event.day)
  if (repeats && targetUtc < todayUtc) targetUtc = Date.UTC(today.year + 1, event.month - 1, event.day)
  return Math.round((targetUtc - todayUtc) / DAY_MS)
}

export function isInsightDateActionable(
  eventDate: string,
  recurring: boolean,
  repeatRule: string,
  todayKey: string,
  horizonDays = 14,
) {
  const days = insightDaysUntil(eventDate, recurring, repeatRule, todayKey)
  return Number.isFinite(days) && days >= 0 && days <= horizonDays
}
