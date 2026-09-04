import { describe, expect, it } from 'vitest'
import { toSimplifiedChinese } from './history.js'

describe('toSimplifiedChinese', () => {
  it('normalizes traditional Chinese returned by Wikimedia history events', () => {
    const input = '超強颱風天鴿吹襲香港和澳門，香港天文台和澳門氣象局需要發出分別是5年和18年以來首次的十號熱帶氣旋警告信號。'

    expect(toSimplifiedChinese(input)).toBe(
      '超强台风天鸽吹袭香港和澳门，香港天文台和澳门气象局需要发出分别是5年和18年以来首次的十号热带气旋警告信号。',
    )
  })

  it('leaves simplified Chinese unchanged', () => {
    expect(toSimplifiedChinese('2017年，历史上的今天')).toBe('2017年，历史上的今天')
  })
})
