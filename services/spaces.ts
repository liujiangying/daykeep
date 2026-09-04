import { request } from '@/api/request'
import type { MoodValue } from '@/shared/mood'

export type SpaceType = 'personal' | 'pair' | 'group'
export type SpaceRole = 'owner' | 'admin' | 'member'
export type SpaceAccessType = 'private' | 'public'
export type SpaceMood = MoodValue

export interface SpaceMember {
  id: string
  userId: string
  spaceId: string
  role: SpaceRole
  nickname: string
  avatarUrl?: string
  mood?: SpaceMood
  joinedAt?: string
}

export interface Space {
  id: string
  name: string
  type: SpaceType
  ownerId?: string
  coverUrl?: string
  dissolvedAt?: string
  dissolvedByUserId?: string
  dissolvedByNickname?: string
  purgeAt?: string
  keywords: string[]
  recordCount: number
  commitmentCount: number
  memberCount?: number
  accessType?: SpaceAccessType
  joinPolicy?: 'invite' | 'open'
  postPolicy?: 'members' | 'admin_only'
  isOfficial?: boolean
  officialKey?: string
  joined?: boolean
  members?: SpaceMember[]
  createdAt?: string
  updatedAt?: string
  /** 仅加入接口返回：当前用户此前已经是该空间成员。 */
  alreadyMember?: boolean
  /** 当前登录用户在该空间中的角色。 */
  currentUserRole?: SpaceRole | ''
}

export interface SpaceInput {
  name: string
  type?: Exclude<SpaceType, 'personal'>
  keywords?: string[]
  memberNickname?: string
  coverUrl?: string
}

/**
 * 这里不做 mock 兜底。
 * 之前所有请求失败都会静默返回假空间（含 `local_*` 这种后端不接受的 id），
 * 结果是「创建失败却提示已创建」、「邀请失效却显示加入成功」、
 * 以及在这个假空间里写入的记录被后端一律拒绝。
 * 失败必须抛出，由页面展示错误或空态。
 */
export function listSpaces(): Promise<Space[]> {
  return request<Space[]>({ url: '/api/spaces' })
}

export function getSpace(id: string): Promise<Space> {
  return request<Space>({ url: `/api/spaces/${encodeURIComponent(id)}` })
}

export function getOfficialExperienceSpace(): Promise<Space> {
  return request<Space>({ url: '/api/spaces/official-experience' })
}

export function joinOfficialExperienceSpace(): Promise<Space> {
  return request<Space>({ url: '/api/spaces/official-experience/join', method: 'POST' })
}

export function createSpace(input: SpaceInput): Promise<Space> {
  return request<Space>({ url: '/api/spaces', method: 'POST', data: { type: 'pair', ...input } })
}

export function updateSpace(id: string, input: Partial<Pick<SpaceInput, 'name' | 'keywords' | 'coverUrl'>>): Promise<Space> {
  return request<Space>({ url: `/api/spaces/${encodeURIComponent(id)}`, method: 'PUT', data: input })
}

export function dissolveSpace(id: string): Promise<Space> {
  return request<Space>({ url: `/api/spaces/${encodeURIComponent(id)}/dissolve`, method: 'POST' })
}

export function restoreSpace(id: string): Promise<Space> {
  return request<Space>({ url: `/api/spaces/${encodeURIComponent(id)}/restore`, method: 'POST' })
}

export interface SpaceInvite {
  inviteCode: string
  inviteUrl: string
  expiresAt?: string
}

export function inviteSpaceMember(spaceId: string): Promise<SpaceInvite> {
  return request<SpaceInvite>({
    url: `/api/spaces/${encodeURIComponent(spaceId)}/invite`,
    method: 'POST',
  })
}

export function joinSpaceByInvite(code: string): Promise<Space> {
  return request<Space>({ url: '/api/spaces/join', method: 'POST', data: { code } })
}

export interface SpaceInvitePreview {
  spaceId: string
  spaceName: string
  spaceType: 'pair' | 'group'
  ownerNickname: string
  ownerAvatarUrl: string
  coverUrl: string
  recordCount: number
  firstBody: string
  firstImage: string
  expiresAt: string
  members: Array<{ nickname: string; avatarUrl: string }>
}

export function getSpaceInvitePreview(code: string): Promise<SpaceInvitePreview> {
  return request<SpaceInvitePreview>({
    url: `/api/spaces/invite-preview?code=${encodeURIComponent(code)}`,
    skipAuth: true,
  })
}

export function updateMyMood(mood: SpaceMood): Promise<{ date?: string; mood: SpaceMood }> {
  return request<{ date?: string; mood: SpaceMood }>({ url: '/api/spaces/mood', method: 'PUT', data: { mood } })
}

export interface MoodDay {
  date: string
  mood: SpaceMood
}

export function getMyMoodWeek(): Promise<MoodDay[]> {
  return request<MoodDay[]>({ url: '/api/spaces/mood/week' })
}

export function leaveSpace(spaceId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>({ url: `/api/spaces/${encodeURIComponent(spaceId)}/members/me`, method: 'DELETE' })
}

export function removeSpaceMember(spaceId: string, userId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>({ url: `/api/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}`, method: 'DELETE' })
}

export function listOfficialSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
  return request<SpaceMember[]>({ url: `/api/spaces/${encodeURIComponent(spaceId)}/members` })
}

export function setOfficialSpaceMemberRole(spaceId: string, userId: string, role: 'admin' | 'member'): Promise<{ ok: boolean; role: 'admin' | 'member' }> {
  return request<{ ok: boolean; role: 'admin' | 'member' }>({
    url: `/api/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}/role`,
    method: 'PUT',
    data: { role },
  })
}

export interface PublicContentReport {
  id: string
  entryId: string
  reporterId: string
  reason: string
  createdAt: string
  title: string
  body: string
  authorUserId: string
  authorName: string
}

export interface PublicBlockedMember {
  userId: string
  nickname: string
  avatarUrl: string
  blockedAt: string
  reason: string
}

export function listPublicBlockedMembers(spaceId: string): Promise<PublicBlockedMember[]> {
  return request<PublicBlockedMember[]>({ url: `/api/spaces/${encodeURIComponent(spaceId)}/blocked-members` })
}

export function reportPublicEntry(spaceId: string, entryId: string, reason: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>({
    url: `/api/spaces/${encodeURIComponent(spaceId)}/reports`,
    method: 'POST',
    data: { entryId, reason },
  })
}

export function listPublicContentReports(spaceId: string): Promise<PublicContentReport[]> {
  return request<PublicContentReport[]>({ url: `/api/spaces/${encodeURIComponent(spaceId)}/reports` })
}

export function dismissPublicContentReport(spaceId: string, reportId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>({
    url: `/api/spaces/${encodeURIComponent(spaceId)}/reports/${encodeURIComponent(reportId)}/resolve`,
    method: 'POST',
  })
}

export function hidePublicEntry(spaceId: string, entryId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>({
    url: `/api/spaces/${encodeURIComponent(spaceId)}/entries/${encodeURIComponent(entryId)}/hide`,
    method: 'POST',
  })
}

export function pinPublicEntry(spaceId: string, entryId: string, pinned: boolean): Promise<{ ok: boolean; pinned: boolean }> {
  return request<{ ok: boolean; pinned: boolean }>({
    url: `/api/spaces/${encodeURIComponent(spaceId)}/entries/${encodeURIComponent(entryId)}/pin`,
    method: 'PUT',
    data: { pinned },
  })
}

export function setPublicPostingBlocked(spaceId: string, userId: string, blocked: boolean, reason = ''): Promise<{ ok: boolean; blocked: boolean }> {
  return request<{ ok: boolean; blocked: boolean }>({
    url: `/api/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(userId)}/posting-block`,
    method: 'PUT',
    data: { blocked, reason },
  })
}
