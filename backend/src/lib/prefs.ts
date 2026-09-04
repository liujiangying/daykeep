export type HolidayMode = 'recent' | 'custom'

export type HolidayPrefs = {
  enabled: boolean
  mode: HolidayMode
  selectedIds: string[]
}

export type UserPrefs = {
  holidays: HolidayPrefs
  holidayPosters: Record<string, string>
  fontSize: 'small' | 'medium' | 'standard' | 'large'
}

const DEFAULT_HOLIDAYS: HolidayPrefs = {
  enabled: true,
  mode: 'recent',
  selectedIds: [],
}

export function defaultUserPrefs(): UserPrefs {
  return {
    holidays: { ...DEFAULT_HOLIDAYS, selectedIds: [] },
    holidayPosters: {},
    fontSize: 'standard',
  }
}

function normalizeHolidayPosters(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(
        ([id, url]) =>
          !!id.trim() &&
          typeof url === 'string' &&
          (/^https?:\/\//.test(url) || /^builtin:[0-3]$/.test(url)),
      )
      .slice(0, 100)
      .map(([id, url]) => [id.trim().slice(0, 80), String(url).slice(0, 512)]),
  )
}

export function normalizeHolidayPrefs(input: unknown): HolidayPrefs {
  const raw =
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  return {
    enabled: raw.enabled === true,
    mode: raw.mode === 'custom' ? 'custom' : 'recent',
    selectedIds: Array.isArray(raw.selectedIds)
      ? raw.selectedIds
          .filter((id): id is string => typeof id === 'string' && !!id.trim())
          .map((id) => id.trim())
          .slice(0, 200)
      : [],
  }
}

export function normalizeUserPrefs(input: unknown): UserPrefs {
  const raw =
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  return {
    holidays: raw.holidays == null
      ? { ...DEFAULT_HOLIDAYS, selectedIds: [] }
      : normalizeHolidayPrefs(raw.holidays),
    holidayPosters: normalizeHolidayPosters(raw.holidayPosters),
    fontSize:
      raw.fontSize === 'small' || raw.fontSize === 'medium' || raw.fontSize === 'large'
        ? raw.fontSize
        : 'standard',
  }
}

/** 合并部分更新：只覆盖传入字段 */
export function mergeUserPrefs(
  current: unknown,
  patch: unknown,
): UserPrefs {
  const base = normalizeUserPrefs(current)
  if (!patch || typeof patch !== 'object') return base
  const p = patch as Record<string, unknown>
  if (p.holidays != null) {
    base.holidays = normalizeHolidayPrefs(p.holidays)
  }
  if (p.holidayPosters != null) {
    base.holidayPosters = normalizeHolidayPosters(p.holidayPosters)
  }
  if (p.fontSize != null) {
    base.fontSize =
      p.fontSize === 'small' || p.fontSize === 'medium' || p.fontSize === 'large'
        ? p.fontSize
        : 'standard'
  }
  return base
}
