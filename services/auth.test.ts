import { describe, expect, it } from 'vitest'
import { isSessionBoundaryError, isTransientAccessError } from './auth'

describe('auth error classification', () => {
  it('only treats an explicit unauthenticated response as a session boundary', () => {
    expect(isSessionBoundaryError(new Error('未登录'))).toBe(true)
    expect(isSessionBoundaryError(new Error('服务拒绝访问(403)，请稍后重试'))).toBe(false)
    expect(isSessionBoundaryError(new Error('网络连接失败，请检查网络设置'))).toBe(false)
  })

  it('recognizes office-network and gateway failures without expiring the session', () => {
    expect(isTransientAccessError(new Error('请求失败(403)'))).toBe(true)
    expect(isTransientAccessError(new Error('网络连接失败'))).toBe(true)
    expect(isTransientAccessError(new Error('网关拒绝访问'))).toBe(true)
    expect(isTransientAccessError(new Error('未登录'))).toBe(false)
  })
})
