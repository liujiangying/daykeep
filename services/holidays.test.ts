import { describe, expect, it } from 'vitest'
import { listHolidayOccurrences } from './holidays'

function datesFrom(year: number, month = 1, day = 1) {
  return new Map(
    listHolidayOccurrences(new Date(year, month - 1, day)).map((item) => [
      item.name,
      item.date,
    ]),
  )
}

describe('listHolidayOccurrences', () => {
  it('matches authoritative 2025 lunar festivals and solar terms', () => {
    const dates = datesFrom(2025)
    expect(dates.get('春节')).toBe('2025-01-29')
    expect(dates.get('端午节')).toBe('2025-05-31')
    expect(dates.get('中秋节')).toBe('2025-10-06')
    expect(dates.get('清明')).toBe('2025-04-04')
    expect(dates.get('大暑')).toBe('2025-07-22')
  })

  it('matches authoritative 2026 lunar festivals and solar terms', () => {
    const dates = datesFrom(2026)
    expect(dates.get('春节')).toBe('2026-02-17')
    expect(dates.get('端午节')).toBe('2026-06-19')
    expect(dates.get('中秋节')).toBe('2026-09-25')
    expect(dates.get('清明')).toBe('2026-04-05')
    expect(dates.get('大暑')).toBe('2026-07-23')
  })

  it('matches authoritative 2027 lunar festivals and solar terms', () => {
    const dates = datesFrom(2027)
    expect(dates.get('春节')).toBe('2027-02-06')
    expect(dates.get('端午节')).toBe('2027-06-09')
    expect(dates.get('中秋节')).toBe('2027-09-15')
    expect(dates.get('清明')).toBe('2027-04-05')
    expect(dates.get('冬至')).toBe('2027-12-22')
  })

  it('finds next winter solstice after this year’s winter solstice', () => {
    const dates = datesFrom(2026, 12, 23)
    expect(dates.get('冬至')).toBe('2027-12-22')
  })

  it('keeps fixed Gregorian holidays in the next calendar occurrence', () => {
    const before = datesFrom(2026, 9, 1)
    expect(before.get('国庆节')).toBe('2026-10-01')

    const after = datesFrom(2026, 10, 2)
    expect(after.get('国庆节')).toBe('2027-10-01')
  })
})
