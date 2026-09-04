import { request } from '@/api/request'

export type HolidayPrefs = {
  enabled: boolean
  mode: 'recent' | 'custom'
  selectedIds: string[]
}

export type UserPrefs = {
  holidays: HolidayPrefs
  holidayPosters: Record<string, string>
  fontSize: 'small' | 'medium' | 'standard' | 'large'
}

export async function fetchUserPrefs(): Promise<UserPrefs> {
  return request<UserPrefs>({ url: '/api/auth/prefs' })
}

export async function saveUserPrefs(patch: {
  holidays?: HolidayPrefs
  holidayPosters?: Record<string, string>
  fontSize?: 'small' | 'medium' | 'standard' | 'large'
}): Promise<UserPrefs> {
  return request<UserPrefs>({
    url: '/api/auth/prefs',
    method: 'PUT',
    data: patch,
  })
}
