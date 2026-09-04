import { describe, expect, it } from 'vitest'
import { hasValidCoords, normalizeLocationName, isLocationPermissionDenied, isUserCancelled, MAX_LOCATION_LEN } from '@/subpackages/shared/services/location'

describe('normalizeLocationName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeLocationName('  望京SOHO  ')).toBe('望京SOHO')
  })

  it('truncates at MAX_LOCATION_LEN so the client never stores more than the server keeps', () => {
    const long = '地'.repeat(100)
    expect(normalizeLocationName(long)).toHaveLength(MAX_LOCATION_LEN)
  })

  it('keeps names at the boundary intact', () => {
    const exact = '地'.repeat(MAX_LOCATION_LEN)
    expect(normalizeLocationName(exact)).toBe(exact)
  })

  it.each([[''], ['   '], [null], [undefined]])('returns an empty string for %p', (input) => {
    expect(normalizeLocationName(input as unknown as string)).toBe('')
  })
})

describe('hasValidCoords', () => {
  it('accepts a normal Beijing coordinate', () => {
    expect(hasValidCoords(39.9042, 116.4074)).toBe(true)
  })

  it('rejects 0,0 because it is the default value of an unset column, not a real place', () => {
    expect(hasValidCoords(0, 0)).toBe(false)
  })

  it.each([
    ['missing values', undefined, undefined],
    ['latitude out of range', 91, 116],
    ['longitude out of range', 39, 181],
    ['non-numeric input', NaN, NaN],
  ])('rejects %s', (_label, lat, lng) => {
    expect(hasValidCoords(lat as number, lng as number)).toBe(false)
  })

  it('accepts a valid coordinate where only one component is zero', () => {
    expect(hasValidCoords(0, 116.4074)).toBe(true)
  })
})

describe('error classification', () => {
  it.each([
    ['getLocation:fail auth deny'],
    ['authorize no response'],
    ['getLocation:fail permission denied'],
    ['chooseLocation:fail user deny'],
  ])('treats %s as a permission denial', (errMsg) => {
    expect(isLocationPermissionDenied({ errMsg })).toBe(true)
  })

  it('does not treat a generic failure as a permission denial', () => {
    expect(isLocationPermissionDenied({ errMsg: 'getLocation:fail timeout' })).toBe(false)
  })

  it('recognises an explicit user cancel so callers stay silent', () => {
    expect(isUserCancelled({ errMsg: 'chooseLocation:fail cancel' })).toBe(true)
  })

  it('does not treat a timeout as a cancel', () => {
    expect(isUserCancelled({ errMsg: 'getLocation:fail timeout' })).toBe(false)
  })
})
