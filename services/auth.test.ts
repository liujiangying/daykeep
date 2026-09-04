import { describe, expect, it } from 'vitest'
import { isOfficeNetworkError, isSessionBoundaryError } from './auth'

describe('auth error classification', () => {
  it('only treats an explicit unauthenticated response as a session boundary', () => {
    expect(isSessionBoundaryError(new Error('未登录'))).toBe(true)
    expect(isSessionBoundaryError(new Error('网关拒绝访问(403)，请连办公网/VPN 后再试'))).toBe(false)
    expect(isSessionBoundaryError(new Error('网络连接失败，请检查网络设置'))).toBe(false)
  })

  it('recognizes office-network and gateway failures without expiring the session', () => {
    expect(isOfficeNetworkError(new Error('请求失败(403)'))).toBe(true)
    expect(isOfficeNetworkError(new Error('请连接办公网/VPN'))).toBe(true)
    expect(isOfficeNetworkError(new Error('网关拒绝访问'))).toBe(true)
    expect(isOfficeNetworkError(new Error('未登录'))).toBe(false)
  })
})
