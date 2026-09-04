import { describe, expect, it } from 'vitest'
import { normalizeMoodDate, normalizeMoodWeek, shanghaiDateKey } from './mood'

describe('mood calendar dates', () => {
  it('uses the Shanghai calendar day around the UTC boundary', () => {
    expect(shanghaiDateKey(new Date('2026-08-22T15:59:59Z'))).toBe('2026-08-22')
    expect(shanghaiDateKey(new Date('2026-08-22T16:00:00Z'))).toBe('2026-08-23')
  })

  it('normalizes API timestamps before matching an optimistic update', () => {
    expect(normalizeMoodDate('2026-08-22T00:00:00.000Z')).toBe('2026-08-22')
    expect(normalizeMoodWeek([
      { date: '2026-08-22T00:00:00.000Z', mood: '' },
      { date: '2026-08-22', mood: 'sunny' },
    ])).toEqual([{ date: '2026-08-22', mood: 'sunny' }])
  })
})
