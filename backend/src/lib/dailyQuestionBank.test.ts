import { describe, expect, it } from 'vitest'
import { DAILY_QUESTIONS, dailyQuestionForDate, nextDailyQuestion } from './dailyQuestionBank.js'

describe('dailyQuestionForDate', () => {
  it('keeps the question stable within the same date', () => {
    expect(dailyQuestionForDate('2026-08-22')).toEqual(dailyQuestionForDate('2026-08-22'))
  })

  it('does not repeat within any seven-day window', () => {
    const start = Date.UTC(2026, 0, 1)
    for (let offset = 0; offset < DAILY_QUESTIONS.length * 2; offset += 1) {
      const keys = Array.from({ length: 7 }, (_, day) => {
        const date = new Date(start + (offset + day) * 86_400_000).toISOString().slice(0, 10)
        return dailyQuestionForDate(date).key
      })
      expect(new Set(keys).size).toBe(7)
    }
  })

  it('swaps to a different question from the bank', () => {
    const current = DAILY_QUESTIONS[6]
    const next = nextDailyQuestion(current)
    expect(next.text).not.toBe(current)
    expect(DAILY_QUESTIONS).toContain(next.text)
  })
})
