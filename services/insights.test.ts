import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/request', () => ({ request: vi.fn(() => Promise.resolve([])) }))

import { request } from '@/api/request'
import { listInsights } from './insights'

describe('insight scope requests', () => {
  beforeEach(() => vi.mocked(request).mockClear())

  it('loads personal insights without a space query', async () => {
    await listInsights(null)
    expect(request).toHaveBeenCalledWith({ url: '/api/insights', timeout: 120000 })
  })

  it('loads only the selected space insights', async () => {
    await listInsights('42')
    expect(request).toHaveBeenCalledWith({ url: '/api/insights?spaceId=42', timeout: 120000 })
  })
})
