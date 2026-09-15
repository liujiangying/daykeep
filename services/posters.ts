import { getAccessToken } from '@/api/request'
import { fetchUserPrefs, saveUserPrefs } from '@/services/prefs'

const HOLIDAY_POSTERS_KEY = 'dk_holiday_posters_v1'

/**
 * 默认海报优先使用显式配置的 COS 地址；个人版未配置公开 COS 时，
 * 回退到随小程序打包的内置素材，避免私有桶或缺少环境变量导致详情页空白。
 */
const COS_PUBLIC_HOST =
  (import.meta.env.VITE_COS_PUBLIC_HOST as string | undefined)?.replace(/\/$/, '') || ''
const COS_PREFIX =
  (import.meta.env.VITE_COS_PREFIX as string | undefined)?.replace(/^\/|\/$/g, '') || ''
const LOCAL_DEFAULT_POSTERS = [
  '/static/posters/default-mist.jpg',
  '/static/posters/default-field.jpg',
  '/static/posters/default-rain.jpg',
  '/static/posters/default-paper.jpg',
] as const
const posterUrl = (name: string, localUrl: string) => COS_PUBLIC_HOST
  ? `${COS_PUBLIC_HOST}/${COS_PREFIX ? `${COS_PREFIX}/` : ''}defaults/posters/${name}.jpg`
  : localUrl

export const DEFAULT_POSTERS = [
  posterUrl('mist', LOCAL_DEFAULT_POSTERS[0]),
  posterUrl('field', LOCAL_DEFAULT_POSTERS[1]),
  posterUrl('rain', LOCAL_DEFAULT_POSTERS[2]),
  posterUrl('paper', LOCAL_DEFAULT_POSTERS[3]),
] as const

function normalize(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([id, url]) => !!id && typeof url === 'string' && !!url)
      .slice(0, 100)
      .map(([id, url]) => [id, String(url)]),
  ) as Record<string, string>
}

/** 兼容历史本地路径 / builtin 索引 */
export function resolvePosterUrl(url?: string): string {
  if (!url) return ''
  const builtin = /^builtin:(\d+)$/.exec(url)
  if (builtin) return DEFAULT_POSTERS[Number(builtin[1]) % DEFAULT_POSTERS.length]
  if (url.includes('/static/posters/default-')) {
    const name = url.match(/default-(mist|field|rain|paper)\.jpg/i)?.[1]?.toLowerCase()
    const index = ['mist', 'field', 'rain', 'paper'].indexOf(name || '')
    if (name && index >= 0) return posterUrl(name, LOCAL_DEFAULT_POSTERS[index])
  }
  return url
}

export function defaultPosterFor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0
  }
  return DEFAULT_POSTERS[Math.abs(hash) % DEFAULT_POSTERS.length]
}

export function getHolidayPosters(): Record<string, string> {
  try {
    const raw = uni.getStorageSync(HOLIDAY_POSTERS_KEY)
    return normalize(typeof raw === 'string' ? JSON.parse(raw || '{}') : raw)
  } catch {
    return {}
  }
}

function writeHolidayPosters(posters: Record<string, string>) {
  uni.setStorageSync(HOLIDAY_POSTERS_KEY, JSON.stringify(normalize(posters)))
}

export function getHolidayPoster(id: string): string {
  const saved = getHolidayPosters()[id] || ''
  return resolvePosterUrl(saved) || ''
}

export async function setHolidayPoster(id: string, url: string) {
  const next = { ...getHolidayPosters(), [id]: url }
  writeHolidayPosters(next)
  if (getAccessToken()) await saveUserPrefs({ holidayPosters: next })
}

export function setHolidayPosterPreset(id: string, index: number) {
  return setHolidayPoster(id, `builtin:${index % DEFAULT_POSTERS.length}`)
}

export async function syncHolidayPosters() {
  if (!getAccessToken()) return getHolidayPosters()
  try {
    const prefs = await fetchUserPrefs()
    const cloud = normalize(prefs.holidayPosters)
    if (Object.keys(cloud).length) {
      writeHolidayPosters(cloud)
      return cloud
    }
    const local = getHolidayPosters()
    if (Object.keys(local).length) await saveUserPrefs({ holidayPosters: local })
    return local
  } catch {
    return getHolidayPosters()
  }
}
