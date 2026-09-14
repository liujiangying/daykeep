import { Router, type NextFunction, type Request, type Response } from 'express'
import crypto from 'node:crypto'
import multer from 'multer'
import { getPool, query, queryOne } from '../db.js'
import { requireAuth } from '../auth.js'
import { buildObjectKey, normalizeStoredAsset, normalizeUserAsset, putObject } from '../cos.js'

const bgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

function handleBgFile(req: Request, res: Response, next: NextFunction) {
  bgUpload.single('file')(req, res, (err) => {
    if (!err) return next()
    const status = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    return res.status(status).json({ code: status, msg: clientMessage(err, 'upload failed') })
  })
}
import {
  daysUntil,
  formatCountdownLabel,
  normalizeRepeatRule,
  advanceEventDate,
  type RepeatRule,
} from '../lib/countdown.js'
import { checkCreateRateLimit, recordCreateSuccess, sanitizeEntryTitle } from '../lib/entryGuard.js'
import { decodeBase64Image, sanitizeImageBuffer } from '../lib/imageValidation.js'
import { clientMessage } from '../lib/clientError.js'
import { normalizeSharedEntryKind } from '../../../shared/entrySemantics.js'

export const entriesRouter = Router()
entriesRouter.use(requireAuth)

type EntryRow = {
  id: string
  userId: string
  authorName?: string
  authorAvatar?: string
  type: string
  title: string
  body: string
  eventDate: string
  eventAt: string | null
  calendar: string
  recurring: boolean
  repeatRule: RepeatRule
  pinned: boolean
  showInTimeline: boolean
  remindEnabled: boolean
  remindAheadDays: number
  remindTime: string
  wxSubscribeStatus: string
  wxSubscribeSentAt: string | null
  wxSubscribeError: string
  wxSubscribeAttempts: number
  todoStatus: string | null
  color: string
  images: string
  backgroundUrl: string
  location: string
  locationLat: number | null
  locationLng: number | null
  tags: unknown
  ownerType: string
  spaceId: string | null
  visibility: string
  entryKind: string
  commitmentMeta: unknown
  capsuleUnlockAt: string | null
  capsuleUnlockMode: 'scheduled' | 'random'
  capsuleUnlocked: boolean
  createdAt: string
  updatedAt: string
  isCollaborated?: boolean
}

const SELECT_FIELDS = `
  id, user_id AS "userId", type, title, body,
  to_char(event_date, 'YYYY-MM-DD') AS "eventDate",
  CASE WHEN event_at IS NULL THEN NULL
       ELSE to_char(event_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS')
  END AS "eventAt",
  calendar, recurring,
  COALESCE(repeat_rule, 'none') AS "repeatRule",
  COALESCE(pinned, FALSE) AS "pinned",
  show_in_timeline AS "showInTimeline",
  remind_enabled AS "remindEnabled",
  remind_ahead_days AS "remindAheadDays",
  LPAD((COALESCE(remind_time_minutes, 600) / 60)::text, 2, '0')
    || ':' || LPAD((COALESCE(remind_time_minutes, 600) % 60)::text, 2, '0') AS "remindTime",
  wx_subscribe_status AS "wxSubscribeStatus",
  wx_subscribe_sent_at AS "wxSubscribeSentAt",
  COALESCE(wx_subscribe_error, '') AS "wxSubscribeError",
  COALESCE(wx_subscribe_attempts, 0) AS "wxSubscribeAttempts",
  todo_status AS "todoStatus",
  color,
  COALESCE(images, '[]') AS "images",
  background_url AS "backgroundUrl",
  COALESCE(location, '') AS "location",
  location_lat AS "locationLat",
  location_lng AS "locationLng",
  COALESCE(tags, '[]'::jsonb) AS "tags",
  COALESCE(owner_type, 'personal') AS "ownerType",
  space_id::text AS "spaceId",
  COALESCE(visibility, 'private') AS "visibility",
  COALESCE(entry_kind, 'normal') AS "entryKind",
  COALESCE(commitment_meta, '{}'::jsonb) AS "commitmentMeta",
  capsule_unlock_at AS "capsuleUnlockAt",
  COALESCE(capsule_unlock_mode, 'scheduled') AS "capsuleUnlockMode",
  capsule_unlocked AS "capsuleUnlocked",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`

function parseImages(raw: unknown, userId?: string | number): string[] {
  const normalize = (value: string) => {
    if (userId == null) return normalizeStoredAsset(value)
    return normalizeUserAsset(value, userId, ['entry'])
  }
  if (Array.isArray(raw)) {
    return raw.filter((x) => typeof x === 'string').map(normalize).filter((x): x is string => !!x).slice(0, 9)
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((x) => typeof x === 'string').map(normalize).filter((x): x is string => !!x).slice(0, 9)
      }
    } catch {
      /* ignore */
    }
  }
  return []
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((item) => String(item || '').trim().replace(/^#/, '').slice(0, 16)).filter(Boolean))].slice(0, 8)
}

function normalizeOwnerType(input: unknown): 'personal' | 'space' {
  return String(input || '') === 'space' ? 'space' : 'personal'
}

/**
 * 记录的「可读」判定，列表与详情必须共用同一份，否则会出现
 * 「时光轴上看得到共同记录、点进详情却 404」这种口径分裂。
 *
 * 空间分支必须同时满足 visibility = 'space'：记录挂在时光圈下但作者标记为私密时，
 * 不能因为「同圈」就对全体成员可见。
 *
 * 注意这里只放开读。写入侧（PUT/DELETE）仍限定作者或 partner 协作者，
 * 空间成员对他人的共同记录是只读的。
 *
 * @param userParam 当前用户在该语句里的占位符，如 '$1'、'$2'（非用户输入）
 */
function readableCond(userParam: string): string {
  return `(
    (
      COALESCE(owner_type, 'personal') <> 'space'
      AND (
        user_id = ${userParam}
        OR id IN (SELECT entry_id FROM t_entry_collaborator WHERE user_id = ${userParam} AND role = 'partner')
      )
    )
    OR (
      owner_type = 'space'
      AND visibility = 'space'
      AND space_id IN (
        SELECT m.space_id
          FROM t_space_member m
          JOIN t_space s ON s.id = m.space_id AND s.dissolved_at IS NULL
         WHERE m.user_id = ${userParam}
      )
    )
  )`
}

function normalizeVisibility(input: unknown, ownerType: 'personal' | 'space'): 'private' | 'space' {
  if (ownerType === 'space') return 'space'
  return String(input || '') === 'space' ? 'space' : 'private'
}

/** 记录类型，与 db.ts 的 chk_entry_type 约束同源。 */
const ENTRY_TYPES = ['anniversary', 'todo', 'diary'] as const

/**
 * 新约定以日期为主（anniversary + commitment）；历史 todo + commitment 继续兼容。
 * diary 不能承载约定语义，胶囊仍由 capsuleUnlockAt 决定。
 */
function normalizeEntryKind(
  input: unknown,
  type: string,
  isCapsule = false,
): 'normal' | 'commitment' | 'capsule' {
  return normalizeSharedEntryKind(input, type, isCapsule)
}

function normalizeSpaceId(input: unknown, ownerType: 'personal' | 'space'): string | null {
  if (ownerType !== 'space') return null
  const raw = String(input ?? '').trim()
  if (!/^\d+$/.test(raw)) return null
  return raw
}

/**
 * 地点长度上限，与编辑页输入框的 maxlength 一致。
 * 服务端是唯一做截断的地方：之前客户端截 64、服务端截 256，
 * 65~256 字的地点存得进来，却会在下一次保存任何无关字段时被悄悄截成 64。
 */
const MAX_LOCATION_LEN = 64

/**
 * 地点坐标归一化。返回 null 表示「没有可用坐标」，写库即为 NULL。
 *
 * 不把缺失坐标折成 0：0,0 是几内亚湾里的真实坐标，用它当哨兵值会让所有
 * 没选过点的记录在地图上堆到同一处。范围校验也必须做——客户端把经纬度
 * 传反是很常见的错误，纬度收到 116 这种值应当直接丢弃而不是存进去。
 */
function normalizeCoord(value: unknown, limit: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  if (num < -limit || num > limit) return null
  return num
}

/** 经纬度必须成对存在，只有一半的坐标无法用于地图与导航。 */
function normalizeCoordPair(lat: unknown, lng: unknown): { lat: number | null; lng: number | null } {
  const nextLat = normalizeCoord(lat, 90)
  const nextLng = normalizeCoord(lng, 180)
  if (nextLat === null || nextLng === null) return { lat: null, lng: null }
  if (nextLat === 0 && nextLng === 0) return { lat: null, lng: null }
  return { lat: nextLat, lng: nextLng }
}

/** 约定确认状态的合法取值，与前端 CommitmentMeta.confirmStatus 同源。 */
const CONFIRM_STATUSES = ['pending', 'confirmed', 'declined'] as const
type ConfirmStatus = (typeof CONFIRM_STATUSES)[number]

/**
 * commitment_meta 按白名单重建，不做深拷贝直存。
 * 之前是 JSON.parse(JSON.stringify(input))，那只是深拷贝：键名、层级、体积
 * 全部由客户端决定，等于开放一个任意写入的 JSONB 字段，既能塞进几 MB 的
 * 垃圾撑爆行，也会让后面任何按 meta 取值的逻辑必须自己防御脏结构。
 * 这里只保留唯一被消费的 confirmStatus，其余一律丢弃。
 *
 * 地点不放在 meta 里：t_entry.location 是唯一数据源。两处都能存会立刻产生
 * 「改了一处、另一处还是旧值」的分叉，展示端也就得猜哪边更新。
 *
 * confirmStatus 只接受调用者自己那一个键（ownUserId）。只校验键的形状是不够的：
 * 那样创建者可以直接 POST `{ confirmStatus: { "<对方userId>": "confirmed" } }`，
 * 凭空造出对方的同意，把 POST /:id/confirm「只能写自己」的保证整个绕开。
 */
function normalizeCommitmentMeta(input: unknown, ownUserId: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const source = input as Record<string, unknown>
  const output: Record<string, unknown> = {}

  const rawStatus = source.confirmStatus
  if (rawStatus && typeof rawStatus === 'object' && !Array.isArray(rawStatus)) {
    const confirmStatus: Record<string, ConfirmStatus> = {}
    for (const [userId, value] of Object.entries(rawStatus as Record<string, unknown>)) {
      // 只允许写自己的表态，别人的确认必须由本人调 /confirm 产生。
      // 因此这里最多只会留下 1 个键，不再需要额外的数量上限。
      if (userId !== ownUserId) continue
      const status = String(value || '')
      if (!CONFIRM_STATUSES.includes(status as ConfirmStatus)) continue
      confirmStatus[userId] = status as ConfirmStatus
    }
    if (Object.keys(confirmStatus).length) output.confirmStatus = confirmStatus
  }

  return output
}

function normalizeAssignments(input: unknown) {
  if (!Array.isArray(input)) return []
  return input.slice(0, 20).map((raw, index) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    return {
      id: String(item.id || `task_${index + 1}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || `task_${index + 1}`,
      text: String(item.text || '').trim().slice(0, 80),
      assigneeUserId: /^\d+$/.test(String(item.assigneeUserId || '')) ? String(item.assigneeUserId) : '',
      done: item.done === true,
    }
  }).filter((item) => item.text)
}

function normalizeEventAt(input: unknown, eventDate: string): string | null {
  if (input == null || input === '') return null
  const s = String(input).trim().replace('T', ' ')
  // YYYY-MM-DD HH:mm:ss or YYYY-MM-DD HH:mm
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.length === 16 ? `${s}:00` : s
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`
  if (eventDate) return `${eventDate} 00:00:00`
  return null
}

/** 将前端 HH:mm 规范为当天的分钟数；历史记录与未传值默认上午十点。 */
function normalizeRemindTime(input: unknown): number {
  const value = String(input ?? '').trim()
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return 10 * 60
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return 10 * 60
  }
  return hour * 60 + minute
}

/** 客户端幂等键：8–64 位字母数字与 _-: */
function normalizeClientRequestId(input: unknown): string | null {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  if (raw.length < 8 || raw.length > 64) return null
  if (!/^[A-Za-z0-9_.:-]+$/.test(raw)) return null
  return raw
}

const SEED_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const SEED_MARKER_RE = /__dk_seed:([a-z0-9][a-z0-9_-]{0,63})__/g

function normalizeSeedNames(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.map((item) => String(item || '').trim()).filter((item) => SEED_NAME_RE.test(item)))].slice(
    0,
    32,
  )
}

function inferDiarySeeds(row: { body: string; title: string; images: string }): string[] {
  const seeds = new Set<string>()
  const body = String(row.body || '')
  const title = String(row.title || '')
  const images = String(row.images || '')
  let marker: RegExpExecArray | null
  SEED_MARKER_RE.lastIndex = 0
  while ((marker = SEED_MARKER_RE.exec(body))) seeds.add(marker[1])

  // 兼容没有 seed 标记的早期版本；即使示例已经软删除，也能回填为“种过”。
  if (
    body.includes('这里是随手记，欢迎记录下一闪而过') ||
    images.includes('modern-city-night') ||
    images.includes('underwater-world') ||
    images.includes('cyberpunk-city')
  ) {
    seeds.add('diary_welcome')
  }
  if (
    body.includes('材料：几个西红柿和几颗鸡蛋') ||
    images.includes('tomato-eggs') ||
    images.includes('1785229239607_e075c93e') ||
    title.includes('西红柿炒蛋') ||
    body.includes('西红柿炒蛋')
  ) {
    seeds.add('diary_tomato_eggs')
  }
  return [...seeds]
}

async function markUserSeeds(userId: string | number, seeds: string[]): Promise<void> {
  if (!seeds.length) return
  await query(
    `INSERT INTO t_user_seed_state (user_id, seed)
     SELECT $1, seed
       FROM unnest($2::text[]) AS seeds(seed)
     ON CONFLICT (user_id, seed)
     DO UPDATE SET updated_at = now()`,
    [userId, seeds],
  )
}

function shanghaiNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0)
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
}

/** 授权时提醒的实际发送时刻必须仍在未来，避免授权后被定时器立即补发。 */
function reminderScheduleError(
  eventDate: string,
  repeatRule: RepeatRule,
  calendar: 'solar' | 'lunar',
  remindAheadDays: number,
  remindTimeMinutes: number,
) {
  const now = shanghaiNow()
  const remaining = daysUntil(eventDate, repeatRule, now, calendar)
  const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  scheduled.setDate(scheduled.getDate() + remaining - remindAheadDays)
  scheduled.setHours(Math.floor(remindTimeMinutes / 60), remindTimeMinutes % 60, 0, 0)
  if (scheduled.getTime() > now.getTime()) return ''
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return scheduled.getTime() < today.getTime()
    ? '提醒日期已过，请调整日期或提前提醒天数'
    : '提醒时间已过，请选择更晚的时间'
}

function enrich(row: EntryRow) {
  const rule = normalizeRepeatRule(row)
  const cal = row.calendar === 'lunar' ? 'lunar' : 'solar'
  let days = daysUntil(row.eventDate, rule, new Date(), cal)
  if (row.type === 'todo' && row.todoStatus === 'done' && days >= 0) {
    days = days === 0 ? -1 : -days
  }
  // 时间胶囊自动解锁判断
  const capsuleUnlockAt = (row as any).capsuleUnlockAt || (row as any).capsule_unlock_at || null
  let capsuleUnlocked = (row as any).capsuleUnlocked ?? (row as any).capsule_unlocked ?? false
  if (capsuleUnlockAt && !capsuleUnlocked && new Date(capsuleUnlockAt) <= new Date()) {
    capsuleUnlocked = true
  }
  // 未解锁的胶囊隐藏内容
  // 历史随机胶囊可能已有 entry_kind='capsule'，但旧版本未写入随机解锁日。
  // 类型身份必须优先于日期字段，否则提醒中心漏项，详情接口还可能提前暴露正文。
  const isCapsuleRecord = row.entryKind === 'capsule' || !!capsuleUnlockAt
  const isCapsuleLocked = isCapsuleRecord && !capsuleUnlocked
  const capsuleUnlockMode = row.capsuleUnlockMode === 'random' ? 'random' : 'scheduled'
  return {
    ...row,
    title: isCapsuleLocked ? '时间胶囊' : row.title,
    calendar: cal,
    repeatRule: rule,
    recurring: rule !== 'none',
    images: isCapsuleLocked ? [] : parseImages(row.images),
    body: isCapsuleLocked ? '' : row.body,
    ownerType: row.ownerType || 'personal',
    spaceId: row.spaceId || null,
    visibility: row.visibility || (row.ownerType === 'space' ? 'space' : 'private'),
    entryKind: row.entryKind || (capsuleUnlockAt ? 'capsule' : 'normal'),
    commitmentMeta: row.commitmentMeta || {},
    tags: normalizeTags(row.tags),
    daysUntil: days,
    countdownLabel: formatCountdownLabel(row.title || '这件事', days),
    // 随机惊喜在解锁前不返回真实日期，避免客户端或分享链路提前泄露答案。
    capsuleUnlockAt: isCapsuleLocked && capsuleUnlockMode === 'random' ? null : capsuleUnlockAt,
    capsuleUnlockMode,
    capsuleUnlocked,
    isCapsule: isCapsuleRecord,
  }
}

async function attachEntryAuthors(rows: EntryRow[]) {
  const userIds = [...new Set(rows.map((row) => String(row.userId || '')).filter((id) => /^\d+$/.test(id)))]
  if (!userIds.length) return
  const authors = await query<{ id: string; name: string; avatar: string }>(
    `SELECT id::text, COALESCE(NULLIF(nickname, ''), '圈内成员') AS name,
            COALESCE(avatar_url, '') AS avatar
       FROM t_user WHERE id = ANY($1::bigint[])`,
    [userIds],
  )
  const byId = new Map(authors.map((author) => [author.id, author]))
  for (const row of rows) {
    const author = byId.get(String(row.userId || ''))
    row.authorName = author?.name || '圈内成员'
    row.authorAvatar = author?.avatar || ''
  }
}

function parseRepeatRule(b: any): RepeatRule {
  return normalizeRepeatRule({
    repeatRule: b.repeatRule,
    recurring: b.recurring,
  })
}

function randomCapsuleUnlockAt(): string {
  const target = new Date()
  target.setDate(target.getDate() + crypto.randomInt(1, 366))
  target.setHours(10, 0, 0, 0)
  return target.toISOString()
}

/** 日期/待办同一用户、同一类型的标题必须唯一；日记标题来自正文首行，不参与此限制。 */
async function hasDuplicateTitle(
  userId: string | number,
  type: string,
  title: string,
  ownerType: 'personal' | 'space' = 'personal',
  spaceId?: string | null,
  excludeId?: string,
) {
  if (type === 'diary') return false
  const row = await queryOne<{ id: string }>(
    `SELECT id
       FROM t_entry
      WHERE user_id = $1
        AND type = $2
        AND deleted = FALSE
        AND lower(btrim(title)) = lower(btrim($3))
        AND owner_type = $4
        AND (($5::bigint IS NULL AND space_id IS NULL) OR space_id = $5::bigint)
        AND ($6::bigint IS NULL OR id <> $6::bigint)
      LIMIT 1`,
    [userId, type, title, ownerType, spaceId || null, excludeId || null],
  )
  return !!row
}

entriesRouter.get('/', async (req, res) => {
  try {
    const type = req.query.type ? String(req.query.type) : ''
    const timeline = req.query.timeline === '1' || req.query.timeline === 'true'
    const remind = req.query.remind === '1' || req.query.remind === 'true'
    const reminderCenter =
      req.query.reminderCenter === '1' || req.query.reminderCenter === 'true'
    const page = Math.max(1, Number(req.query.page) || 1)
    // 前端 SWR 一次拉齐常用列表；上限 200，避免静默截断
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 20))
    const offset = (page - 1) * pageSize

    const ownerType = req.query.ownerType ? normalizeOwnerType(req.query.ownerType) : ''
    const spaceId = String(req.query.spaceId || '').trim()
    const isCapsule = req.query.isCapsule === '1' || req.query.isCapsule === 'true'
    const includeCollaborated = timeline || reminderCenter || (!type && !remind) || !!spaceId
    const ownerCond = includeCollaborated ? readableCond('$1') : 'user_id = $1'
    const conds = [ownerCond, 'deleted = FALSE']
    const params: unknown[] = [req.userId]
    let i = 2

    if (type) {
      conds.push(`type = $${i++}`)
      params.push(type)
    }
    if (timeline) {
      conds.push('show_in_timeline = TRUE')
    }
    if (ownerType) {
      conds.push(`owner_type = $${i++}`)
      params.push(ownerType)
    }
    if (/^\d+$/.test(spaceId)) {
      conds.push(`space_id = $${i++}`)
      params.push(spaceId)
    }
    if (isCapsule) {
      conds.push("(entry_kind = 'capsule' OR capsule_unlock_at IS NOT NULL)")
    }
    if (remind) {
      conds.push('remind_enabled = TRUE')
    }
    if (reminderCenter) {
      conds.push("((type IN ('anniversary', 'todo') AND (todo_status IS NULL OR todo_status <> 'done')) OR entry_kind = 'capsule' OR capsule_unlock_at IS NOT NULL)")
    }

    const where = conds.join(' AND ')
    const orderBy =
      type === 'diary'
        ? 'pinned DESC, COALESCE(event_at, event_date::timestamptz) DESC, id DESC'
        : 'pinned DESC, event_date ASC, id DESC'
    const rows = await query<EntryRow>(
      `SELECT ${SELECT_FIELDS}
       FROM t_entry
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, pageSize, offset],
    )
    const countRow = await queryOne<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM t_entry WHERE ${where}`,
      params,
    )
    if (reminderCenter && rows.length) {
      const collaboratorSettings = await query<{
        entryId: string
        remindEnabled: boolean
        remindAheadDays: number
        remindTime: string
        wxSubscribeStatus: string
        wxSubscribeSentAt: string | null
        wxSubscribeError: string
        wxSubscribeAttempts: number
        hasPartner: boolean
      }>(
        `SELECT entry_id::text AS "entryId",
                remind_enabled AS "remindEnabled",
                remind_ahead_days AS "remindAheadDays",
                LPAD((COALESCE(remind_time_minutes, 600) / 60)::text, 2, '0')
                  || ':' || LPAD((COALESCE(remind_time_minutes, 600) % 60)::text, 2, '0') AS "remindTime",
                wx_subscribe_status AS "wxSubscribeStatus",
                wx_subscribe_sent_at AS "wxSubscribeSentAt",
                COALESCE(wx_subscribe_error, '') AS "wxSubscribeError",
                COALESCE(wx_subscribe_attempts, 0) AS "wxSubscribeAttempts",
                EXISTS (
                  SELECT 1 FROM t_entry_collaborator partner
                   WHERE partner.entry_id = t_entry_collaborator.entry_id AND partner.role = 'partner'
                ) AS "hasPartner"
           FROM t_entry_collaborator
          WHERE user_id = $1 AND role IN ('owner', 'partner')`,
        [req.userId],
      )
      const settingsByEntry = new Map(collaboratorSettings.map((item) => [String(item.entryId), item]))
      for (const row of rows) {
        const own = settingsByEntry.get(String(row.id))
        if (!own) continue
        row.isCollaborated = own.hasPartner
        if (Number(row.userId) !== req.userId) {
          row.remindEnabled = own.remindEnabled
          row.remindAheadDays = own.remindAheadDays
          row.remindTime = own.remindTime
          row.wxSubscribeStatus = own.wxSubscribeStatus
          row.wxSubscribeSentAt = own.wxSubscribeSentAt
          row.wxSubscribeError = own.wxSubscribeError
          row.wxSubscribeAttempts = own.wxSubscribeAttempts
        }
      }
    }
    await attachEntryAuthors(rows)
    return res.json({
      code: 0,
      data: {
        list: rows.map(enrich),
        total: Number(countRow?.c || 0),
        page,
        pageSize,
      },
    })
  } catch (e: any) {
    console.error('[entries/list]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * 返回当前用户已经创建过的系统示例。
 * 首次调用会扫描包括已删除记录在内的历史数据，为旧用户补齐服务端状态。
 */
entriesRouter.get('/seed-state', async (req, res) => {
  try {
    const diaryRows = await query<{ body: string; title: string; images: string }>(
      `SELECT body, title, COALESCE(images, '[]') AS images
         FROM t_entry
        WHERE user_id = $1
          AND type = 'diary'`,
      [req.userId],
    )
    const historicalSeeds = [
      ...new Set(diaryRows.flatMap((row) => inferDiarySeeds(row))),
    ]
    await markUserSeeds(req.userId!, historicalSeeds)

    const rows = await query<{ seed: string }>(
      `SELECT seed
         FROM t_user_seed_state
        WHERE user_id = $1
        ORDER BY seeded_at ASC, seed ASC`,
      [req.userId],
    )
    return res.json({ code: 0, data: { seeds: rows.map((row) => row.seed) } })
  } catch (e: any) {
    console.error('[entries/seed-state]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/** 前端识别到旧示例或成功创建示例后，将状态同步到当前用户。 */
entriesRouter.post('/seed-state', async (req, res) => {
  try {
    const seeds = normalizeSeedNames(req.body?.seeds)
    if (!seeds.length) {
      return res.status(400).json({ code: 400, msg: 'valid seeds required' })
    }
    await markUserSeeds(req.userId!, seeds)
    return res.json({ code: 0, data: { seeds } })
  } catch (e: any) {
    console.error('[entries/seed-state/mark]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/** 回忆日历：按自然月返回用户的日记、待办和重要日，避免前端只靠首 200 条缓存。 */
/** 批量解锁到期的时间胶囊 */
entriesRouter.post('/capsules/unlock', async (req, res) => {
  try {
    const result = await query(
      `UPDATE t_entry
        SET capsule_unlocked = TRUE, updated_at = now()
       WHERE user_id = $1
         AND capsule_unlock_at IS NOT NULL
         AND capsule_unlocked = FALSE
         AND capsule_unlock_at <= now()
       RETURNING id`,
      [req.userId],
    )
    return res.json({ code: 0, data: { unlocked: result.length } })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

entriesRouter.get('/calendar', async (req, res) => {
  try {
    const month = String(req.query.month || '')
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ code: 400, msg: 'month must be YYYY-MM' })
    }
    const [year, monthNumber] = month.split('-').map(Number)
    if (monthNumber < 1 || monthNumber > 12) {
      return res.status(400).json({ code: 400, msg: 'invalid month' })
    }
    const nextMonth = new Date(year, monthNumber, 1)
    const end = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`
    const ownerType = req.query.ownerType ? normalizeOwnerType(req.query.ownerType) : 'personal'
    const spaceId = String(req.query.spaceId || '').trim()
    if (ownerType === 'space' && !/^\d+$/.test(spaceId)) {
      return res.status(400).json({ code: 400, msg: 'spaceId required' })
    }
    const scopeCondition = ownerType === 'space'
      ? `${readableCond('$1')} AND owner_type = 'space' AND space_id = $4`
      : `user_id = $1 AND COALESCE(owner_type, 'personal') = 'personal' AND space_id IS NULL`
    const params: unknown[] = [req.userId, `${month}-01`, end]
    if (ownerType === 'space') params.push(spaceId)
    const rows = await query<EntryRow>(
      `SELECT ${SELECT_FIELDS}
         FROM t_entry
        WHERE ${scopeCondition}
          AND deleted = FALSE
          AND (
            (type = 'diary' AND COALESCE((event_at AT TIME ZONE 'Asia/Shanghai')::date, event_date) >= $2::date
                            AND COALESCE((event_at AT TIME ZONE 'Asia/Shanghai')::date, event_date) < $3::date)
            OR
            (type IN ('anniversary', 'todo') AND event_date >= $2::date AND event_date < $3::date)
          )
        ORDER BY COALESCE(event_at, event_date::timestamp) DESC, id DESC`,
      params,
    )
    return res.json({ code: 0, data: { month, list: rows.map(enrich) } })
  } catch (e: any) {
    console.error('[entries/calendar]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * 将创建者自己的个人日子放入一个已加入的共同空间。
 *
 * 空间成员关系已经表达了共享意愿，因此这里不再重复走微信邀请审批；
 * 只允许记录创建者操作，并且目标必须是自己当前仍加入的有效空间。
 */
entriesRouter.post('/:id/move-to-space', async (req, res) => {
  const id = String(req.params.id || '')
  const spaceId = String(req.body?.spaceId || '').trim()
  if (!/^\d+$/.test(id) || !/^\d+$/.test(spaceId)) {
    return res.status(400).json({ code: 400, msg: '请选择有效的共同空间' })
  }
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const entryResult = await client.query<{
      id: string
      type: string
      body: string
      ownerType: string
      spaceId: string | null
    }>(
      `SELECT id, type, body, COALESCE(owner_type, 'personal') AS "ownerType", space_id::text AS "spaceId"
         FROM t_entry
        WHERE id = $1 AND user_id = $2 AND deleted = FALSE
        FOR UPDATE`,
      [id, req.userId],
    )
    const entry = entryResult.rows[0]
    if (!entry) {
      await client.query('ROLLBACK')
      return res.status(404).json({ code: 404, msg: '日子不存在或你无权操作' })
    }
    if (entry.type !== 'anniversary') {
      await client.query('ROLLBACK')
      return res.status(400).json({ code: 400, msg: '只有日子可以放进共同空间' })
    }
    if (/__dk_seed:(wechat_release|year_progress)__/.test(entry.body || '')) {
      await client.query('ROLLBACK')
      return res.status(400).json({ code: 400, msg: '内置日子仅用于个人回顾' })
    }
    if (entry.ownerType === 'space') {
      await client.query('ROLLBACK')
      return res.status(409).json({
        code: 409,
        msg: entry.spaceId === spaceId ? '这个日子已经在该空间中' : '这个日子已经属于其他共同空间',
      })
    }

    const memberResult = await client.query<{ role: string; postPolicy: string; ownerId: string; accessType: string; postingBlockedAt: string | null }>(
      `SELECT m.role, s.post_policy AS "postPolicy", s.owner_id::text AS "ownerId",
              s.access_type AS "accessType", m.posting_blocked_at AS "postingBlockedAt"
         FROM t_space_member m
         JOIN t_space s ON s.id = m.space_id AND s.dissolved_at IS NULL
        WHERE m.space_id = $1 AND m.user_id = $2`,
      [spaceId, req.userId],
    )
    if (!memberResult.rowCount) {
      await client.query('ROLLBACK')
      return res.status(403).json({ code: 403, msg: '你已不在这个共同空间中' })
    }
    const targetSpace = memberResult.rows[0]
    if (targetSpace?.accessType === 'public' && targetSpace.postingBlockedAt) {
      await client.query('ROLLBACK')
      return res.status(403).json({ code: 403, msg: '你暂时不能在该公开空间发布内容' })
    }
    if (targetSpace?.postPolicy === 'admin_only' && String(targetSpace.ownerId) !== String(req.userId) && targetSpace.role !== 'admin') {
      await client.query('ROLLBACK')
      return res.status(403).json({ code: 403, msg: '该空间仅管理员可以发布' })
    }

    const movedResult = await client.query<EntryRow>(
      `UPDATE t_entry
          SET owner_type = 'space', space_id = $2, visibility = 'space', updated_at = now()
        WHERE id = $1
        RETURNING ${SELECT_FIELDS}`,
      [id, spaceId],
    )

    // 创建者沿用原有提醒设置；其他空间成员获得日子级席位，但提醒默认关闭。
    await client.query(
      `INSERT INTO t_entry_collaborator
        (entry_id, user_id, role, invited_by, joined_at, remind_enabled,
         remind_ahead_days, remind_time_minutes, wx_subscribe_accepted, wx_subscribe_status)
       SELECT e.id, sm.user_id,
              CASE WHEN sm.user_id = e.user_id THEN 'owner' ELSE 'partner' END,
              e.user_id, sm.joined_at,
              CASE WHEN sm.user_id = e.user_id THEN e.remind_enabled ELSE FALSE END,
              CASE WHEN sm.user_id = e.user_id THEN e.remind_ahead_days ELSE 1 END,
              CASE WHEN sm.user_id = e.user_id THEN e.remind_time_minutes ELSE 600 END,
              CASE WHEN sm.user_id = e.user_id THEN e.wx_subscribe_status IN ('authorized', 'sending') ELSE FALSE END,
              CASE WHEN sm.user_id = e.user_id THEN e.wx_subscribe_status ELSE 'none' END
         FROM t_space_member sm
         JOIN t_space space ON space.id = sm.space_id AND space.access_type <> 'public'
         JOIN t_entry e ON e.id = $1
        WHERE sm.space_id = $2
       ON CONFLICT (entry_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
      [id, spaceId],
    )
    await client.query(
      `DELETE FROM t_entry_collaborator WHERE entry_id = $1 AND role = 'pending'`,
      [id],
    )
    await client.query('COMMIT')
    return res.json({ code: 0, data: enrich(movedResult.rows[0]!) })
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('[entries/move-to-space]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, '放入共同空间失败') })
  } finally {
    client.release()
  }
})

// 必须注册在 /:id 之前，否则 Express 会把 reminders 当作 id 拦截。
entriesRouter.get('/reminders', listLocalReminders)

type EntryEditRequestRow = {
  id: string
  requesterId: string
  requesterName: string
  requesterAvatar: string
  status: string
  createdAt: string
}

async function entryEditAccess(entry: EntryRow, userId: number) {
  const isOwner = String(entry.userId) === String(userId)
  const collaborator = isOwner ? null : await queryOne<{ ok: number }>(
    `SELECT 1 AS ok FROM t_entry_collaborator
      WHERE entry_id = $1 AND user_id = $2 AND role = 'partner'`,
    [entry.id, userId],
  )
  const ownRequest = isOwner ? null : await queryOne<{ id: string; status: string }>(
    `SELECT id::text, status FROM t_entry_edit_request
      WHERE entry_id = $1 AND requester_id = $2
      ORDER BY created_at DESC LIMIT 1`,
    [entry.id, userId],
  )
  const pendingRequests = isOwner ? await query<EntryEditRequestRow>(
    `SELECT r.id::text,
            r.requester_id::text AS "requesterId",
            COALESCE(NULLIF(u.nickname, ''), '圈内成员') AS "requesterName",
            COALESCE(u.avatar_url, '') AS "requesterAvatar",
            r.status,
            r.created_at AS "createdAt"
       FROM t_entry_edit_request r
       JOIN t_user u ON u.id = r.requester_id
      WHERE r.entry_id = $1 AND r.status = 'pending'
      ORDER BY r.created_at ASC`,
    [entry.id],
  ) : []
  return {
    isOwner,
    canEdit: isOwner || !!collaborator,
    editRequestStatus: collaborator ? 'approved' : ownRequest?.status || 'none',
    editRequestId: ownRequest?.id || null,
    pendingEditRequests: pendingRequests,
  }
}

/** 获取编辑能力与待审批请求；读取记录本身仍受 readableCond 约束。 */
entriesRouter.get('/:id/edit-access', async (req, res) => {
  try {
    const entry = await queryOne<EntryRow>(
      `SELECT ${SELECT_FIELDS} FROM t_entry
        WHERE id = $1 AND deleted = FALSE AND ${readableCond('$2')}`,
      [req.params.id, req.userId],
    )
    if (!entry) return res.status(404).json({ code: 404, msg: 'not found' })
    return res.json({ code: 0, data: await entryEditAccess(entry, req.userId!) })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/** 同一时光圈成员申请共同编辑一条随手记。 */
entriesRouter.post('/:id/edit-access/request', async (req, res) => {
  try {
    const entry = await queryOne<EntryRow>(
      `SELECT ${SELECT_FIELDS} FROM t_entry e
        WHERE e.id = $1 AND e.deleted = FALSE AND ${readableCond('$2')}`,
      [req.params.id, req.userId],
    )
    if (!entry) return res.status(404).json({ code: 404, msg: 'not found' })
    if (entry.type !== 'diary' || entry.ownerType !== 'space' || !entry.spaceId) {
      return res.status(409).json({ code: 409, msg: '仅共同空间的随手记支持共同编辑' })
    }
    const targetSpace = await queryOne<{ accessType: string }>(
      `SELECT access_type AS "accessType" FROM t_space WHERE id = $1 AND dissolved_at IS NULL`,
      [entry.spaceId],
    )
    if (targetSpace?.accessType === 'public') {
      return res.status(409).json({ code: 409, msg: '公开记录不支持申请共同编辑' })
    }
    if (String(entry.userId) === String(req.userId)) {
      return res.status(409).json({ code: 409, msg: '你已经是这条记录的创建者' })
    }
    if (entry.capsuleUnlockAt) {
      return res.status(409).json({ code: 409, msg: '时间胶囊封存后不可申请编辑' })
    }
    const member = await queryOne<{ ok: number }>(
      `SELECT 1 AS ok FROM t_space_member m JOIN t_space s ON s.id = m.space_id
        WHERE m.space_id = $1 AND m.user_id = $2 AND s.dissolved_at IS NULL`,
      [entry.spaceId, req.userId],
    )
    if (!member) return res.status(403).json({ code: 403, msg: '只有当前时光圈成员可以申请' })
    const approved = await queryOne<{ ok: number }>(
      `SELECT 1 AS ok FROM t_entry_collaborator
        WHERE entry_id = $1 AND user_id = $2 AND role = 'partner'`,
      [entry.id, req.userId],
    )
    if (approved) return res.json({ code: 0, data: await entryEditAccess(entry, req.userId!) })
    await query(
      `INSERT INTO t_entry_edit_request (entry_id, requester_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (entry_id, requester_id) WHERE status = 'pending'
       DO UPDATE SET updated_at = now()`,
      [entry.id, req.userId],
    )
    return res.json({ code: 0, data: await entryEditAccess(entry, req.userId!) })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/** 创建者审批共同编辑申请；批准与写入协作者权限在同一事务中完成。 */
entriesRouter.post('/:id/edit-access/requests/:requestId/resolve', async (req, res) => {
  const decision = req.body?.decision === 'approved' ? 'approved' : req.body?.decision === 'rejected' ? 'rejected' : ''
  if (!decision) return res.status(400).json({ code: 400, msg: '请选择同意或暂不' })
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<{ requesterId: string }>(
      `UPDATE t_entry_edit_request r
          SET status = $4, resolved_by = $2, resolved_at = now(), updated_at = now()
         FROM t_entry e
        WHERE r.id = $3 AND r.entry_id = $1 AND r.status = 'pending'
          AND e.id = r.entry_id AND e.user_id = $2 AND e.deleted = FALSE
        RETURNING r.requester_id::text AS "requesterId"`,
      [req.params.id, req.userId, req.params.requestId, decision],
    )
    const requesterId = result.rows[0]?.requesterId
    if (!requesterId) {
      await client.query('ROLLBACK')
      return res.status(409).json({ code: 409, msg: '申请已处理或不存在' })
    }
    if (decision === 'approved') {
      const granted = await client.query(
        `INSERT INTO t_entry_collaborator (entry_id, user_id, role, invited_by, joined_at)
         SELECT e.id, $2, 'partner', $3, now()
           FROM t_entry e
           JOIN t_space_member m ON m.space_id = e.space_id AND m.user_id = $2
           JOIN t_space s ON s.id = e.space_id AND s.dissolved_at IS NULL
          WHERE e.id = $1 AND e.deleted = FALSE AND e.owner_type = 'space'
         ON CONFLICT (entry_id, user_id) WHERE user_id IS NOT NULL
         DO UPDATE SET role = 'partner', invited_by = EXCLUDED.invited_by, joined_at = now()
         RETURNING id`,
        [req.params.id, requesterId, req.userId],
      )
      if (!granted.rowCount) {
        await client.query('ROLLBACK')
        return res.status(409).json({ code: 409, msg: '申请人已不在当前时光圈，无法授权' })
      }
    }
    await client.query('COMMIT')
    const entry = await queryOne<EntryRow>(
      `SELECT ${SELECT_FIELDS} FROM t_entry WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
      [req.params.id, req.userId],
    )
    return res.json({ code: 0, data: entry ? await entryEditAccess(entry, req.userId!) : null })
  } catch (e: any) {
    await client.query('ROLLBACK')
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  } finally {
    client.release()
  }
})

entriesRouter.get('/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id || ''))) {
      return res.status(400).json({ code: 400, msg: 'invalid id' })
    }
    const row = await queryOne<EntryRow>(
      `SELECT ${SELECT_FIELDS} FROM t_entry
       WHERE id = $1 AND deleted = FALSE
         AND ${readableCond('$2')}`,
      [req.params.id, req.userId],
    )
    if (!row) return res.status(404).json({ code: 404, msg: 'not found' })
    await attachEntryAuthors([row])
    // 定时任务只是主动解锁的兜底。任何有读取权限的空间成员在到期后打开详情时，
    // 都应立即完成解锁，不能继续依赖创建者再次进入或提醒任务成功执行。
    const unlockAt = row.capsuleUnlockAt ? new Date(row.capsuleUnlockAt).getTime() : NaN
    if (!row.capsuleUnlocked && Number.isFinite(unlockAt) && unlockAt <= Date.now()) {
      await query(
        `UPDATE t_entry
            SET capsule_unlocked = TRUE, updated_at = now()
          WHERE id = $1
            AND capsule_unlocked = FALSE
            AND capsule_unlock_at IS NOT NULL
            AND capsule_unlock_at <= now()`,
        [row.id],
      )
      row.capsuleUnlocked = true
    }
    const access = await entryEditAccess(row, req.userId!)
    return res.json({ code: 0, data: { ...enrich(row), ...access } })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

entriesRouter.post('/', async (req, res) => {
  try {
    const rate = checkCreateRateLimit(Number(req.userId))
    if (!rate.ok) return res.status(429).json({ code: 429, msg: rate.msg })

    const b = req.body || {}
    const type = String(b.type || '').trim()
    if (!(ENTRY_TYPES as readonly string[]).includes(type)) {
      return res.status(400).json({ code: 400, msg: 'invalid type' })
    }
    const body = String(b.body || '').slice(0, 8000)
    let titleRaw = String(b.title || '').trim()
    if (!titleRaw) {
      if (type === 'diary') {
        titleRaw = body.trim().split(/\n/)[0]?.slice(0, 32) || '日记'
      } else {
        return res.status(400).json({ code: 400, msg: 'title required' })
      }
    }
    const titleCheck = sanitizeEntryTitle(titleRaw)
    if (!titleCheck.ok) return res.status(400).json({ code: 400, msg: titleCheck.msg })
    const title = titleCheck.title
    const eventDate = String(b.eventDate || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return res.status(400).json({ code: 400, msg: 'eventDate required (YYYY-MM-DD)' })
    }
    const ownerType = normalizeOwnerType(b.ownerType)
    const spaceId = normalizeSpaceId(b.spaceId, ownerType)
    const visibility = normalizeVisibility(b.visibility, ownerType)
    if (ownerType === 'space') {
      if (!spaceId) return res.status(400).json({ code: 400, msg: 'spaceId required' })
      const member = await queryOne<{ role: string; postPolicy: string; ownerId: string; accessType: string; postingBlockedAt: string | null }>(
        `SELECT m.role, s.post_policy AS "postPolicy", s.owner_id::text AS "ownerId",
                s.access_type AS "accessType", m.posting_blocked_at AS "postingBlockedAt"
           FROM t_space_member m
           JOIN t_space s ON s.id = m.space_id AND s.dissolved_at IS NULL
          WHERE m.space_id = $1 AND m.user_id = $2`,
        [spaceId, req.userId],
      )
      if (!member) return res.status(403).json({ code: 403, msg: '无权写入该时光圈' })
      if (member.accessType === 'public' && member.postingBlockedAt) {
        return res.status(403).json({ code: 403, msg: '你暂时不能在该公开空间发布内容' })
      }
      if (member.postPolicy === 'admin_only' && String(member.ownerId) !== String(req.userId) && member.role !== 'admin') {
        return res.status(403).json({ code: 403, msg: '该空间仅管理员可以发布' })
      }
    }
    if (await hasDuplicateTitle(req.userId!, type, title, ownerType, spaceId)) {
      return res.status(409).json({ code: 409, msg: '同类型记录中已存在该标题，请编辑已有记录' })
    }

    const isDiary = type === 'diary'
    const capsuleUnlockMode = isDiary && b.capsuleUnlockMode === 'random' ? 'random' : 'scheduled'
    const capsuleUnlockAt = !isDiary
      ? null
      : capsuleUnlockMode === 'random'
        ? randomCapsuleUnlockAt()
        : b.capsuleUnlockAt ? String(b.capsuleUnlockAt) : null
    if (capsuleUnlockAt) {
      const unlockTime = new Date(capsuleUnlockAt).getTime()
      if (!Number.isFinite(unlockTime) || unlockTime <= Date.now()) {
        return res.status(400).json({ code: 400, msg: '解锁日期必须晚于当前时间' })
      }
    }
    const isCapsule = isDiary && !!capsuleUnlockAt
    const entryKind = normalizeEntryKind(b.entryKind, type, isCapsule)
    const commitmentMeta = normalizeCommitmentMeta(b.commitmentMeta, String(req.userId))
    // 日子、待办和约定始终进入时间轴；随手记由自己的记录流承载。
    const showInTimeline = !isDiary
    const remindEnabled = isDiary ? isCapsule && !!b.remindEnabled : !!b.remindEnabled
    const wxSubscribeAccepted =
      remindEnabled && b.wxSubscribeAccepted === true
    const wxSubscribeStatus = wxSubscribeAccepted ? 'authorized' : 'none'
    const remindAheadRaw = Number(b.remindAheadDays)
    const remindAheadDays = Number.isFinite(remindAheadRaw)
      ? Math.max(0, Math.min(365, remindAheadRaw))
      : 1
    const remindTimeMinutes = normalizeRemindTime(b.remindTime)
    const repeatRule = isDiary ? 'none' : parseRepeatRule(b)
    const recurring = repeatRule !== 'none'
    // 只接受真正的布尔值。字符串 "false" 在 JavaScript 中是真值，不能因此被误存为置顶。
    const pinned = b.pinned === true
    const calendar = b.calendar === 'lunar' ? 'lunar' : 'solar'
    if (wxSubscribeAccepted && !isCapsule) {
      if (!/^\d{2}:\d{2}$/.test(String(b.remindTime || ''))) {
        return res.status(400).json({ code: 400, msg: '开启微信提醒前请先设置提醒时间' })
      }
      const scheduleError = reminderScheduleError(
        eventDate,
        repeatRule,
        calendar,
        remindAheadDays,
        remindTimeMinutes,
      )
      if (scheduleError) return res.status(400).json({ code: 400, msg: scheduleError })
    }
    const color = String(b.color || '').slice(0, 16)
    const normalizedBackgroundUrl = normalizeUserAsset(b.backgroundUrl, req.userId!, ['background'])
    if (normalizedBackgroundUrl == null) {
      return res.status(400).json({ code: 400, msg: '背景图片地址不合法' })
    }
    const backgroundUrl = normalizedBackgroundUrl.slice(0, 512)
    const todoStatus = type === 'todo' ? String(b.todoStatus || 'pending').slice(0, 16) : null
    const imagesJson = JSON.stringify(parseImages(b.images, req.userId))
    const tagsJson = JSON.stringify(normalizeTags(b.tags))
    // 约定要写地点：只放开随手记会让「发起约定」填的地点在 create 时被静默丢掉，
    // 前端表单看起来生效、列表里永远没有地点。
    const acceptsLocation = isDiary || entryKind === 'commitment'
    const location = acceptsLocation ? String(b.location || '').trim().slice(0, MAX_LOCATION_LEN) : ''
    // 坐标跟随地点：地点为空时坐标一律丢弃，否则会留下「没有地名却有图钉」的记录。
    const coords = location ? normalizeCoordPair(b.locationLat, b.locationLng) : { lat: null, lng: null }
    const eventAt = isDiary
      ? normalizeEventAt(b.eventAt, eventDate) || `${eventDate} 00:00:00`
      : normalizeEventAt(b.eventAt, eventDate)
    let clientRequestId = normalizeClientRequestId(b.clientRequestId)
    // 日记若未带客户端幂等键：用内容指纹兜底。图片上传前后的请求仍属于同一条日记，
    // 因此指纹不包含 images，避免同一内容被拆成“纯文字 + 带图”两条。
    if (!clientRequestId && isDiary) {
      const fp = crypto
        .createHash('sha256')
        .update(
          [String(req.userId), title, body, eventAt || '', capsuleUnlockAt || ''].join('\0'),
        )
        .digest('hex')
        .slice(0, 40)
      clientRequestId = `auto_${fp}`
    }
    // 真幂等：同一 clientRequestId 直接返回已有记录（软删则恢复）
    if (clientRequestId) {
      const existingMeta = await queryOne<{ id: string; deleted: boolean }>(
        `SELECT id::text AS id, deleted
           FROM t_entry
          WHERE user_id = $1
            AND client_request_id = $2
          ORDER BY id ASC
          LIMIT 1`,
        [req.userId, clientRequestId],
      )
      if (existingMeta) {
        if (existingMeta.deleted) {
          await query(
            `UPDATE t_entry SET deleted = FALSE, updated_at = now() WHERE id = $1 AND user_id = $2`,
            [existingMeta.id, req.userId],
          )
        }
        const existing = await queryOne<EntryRow>(
          `SELECT ${SELECT_FIELDS} FROM t_entry WHERE id = $1 AND user_id = $2`,
          [existingMeta.id, req.userId],
        )
        if (existing) {
          await markUserSeeds(req.userId!, inferDiarySeeds(existing))
          return res.json({ code: 0, data: enrich(existing) })
        }
      }
    }

    // 内容兜底：日记不限时间窗口（挡住超时后隔很久再点保存）；其它类型仍限 3 分钟
    const recent = await queryOne<EntryRow>(
      `SELECT ${SELECT_FIELDS}
       FROM t_entry
       WHERE user_id = $1
         AND deleted = FALSE
         AND type = $2
         AND title = $3
         AND body = $4
         AND event_date = $5::date
         AND COALESCE(to_char(event_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS'), '')
             = COALESCE($6, '')
         AND ($7::boolean OR COALESCE(images, '[]') = $8)
         AND ($7::boolean OR created_at > now() - interval '3 minutes')
       ORDER BY id ASC
       LIMIT 1`,
      [req.userId, type, title, body, eventDate, eventAt, isDiary, imagesJson],
    )
    if (recent) {
      const seeds = inferDiarySeeds(recent)
      await markUserSeeds(req.userId!, seeds)
      return res.json({ code: 0, data: enrich(recent) })
    }

    let row: EntryRow | null = null
    try {
      row = await queryOne<EntryRow>(
        `INSERT INTO t_entry (
           user_id, type, title, body, event_date, event_at, calendar, recurring, repeat_rule, pinned,
           show_in_timeline, remind_enabled, remind_ahead_days, remind_time_minutes, todo_status, color, images, background_url, location,
           location_lat, location_lng,
           wx_subscribe_status, wx_subscribe_authorized_at, client_request_id, capsule_unlock_at, capsule_unlock_mode,
           owner_type, space_id, visibility, entry_kind, commitment_meta, tags
          ) VALUES (
           $1,$2,$3,$4,$5,$6::timestamp,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
            $30::double precision, $31::double precision,
            $20::varchar(16),
            CASE WHEN $20::varchar(16) = 'authorized' THEN now() ELSE NULL END,
            $21, $22::timestamptz, $23,
            $24, $25::bigint, $26, $27, $28::jsonb, $29::jsonb
          )
          RETURNING ${SELECT_FIELDS}`,
        [
          req.userId,
          type,
          title,
          body,
          eventDate,
          eventAt,
          calendar,
          recurring,
          repeatRule,
          pinned,
          showInTimeline,
          remindEnabled,
          remindAheadDays,
          remindTimeMinutes,
          todoStatus,
          color,
          imagesJson,
          backgroundUrl,
          location,
          wxSubscribeStatus,
          clientRequestId,
          capsuleUnlockAt,
          capsuleUnlockMode,
          ownerType,
          spaceId,
          visibility,
          entryKind,
          JSON.stringify(commitmentMeta),
          tagsJson,
          coords.lat,
          coords.lng,
        ],
      )
    } catch (insertErr: any) {
      // 唯一约束冲突：并发下两个请求同时插入同一 clientRequestId
      if (
        clientRequestId &&
        (insertErr?.code === '23505' || /idx_entry_user_client_request/i.test(String(insertErr?.message || '')))
      ) {
        const existing = await queryOne<EntryRow>(
          `SELECT ${SELECT_FIELDS}
             FROM t_entry
            WHERE user_id = $1 AND client_request_id = $2
            ORDER BY id ASC LIMIT 1`,
          [req.userId, clientRequestId],
        )
        if (existing) {
          await markUserSeeds(req.userId!, inferDiarySeeds(existing))
          return res.json({ code: 0, data: enrich(existing) })
        }
      }
      throw insertErr
    }
    recordCreateSuccess(Number(req.userId))
    await markUserSeeds(req.userId!, inferDiarySeeds(row!))
    return res.json({ code: 0, data: enrich(row!) })
  } catch (e: any) {
    console.error('[entries/create]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

entriesRouter.put('/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id || ''))) {
      return res.status(400).json({ code: 400, msg: 'invalid id' })
    }
    let b = req.body || {}
    const expectedUpdatedAt = b.expectedUpdatedAt ? String(b.expectedUpdatedAt) : null
    if (expectedUpdatedAt && !Number.isFinite(new Date(expectedUpdatedAt).getTime())) {
      return res.status(400).json({ code: 400, msg: '记录版本无效，请刷新后重试' })
    }
    // First try as owner
    let existing = await queryOne<EntryRow>(
      `SELECT ${SELECT_FIELDS} FROM t_entry WHERE id = $1 AND deleted = FALSE
         AND user_id = $2`,
      [req.params.id, req.userId],
    )
    let isCollaborator = false
    if (!existing) {
      // Check if user is a collaborator on this entry
      existing = await queryOne<EntryRow>(
        `SELECT ${SELECT_FIELDS} FROM t_entry e
         WHERE e.id = $1 AND e.deleted = FALSE
           AND EXISTS (SELECT 1 FROM t_entry_collaborator c WHERE c.entry_id = e.id AND c.user_id = $2 AND c.role = 'partner')
           AND (
             e.owner_type <> 'space'
             OR EXISTS (
               SELECT 1 FROM t_space_member m JOIN t_space s ON s.id = m.space_id AND s.dissolved_at IS NULL
                WHERE m.space_id = e.space_id AND m.user_id = $2
             )
           )`,
        [req.params.id, req.userId],
      )
      if (!existing) return res.status(403).json({ code: 403, msg: '只有日子创建者或协作者可以修改' })
      isCollaborator = true
    }
    if (existing.type === 'diary' && existing.capsuleUnlockAt) {
      return res.status(409).json({ code: 409, msg: '时间胶囊封存后不可修改' })
    }

    /**
     * 协作者只能改标题和正文，这里按白名单重建请求体。
     *
     * 之前是黑名单（只挡 eventDate/repeatRule/recurring/todoStatus），有两个问题：
     * 1. 漏掉的字段全都能写。下面的 UPDATE 还会写 capsuleUnlockAt、images、
     *    pinned、色值和全部提醒字段——协作者只要构造一个不带 eventDate 的请求，
     *    就能把作者的随手记封成时间胶囊，而封存后连作者自己都改不了（见上面 409）。
     * 2. 因为编辑页每次都会把 eventDate/repeatRule 一起提交，黑名单等于永远命中，
     *    协作者连标题正文都存不进去，这个能力实际上从来没生效过。
     *
     * 改成白名单后：多余字段一律忽略而不是整单拒绝，协作者的正常保存才能成功，
     * 同时不可能碰到白名单外的任何列。确认状态请走 POST /:id/confirm。
     */
    if (isCollaborator) {
      const allowed: Record<string, unknown> = {}
      if (b.title != null) allowed.title = b.title
      if (b.body != null) allowed.body = b.body
      if (b.images != null) allowed.images = b.images
      if (b.location != null) allowed.location = b.location
      if (b.locationLat != null) allowed.locationLat = b.locationLat
      if (b.locationLng != null) allowed.locationLng = b.locationLng
      if (b.tags != null) allowed.tags = b.tags
      b = allowed
    }

    /**
     * 记录类型切换。
     *
     * UPDATE 里原本没有 type 这一列：客户端把 type 一起提交上来，服务端读了却不写，
     * 于是「随手记 → 好日子」这类改动会提示保存成功、退出重进却还是原样——
     * 一个用户可见的假成功。
     *
     * 切换 type 必须同时收敛派生字段，否则会留下自相矛盾的行：
     * 离开 todo 不清 todo_status，记录会同时是「日期」和「已完成」；
     * 切到随手记时不清 entry_kind / commitment_meta，则仍会被当成约定。
     */
    let nextType: string | null = null
    if (b.type != null) {
      const requested = String(b.type).trim()
      if (!(ENTRY_TYPES as readonly string[]).includes(requested)) {
        return res.status(400).json({ code: 400, msg: 'invalid type' })
      }
      if (requested !== existing.type) nextType = requested
    }
    const effectiveType = nextType ?? existing.type
    // 同一个请求里既改类型又设胶囊，两边的校验会互相踩（胶囊只允许随手记，
    // 而类型此刻正在变）。直接拒绝，让客户端分两步做。
    if (nextType && b.capsuleUnlockAt) {
      return res.status(400).json({ code: 400, msg: '请先保存类型改动，再设置时间胶囊' })
    }

    let title = b.title != null ? String(b.title).trim() : undefined
    if (title === '' && effectiveType === 'diary') {
      const bodyText = b.body != null ? String(b.body) : existing.body
      title = bodyText.trim().split(/\n/)[0]?.slice(0, 32) || '日记'
    }
    if (title != null) {
      const titleCheck = sanitizeEntryTitle(title)
      if (!titleCheck.ok) return res.status(400).json({ code: 400, msg: titleCheck.msg })
      title = titleCheck.title
    }
    let eventDate = b.eventDate != null ? String(b.eventDate).slice(0, 10) : undefined
    if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return res.status(400).json({ code: 400, msg: 'invalid eventDate' })
    }
    const nextTitle = title ?? existing.title
    const ownerId = isCollaborator ? existing.userId : req.userId!
    // 查重必须按切换后的类型：按旧类型查会让改类型成为绕过同类型标题唯一性的后门。
    if (await hasDuplicateTitle(ownerId, effectiveType, nextTitle, normalizeOwnerType(existing.ownerType), existing.spaceId, req.params.id)) {
      return res.status(409).json({ code: 409, msg: '同类型记录中已存在该标题，请使用其他标题' })
    }

    let todoStatus =
      b.todoStatus != null ? String(b.todoStatus).slice(0, 16) : undefined
    let repeatRule: RepeatRule | undefined
    if (b.repeatRule != null || typeof b.recurring === 'boolean') {
      repeatRule = parseRepeatRule(b)
    }

    const rule = repeatRule ?? normalizeRepeatRule(existing)
    if (effectiveType === 'todo' && todoStatus === 'done' && rule !== 'none') {
      eventDate = advanceEventDate(eventDate || existing.eventDate, rule)
      todoStatus = 'pending'
    }

    const recurring = repeatRule != null ? repeatRule !== 'none' : undefined
    const imagesJson =
      b.images != null ? JSON.stringify(parseImages(b.images, req.userId)) : null
    const tagsJson = b.tags != null ? JSON.stringify(normalizeTags(b.tags)) : null
    const backgroundUrl = b.backgroundUrl != null
      ? normalizeUserAsset(b.backgroundUrl, req.userId!, ['background'])?.slice(0, 512)
      : undefined
    if (b.backgroundUrl != null && backgroundUrl == null) {
      return res.status(400).json({ code: 400, msg: '背景图片地址不合法' })
    }
    const eventAt =
      b.eventAt != null
        ? normalizeEventAt(b.eventAt, eventDate || existing.eventDate)
        : undefined
    const wxSubscribeAccepted =
      b.wxSubscribeAccepted === true && b.remindEnabled === true
    const hasCapsuleUnlockAt = Object.prototype.hasOwnProperty.call(b, 'capsuleUnlockAt')
      || b.capsuleUnlockMode === 'random'
    const capsuleUnlockMode = b.capsuleUnlockMode === 'random' ? 'random' : 'scheduled'
    let capsuleUnlockAt: string | null = null
    if (hasCapsuleUnlockAt) {
      capsuleUnlockAt = capsuleUnlockMode === 'random'
        ? randomCapsuleUnlockAt()
        : b.capsuleUnlockAt ? String(b.capsuleUnlockAt) : null
      if (capsuleUnlockAt && existing.type !== 'diary') {
        return res.status(400).json({ code: 400, msg: '仅随手记可以创建时间胶囊' })
      }
      if (capsuleUnlockAt) {
        const unlockTime = new Date(capsuleUnlockAt).getTime()
        if (!Number.isFinite(unlockTime) || unlockTime <= Date.now()) {
          return res.status(400).json({ code: 400, msg: '解锁日期必须晚于当前时间' })
        }
      }
    }
    const isCapsuleUpdate =
      existing.type === 'diary' &&
      !!(capsuleUnlockAt || existing.capsuleUnlockAt)
    const remindTimeMinutes =
      b.remindTime != null ? normalizeRemindTime(b.remindTime) : null
    if (wxSubscribeAccepted && !isCapsuleUpdate) {
      if (!/^\d{2}:\d{2}$/.test(String(b.remindTime || ''))) {
        return res.status(400).json({ code: 400, msg: '开启微信提醒前请先设置提醒时间' })
      }
      const effectiveAheadDays =
        b.remindAheadDays != null && Number.isFinite(Number(b.remindAheadDays))
          ? Math.max(0, Math.min(365, Number(b.remindAheadDays)))
          : existing.remindAheadDays
      const effectiveCalendar =
        b.calendar === 'lunar' ? 'lunar' : b.calendar === 'solar' ? 'solar' : existing.calendar === 'lunar' ? 'lunar' : 'solar'
      const scheduleError = reminderScheduleError(
        eventDate || existing.eventDate,
        rule,
        effectiveCalendar,
        effectiveAheadDays,
        remindTimeMinutes!,
      )
      if (scheduleError) return res.status(400).json({ code: 400, msg: scheduleError })
    }

    /** 日期型与历史待办型都可在 normal / commitment 间切换；胶囊不从这里改。 */
    let nextEntryKind: string | null = null
    if (
      b.entryKind != null &&
      (effectiveType === 'anniversary' || effectiveType === 'todo') &&
      existing.entryKind !== 'capsule' &&
      !isCapsuleUpdate
    ) {
      nextEntryKind = normalizeEntryKind(b.entryKind, effectiveType)
    }

    const effectiveEntryKind = nextEntryKind ?? existing.entryKind
    const acceptsLocation = effectiveType === 'diary' || effectiveEntryKind === 'commitment'
    const clearLocation = !!nextType && !acceptsLocation
    // 只在本次确实带了地点时才解析坐标；地点被显式清成空串时坐标同样归零。
    const nextLocation = b.location != null ? String(b.location).trim().slice(0, MAX_LOCATION_LEN) : null
    const putCoords =
      nextLocation ? normalizeCoordPair(b.locationLat, b.locationLng) : { lat: null, lng: null }

    const row = await queryOne<EntryRow>(
      `UPDATE t_entry SET
         type = COALESCE($23::text, type),
         title = COALESCE($3, title),
         body = COALESCE($4, body),
         event_date = COALESCE($5::date, event_date),
         event_at = COALESCE($6::timestamp, event_at),
         calendar = COALESCE($7, calendar),
         -- 随手记不参与重复与提醒排期，切过去时一并收敛，避免留下
         -- 「每年重复的随手记」这种查询端无法解释的行。
         recurring = CASE WHEN $23::text = 'diary' THEN FALSE ELSE COALESCE($8, recurring) END,
         repeat_rule = CASE WHEN $23::text = 'diary' THEN 'none' ELSE COALESCE($9, repeat_rule) END,
         pinned = COALESCE($10, pinned),
         -- show_in_timeline 由类型推导，不接受客户端传值：随手记独占时间线，
         -- 其余类型一律上墙。这里刻意不再绑定 b.showInTimeline —— 之前它作为一个
         -- 已无人引用的占位参数留在数组里，Postgres 无法推断其类型（42P18），
         -- 整个 PUT /api/entries/:id 因此长期 500。
         show_in_timeline = CASE WHEN COALESCE($23::text, type) = 'diary' THEN FALSE ELSE TRUE END,
         remind_enabled = CASE WHEN $23::text = 'diary' THEN FALSE ELSE COALESCE($11, remind_enabled) END,
         remind_ahead_days = COALESCE($12, remind_ahead_days),
         remind_time_minutes = COALESCE($13, remind_time_minutes),
         -- 只有待办有完成态：切到好日子/随手记必须清掉，否则会留下
         -- 一条「已完成的好日子」，而 reminderCenter 正是按 todo_status 过滤的。
         todo_status = CASE
           WHEN $23::text IS NULL THEN COALESCE($14, todo_status)
           WHEN $23::text = 'todo' THEN COALESCE($14, todo_status, 'pending')
           ELSE NULL
         END,
         color = COALESCE($15, color),
         images = COALESCE($16, images),
         background_url = COALESCE($17, background_url),
         wx_subscribe_status = CASE
           WHEN $19::boolean THEN 'authorized'
           WHEN $11::boolean IS FALSE THEN 'none'
           ELSE wx_subscribe_status
         END,
         wx_subscribe_authorized_at = CASE
           WHEN $19::boolean THEN now()
           WHEN $11::boolean IS FALSE THEN NULL
           ELSE wx_subscribe_authorized_at
         END,
         wx_subscribe_sent_at = CASE
           WHEN $19::boolean OR $11::boolean IS FALSE THEN NULL
           ELSE wx_subscribe_sent_at
         END,
         wx_subscribe_last_attempt_at = CASE
           WHEN $19::boolean OR $11::boolean IS FALSE THEN NULL
           ELSE wx_subscribe_last_attempt_at
         END,
         wx_subscribe_attempts = CASE
           WHEN $19::boolean OR $11::boolean IS FALSE THEN 0
           ELSE wx_subscribe_attempts
         END,
         wx_subscribe_error = CASE
           WHEN $19::boolean OR $11::boolean IS FALSE THEN ''
           ELSE wx_subscribe_error
         END,
         capsule_unlock_at = CASE
           WHEN $20::boolean THEN $21::timestamptz
           ELSE capsule_unlock_at
         END,
         capsule_unlocked = CASE
           WHEN $20::boolean THEN FALSE
           ELSE capsule_unlocked
         END,
         capsule_unlock_mode = CASE
           WHEN $20::boolean THEN $25
           ELSE capsule_unlock_mode
         END,
         tags = COALESCE($26::jsonb, tags),
         -- 日期与历史待办都可承载约定；只有切到随手记才退出约定并清空确认状态。
         entry_kind = CASE
           WHEN $23::text IS NULL THEN COALESCE($22, entry_kind)
           WHEN $23::text IN ('anniversary', 'todo') THEN COALESCE($22, entry_kind)
           ELSE 'normal'
         END,
         commitment_meta = CASE
           WHEN $23::text = 'diary' THEN '{}'::jsonb
           ELSE commitment_meta
         END,
         -- 和 POST 的 acceptsLocation 保持同一条不变量：只有随手记和约定带地点。
         -- 不清的话「约定 → 好日子」会留下一个界面上看不见、切回去又突然复活的地点。
         location = CASE WHEN $24::boolean THEN '' ELSE COALESCE($18, location) END,
         -- 坐标跟着地点走，三种情形分别处理：
         --   1) 类型切换导致清空地点 → 坐标一并清掉，否则会留下孤立图钉
         --   2) 本次传了新地点 → 用本次坐标（没带坐标就置 NULL，避免新地名配旧坐标）
         --   3) 本次没动地点 → 保留原坐标
         location_lat = CASE
           WHEN $24::boolean THEN NULL
           WHEN $18 IS NOT NULL THEN $27::double precision
           ELSE location_lat
         END,
         location_lng = CASE
           WHEN $24::boolean THEN NULL
           WHEN $18 IS NOT NULL THEN $28::double precision
           ELSE location_lng
         END,
         updated_at = now()
       WHERE id = $1 AND user_id = $2::bigint
         -- node-postgres 把时间序列化到毫秒，Postgres 的 now() 则可能带微秒；
         -- 比较前统一到毫秒，否则同一版本也会被误判为冲突。
         AND ($29::timestamptz IS NULL OR date_trunc('milliseconds', updated_at) = $29::timestamptz)
       RETURNING ${SELECT_FIELDS}`,
      [
        req.params.id,
        // 必须用 ownerId 而不是 req.userId：协作者改的是别人的记录，
        // 用 req.userId 会匹配 0 行，然后 enrich(null) 抛出 500。
        ownerId,
        title ?? null,
        b.body != null ? String(b.body) : null,
        eventDate ?? null,
        eventAt !== undefined ? eventAt : null,
        b.calendar === 'lunar' || b.calendar === 'solar' ? b.calendar : null,
        recurring ?? null,
        repeatRule ?? null,
        typeof b.pinned === 'boolean' ? b.pinned : null,
        typeof b.remindEnabled === 'boolean' ? b.remindEnabled : null,
        b.remindAheadDays != null && Number.isFinite(Number(b.remindAheadDays))
          ? Math.max(0, Math.min(365, Number(b.remindAheadDays)))
          : null,
        remindTimeMinutes,
        todoStatus ?? null,
        b.color != null ? String(b.color).slice(0, 16) : null,
        imagesJson,
        backgroundUrl !== undefined ? backgroundUrl.slice(0, 512) : null,
        nextLocation,
        wxSubscribeAccepted,
        hasCapsuleUnlockAt,
        capsuleUnlockAt,
        nextEntryKind,
        nextType,
        clearLocation,
        capsuleUnlockMode,
        tagsJson,
        putCoords.lat,
        putCoords.lng,
        expectedUpdatedAt,
      ],
    )
    // 前面已经确认过权限，走到这里没匹配到行只能是并发删除/改动，
    // 用 409 明确告诉前端重试，不要靠 row! 断言把 null 送进 enrich。
    if (!row) return res.status(409).json({ code: 409, msg: '记录已变更，请刷新后重试' })
    return res.json({ code: 0, data: enrich(row) })
  } catch (e: any) {
    console.error('[entries/update]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * 成员确认约定：只写调用者自己那一个键。
 *
 * 不走 PUT + 整包 commitmentMeta：两人同时确认时，后到的请求会拿自己读到的旧快照
 * 覆盖对方刚写入的状态，确认结果随机丢一条。这里在库内按单键合并，天然避开这个
 * last-write-wins。
 *
 * 用 `||` 合并而不是 jsonb_set：jsonb_set 只会创建路径上的最后一段，
 * 首次确认时 confirmStatus 这一层还不存在，jsonb_set 会原样返回、静默不写。
 *
 * 权限用 readableCond：能读到这条共同约定的人（作者 / partner / 同圈成员）
 * 才有资格表态，且只能写自己 userId 那个键，改不了别人的。
 */
entriesRouter.put('/:id/commitment-details', async (req, res) => {
  try {
    const existing = await queryOne<EntryRow>(
      `SELECT ${SELECT_FIELDS} FROM t_entry
        WHERE id = $1 AND user_id = $2 AND deleted = FALSE
          AND type IN ('anniversary', 'todo') AND entry_kind = 'commitment'`,
      [req.params.id, req.userId],
    )
    if (!existing) return res.status(404).json({ code: 404, msg: '约定不存在或只有发起人可以编辑详情' })
    const assignments = normalizeAssignments(req.body?.assignments)
    const transport = String(req.body?.transport || '').trim().slice(0, 120)
    const note = String(req.body?.note || '').trim().slice(0, 500)
    const row = await queryOne<EntryRow>(
      `UPDATE t_entry SET commitment_meta = COALESCE(commitment_meta, '{}'::jsonb)
          || jsonb_build_object('assignments', $3::jsonb, 'transport', $4::text, 'note', $5::text),
          updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING ${SELECT_FIELDS}`,
      [req.params.id, req.userId, JSON.stringify(assignments), transport, note],
    )
    return res.json({ code: 0, data: enrich(row!) })
  } catch (error: any) {
    console.error('[entries/commitment-details]', error)
    return res.status(500).json({ code: 500, msg: clientMessage(error, '约定详情保存失败') })
  }
})

entriesRouter.post('/:id/check-in', async (req, res) => {
  try {
    const row = await queryOne<EntryRow>(
      `UPDATE t_entry SET commitment_meta = COALESCE(commitment_meta, '{}'::jsonb)
          || jsonb_build_object(
            'checkedIn',
            COALESCE(CASE WHEN jsonb_typeof(commitment_meta -> 'checkedIn') = 'object'
              THEN commitment_meta -> 'checkedIn' ELSE '{}'::jsonb END, '{}'::jsonb)
              || jsonb_build_object($2::text, to_jsonb(now()::text))
          ), updated_at = now()
        WHERE id = $1 AND deleted = FALSE
          AND type IN ('anniversary', 'todo') AND entry_kind = 'commitment'
          AND ${readableCond('$2')}
        RETURNING ${SELECT_FIELDS}`,
      [req.params.id, req.userId],
    )
    if (!row) return res.status(404).json({ code: 404, msg: '约定不存在或无权打卡' })
    return res.json({ code: 0, data: enrich(row) })
  } catch (error: any) {
    console.error('[entries/check-in]', error)
    return res.status(500).json({ code: 500, msg: clientMessage(error, '到场打卡失败') })
  }
})

entriesRouter.post('/:id/confirm', async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id || ''))) {
      return res.status(400).json({ code: 400, msg: 'invalid id' })
    }
    const status = String(req.body?.status || 'confirmed')
    if (!CONFIRM_STATUSES.includes(status as ConfirmStatus)) {
      return res.status(400).json({ code: 400, msg: 'invalid status' })
    }
    const row = await queryOne<EntryRow>(
      `UPDATE t_entry SET
         commitment_meta = COALESCE(commitment_meta, '{}'::jsonb) || jsonb_build_object(
           'confirmStatus',
           CASE
             WHEN jsonb_typeof(commitment_meta -> 'confirmStatus') = 'object'
               THEN commitment_meta -> 'confirmStatus'
             ELSE '{}'::jsonb
           END || jsonb_build_object($3::text, $4::text)
         ),
         updated_at = now()
       WHERE id = $1 AND deleted = FALSE
         AND type IN ('anniversary', 'todo') AND entry_kind = 'commitment'
         AND ${readableCond('$2')}
       RETURNING ${SELECT_FIELDS}`,
      [req.params.id, req.userId, req.userId, status],
    )
    // 只有约定能确认：普通待办/纪念日走到这里应当明确 404，而不是静默成功。
    if (!row) return res.status(404).json({ code: 404, msg: '约定不存在或无权确认' })
    return res.json({ code: 0, data: enrich(row) })
  } catch (e: any) {
    console.error('[entries/confirm]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

entriesRouter.post('/:id/background', handleBgFile, async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id || ''))) {
      return res.status(400).json({ code: 400, msg: 'invalid id' })
    }
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM t_entry WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
      [req.params.id, req.userId],
    )
    if (!existing) return res.status(404).json({ code: 404, msg: 'not found' })

    const buf = req.file?.buffer?.length
      ? req.file.buffer
      : decodeBase64Image(req.body?.imageBase64)
    const image = await sanitizeImageBuffer(buf, { maxBytes: 10 * 1024 * 1024 })

    const rand = crypto.randomBytes(4).toString('hex')
    const key = buildObjectKey(req.userId!, 'background', image.ext, rand)
    const backgroundUrl = await putObject(key, image.buffer, image.mime)

    const row = await queryOne<EntryRow>(
      `UPDATE t_entry SET background_url = $3, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING ${SELECT_FIELDS}`,
      [req.params.id, req.userId, backgroundUrl],
    )
    return res.json({ code: 0, data: enrich(row!) })
  } catch (e: any) {
    console.error('[entries/background]', e)
    const status = Number(e?.status) || 500
    return res.status(status).json({ code: status, msg: clientMessage(e, 'failed') })
  }
})

entriesRouter.delete('/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id || ''))) {
      return res.status(400).json({ code: 400, msg: 'invalid id' })
    }
    const row = await queryOne(
      `UPDATE t_entry SET deleted = TRUE, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted = FALSE
       RETURNING id`,
      [req.params.id, req.userId],
    )
    if (!row) return res.status(404).json({ code: 404, msg: 'not found' })
    return res.json({ code: 0, data: { ok: true } })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * GET /api/entries/reminders
 * 返回当前用户所有开启了提醒的条目（供前端注册本地通知）
 */
async function listLocalReminders(req: Request, res: Response) {
  try {
    const rows = await query(
      `SELECT reminders.*
         FROM (
           -- 创建者的提醒设置以 t_entry 为准。
           SELECT e.id, e.title, e.type,
                  to_char(e.event_date, 'YYYY-MM-DD') AS "eventDate",
                  e.remind_enabled AS "remindEnabled",
                  e.remind_ahead_days AS "remindAheadDays",
                  COALESCE(e.remind_time_minutes, 600) AS "remindTimeMinutes",
                  COALESCE(e.repeat_rule, 'none') AS "repeatRule"
             FROM t_entry e
            WHERE e.user_id = $1
              AND e.deleted = FALSE
              AND e.remind_enabled = TRUE
              AND e.type IN ('anniversary', 'todo')
              AND (
                e.owner_type <> 'space'
                OR EXISTS (
                  SELECT 1 FROM t_space_member sm
                  JOIN t_space s ON s.id = sm.space_id AND s.dissolved_at IS NULL
                  WHERE sm.space_id = e.space_id AND sm.user_id = $1
                )
              )

           UNION ALL

           -- 同一内容只取当前成员自己的提醒席位，不能沿用创建者设置。
           SELECT e.id, e.title, e.type,
                  to_char(e.event_date, 'YYYY-MM-DD') AS "eventDate",
                  c.remind_enabled AS "remindEnabled",
                  c.remind_ahead_days AS "remindAheadDays",
                  COALESCE(c.remind_time_minutes, 600) AS "remindTimeMinutes",
                  COALESCE(e.repeat_rule, 'none') AS "repeatRule"
             FROM t_entry_collaborator c
             JOIN t_entry e ON e.id = c.entry_id AND e.deleted = FALSE
            WHERE c.user_id = $1
              AND c.role = 'partner'
              AND c.remind_enabled = TRUE
              AND e.type IN ('anniversary', 'todo')
              AND (
                e.owner_type <> 'space'
                OR EXISTS (
                  SELECT 1 FROM t_space_member sm
                  JOIN t_space s ON s.id = sm.space_id AND s.dissolved_at IS NULL
                  WHERE sm.space_id = e.space_id AND sm.user_id = $1
                )
              )
         ) reminders
        ORDER BY reminders."eventDate" ASC`,
      [req.userId],
    )
    return res.json({ code: 0, data: rows })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
}
