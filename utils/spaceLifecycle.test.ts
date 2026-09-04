import { describe, expect, it } from 'vitest'
import { spaceDissolutionLines, spacePurgeDaysLeft } from './spaceLifecycle'

describe('space lifecycle display', () => {
  const now = new Date('2026-08-22T00:00:00.000Z').getTime()

  it('rounds a partial remaining day up for the user-facing countdown', () => {
    expect(spacePurgeDaysLeft('2026-08-23T00:00:01.000Z', now)).toBe(2)
  })

  it('never displays a negative countdown', () => {
    expect(spacePurgeDaysLeft('2026-08-21T00:00:00.000Z', now)).toBe(0)
  })

  it('builds the two status lines with the dissolver nickname', () => {
    expect(spaceDissolutionLines({ dissolvedByNickname: '小林', purgeAt: '2026-08-29T00:00:00.000Z' }, now)).toEqual({
      title: '小林已解除该共同记录空间～',
      desc: '— 7 天后将彻底注销该空间',
    })
  })
})
