import { API_BASE, getAccessToken, request } from '@/api/request'
import { resolvePosterUrl } from '@/services/posters'
import type { RepeatRule } from '@/utils/countdown'

export type EntryType = 'anniversary' | 'todo' | 'diary'
export type { RepeatRule }

export type EntryOwnerType = 'personal' | 'space'
export type EntryVisibility = 'private' | 'space'
export type EntryKind = 'normal' | 'commitment' | 'capsule'
export type CapsuleUnlockMode = 'scheduled' | 'random'

export type ConfirmStatus = 'pending' | 'confirmed' | 'declined'
export type EntryEditRequestStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'revoked'

export interface EntryEditRequest {
  id: string
  requesterId: string
  requesterName: string
  requesterAvatar: string
  status: EntryEditRequestStatus
  createdAt: string
}

export interface EntryEditAccess {
  isOwner: boolean
  canEdit: boolean
  editRequestStatus: EntryEditRequestStatus
  editRequestId?: string | null
  pendingEditRequests: EntryEditRequest[]
}

/**
 * 约定元信息。地点不在这里：`Entry.location` 是唯一数据源，
 * 两处都存会立刻分叉出「改了一处、另一处还是旧值」。
 */
export interface CommitmentMeta {
  /** key 是 userId，value 是该成员对这次约定的表态。 */
  confirmStatus?: Record<string, ConfirmStatus>
  assignments?: Array<{ id: string; text: string; assigneeUserId?: string; done?: boolean }>
  transport?: string
  note?: string
  checkedIn?: Record<string, string>
}

export interface CommitmentDetailsInput {
  assignments: NonNullable<CommitmentMeta['assignments']>
  transport?: string
  note?: string
}

export interface Entry {
  id: string
  userId?: string
  authorName?: string
  authorAvatar?: string
  type: EntryType
  title: string
  body: string
  eventDate: string
  /** 日记完整时间 YYYY-MM-DD HH:mm:ss */
  eventAt?: string | null
  calendar: 'solar' | 'lunar'
  recurring: boolean
  repeatRule: RepeatRule
  pinned: boolean
  showInTimeline: boolean
  remindEnabled: boolean
  remindAheadDays: number
  /** 微信提醒的发送时间，HH:mm；未设置时后端按 10:00 处理。 */
  remindTime?: string
  wxSubscribeStatus?: 'none' | 'authorized' | 'sending' | 'sent' | 'failed' | 'expired'
  wxSubscribeSentAt?: string | null
  /** 发送失败/过期时的说明 */
  wxSubscribeError?: string
  wxSubscribeAttempts?: number
  todoStatus: string | null
  color: string
  images?: string[]
  backgroundUrl?: string
  location?: string
  /** 地点坐标，未选点或历史数据为 null。展示前用 hasValidCoords 校验。 */
  locationLat?: number | null
  locationLng?: number | null
  tags?: string[]
  ownerType?: EntryOwnerType
  spaceId?: string | null
  visibility?: EntryVisibility
  entryKind?: EntryKind
  commitmentMeta?: CommitmentMeta | null
  daysUntil?: number
  countdownLabel?: string
  capsuleUnlockAt?: string | null
  capsuleUnlockMode?: CapsuleUnlockMode
  capsuleUnlocked?: boolean
  isCapsule?: boolean
  createdAt?: string
  updatedAt?: string
  /** 当前用户作为协作者参与，而非该日子的创建者。 */
  isCollaborated?: boolean
  isOwner?: boolean
  canEdit?: boolean
  editRequestStatus?: EntryEditRequestStatus
  editRequestId?: string | null
  pendingEditRequests?: EntryEditRequest[]
}

export interface EntryList {
  list: Entry[]
  total: number
  page: number
  pageSize: number
}

export interface EntryInput {
  type: EntryType
  title: string
  body?: string
  eventDate: string
  eventAt?: string | null
  calendar?: 'solar' | 'lunar'
  recurring?: boolean
  repeatRule?: RepeatRule
  pinned?: boolean
  showInTimeline?: boolean
  remindEnabled?: boolean
  remindAheadDays?: number
  remindTime?: string
  /** 本次保存前，用户是否刚同意了一次微信订阅消息。 */
  wxSubscribeAccepted?: boolean
  todoStatus?: string
  color?: string
  images?: string[]
  backgroundUrl?: string
  location?: string
  locationLat?: number | null
  locationLng?: number | null
  tags?: string[]
  ownerType?: EntryOwnerType
  spaceId?: string | null
  visibility?: EntryVisibility
  entryKind?: EntryKind
  commitmentMeta?: CommitmentMeta | null
  /**
   * 新建幂等键：同一次编辑会话内稳定，重试/并发 create 返回同一条。
   * 由客户端生成；种子可用 `seed:xxx`。
   */
  clientRequestId?: string
  capsuleUnlockAt?: string | null
  capsuleUnlockMode?: CapsuleUnlockMode
  /** 乐观锁：仅当服务端版本仍等于该值时保存。 */
  expectedUpdatedAt?: string
}

function absolutizeUrl(url?: string) {
  if (!url) return ''
  const resolved = resolvePosterUrl(url)
  if (/^https?:\/\//.test(resolved) || resolved.startsWith('data:') || resolved.startsWith('wxfile://')) {
    return resolved
  }
  return API_BASE + resolved
}

export function entryBackgroundUrl(entry: Pick<Entry, 'backgroundUrl'>): string {
  return absolutizeUrl(entry.backgroundUrl)
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export async function listEntries(opts: {
  type?: EntryType
  timeline?: boolean
  remind?: boolean
  ownerType?: EntryOwnerType
  spaceId?: string | null
  isCapsule?: boolean
  /** 提醒中心：返回所有可提醒的日期/待办（含已发送和未开启）。 */
  reminderCenter?: boolean
  page?: number
  pageSize?: number
} = {}): Promise<EntryList> {
  return request({
    url:
      '/api/entries' +
      qs({
        type: opts.type,
        timeline: opts.timeline ? 1 : undefined,
        remind: opts.remind ? 1 : undefined,
        ownerType: opts.ownerType,
        spaceId: opts.spaceId || undefined,
        isCapsule: opts.isCapsule ? 1 : undefined,
        reminderCenter: opts.reminderCenter ? 1 : undefined,
        page: opts.page || 1,
        pageSize: opts.pageSize || 50,
      }),
  })
}

/** 回忆日历按月、按归属加载，避免跨空间串数据。 */
export async function listCalendarEntries(
  month: string,
  scope: { ownerType?: EntryOwnerType; spaceId?: string | null } = {},
): Promise<Entry[]> {
  const data = await request<{ month: string; list: Entry[] }>({
    url: `/api/entries/calendar${qs({
      month,
      ownerType: scope.ownerType,
      spaceId: scope.spaceId || undefined,
    })}`,
  })
  return Array.isArray(data?.list) ? data.list : []
}

/** 服务端持久化的系统示例状态，不受本地缓存、卸载或换设备影响。 */
export async function getEntrySeedState(): Promise<string[]> {
  const data = await request<{ seeds: string[] }>({
    url: '/api/entries/seed-state',
  })
  return Array.isArray(data?.seeds) ? data.seeds : []
}

export async function markEntrySeeds(seeds: string[]): Promise<void> {
  const normalized = [...new Set(seeds.filter(Boolean))]
  if (!normalized.length) return
  await request({
    url: '/api/entries/seed-state',
    method: 'POST',
    data: { seeds: normalized },
  })
}

export async function getEntry(id: string): Promise<Entry> {
  return request({ url: `/api/entries/${id}` })
}

export async function createEntry(input: EntryInput): Promise<Entry> {
  return request({ url: '/api/entries', method: 'POST', data: input })
}

export async function updateEntry(id: string, input: Partial<EntryInput>): Promise<Entry> {
  return request({ url: `/api/entries/${id}`, method: 'PUT', data: input })
}

export async function moveEntryToSpace(id: string, spaceId: string): Promise<Entry> {
  return request({
    url: `/api/entries/${id}/move-to-space`,
    method: 'POST',
    data: { spaceId },
  })
}

export async function getEntryEditAccess(id: string): Promise<EntryEditAccess> {
  return request({ url: `/api/entries/${id}/edit-access` })
}

export async function requestEntryEditAccess(id: string): Promise<EntryEditAccess> {
  return request({ url: `/api/entries/${id}/edit-access/request`, method: 'POST' })
}

export async function resolveEntryEditRequest(
  entryId: string,
  requestId: string,
  decision: 'approved' | 'rejected',
): Promise<EntryEditAccess> {
  return request({
    url: `/api/entries/${entryId}/edit-access/requests/${requestId}/resolve`,
    method: 'POST',
    data: { decision },
  })
}

export async function deleteEntry(id: string): Promise<{ ok: boolean }> {
  return request({ url: `/api/entries/${id}`, method: 'DELETE' })
}

/**
 * 对共同约定表态。只会写当前用户自己的确认状态，后端用 jsonb_set 单键更新，
 * 因此双方同时点确认不会互相覆盖。返回更新后的完整约定。
 */
export async function confirmCommitment(id: string, status: ConfirmStatus = 'confirmed'): Promise<Entry> {
  return request({ url: `/api/entries/${id}/confirm`, method: 'POST', data: { status } })
}

export async function updateCommitmentDetails(id: string, input: CommitmentDetailsInput): Promise<Entry> {
  return request({ url: `/api/entries/${id}/commitment-details`, method: 'PUT', data: input })
}

export async function checkInCommitment(id: string): Promise<Entry> {
  return request({ url: `/api/entries/${id}/check-in`, method: 'POST' })
}

export async function uploadEntryBackground(id: string, filePath: string): Promise<Entry> {
  const uploadPath = await compressBackgroundImage(filePath)
  // 优先 multipart 直传；dataURL 仍走旧 base64 逻辑兼容
  if (!uploadPath.startsWith('data:')) {
    return new Promise((resolve, reject) => {
      const token = getAccessToken()
      uni.uploadFile({
        url: API_BASE + `/api/entries/${id}/background`,
        filePath: uploadPath,
        name: 'file',
        header: token ? { Authorization: `Bearer ${token}` } : undefined,
        success: (res) => {
          const status = res.statusCode || 0
          const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {})
          try {
            if (status >= 400) {
              let msg = `上传失败(${status})`
              try {
                const body = JSON.parse(raw || '{}')
                if (body?.msg) msg = String(body.msg)
              } catch {
                if (status === 403) msg = '网关拒绝上传(403)，请检查 uploadFile 合法域名或网络'
                else if (raw && !raw.trim().startsWith('{')) msg = `上传失败(${status})，网关/代理未返回业务 JSON`
              }
              reject(new Error(msg))
              return
            }
            const body = JSON.parse(raw || '{}')
            resolve((body && body.data !== undefined && body.data !== null ? body.data : body) as Entry)
          } catch (e: any) {
            reject(new Error(e?.message || `上传响应解析失败(${status})`))
          }
        },
        fail: (err) => {
          const msg = (err as { errMsg?: string })?.errMsg || 'uploadFile failed'
          // 微信未配 uploadFile 合法域名时常见文案
          if (/url not in domain list|不在以下.*域名|合法域名/i.test(msg)) {
            reject(new Error('uploadFile 域名未配置：请在微信后台添加当前环境的 HTTPS API 域名'))
            return
          }
          reject(new Error(msg))
        },
      })
    })
  }
  // fallback: dataURL → base64 JSON
  const ext = (uploadPath.match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1] || 'jpg')
    .toLowerCase()
    .replace('jpeg', 'jpg')
  const imageBase64 = uploadPath.includes(',') ? uploadPath.split(',')[1] : uploadPath
  return request({
    url: `/api/entries/${id}/background`,
    method: 'POST',
    data: { imageBase64, ext },
  })
}

export async function compressBackgroundImage(filePath: string): Promise<string> {
  if (!filePath || filePath.startsWith('http') || filePath.startsWith('data:')) return filePath

  const TARGET_BYTES = 4 * 1024 * 1024
  const HARD_MAX = 8 * 1024 * 1024
  const attempts = [
    { maxEdge: 1920, quality: 82 },
    { maxEdge: 1600, quality: 70 },
    { maxEdge: 1280, quality: 58 },
    { maxEdge: 1080, quality: 48 },
  ]

  // 压缩全失败时，只要原图未超硬上限就直传，避免体验版/低基础库 compressImage 不可用导致永远上不了 COS
  const fallbackOriginal = async (reason: string) => {
    try {
      const size = await getLocalFileSize(filePath)
      if (size <= HARD_MAX) {
        console.warn('[compressBackground] fallback original:', reason, 'size=', size)
        return filePath
      }
      throw new Error(`图片过大(${Math.round(size / 1024 / 1024)}MB)，请选择较小的图片`)
    } catch (e: any) {
      if (e?.message?.includes('图片过大')) throw e
      console.warn('[compressBackground] fallback without size check:', reason)
      return filePath
    }
  }

  let info: { width: number; height: number }
  try {
    info = await getLocalImageInfo(filePath)
  } catch (e: any) {
    return fallbackOriginal(e?.message || 'getImageInfo failed')
  }

  let lastPath = ''
  let lastSize = Number.POSITIVE_INFINITY
  let lastErr = ''
  for (const attempt of attempts) {
    try {
      const compressedPath = await compressToMaxEdge(
        filePath,
        info,
        attempt.maxEdge,
        attempt.quality,
      )
      const size = await getLocalFileSize(compressedPath)
      lastPath = compressedPath
      lastSize = size
      if (size <= TARGET_BYTES) return compressedPath
    } catch (e: any) {
      lastErr = e?.message || e?.errMsg || 'compress failed'
    }
  }

  if (lastPath && lastSize <= HARD_MAX) return lastPath
  return fallbackOriginal(lastErr || 'compress exhausted')
}

function getLocalImageInfo(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    uni.getImageInfo({
      src: filePath,
      success: (res) => resolve({ width: res.width, height: res.height }),
      fail: (err) =>
        reject(new Error((err as { errMsg?: string })?.errMsg || '无法读取图片信息，请重新选择图片')),
    })
  })
}

function getLocalFileSize(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    uni.getFileInfo({
      filePath,
      success: (res) => resolve(res.size),
      fail: (err) =>
        reject(new Error((err as { errMsg?: string })?.errMsg || '无法读取图片大小')),
    })
  })
}

function compressToMaxEdge(
  filePath: string,
  info: { width: number; height: number },
  maxEdge: number,
  quality: number,
): Promise<string> {
  const scale = Math.min(1, maxEdge / Math.max(info.width, info.height))
  const width = Math.max(1, Math.round(info.width * scale))
  const height = Math.max(1, Math.round(info.height * scale))

  return new Promise((resolve, reject) => {
    uni.compressImage({
      src: filePath,
      quality,
      compressedWidth: width,
      compressedHeight: height,
      success: (res) => {
        if (res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error('图片压缩失败'))
      },
      fail: (err) =>
        reject(new Error((err as { errMsg?: string })?.errMsg || '图片压缩失败')),
    })
  })
}

/** 快速切换待办完成状态 */
export async function toggleTodoDone(entry: Entry): Promise<Entry> {
  const done = entry.todoStatus === 'done'
  return updateEntry(entry.id, {
    todoStatus: done ? 'pending' : 'done',
  })
}
