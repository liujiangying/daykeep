/**
 * 农历工具：基于 lunar-javascript
 * 存储仍用公历 YYYY-MM-DD；calendar=lunar 表示按农历语义展示/年重复
 */
import { Solar, Lunar, LunarYear } from 'lunar-javascript'

const DAY_CN = [
  '',
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十',
]

export const LUNAR_YEAR_START = 1901
export const LUNAR_YEAR_END = 2100

export type LunarMonthOpt = { month: number; label: string; days: number }

function pad(n: number) {
  return `${n}`.padStart(2, '0')
}

export function fmtYmd(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`
}

export function parseYmd(ymd: string) {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

export function lunarYears(): number[] {
  const list: number[] = []
  for (let y = LUNAR_YEAR_START; y <= LUNAR_YEAR_END; y++) list.push(y)
  return list
}

export function monthsOfLunarYear(year: number): LunarMonthOpt[] {
  const ly = LunarYear.fromYear(year)
  return ly
    .getMonths()
    .filter((m: any) => m.getYear() === year)
    .map((m: any) => {
      const month = m.getMonth() as number
      const abs = Math.abs(month)
      const name =
        abs === 1 ? '正' : abs === 12 ? '腊' : `${['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][abs]}`
      const label = month < 0 ? `闰${name}月` : `${name}月`
      return { month, label, days: m.getDayCount() as number }
    })
}

export function dayLabels(count: number): string[] {
  return DAY_CN.slice(1, count + 1)
}

/** 公历 → 农历展示 */
export function formatLunarLabel(solarYmd: string): string {
  try {
    const { y, m, d } = parseYmd(solarYmd)
    const l = Solar.fromYmd(y, m, d).getLunar()
    const month = l.getMonth() as number
    const abs = Math.abs(month)
    const name =
      abs === 1 ? '正' : abs === 12 ? '腊' : `${['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][abs]}`
    const monthLabel = month < 0 ? `闰${name}月` : `${name}月`
    return `农历${l.getYear()}年${monthLabel}${DAY_CN[l.getDay()] || l.getDayInChinese()}`
  } catch {
    return solarYmd
  }
}

/** 年度重复只展示有业务意义的月日，年份仍保留在底层日期中。 */
export function formatAnnualDateLabel(
  solarYmd: string,
  calendar: 'solar' | 'lunar' = 'solar',
): string {
  try {
    const { y, m, d } = parseYmd(solarYmd)
    if (calendar === 'solar') return `${m}月${d}日`
    const lunar = Solar.fromYmd(y, m, d).getLunar()
    const month = lunar.getMonth() as number
    const abs = Math.abs(month)
    const name =
      abs === 1 ? '正' : abs === 12 ? '腊' : `${['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][abs]}`
    const monthLabel = month < 0 ? `闰${name}月` : `${name}月`
    return `农历${monthLabel}${DAY_CN[lunar.getDay()] || lunar.getDayInChinese()}`
  } catch {
    return solarYmd
  }
}

export function formatDateLabel(solarYmd: string, calendar: 'solar' | 'lunar') {
  if (calendar === 'lunar') return formatLunarLabel(solarYmd)
  return solarYmd
}

export function solarToLunarParts(solarYmd: string) {
  const { y, m, d } = parseYmd(solarYmd)
  const l = Solar.fromYmd(y, m, d).getLunar()
  return {
    year: l.getYear() as number,
    month: l.getMonth() as number,
    day: l.getDay() as number,
  }
}

export function lunarToSolarYmd(year: number, month: number, day: number): string {
  const solar = Lunar.fromYmd(year, month, day).getSolar()
  return fmtYmd(solar.getYear(), solar.getMonth(), solar.getDay())
}

/** 根据公历日期，算出 multiSelector 的 [年下标, 月下标, 日下标] */
export function solarToLunarPickerIndex(solarYmd: string): {
  index: [number, number, number]
  months: LunarMonthOpt[]
  days: string[]
} {
  const parts = solarToLunarParts(solarYmd)
  const years = lunarYears()
  let yi = years.indexOf(parts.year)
  if (yi < 0) yi = years.indexOf(new Date().getFullYear())
  if (yi < 0) yi = 0
  const year = years[yi]
  const months = monthsOfLunarYear(year)
  let mi = months.findIndex((x) => x.month === parts.month)
  if (mi < 0) mi = 0
  const days = dayLabels(months[mi].days)
  const di = Math.min(Math.max(parts.day - 1, 0), days.length - 1)
  return { index: [yi, mi, di], months, days }
}

export function lunarPickerIndexToSolar(
  yearIndex: number,
  monthIndex: number,
  dayIndex: number,
  months?: LunarMonthOpt[],
): string {
  const years = lunarYears()
  const year = years[Math.min(Math.max(yearIndex, 0), years.length - 1)]
  const mos = months || monthsOfLunarYear(year)
  const mo = mos[Math.min(Math.max(monthIndex, 0), mos.length - 1)]
  const day = Math.min(dayIndex + 1, mo.days)
  return lunarToSolarYmd(year, mo.month, day)
}

/**
 * 农历年重复：找「下一个」与锚点同月同日的农历对应公历日
 */
export function nextLunarYearlySolar(anchorSolarYmd: string, from = new Date()): string {
  const parts = solarToLunarParts(anchorSolarYmd)
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const todayL = Solar.fromYmd(
    start.getFullYear(),
    start.getMonth() + 1,
    start.getDate(),
  ).getLunar()
  const year = todayL.getYear() as number
  for (let i = 0; i < 3; i++) {
    try {
      const solar = Lunar.fromYmd(year + i, parts.month, parts.day).getSolar()
      const t = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay())
      if (t >= start) return fmtYmd(solar.getYear(), solar.getMonth(), solar.getDay())
    } catch {
      /* 该年无此闰月等 */
    }
  }
  return anchorSolarYmd
}

export function daysUntilLunarYearly(anchorSolarYmd: string, today = new Date()): number {
  const next = nextLunarYearlySolar(anchorSolarYmd, today)
  const { y, m, d } = parseYmd(next)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const target = new Date(y, m - 1, d)
  return Math.round((target.getTime() - start.getTime()) / 86400000)
}
