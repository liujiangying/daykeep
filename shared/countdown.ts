import { daysUntilLunarYearly } from './lunar.js'

export type RepeatRule = 'none' | 'weekly' | 'monthly' | 'yearly'

export function normalizeRepeatRule(input: {
  repeatRule?: string | null
  recurring?: boolean | null
}): RepeatRule {
  const r = String(input.repeatRule || '')
  if (r === 'none' || r === 'weekly' || r === 'monthly' || r === 'yearly') return r
  return input.recurring ? 'yearly' : 'none'
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function fmt(d: Date) {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function dayDiff(target: Date, start: Date) {
  return Math.round((target.getTime() - start.getTime()) / 86400000)
}

/** 当月指定日；若无该日则落到月末 */
function dateInMonth(year: number, monthIndex: number, day: number) {
  const last = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(day, last))
}

/**
 * 距离「下一次发生」的天数。
 * none：相对原始日期（可为负）；其余规则始终落到今天或之后。
 * calendar=lunar 且 yearly 时按农历月日找下一次。
 */
export function daysUntil(
  eventDate: string,
  repeatRule: RepeatRule | boolean = 'none',
  today = new Date(),
  calendar: 'solar' | 'lunar' = 'solar',
): number {
  const rule =
    typeof repeatRule === 'boolean'
      ? repeatRule
        ? 'yearly'
        : 'none'
      : repeatRule

  if (rule === 'yearly' && calendar === 'lunar') {
    return daysUntilLunarYearly(eventDate, today)
  }

  const [y, m, d] = eventDate.slice(0, 10).split('-').map(Number)
  const start = startOfDay(today)
  let target = new Date(y, m - 1, d)

  if (rule === 'none') {
    return dayDiff(target, start)
  }

  if (rule === 'yearly') {
    target = dateInMonth(start.getFullYear(), m - 1, d)
    if (target < start) target = dateInMonth(start.getFullYear() + 1, m - 1, d)
    return dayDiff(target, start)
  }

  if (rule === 'monthly') {
    target = dateInMonth(start.getFullYear(), start.getMonth(), d)
    if (target < start) {
      target = dateInMonth(start.getFullYear(), start.getMonth() + 1, d)
    }
    return dayDiff(target, start)
  }

  // weekly：下一个同星期几（含今天）
  const weekday = new Date(y, m - 1, d).getDay()
  target = new Date(start)
  const add = (weekday - target.getDay() + 7) % 7
  target.setDate(target.getDate() + add)
  return dayDiff(target, start)
}

/** 完成重复待办后，滚到严格晚于 from 的下一次日期 */
export function advanceEventDate(
  eventDate: string,
  repeatRule: RepeatRule,
  from = new Date(),
): string {
  if (repeatRule === 'none') return eventDate.slice(0, 10)
  const [y, m, d] = eventDate.slice(0, 10).split('-').map(Number)
  const start = startOfDay(from)
  // 从明天起找下一次
  const tomorrow = new Date(start)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (repeatRule === 'yearly') {
    let target = dateInMonth(tomorrow.getFullYear(), m - 1, d)
    if (target < tomorrow) target = dateInMonth(tomorrow.getFullYear() + 1, m - 1, d)
    return fmt(target)
  }

  if (repeatRule === 'monthly') {
    let target = dateInMonth(tomorrow.getFullYear(), tomorrow.getMonth(), d)
    if (target < tomorrow) {
      target = dateInMonth(tomorrow.getFullYear(), tomorrow.getMonth() + 1, d)
    }
    return fmt(target)
  }

  // weekly
  const weekday = new Date(y, m - 1, d).getDay()
  const target = new Date(tomorrow)
  const add = (weekday - target.getDay() + 7) % 7
  target.setDate(target.getDate() + add)
  return fmt(target)
}

export function formatCountdownLabel(title: string, days: number): string {
  if (days === 0) return `今天是${title}`
  if (days > 0) return `距离${title}还有${days}日`
  return `${title}已过去${Math.abs(days)}日`
}

export function repeatRuleLabel(rule: RepeatRule): string {
  if (rule === 'weekly') return '每周'
  if (rule === 'monthly') return '每月'
  if (rule === 'yearly') return '每年'
  return ''
}
