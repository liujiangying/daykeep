import { describe, expect, it } from 'vitest'
import { maskPhone } from './phone'

describe('maskPhone', () => {
  it('masks a mainland mobile number', () => {
    expect(maskPhone('18745735124')).toBe('187****5124')
  })

  it('accepts spaced or prefixed input', () => {
    expect(maskPhone('+86 13900000001')).toBe('139****0001')
  })

  it('returns empty for missing or invalid values', () => {
    expect(maskPhone('')).toBe('')
    expect(maskPhone(null)).toBe('')
    expect(maskPhone('12345')).toBe('')
    expect(maskPhone('11012345678')).toBe('')
  })
})
