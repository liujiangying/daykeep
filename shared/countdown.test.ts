import { describe, it, expect } from 'vitest'
import {
  daysUntil,
  normalizeRepeatRule,
  advanceEventDate,
  formatCountdownLabel,
  repeatRuleLabel,
} from './countdown'

describe('normalizeRepeatRule', () => {
  it('returns valid rule as-is', () => {
    expect(normalizeRepeatRule({ repeatRule: 'yearly' })).toBe('yearly')
    expect(normalizeRepeatRule({ repeatRule: 'weekly' })).toBe('weekly')
    expect(normalizeRepeatRule({ repeatRule: 'monthly' })).toBe('monthly')
    expect(normalizeRepeatRule({ repeatRule: 'none' })).toBe('none')
  })

  it('falls back to yearly when recurring is true', () => {
    expect(normalizeRepeatRule({ recurring: true })).toBe('yearly')
  })

  it('falls back to none when recurring is false', () => {
    expect(normalizeRepeatRule({ recurring: false })).toBe('none')
    expect(normalizeRepeatRule({})).toBe('none')
  })
})

describe('daysUntil', () => {
  const today = new Date(2025, 0, 15) // Jan 15, 2025

  it('none: returns raw difference', () => {
    expect(daysUntil('2025-01-20', 'none', today)).toBe(5)
    expect(daysUntil('2025-01-10', 'none', today)).toBe(-5)
    expect(daysUntil('2025-01-15', 'none', today)).toBe(0)
  })

  it('yearly: finds next occurrence', () => {
    // Mar 1 is in the future relative to Jan 15
    expect(daysUntil('2020-03-01', 'yearly', today)).toBe(45)
    // Jan 10 already passed this year -> next year
    expect(daysUntil('2020-01-10', 'yearly', today)).toBe(360)
  })

  it('yearly: rolls a just-passed original date to next year on detail pages too', () => {
    const aug4 = new Date(2026, 7, 4)
    expect(daysUntil('2026-08-03', 'yearly', aug4)).toBe(364)
    expect(daysUntil('2026-08-03', 'none', aug4)).toBe(-1)
  })

  it('monthly: finds next same day this or next month', () => {
    // 20th is still coming this month
    expect(daysUntil('2024-06-20', 'monthly', today)).toBe(5)
    // 10th already passed -> next month Feb 10
    expect(daysUntil('2024-06-10', 'monthly', today)).toBe(26)
  })

  it('weekly: finds next same weekday', () => {
    // Jan 15 2025 is Wednesday (day 3)
    // If event was on a Friday (day 5), next Friday is Jan 17
    expect(daysUntil('2025-01-03', 'weekly', today)).toBe(2) // Jan 3 is Friday -> next Fri = Jan 17
  })
})

describe('advanceEventDate', () => {
  const from = new Date(2025, 0, 15)

  it('none returns same date', () => {
    expect(advanceEventDate('2025-01-10', 'none', from)).toBe('2025-01-10')
  })

  it('yearly advances to next year', () => {
    expect(advanceEventDate('2025-01-15', 'yearly', from)).toBe('2026-01-15')
  })

  it('monthly advances to next month', () => {
    expect(advanceEventDate('2025-01-15', 'monthly', from)).toBe('2025-02-15')
  })
})

describe('formatCountdownLabel', () => {
  it('today', () => {
    expect(formatCountdownLabel('生日', 0)).toBe('今天是生日')
  })
  it('future', () => {
    expect(formatCountdownLabel('生日', 5)).toBe('距离生日还有5日')
  })
  it('past', () => {
    expect(formatCountdownLabel('生日', -3)).toBe('生日已过去3日')
  })
})

describe('repeatRuleLabel', () => {
  it('returns Chinese labels', () => {
    expect(repeatRuleLabel('yearly')).toBe('每年')
    expect(repeatRuleLabel('monthly')).toBe('每月')
    expect(repeatRuleLabel('weekly')).toBe('每周')
    expect(repeatRuleLabel('none')).toBe('')
  })
})
