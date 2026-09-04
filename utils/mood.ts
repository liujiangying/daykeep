import type { MoodDay } from '@/services/spaces'

export function normalizeMoodDate(value = '') {
  return String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || ''
}

/** 产品日界线统一使用北京时间，不跟随设备或开发者工具的本地时区。 */
export function shanghaiDateKey(now: number | Date = Date.now()) {
  const timestamp = now instanceof Date ? now.getTime() : now
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function normalizeMoodWeek(days: MoodDay[]) {
  const byDate = new Map<string, MoodDay>()
  for (const day of days) {
    const date = normalizeMoodDate(day.date)
    if (date) byDate.set(date, { date, mood: day.mood })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-7)
}
