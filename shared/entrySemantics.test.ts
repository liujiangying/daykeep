import { describe, expect, it } from 'vitest'
import { isCommitmentEntry, normalizeSharedEntryKind } from './entrySemantics'

describe('entry commitment semantics', () => {
  it('treats new date commitments as commitments', () => {
    expect(isCommitmentEntry({ type: 'anniversary', entryKind: 'commitment' })).toBe(true)
    expect(normalizeSharedEntryKind('commitment', 'anniversary')).toBe('commitment')
  })

  it('keeps legacy todo commitments compatible', () => {
    expect(isCommitmentEntry({ type: 'todo', entryKind: 'commitment' })).toBe(true)
    expect(normalizeSharedEntryKind('commitment', 'todo')).toBe('commitment')
  })

  it('does not allow diary entries to become commitments', () => {
    expect(isCommitmentEntry({ type: 'diary', entryKind: 'commitment' })).toBe(false)
    expect(normalizeSharedEntryKind('commitment', 'diary')).toBe('normal')
  })

  it('keeps capsule semantics ahead of the submitted kind', () => {
    expect(normalizeSharedEntryKind('commitment', 'anniversary', true)).toBe('capsule')
  })
})
