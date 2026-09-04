export interface DissolvedSpaceLike {
  dissolvedAt?: string
  dissolvedByNickname?: string
  purgeAt?: string
}

export function spacePurgeDaysLeft(purgeAt?: string, now = Date.now()): number {
  const deadline = new Date(purgeAt || '').getTime()
  if (!Number.isFinite(deadline)) return 0
  return Math.max(0, Math.ceil((deadline - now) / 86400000))
}

export function spaceDissolutionLines(space: DissolvedSpaceLike, now = Date.now()) {
  return {
    title: `${space.dissolvedByNickname?.trim() || '一位成员'}已解除该共同记录空间～`,
    desc: `— ${spacePurgeDaysLeft(space.purgeAt, now)} 天后将彻底注销该空间`,
  }
}
