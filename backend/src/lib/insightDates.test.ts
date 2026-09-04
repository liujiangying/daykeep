import { describe, expect, it } from 'vitest'
import { insightDaysUntil, isInsightDateActionable } from './insightDates.js'

describe('insightDaysUntil', () => {
  it('keeps an expired one-off commitment in the past', () => {
    expect(insightDaysUntil('2026-08-25', false, 'none', '2026-08-26')).toBe(-1)
  })

  it('rolls an explicitly recurring day into the next year', () => {
    expect(insightDaysUntil('2025-08-25', true, 'yearly', '2026-08-26')).toBe(364)
  })

  it('keeps today at zero', () => {
    expect(insightDaysUntil('2026-08-26', false, 'none', '2026-08-26')).toBe(0)
  })

  it('only surfaces today and the next 14 days', () => {
    expect(isInsightDateActionable('2026-08-26', false, 'none', '2026-08-26')).toBe(true)
    expect(isInsightDateActionable('2026-09-09', false, 'none', '2026-08-26')).toBe(true)
    expect(isInsightDateActionable('2026-09-10', false, 'none', '2026-08-26')).toBe(false)
    expect(isInsightDateActionable('2026-08-25', false, 'none', '2026-08-26')).toBe(false)
  })

  it('does not keep a recurring date visible after this year occurrence passes', () => {
    expect(isInsightDateActionable('2025-08-25', true, 'yearly', '2026-08-26')).toBe(false)
  })
})
