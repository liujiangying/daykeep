import { Lunar, Solar } from 'lunar-javascript'
import type { Entry } from '@/services/entries'
import { getAccessToken } from '@/api/request'
import { fetchUserPrefs, saveUserPrefs } from '@/services/prefs'

export type HolidayMode = 'recent' | 'custom'

export interface HolidaySettings {
  enabled: boolean
  mode: HolidayMode
  selectedIds: string[]
}

export interface HolidayOccurrence {
  id: string
  name: string
  date: string
  daysUntil: number
  calendar: 'solar' | 'lunar'
  calendarLabel: string
}

type SolarHoliday = {
  id: string
  name: string
  calendar: 'solar'
  month: number
  day: number
}

type LunarHoliday = {
  id: string
  name: string
  calendar: 'lunar'
  month: number
  day: number
}

type HolidayDefinition = SolarHoliday | LunarHoliday

const SETTINGS_KEY = 'dk_holiday_settings_v1'
export const RECENT_HOLIDAY_COUNT = 3
const DEFAULT_HOLIDAY_SETTINGS: HolidaySettings = {
  enabled: true,
  mode: 'recent',
  selectedIds: [],
}

/** 二十四节气（按常序） */
const SOLAR_TERMS = [
  '小寒',
  '大寒',
  '立春',
  '雨水',
  '惊蛰',
  '春分',
  '清明',
  '谷雨',
  '立夏',
  '小满',
  '芒种',
  '夏至',
  '小暑',
  '大暑',
  '立秋',
  '处暑',
  '白露',
  '秋分',
  '寒露',
  '霜降',
  '立冬',
  '小雪',
  '大雪',
  '冬至',
] as const

const HOLIDAYS: HolidayDefinition[] = [
  { id: 'new-year', name: '元旦', calendar: 'solar', month: 1, day: 1 },
  { id: 'spring-festival', name: '春节', calendar: 'lunar', month: 1, day: 1 },
  { id: 'valentine', name: '情人节', calendar: 'solar', month: 2, day: 14 },
  { id: 'lantern', name: '元宵节', calendar: 'lunar', month: 1, day: 15 },
  { id: 'women', name: '妇女节', calendar: 'solar', month: 3, day: 8 },
  { id: 'arbor-day', name: '植树节', calendar: 'solar', month: 3, day: 12 },
  { id: 'dragon-head', name: '龙抬头', calendar: 'lunar', month: 2, day: 2 },
  // 清明用节气精确日期，见 SOLAR_TERMS「清明」
  { id: 'labor', name: '劳动节', calendar: 'solar', month: 5, day: 1 },
  { id: 'youth', name: '青年节', calendar: 'solar', month: 5, day: 4 },
  { id: 'children', name: '儿童节', calendar: 'solar', month: 6, day: 1 },
  { id: 'dragon-boat', name: '端午节', calendar: 'lunar', month: 5, day: 5 },
  { id: 'party-day', name: '建党节', calendar: 'solar', month: 7, day: 1 },
  { id: 'army-day', name: '建军节', calendar: 'solar', month: 8, day: 1 },
  { id: 'qixi', name: '七夕节', calendar: 'lunar', month: 7, day: 7 },
  { id: 'ghost', name: '中元节', calendar: 'lunar', month: 7, day: 15 },
  { id: 'teachers', name: '教师节', calendar: 'solar', month: 9, day: 10 },
  { id: 'mid-autumn', name: '中秋节', calendar: 'lunar', month: 8, day: 15 },
  { id: 'national-day', name: '国庆节', calendar: 'solar', month: 10, day: 1 },
  { id: 'double-ninth', name: '重阳节', calendar: 'lunar', month: 9, day: 9 },
  { id: 'laba', name: '腊八节', calendar: 'lunar', month: 12, day: 8 },
  { id: 'little-new-year', name: '小年', calendar: 'lunar', month: 12, day: 23 },
  { id: 'christmas-eve', name: '平安夜', calendar: 'solar', month: 12, day: 24 },
  { id: 'christmas', name: '圣诞节', calendar: 'solar', month: 12, day: 25 },
]

function solarTermId(name: string) {
  return `jieqi-${name}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatYmd(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function diffDays(date: Date, from: Date) {
  // 使用纯日期的 UTC 序号，避免设备处于夏令时时出现 23/25 小时导致天数偏差。
  const dateDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const fromDay = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((dateDay - fromDay) / 86400000)
}

function nextSolar(definition: SolarHoliday, from: Date) {
  let year = from.getFullYear()
  let date = new Date(year, definition.month - 1, definition.day)
  if (date < startOfDay(from)) {
    year += 1
    date = new Date(year, definition.month - 1, definition.day)
  }
  return {
    date,
    ymd: formatYmd(year, definition.month, definition.day),
  }
}

function nextLunar(definition: LunarHoliday, from: Date) {
  const todayLunar = Solar.fromYmd(
    from.getFullYear(),
    from.getMonth() + 1,
    from.getDate(),
  ).getLunar()
  const lunarYear = todayLunar.getYear() as number

  for (let offset = 0; offset < 3; offset += 1) {
    try {
      const solar = Lunar.fromYmd(
        lunarYear + offset,
        definition.month,
        definition.day,
      ).getSolar()
      const date = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay())
      if (date >= startOfDay(from)) {
        return {
          date,
          ymd: formatYmd(solar.getYear(), solar.getMonth(), solar.getDay()),
        }
      }
    } catch {
      /* continue with next lunar year */
    }
  }

  throw new Error(`无法换算农历节日：农历${definition.month}月${definition.day}日`)
}

/** 节气日期每年浮动，按 lunar-javascript 节气表取下一个 */
function nextSolarTerm(name: string, from: Date) {
  // lunar-javascript 的「冬至」位于下一公历年的节气表中，因此必须查到 +2 年，
  // 否则当年冬至之后查询下一次冬至会漏掉整整一年。
  const year = from.getFullYear()
  const years = [year - 1, year, year + 1, year + 2]
  let best: { date: Date; ymd: string } | null = null
  for (const year of years) {
    try {
      // 运行时提供 getJieQiTable，但第三方类型声明未包含该方法
      const lunar = Solar.fromYmd(year, 6, 1).getLunar() as any
      const table = lunar.getJieQiTable()
      const solar = table?.[name]
      if (!solar?.toYmd) continue
      const ymd = String(solar.toYmd())
      const [y, m, d] = ymd.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      if (date < startOfDay(from)) continue
      if (!best || date < best.date) best = { date, ymd: formatYmd(y, m, d) }
    } catch {
      /* ignore */
    }
  }
  if (best) return best

  // 极端情况下按日核验未来一年，绝不把 1 月 1 日伪装成节气日期。
  const cursor = startOfDay(from)
  for (let offset = 0; offset <= 370; offset += 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + offset)
    const solar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate())
    // 运行时提供 getJieQi，但第三方类型声明未包含该方法
    if ((solar.getLunar() as any).getJieQi() === name) {
      return {
        date,
        ymd: formatYmd(date.getFullYear(), date.getMonth() + 1, date.getDate()),
      }
    }
  }
  throw new Error(`无法换算二十四节气：${name}`)
}

export function listHolidayOccurrences(from = new Date()): HolidayOccurrence[] {
  const festivals = HOLIDAYS.map((definition) => {
    const next =
      definition.calendar === 'solar'
        ? nextSolar(definition, from)
        : nextLunar(definition, from)
    return {
      id: definition.id,
      name: definition.name,
      date: next.ymd,
      daysUntil: diffDays(next.date, from),
      calendar: definition.calendar,
      calendarLabel:
        definition.calendar === 'lunar'
          ? `农历${definition.month}月${definition.day}日`
          : `${definition.month}月${definition.day}日`,
    }
  })

  const terms = SOLAR_TERMS.map((name) => {
    const next = nextSolarTerm(name, from)
    return {
      id: solarTermId(name),
      name,
      date: next.ymd,
      daysUntil: diffDays(next.date, from),
      calendar: 'solar' as const,
      calendarLabel: '二十四节气',
    }
  })

  return [...festivals, ...terms].sort(
    (a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name),
  )
}

export function getHolidaySettings(): HolidaySettings {
  try {
    const stored = uni.getStorageSync(SETTINGS_KEY) as Partial<HolidaySettings> | string
    if (!stored) return { ...DEFAULT_HOLIDAY_SETTINGS, selectedIds: [] }
    let parsed: Partial<HolidaySettings> = {}
    if (typeof stored === 'string' && stored) {
      parsed = JSON.parse(stored) as Partial<HolidaySettings>
    } else if (stored && typeof stored === 'object') {
      parsed = stored
    }
    if (parsed.enabled == null) return { ...DEFAULT_HOLIDAY_SETTINGS, selectedIds: [] }
    return normalizeHolidaySettings(parsed)
  } catch {
    return { ...DEFAULT_HOLIDAY_SETTINGS, selectedIds: [] }
  }
}

function normalizeHolidaySettings(parsed: Partial<HolidaySettings>): HolidaySettings {
  return {
    enabled: parsed.enabled === true,
    mode: parsed.mode === 'custom' ? 'custom' : 'recent',
    selectedIds: Array.isArray(parsed.selectedIds)
      ? parsed.selectedIds.filter(
          (id: unknown): id is string => typeof id === 'string',
        )
      : [],
  }
}

function writeLocalHolidaySettings(settings: HolidaySettings) {
  uni.setStorageSync(SETTINGS_KEY, JSON.stringify(normalizeHolidaySettings(settings)))
}

/** 仅写本地；登录态下请用 setHolidaySettings */
export function setHolidaySettingsLocal(settings: HolidaySettings) {
  writeLocalHolidaySettings(settings)
}

export function setHolidaySettings(settings: HolidaySettings) {
  const next = normalizeHolidaySettings(settings)
  writeLocalHolidaySettings(next)
  if (!getAccessToken()) return
  void saveUserPrefs({ holidays: next }).catch((error) => {
    console.warn('[holidays] sync prefs failed', error)
  })
}

/**
 * 登录后同步：云端是用户偏好的唯一来源。
 * 后端会为从未配置过的用户返回“开启 + 最近 3 个”的默认值，
 * 同时保留老用户明确保存过的关闭或自定义设置。
 */
export async function syncHolidaySettings(): Promise<HolidaySettings> {
  const local = getHolidaySettings()
  if (!getAccessToken()) return local
  try {
    const prefs = await fetchUserPrefs()
    const cloud = normalizeHolidaySettings(prefs.holidays || {})
    writeLocalHolidaySettings(cloud)
    return cloud
  } catch (error) {
    console.warn('[holidays] pull prefs failed', error)
    return local
  }
}

export function holidaysForTimeline(from = new Date()): Entry[] {
  const settings = getHolidaySettings()
  if (!settings.enabled) return []

  const occurrences = listHolidayOccurrences(from)
  const visible =
    settings.mode === 'custom'
      ? occurrences.filter((item) => settings.selectedIds.includes(item.id))
      : occurrences.slice(0, RECENT_HOLIDAY_COUNT)

  return visible.map((item) => ({
    id: `holiday:${item.id}`,
    type: 'anniversary',
    title: item.name,
    body: '',
    eventDate: item.date,
    eventAt: null,
    calendar: 'solar',
    recurring: true,
    repeatRule: 'yearly',
    pinned: false,
    showInTimeline: true,
    remindEnabled: false,
    remindAheadDays: 0,
    todoStatus: null,
    color: '',
    images: [],
    daysUntil: item.daysUntil,
    countdownLabel: item.daysUntil === 0 ? `${item.name}就是今天` : `距${item.name}还有${item.daysUntil}天`,
  }))
}
