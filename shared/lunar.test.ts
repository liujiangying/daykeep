import { describe, it, expect } from 'vitest'
import {
  parseYmd,
  fmtYmd,
  lunarYears,
  monthsOfLunarYear,
  dayLabels,
  formatLunarLabel,
  formatAnnualDateLabel,
  formatDateLabel,
  solarToLunarParts,
  lunarToSolarYmd,
  daysUntilLunarYearly,
} from './lunar'

describe('parseYmd / fmtYmd', () => {
  it('parses YYYY-MM-DD', () => {
    expect(parseYmd('2025-03-08')).toEqual({ y: 2025, m: 3, d: 8 })
  })
  it('formats back', () => {
    expect(fmtYmd(2025, 3, 8)).toBe('2025-03-08')
    expect(fmtYmd(2025, 1, 1)).toBe('2025-01-01')
  })
})

describe('lunarYears', () => {
  it('returns range 1901-2100', () => {
    const years = lunarYears()
    expect(years[0]).toBe(1901)
    expect(years[years.length - 1]).toBe(2100)
    expect(years.length).toBe(200)
  })
})

describe('monthsOfLunarYear', () => {
  it('returns 12+ months for a year', () => {
    const months = monthsOfLunarYear(2025)
    expect(months.length).toBeGreaterThanOrEqual(12)
    expect(months[0].label).toContain('月')
  })
})

describe('dayLabels', () => {
  it('returns correct count of Chinese day names', () => {
    const labels = dayLabels(30)
    expect(labels.length).toBe(30)
    expect(labels[0]).toBe('初一')
    expect(labels[29]).toBe('三十')
  })
})

describe('formatLunarLabel', () => {
  it('converts solar date to lunar label', () => {
    const label = formatLunarLabel('2025-01-29') // Spring Festival 2025
    expect(label).toContain('农历')
    expect(label).toContain('正月')
  })
})

describe('formatAnnualDateLabel', () => {
  it('omits the stored year for a solar yearly date', () => {
    expect(formatAnnualDateLabel('2026-07-24', 'solar')).toBe('7月24日')
  })

  it('omits the stored lunar year for a lunar yearly date', () => {
    expect(formatAnnualDateLabel('2025-01-29', 'lunar')).toBe('农历正月初一')
  })
})

describe('formatDateLabel', () => {
  it('returns solar as-is for solar calendar', () => {
    expect(formatDateLabel('2025-03-08', 'solar')).toBe('2025-03-08')
  })
  it('returns lunar label for lunar calendar', () => {
    expect(formatDateLabel('2025-03-08', 'lunar')).toContain('农历')
  })
})

describe('solarToLunarParts', () => {
  it('returns year/month/day', () => {
    const parts = solarToLunarParts('2025-01-29')
    expect(parts.year).toBe(2025)
    expect(parts.month).toBe(1)
    expect(parts.day).toBe(1)
  })
})

describe('lunarToSolarYmd', () => {
  it('converts lunar to solar', () => {
    // Lunar 2025-1-1 should be 2025-01-29
    expect(lunarToSolarYmd(2025, 1, 1)).toBe('2025-01-29')
  })
})

describe('daysUntilLunarYearly', () => {
  it('returns non-negative for future lunar date', () => {
    // Anchor: 2024-02-10 (lunar new year 2024)
    const today = new Date(2025, 0, 1)
    const days = daysUntilLunarYearly('2024-02-10', today)
    expect(days).toBeGreaterThanOrEqual(0)
  })
})
