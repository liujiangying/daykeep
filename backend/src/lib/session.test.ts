import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db.js', () => ({ queryOne: vi.fn() }))
vi.mock('../jwt.js', () => ({
  signAccess: vi.fn((uid: string | number, ver: number) => `access:${uid}:${ver}`),
  signRefresh: vi.fn((uid: string | number, ver: number) => `refresh:${uid}:${ver}`),
}))

import { queryOne } from '../db.js'
import { issueTokensAfterLogin } from './session.js'

const queryOneMock = vi.mocked(queryOne)

describe('issueTokensAfterLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('使用当前 token version，不作废其他已登录端', async () => {
    queryOneMock.mockResolvedValueOnce({ tokenVersion: '7' })

    await expect(issueTokensAfterLogin(42)).resolves.toEqual({
      userId: 42,
      accessToken: 'access:42:7',
      refreshToken: 'refresh:42:7',
    })
    expect(queryOneMock).toHaveBeenCalledOnce()
    expect(String(queryOneMock.mock.calls[0][0])).toContain('SELECT token_version')
    expect(String(queryOneMock.mock.calls[0][0])).not.toContain('UPDATE t_user')
  })

  it('用户不存在时不签发 token', async () => {
    queryOneMock.mockResolvedValueOnce(null)
    await expect(issueTokensAfterLogin(404)).rejects.toThrow('user not found')
  })
})
