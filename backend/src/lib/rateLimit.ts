type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/**
 * 进程内滑动窗口限流（单副本 API 足够用）。
 * 返回 true 表示已超限。
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const cur = buckets.get(key)
  if (!cur || cur.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  cur.count += 1
  if (cur.count > limit) return true
  return false
}

/** 粗略识别安全扫描常见 payload，避免入库。 */
export function looksLikeAttackPayload(text: string): boolean {
  const s = String(text || '')
  if (!s) return false
  if (s.length > 2000) return true
  return /tst\.qq\.com|ttstqq\.com|ssrfauto|cmd_inject|\/etc\/passwd|file_get_contents|__class__|__mro__|\$\{|`|\|\s*curl\b|limit\s+\d+\s*--|dnsrebinding|base64_decode/i.test(
    s,
  )
}
