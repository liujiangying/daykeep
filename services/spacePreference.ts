const CURRENT_SPACE_KEY = 'daykeep:current-space-id'
const TIMELINE_ENTRY_ANCHOR_KEY = 'daykeep:timeline-entry-anchor'

export type TimelineEntryAnchor = 'past' | 'today' | 'upcoming'

export function getPreferredSpaceId() {
  try { return String(uni.getStorageSync(CURRENT_SPACE_KEY) || '') }
  catch { return '' }
}

export function setPreferredSpaceId(spaceId: string | null) {
  try {
    if (spaceId) uni.setStorageSync(CURRENT_SPACE_KEY, spaceId)
    else uni.removeStorageSync(CURRENT_SPACE_KEY)
  } catch { /* storage failure must not block navigation */ }
}

/** 为跨 tab 跳转指定一次落点；读取后立即清除，不覆盖用户日常浏览习惯。 */
export function setTimelineEntryAnchor(anchor: TimelineEntryAnchor) {
  try { uni.setStorageSync(TIMELINE_ENTRY_ANCHOR_KEY, anchor) }
  catch { /* storage failure must not block navigation */ }
}

export function consumeTimelineEntryAnchor(): TimelineEntryAnchor | null {
  try {
    const value = String(uni.getStorageSync(TIMELINE_ENTRY_ANCHOR_KEY) || '')
    uni.removeStorageSync(TIMELINE_ENTRY_ANCHOR_KEY)
    return value === 'past' || value === 'today' || value === 'upcoming' ? value : null
  } catch {
    return null
  }
}
