export type SharedEntryKind = 'normal' | 'commitment' | 'capsule'

/**
 * 新约定以日期为主（anniversary + commitment）；历史 todo + commitment 继续兼容。
 * diary 只用于随手记，不能承载约定语义。
 */
export function isCommitmentEntry(input: {
  type?: string | null
  entryKind?: string | null
}): boolean {
  return input.type !== 'diary' && input.entryKind === 'commitment'
}

export function normalizeSharedEntryKind(
  input: unknown,
  type: string,
  isCapsule = false,
): SharedEntryKind {
  if (isCapsule) return 'capsule'
  const value = String(input || '').trim()
  if (value === 'commitment') {
    return type === 'anniversary' || type === 'todo' ? 'commitment' : 'normal'
  }
  if (value === 'capsule') return 'capsule'
  return 'normal'
}
