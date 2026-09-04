import { getCachedUserId } from '@/services/auth'

const ONBOARDING_VERSION = 'v1'
const KEY_PREFIX = `dk_onboarding_seen_${ONBOARDING_VERSION}_`

function storageKey() {
  const userId = getCachedUserId()
  return userId ? `${KEY_PREFIX}${userId}` : ''
}

/** 首次登录引导按用户保存；已有内置记录不影响是否展示。 */
export function shouldShowOnboarding() {
  const key = storageKey()
  if (!key) return false
  try {
    return uni.getStorageSync(key) !== '1'
  } catch {
    return false
  }
}

export function completeOnboarding() {
  const key = storageKey()
  if (!key) return
  try {
    uni.setStorageSync(key, '1')
  } catch {
    /* ignore */
  }
}
