import { describe, expect, it } from 'vitest'
import { normalizeSingleTag, suggestEntryTags } from '@/subpackages/shared/entryMeta'

describe('entry meta', () => {
  it('normalizes one hashtag but rejects delimiter-based bulk input', () => {
    expect(normalizeSingleTag('# 西湖')).toBe('西湖')
    expect(normalizeSingleTag('西湖,旅行')).toBe('')
    expect(normalizeSingleTag('西湖 旅行')).toBe('')
  })

  it('recommends from text and image presence without duplicating selected tags', () => {
    expect(suggestEntryTags({ body: '今天在西湖旅行，喝了咖啡', hasImages: true, selected: ['旅行'] }))
      .toEqual(expect.arrayContaining(['在路上', '美食', '探店', '照片日记']))
    expect(suggestEntryTags({ body: '今天在西湖旅行', selected: ['旅行'] })).not.toContain('旅行')
  })
})
