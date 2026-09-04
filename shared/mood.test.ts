import { describe, expect, it } from 'vitest'
import { encodeCustomMood, isMoodValue, moodAssetForValue, moodIconForValue, normalizeCustomEmoji } from './mood'

describe('custom mood emoji', () => {
  it('accepts one complete emoji sequence', () => {
    expect(normalizeCustomEmoji(' 😊 ')).toBe('😊')
    expect(normalizeCustomEmoji('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦')
    expect(normalizeCustomEmoji('🇨🇳')).toBe('🇨🇳')
    expect(normalizeCustomEmoji('🀄️')).toBe('🀄️')
    expect(encodeCustomMood('🥰')).toBe('custom:🥰')
  })

  it('rejects text, symbols and multiple emoji', () => {
    expect(normalizeCustomEmoji('开心')).toBe('')
    expect(normalizeCustomEmoji('+')).toBe('')
    expect(normalizeCustomEmoji('😊😊')).toBe('')
    expect(encodeCustomMood('A')).toBe('')
  })

  it('validates and displays preset and custom values', () => {
    expect(isMoodValue('sunny')).toBe(true)
    expect(isMoodValue('custom:🫶')).toBe(true)
    expect(isMoodValue('custom:开心')).toBe(false)
    expect(moodIconForValue('custom:🫶')).toBe('🫶')
  })

  it('maps preset moods to Lucide weather assets', () => {
    expect(moodAssetForValue('sunny')).toBe('/static/mood/sunny.png')
    expect(moodAssetForValue('custom:🫶')).toBe('')
  })
})
