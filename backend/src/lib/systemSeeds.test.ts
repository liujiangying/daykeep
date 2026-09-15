import { describe, expect, it } from 'vitest'
import { normalizeSystemSeedEventDate } from './systemSeeds.js'

describe('normalizeSystemSeedEventDate', () => {
  it('将个人空间系统约定固定为 2027-01-01', () => {
    expect(normalizeSystemSeedEventDate({
      eventDate: '2026-09-21',
      ownerType: 'personal',
      clientRequestId: 'seed:self_promise',
      body: '',
    })).toBe('2027-01-01')
  })

  it('兼容仅带旧版正文标识的系统约定', () => {
    expect(normalizeSystemSeedEventDate({
      eventDate: '2026-09-21',
      ownerType: 'personal',
      clientRequestId: null,
      body: '约定\n__dk_seed:self_promise__',
    })).toBe('2027-01-01')
  })

  it('不修改用户内容或圈子内容', () => {
    expect(normalizeSystemSeedEventDate({
      eventDate: '2026-09-21',
      ownerType: 'personal',
      clientRequestId: null,
      body: '给自己的小约定',
    })).toBe('2026-09-21')
    expect(normalizeSystemSeedEventDate({
      eventDate: '2026-09-21',
      ownerType: 'space',
      clientRequestId: 'seed:self_promise',
      body: '',
    })).toBe('2026-09-21')
  })
})
