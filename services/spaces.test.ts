import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/request', () => ({ request: vi.fn(() => Promise.resolve({})) }))

import { request } from '@/api/request'
import {
  dismissPublicContentReport,
  getOfficialExperienceSpace,
  hidePublicEntry,
  joinOfficialExperienceSpace,
  listOfficialSpaceMembers,
  listPublicBlockedMembers,
  listPublicContentReports,
  pinPublicEntry,
  reportPublicEntry,
  setOfficialSpaceMemberRole,
  setPublicPostingBlocked,
} from './spaces'

describe('official experience space requests', () => {
  beforeEach(() => vi.mocked(request).mockClear())

  it('previews and joins without an invite code', async () => {
    await getOfficialExperienceSpace()
    expect(request).toHaveBeenLastCalledWith({ url: '/api/spaces/official-experience' })

    await joinOfficialExperienceSpace()
    expect(request).toHaveBeenLastCalledWith({ url: '/api/spaces/official-experience/join', method: 'POST' })
  })

  it('sends moderation actions to space-scoped endpoints', async () => {
    await listOfficialSpaceMembers('12')
    expect(request).toHaveBeenLastCalledWith({ url: '/api/spaces/12/members' })

    await setOfficialSpaceMemberRole('12', '107', 'admin')
    expect(request).toHaveBeenLastCalledWith({
      url: '/api/spaces/12/members/107/role', method: 'PUT', data: { role: 'admin' },
    })

    await reportPublicEntry('12', '34', '涉及隐私')
    expect(request).toHaveBeenLastCalledWith({
      url: '/api/spaces/12/reports', method: 'POST', data: { entryId: '34', reason: '涉及隐私' },
    })

    await dismissPublicContentReport('12', '56')
    expect(request).toHaveBeenLastCalledWith({ url: '/api/spaces/12/reports/56/resolve', method: 'POST' })

    await listPublicContentReports('12')
    expect(request).toHaveBeenLastCalledWith({ url: '/api/spaces/12/reports' })

    await listPublicBlockedMembers('12')
    expect(request).toHaveBeenLastCalledWith({ url: '/api/spaces/12/blocked-members' })

    await hidePublicEntry('12', '34')
    expect(request).toHaveBeenLastCalledWith({ url: '/api/spaces/12/entries/34/hide', method: 'POST' })

    await pinPublicEntry('12', '34', true)
    expect(request).toHaveBeenLastCalledWith({
      url: '/api/spaces/12/entries/34/pin', method: 'PUT', data: { pinned: true },
    })

    await setPublicPostingBlocked('12', '7', true, '待复核')
    expect(request).toHaveBeenLastCalledWith({
      url: '/api/spaces/12/members/7/posting-block', method: 'PUT', data: { blocked: true, reason: '待复核' },
    })
  })
})
