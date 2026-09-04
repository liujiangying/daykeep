/** 拒绝安全扫描 / 注入探针常见标题，避免原样入库污染时间线 */
const BLOCKED_TITLE =
  /jdbc:|idbc:|mvsal|cmd_inject|file_get_contents|__import__|child_process|getRuntime|\/etc\/passwd|\.php\b|allowLoadLocalInfile|%bf%|%27|union\s+select|sleep\s*\(|benchmark\s*\(|tst\.qq\.com|tst2\.qq\.com|<\s*script|javascript:|onerror\s*=|onmouseover|prompt\s*\(|T_S_T|\.\.\/|md5\s*\(|limit\s+1--|diao[_]?yu|wangzhan|AND\s+\d+\s*=|OR\s+\d+\s*=/i

const SUSPICIOUS_CHARS = /[{}`<>;|\\]|\$\{|#\{|\{\{|"/

const BASE64ISH = /^[A-Za-z0-9+/]{32,}={0,2}$/

/** 允许常见中英文、数字与少量标点；拒绝控制字符与明显探针 */
export function sanitizeEntryTitle(raw: unknown, maxLen = 128): { ok: true; title: string } | { ok: false; msg: string } {
  const title = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLen)
  if (!title) return { ok: false, msg: 'title required' }
  if (BLOCKED_TITLE.test(title) || SUSPICIOUS_CHARS.test(title) || BASE64ISH.test(title)) {
    return { ok: false, msg: 'invalid title' }
  }
  if (/https?:\/\//i.test(title) || title.includes('://') || /^[0-9]{16,}$/.test(title)) {
    return { ok: false, msg: 'invalid title' }
  }
  // 标题里不应出现大段百分号编码（扫描特征）
  if ((title.match(/%[0-9a-fA-F]{2}/g) || []).length >= 2) {
    return { ok: false, msg: 'invalid title' }
  }
  return { ok: true, title }
}

type Bucket = { stamps: number[] }

const createBuckets = new Map<number, Bucket>()

/** 每用户创建限流：默认 20 次/分钟、120 次/小时（仅统计真正新建成功）。 */
export function checkCreateRateLimit(
  userId: number,
  opts: { perMinute?: number; perHour?: number } = {},
): { ok: true } | { ok: false; msg: string } {
  const perMinute = opts.perMinute ?? 20
  const perHour = opts.perHour ?? 120
  const now = Date.now()
  let b = createBuckets.get(userId)
  if (!b) {
    b = { stamps: [] }
    createBuckets.set(userId, b)
  }
  b.stamps = b.stamps.filter((t) => now - t < 60 * 60 * 1000)
  const lastMin = b.stamps.filter((t) => now - t < 60 * 1000).length
  if (lastMin >= perMinute) {
    return { ok: false, msg: '创建太频繁，请稍后再试' }
  }
  if (b.stamps.length >= perHour) {
    return { ok: false, msg: '这一小时创建次数已达上限，请稍后再试' }
  }
  return { ok: true }
}

/** 仅在真正 INSERT 成功后记账，幂等命中 / 校验失败不占用额度。 */
export function recordCreateSuccess(userId: number): void {
  const now = Date.now()
  let b = createBuckets.get(userId)
  if (!b) {
    b = { stamps: [] }
    createBuckets.set(userId, b)
  }
  b.stamps = b.stamps.filter((t) => now - t < 60 * 60 * 1000)
  b.stamps.push(now)
}
