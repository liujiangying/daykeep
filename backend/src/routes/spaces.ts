import { Router } from 'express'
import crypto from 'node:crypto'
import type { PoolClient } from 'pg'
import { requireAuth } from '../auth.js'
import { getPool, query, queryOne } from '../db.js'
import { isRateLimited, looksLikeAttackPayload } from '../lib/rateLimit.js'
import { purgeExpiredSpaces } from '../spaceLifecycle.js'
import { isMoodValue } from '../../../shared/mood.js'
import { normalizeUserAsset } from '../cos.js'

export const spacesRouter = Router()

/** 邀请有效期。短 TTL + 单次使用，降低链接被转发后的暴露面。 */
const INVITE_TTL = "interval '48 hours'"

type SpaceRow = {
  id: string
  name: string
  type: string
  ownerId: string
  coverUrl: string
  dissolvedAt: string | null
  dissolvedByUserId: string | null
  dissolvedByNickname: string
  purgeAt: string | null
  keywords: unknown
  recordCount: string
  commitmentCount: string
  memberCount: string
  accessType: string
  joinPolicy: string
  postPolicy: string
  isOfficial: boolean
  officialKey: string | null
  createdAt: string
  updatedAt: string
}

type MemberRow = {
  id: string
  userId: string
  spaceId: string
  role: string
  nickname: string
  avatarUrl: string
  mood: string
  joinedAt: string
}

/** 邀请卡预览是公开落地页：链接令牌只允许读取卡片摘要，不授予任何圈内权限。 */
spacesRouter.get('/invite-preview', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim()
    if (!code) return res.status(400).json({ code: 400, msg: '邀请链接无效' })
    const preview = await queryOne<{
      spaceId: string; spaceName: string; spaceType: string; coverUrl: string; ownerNickname: string; ownerAvatarUrl: string;
      recordCount: string; firstBody: string; firstImage: string; expiresAt: string;
    }>(
      `SELECT s.id::text AS "spaceId", s.name AS "spaceName", s.type AS "spaceType", s.cover_url AS "coverUrl",
              u.nickname AS "ownerNickname", u.avatar_url AS "ownerAvatarUrl",
              (SELECT COUNT(*)::text FROM t_entry e WHERE e.space_id = s.id AND e.visibility = 'space' AND e.deleted = FALSE) AS "recordCount",
              COALESCE((SELECT left(e.body, 100) FROM t_entry e WHERE e.space_id = s.id AND e.visibility = 'space' AND e.deleted = FALSE AND e.type = 'diary' ORDER BY e.created_at ASC LIMIT 1), '') AS "firstBody",
              COALESCE((SELECT e.images::jsonb ->> 0 FROM t_entry e WHERE e.space_id = s.id AND e.visibility = 'space' AND e.deleted = FALSE AND e.type = 'diary' AND e.images IS NOT NULL AND e.images ~ '^\\s*\\[' AND jsonb_array_length(e.images::jsonb) > 0 ORDER BY e.created_at ASC LIMIT 1), '') AS "firstImage",
              i.expires_at AS "expiresAt"
         FROM t_space_invite i JOIN t_space s ON s.id = i.space_id JOIN t_user u ON u.id = i.created_by
        WHERE i.code = $1 AND s.dissolved_at IS NULL AND i.revoked_at IS NULL AND i.used_at IS NULL AND i.expires_at > now()`,
      [code],
    )
    if (!preview) return res.status(404).json({ code: 404, msg: '邀请已失效或已被使用' })
    const members = await query<{ nickname: string; avatarUrl: string }>(
      `SELECT COALESCE(NULLIF(u.nickname, ''), sm.nickname) AS nickname,
              COALESCE(NULLIF(u.avatar_url, ''), sm.avatar_url) AS "avatarUrl"
         FROM t_space_member sm
         JOIN t_user u ON u.id = sm.user_id
        WHERE sm.space_id = $1
        ORDER BY sm.joined_at ASC
        LIMIT 6`,
      [preview.spaceId],
    )
    return res.json({ code: 0, data: { ...preview, recordCount: Number(preview.recordCount || 0), members } })
  } catch (error) {
    console.error('[spaces/invite-preview]', error)
    return res.status(500).json({ code: 500, msg: '邀请卡加载失败' })
  }
})

// 除上面的只读邀请摘要外，时光圈的所有能力都必须登录。
spacesRouter.use(requireAuth)
spacesRouter.use(async (_req, _res, next) => {
  try {
    await purgeExpiredSpaces()
  } catch (error) {
    console.error('[spaces/purge-expired]', error)
  }
  next()
})

/**
 * 唯一的 space 投影。
 * 计数用标量子查询而不是多个 LEFT JOIN，避免「记录数 × 约定数 × 成员数」的行乘积；
 * 所有读写路径共用它，避免各 handler 的过滤条件各自漂移。
 *
 * 计数口径必须和 entries.ts 的 readableCond 对齐：成员只能读到 visibility = 'space'
 * 的圈内记录，如果这里统计所有 space_id 命中的行，卡片会显示「8 条记录」
 * 而点进去只有 3 条。新约定是日期型，历史待办型继续兼容；随手记不能算约定。
 *
 * 约定数还要排除已完成：约定列表走 reminderCenter，它本身就过滤掉
 * todo_status = 'done'，不排除的话卡片上的「N 个约定」会比列表里能看到的多。
 */
const SPACE_SELECT = `
  SELECT s.id::text, s.name, s.type, s.owner_id::text AS "ownerId", s.cover_url AS "coverUrl",
         s.dissolved_at AS "dissolvedAt", s.dissolved_by::text AS "dissolvedByUserId",
         s.dissolved_by_name AS "dissolvedByNickname", s.purge_at AS "purgeAt",
         s.keywords,
         s.access_type AS "accessType", s.join_policy AS "joinPolicy",
         s.post_policy AS "postPolicy", s.is_official AS "isOfficial",
         s.official_key AS "officialKey",
         (SELECT COUNT(*) FROM t_space_member sm WHERE sm.space_id = s.id)::text AS "memberCount",
         (
           SELECT COUNT(*) FROM t_entry e
            WHERE e.space_id = s.id AND e.deleted = FALSE
              AND e.visibility = 'space'
         )::text AS "recordCount",
         (
           SELECT COUNT(*) FROM t_entry e
            WHERE e.space_id = s.id AND e.deleted = FALSE
              AND e.visibility = 'space'
              AND e.type IN ('anniversary', 'todo') AND e.entry_kind = 'commitment'
              AND (e.todo_status IS NULL OR e.todo_status <> 'done')
         )::text AS "commitmentCount",
         s.created_at AS "createdAt", s.updated_at AS "updatedAt"
    FROM t_space s
`

function normalizeKeywords(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input)
      if (Array.isArray(parsed)) return normalizeKeywords(parsed)
    } catch {
      return input.split(/[#,，、\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8)
    }
  }
  return []
}

/** 封面 URL 只能来自本服务配置的 COS/CDN，阻止任意外链进入分享卡。 */
function normalizeCoverUrl(input: unknown, userId: string | number): string | null {
  const raw = String(input || '').trim()
  if (!raw) return ''
  const normalized = normalizeUserAsset(raw, userId, ['space-cover'])
  return normalized?.startsWith('cos://') ? normalized : null
}

function normalizeSpace(row: SpaceRow, members: MemberRow[] = [], currentUserRole = '') {
  return {
    id: String(row.id),
    name: row.name,
    type: row.type === 'group' ? 'group' : 'pair',
    ownerId: String(row.ownerId),
    coverUrl: row.coverUrl || '',
    dissolvedAt: row.dissolvedAt || '',
    dissolvedByUserId: row.dissolvedByUserId || '',
    dissolvedByNickname: row.dissolvedByNickname || '',
    purgeAt: row.purgeAt || '',
    keywords: normalizeKeywords(row.keywords),
    recordCount: Number(row.recordCount || 0),
    commitmentCount: Number(row.commitmentCount || 0),
    memberCount: Number(row.memberCount || 0),
    accessType: row.accessType === 'public' ? 'public' : 'private',
    joinPolicy: row.joinPolicy === 'open' ? 'open' : 'invite',
    postPolicy: row.postPolicy === 'admin_only' ? 'admin_only' : 'members',
    isOfficial: !!row.isOfficial,
    officialKey: row.officialKey || '',
    members: members.map((member) => ({
      id: String(member.id),
      userId: String(member.userId),
      spaceId: String(member.spaceId),
      role: member.role === 'owner' ? 'owner' : member.role === 'admin' ? 'admin' : 'member',
      nickname: member.nickname || '微信用户',
      avatarUrl: member.avatarUrl || '',
      mood: member.mood || '',
      joinedAt: member.joinedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    currentUserRole: currentUserRole === 'owner' ? 'owner' : currentUserRole === 'admin' ? 'admin' : currentUserRole === 'member' ? 'member' : '',
  }
}

async function viewerRole(spaceId: string, userId: string | number | undefined) {
  if (userId == null) return ''
  const member = await queryOne<{ role: string }>(
    `SELECT role FROM t_space_member WHERE space_id = $1 AND user_id = $2`,
    [spaceId, userId],
  )
  return member?.role || ''
}

async function viewerRoles(spaceIds: string[], userId: string | number | undefined) {
  if (!spaceIds.length || userId == null) return new Map<string, string>()
  const rows = await query<{ spaceId: string; role: string }>(
    `SELECT space_id::text AS "spaceId", role
       FROM t_space_member
      WHERE user_id = $1 AND space_id = ANY($2::bigint[])`,
    [userId, spaceIds],
  )
  return new Map(rows.map((row) => [row.spaceId, row.role]))
}

async function requireOfficialModerator(spaceId: string, userId: string | number | undefined) {
  if (userId == null) return null
  return queryOne<{ ownerId: string; role: string }>(
    `SELECT s.owner_id::text AS "ownerId", sm.role
       FROM t_space s
       JOIN t_space_member sm ON sm.space_id = s.id AND sm.user_id = $2
      WHERE s.id = $1 AND s.is_official = TRUE AND s.access_type = 'public'
        AND (s.owner_id = $2 OR sm.role IN ('owner', 'admin'))`,
    [spaceId, userId],
  )
}

async function listMembers(spaceIds: string[]) {
  if (!spaceIds.length) return new Map<string, MemberRow[]>()
  const rows = await query<MemberRow>(
    `SELECT sm.id::text, sm.user_id::text AS "userId", sm.space_id::text AS "spaceId", sm.role,
            COALESCE(NULLIF(u.nickname, ''), sm.nickname) AS nickname,
            COALESCE(NULLIF(u.avatar_url, ''), sm.avatar_url) AS "avatarUrl",
            COALESCE(today.mood, '') AS mood, sm.joined_at AS "joinedAt"
       FROM t_space_member sm
       JOIN t_user u ON u.id = sm.user_id
       LEFT JOIN t_mood_history today
         ON today.user_id = sm.user_id
        AND today.mood_date = (now() AT TIME ZONE 'Asia/Shanghai')::date
      WHERE sm.space_id = ANY($1::bigint[])
      ORDER BY CASE sm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, sm.joined_at ASC`,
    [spaceIds],
  )
  const grouped = new Map<string, MemberRow[]>()
  for (const row of rows) {
    const list = grouped.get(row.spaceId) || []
    list.push(row)
    grouped.set(row.spaceId, list)
  }
  return grouped
}

/** 公共空间只返回最早加入的三位成员作为头像预览，完整人数使用 memberCount。 */
async function listPublicMemberPreviews(spaceIds: string[]) {
  if (!spaceIds.length) return new Map<string, MemberRow[]>()
  const rows = await query<MemberRow>(
    `SELECT id, "userId", "spaceId", role, nickname, "avatarUrl", mood, "joinedAt"
       FROM (
         SELECT sm.id::text AS id, sm.user_id::text AS "userId", sm.space_id::text AS "spaceId", sm.role,
                COALESCE(NULLIF(u.nickname, ''), sm.nickname) AS nickname,
                COALESCE(NULLIF(u.avatar_url, ''), sm.avatar_url) AS "avatarUrl",
                '' AS mood, sm.joined_at AS "joinedAt",
                row_number() OVER (
                  PARTITION BY sm.space_id
                  ORDER BY CASE sm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, sm.joined_at ASC
                ) AS member_rank
           FROM t_space_member sm
           JOIN t_user u ON u.id = sm.user_id
          WHERE sm.space_id = ANY($1::bigint[])
       ) ranked
      WHERE member_rank <= 3
      ORDER BY "spaceId"::bigint, member_rank`,
    [spaceIds],
  )
  const grouped = new Map<string, MemberRow[]>()
  for (const row of rows) {
    const list = grouped.get(row.spaceId) || []
    list.push(row)
    grouped.set(row.spaceId, list)
  }
  return grouped
}

async function listDisplayMembers(rows: SpaceRow[]) {
  const privateRows = rows.filter((row) => row.accessType !== 'public')
  const publicRows = rows.filter((row) => row.accessType === 'public')
  const [privateMembers, publicPreviews] = await Promise.all([
    listMembers(privateRows.map((row) => row.id)),
    listPublicMemberPreviews(publicRows.map((row) => row.id)),
  ])
  for (const [spaceId, members] of publicPreviews) privateMembers.set(spaceId, members)
  return privateMembers
}

/** 写操作后统一用同一投影回读，保证返回的计数与列表页一致。 */
async function loadSpaceById(id: string) {
  const row = await queryOne<SpaceRow>(`${SPACE_SELECT} WHERE s.id = $1`, [id])
  if (!row) return null
  const membersBySpace = await listDisplayMembers([row])
  return normalizeSpace(row, membersBySpace.get(row.id) || [])
}

spacesRouter.get('/', async (req, res) => {
  try {
    const rows = await query<SpaceRow>(
      `${SPACE_SELECT}
         JOIN t_space_member m ON m.space_id = s.id AND m.user_id = $1
        ORDER BY s.updated_at DESC, s.created_at DESC`,
      [req.userId],
    )
    const [membersBySpace, roles] = await Promise.all([
      listDisplayMembers(rows),
      viewerRoles(rows.map((row) => row.id), req.userId),
    ])
    return res.json({ code: 0, data: rows.map((row) => normalizeSpace(row, membersBySpace.get(row.id) || [], roles.get(row.id) || '')) })
  } catch (e: any) {
    console.error('[spaces/list]', e)
    return res.status(500).json({ code: 500, msg: 'failed' })
  }
})

spacesRouter.post('/', async (req, res) => {
  try {
    const uid = Number(req.userId)
    // 防刷：挡住带有效 JWT 的扫描狂建圈子（此前测服 5 分钟内灌入四千+ 条）
    if (
      isRateLimited(`space:create:user:${uid}`, 5, 60_000) ||
      isRateLimited(`space:create:user-hour:${uid}`, 20, 60 * 60_000)
    ) {
      return res.status(429).json({ code: 429, msg: '操作过于频繁，请稍后再试' })
    }

    const body = req.body || {}
    // 禁止空名落默认文案：扫描常发 {} / {name:""}，以前会批量变成「我和 TA 的小圈」
    const name = String(body.name || '').trim().slice(0, 64)
    if (!name) {
      return res.status(400).json({ code: 400, msg: '请先给圈子起个名字' })
    }
    const type = body.type === 'group' ? 'group' : 'pair'
    const keywords = normalizeKeywords(body.keywords)
    const coverUrl = normalizeCoverUrl(body.coverUrl, req.userId!)
    if (coverUrl == null) return res.status(400).json({ code: 400, msg: '封面地址不合法' })
    if (
      looksLikeAttackPayload(name) ||
      keywords.some((item) => looksLikeAttackPayload(item))
    ) {
      console.warn('[spaces/create] blocked suspicious payload', {
        userId: uid,
        namePreview: name.slice(0, 80),
      })
      return res.status(400).json({ code: 400, msg: '圈子名称不合法' })
    }

    const created = await queryOne<{ id: string }>(
      `INSERT INTO t_space (owner_id, name, type, keywords, cover_url)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id::text`,
      [req.userId, name, type, JSON.stringify(keywords), coverUrl],
    )
    if (!created) return res.status(500).json({ code: 500, msg: '创建失败' })
    await query(
      `INSERT INTO t_space_member (space_id, user_id, role, nickname, avatar_url)
       SELECT $1, id, 'owner', nickname, avatar_url FROM t_user WHERE id = $2
       ON CONFLICT (space_id, user_id) DO NOTHING`,
      [created.id, req.userId],
    )
    const space = await loadSpaceById(created.id)
    if (!space) return res.status(500).json({ code: 500, msg: '创建失败' })
    return res.json({ code: 0, data: space })
  } catch (e: any) {
    console.error('[spaces/create]', e)
    return res.status(500).json({ code: 500, msg: 'failed' })
  }
})

/** 当前心情是个人状态，同步到用户所在的所有时光圈，圈内成员即可看到。 */
spacesRouter.put('/mood', async (req, res) => {
  try {
    const mood = String(req.body?.mood || '').trim()
    if (!isMoodValue(mood)) return res.status(400).json({ code: 400, msg: '请选择有效的心情；自定义仅支持一个表情' })
    await query(
      `UPDATE t_space_member sm
          SET mood = $2, updated_at = now()
        WHERE sm.user_id = $1
          AND EXISTS (SELECT 1 FROM t_space s WHERE s.id = sm.space_id AND s.access_type <> 'public')`,
      [req.userId, mood],
    )
    const history = await query<{ date: string; mood: string }>(
      `INSERT INTO t_mood_history (user_id, mood_date, mood)
       VALUES ($1, (now() AT TIME ZONE 'Asia/Shanghai')::date, $2)
       ON CONFLICT (user_id, mood_date) DO UPDATE SET mood = EXCLUDED.mood, updated_at = now()
       RETURNING mood_date::text AS date, mood`,
      [req.userId, mood],
    )
    return res.json({ code: 0, data: history[0] || { date: '', mood } })
  } catch (error: any) {
    console.error('[spaces/mood]', error)
    return res.status(500).json({ code: 500, msg: '心情保存失败' })
  }
})

/** 我的近七日心情；缺失日期也返回，前端才能稳定画出完整一周。 */
spacesRouter.get('/mood/week', async (req, res) => {
  try {
    const rows = await query<{ date: string; mood: string }>(
      `SELECT day::text AS date, COALESCE(h.mood, '') AS mood
         FROM generate_series(
           (now() AT TIME ZONE 'Asia/Shanghai')::date - 6,
           (now() AT TIME ZONE 'Asia/Shanghai')::date,
           interval '1 day'
         ) AS day
         LEFT JOIN t_mood_history h ON h.user_id = $1 AND h.mood_date = day::date
        ORDER BY day ASC`,
      [req.userId],
    )
    return res.json({ code: 0, data: rows })
  } catch (error) {
    console.error('[spaces/mood-week]', error)
    return res.status(500).json({ code: 500, msg: '本周心情加载失败' })
  }
})

/** 官方体验圈可在加入前预览；不返回大规模成员列表，只返回聚合数量。 */
spacesRouter.get('/official-experience', async (req, res) => {
  try {
    const row = await queryOne<SpaceRow>(
      `${SPACE_SELECT}
        WHERE s.official_key = 'daykeep-experience'
          AND s.is_official = TRUE
          AND s.access_type = 'public'
          AND s.dissolved_at IS NULL`,
    )
    if (!row) return res.status(404).json({ code: 404, msg: '官方体验圈暂未开放' })
    const joined = await queryOne<{ role: string }>(
      `SELECT role FROM t_space_member WHERE space_id = $1 AND user_id = $2`,
      [row.id, req.userId],
    )
    const membersBySpace = await listPublicMemberPreviews([row.id])
    return res.json({ code: 0, data: { ...normalizeSpace(row, membersBySpace.get(row.id) || [], joined?.role || ''), joined: !!joined } })
  } catch (error) {
    console.error('[spaces/official-experience]', error)
    return res.status(500).json({ code: 500, msg: '体验圈加载失败' })
  }
})

/** 无需邀请码的一键加入；唯一约束保证重复点击和并发请求都是幂等的。 */
spacesRouter.post('/official-experience/join', async (req, res) => {
  try {
    const uid = Number(req.userId)
    if (isRateLimited(`space:official-join:user:${uid}`, 10, 60_000)) {
      return res.status(429).json({ code: 429, msg: '操作过于频繁，请稍后再试' })
    }
    const space = await queryOne<{ id: string }>(
      `SELECT id::text
         FROM t_space
        WHERE official_key = 'daykeep-experience'
          AND is_official = TRUE
          AND access_type = 'public'
          AND join_policy = 'open'
          AND dissolved_at IS NULL`,
    )
    if (!space) return res.status(404).json({ code: 404, msg: '官方体验圈暂未开放' })
    const existed = await queryOne<{ ok: number }>(
      `SELECT 1 AS ok FROM t_space_member WHERE space_id = $1 AND user_id = $2`,
      [space.id, req.userId],
    )
    await query(
      `INSERT INTO t_space_member (space_id, user_id, role, nickname, avatar_url)
       SELECT $1, id, 'member', nickname, avatar_url
         FROM t_user WHERE id = $2
       ON CONFLICT (space_id, user_id) DO UPDATE SET updated_at = now()`,
      [space.id, req.userId],
    )
    const loaded = await loadSpaceById(space.id)
    if (!loaded) return res.status(404).json({ code: 404, msg: '官方体验圈暂未开放' })
    const role = await viewerRole(space.id, req.userId)
    return res.json({ code: 0, data: { ...loaded, currentUserRole: role, joined: true, alreadyMember: !!existed } })
  } catch (error) {
    console.error('[spaces/official-experience/join]', error)
    return res.status(500).json({ code: 500, msg: '加入失败，请稍后重试' })
  }
})

spacesRouter.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    if (!/^\d+$/.test(id)) return res.status(400).json({ code: 400, msg: 'invalid id' })
    const row = await queryOne<SpaceRow>(
      `${SPACE_SELECT}
         JOIN t_space_member m ON m.space_id = s.id AND m.user_id = $2
        WHERE s.id = $1`,
      [id, req.userId],
    )
    if (!row) return res.status(404).json({ code: 404, msg: '时光圈不存在' })
    const [membersBySpace, role] = await Promise.all([
      listDisplayMembers([row]),
      viewerRole(row.id, req.userId),
    ])
    return res.json({ code: 0, data: normalizeSpace(row, membersBySpace.get(row.id) || [], role) })
  } catch (e: any) {
    console.error('[spaces/detail]', e)
    return res.status(500).json({ code: 500, msg: 'failed' })
  }
})

spacesRouter.post('/:id/invite', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    if (!/^\d+$/.test(id)) return res.status(400).json({ code: 400, msg: 'invalid id' })
    const publicSpace = await queryOne<{ ok: number }>(
      `SELECT 1 AS ok FROM t_space WHERE id = $1 AND access_type = 'public' AND is_official = TRUE`, [id],
    )
    if (publicSpace) return res.status(409).json({ code: 409, msg: '官方体验圈无需邀请，可以直接加入' })
    // 只有创建者可以签发邀请：否则被邀请进来的成员能继续拉入任意第三方。
    const owner = await queryOne<{ id: string }>(
      `SELECT id::text FROM t_space WHERE id = $1 AND owner_id = $2 AND dissolved_at IS NULL`,
      [id, req.userId],
    )
    if (!owner) return res.status(403).json({ code: 403, msg: '只有创建者可以邀请成员' })
    // 详情页会提前准备微信分享卡。复用尚未消费的有效邀请，避免用户每次
    // 打开页面都生成一条永远不会使用的邀请链接令牌。
    const existing = await queryOne<{ inviteCode: string; expiresAt: string }>(
      `SELECT code AS "inviteCode", expires_at AS "expiresAt"
         FROM t_space_invite
        WHERE space_id = $1
          AND created_by = $2
          AND revoked_at IS NULL
          AND used_at IS NULL
          AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1`,
      [id, req.userId],
    )
    let invitation = existing
    if (!invitation) {
      const inviteCode = crypto.randomBytes(16).toString('hex')
      invitation = await queryOne<{ inviteCode: string; expiresAt: string }>(
        `INSERT INTO t_space_invite (space_id, created_by, code, expires_at)
         VALUES ($1, $2, $3, now() + ${INVITE_TTL})
         RETURNING code AS "inviteCode", expires_at AS "expiresAt"`,
        [id, req.userId, inviteCode],
      )
    }
    if (!invitation) return res.status(500).json({ code: 500, msg: '邀请卡生成失败' })
    return res.json({
      code: 0,
      data: {
        inviteCode: invitation.inviteCode,
        inviteUrl: `/pages/space/join?code=${invitation.inviteCode}`,
        expiresAt: invitation.expiresAt,
      },
    })
  } catch (e: any) {
    console.error('[spaces/invite]', e)
    return res.status(500).json({ code: 500, msg: 'failed' })
  }
})

/** 撤销该时光圈尚未使用的邀请，供泄漏后立即止损。 */
spacesRouter.post('/:id/invite/revoke', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    if (!/^\d+$/.test(id)) return res.status(400).json({ code: 400, msg: 'invalid id' })
    const owner = await queryOne<{ id: string }>(
      `SELECT id::text FROM t_space WHERE id = $1 AND owner_id = $2`,
      [id, req.userId],
    )
    if (!owner) return res.status(403).json({ code: 403, msg: '只有创建者可以撤销邀请' })
    const revoked = await query<{ id: string }>(
      `UPDATE t_space_invite
          SET revoked_at = now()
        WHERE space_id = $1 AND revoked_at IS NULL AND used_at IS NULL
        RETURNING id::text`,
      [id],
    )
    return res.json({ code: 0, data: { revokedCount: revoked.length } })
  } catch (e: any) {
    console.error('[spaces/invite/revoke]', e)
    return res.status(500).json({ code: 500, msg: 'failed' })
  }
})

/** 任一成员都可解除整个共同空间；7 天内仅发起者可恢复。 */
spacesRouter.post('/:id/dissolve', async (req, res) => {
  let client: PoolClient | null = null
  try {
    const id = String(req.params.id || '')
    if (!/^\d+$/.test(id)) return res.status(400).json({ code: 400, msg: 'invalid id' })
    const protectedSpace = await queryOne<{ ok: number }>(
      `SELECT 1 AS ok FROM t_space WHERE id = $1 AND is_official = TRUE`, [id],
    )
    if (protectedSpace) return res.status(409).json({ code: 409, msg: '官方体验圈不能解除' })
    client = await getPool().connect()
    await client.query('BEGIN')
    const memberResult = await client.query<{ nickname: string }>(
      `SELECT nickname FROM t_space_member WHERE space_id = $1 AND user_id = $2`,
      [id, req.userId],
    )
    const member = memberResult.rows[0]
    if (!member) {
      await client.query('ROLLBACK')
      return res.status(403).json({ code: 403, msg: '你已不在该时光圈' })
    }
    const updatedResult = await client.query<{ id: string }>(
      `UPDATE t_space
          SET dissolved_at = now(),
              dissolved_by = $2,
              dissolved_by_name = $3,
              purge_at = now() + interval '7 days',
              updated_at = now()
        WHERE id = $1 AND dissolved_at IS NULL
        RETURNING id::text`,
      [id, req.userId, member.nickname || '一位成员'],
    )
    if (!updatedResult.rowCount) {
      await client.query('ROLLBACK')
      return res.status(409).json({ code: 409, msg: '该时光圈已经解除' })
    }
    await client.query(
      `UPDATE t_space_invite SET revoked_at = now()
        WHERE space_id = $1 AND revoked_at IS NULL AND used_at IS NULL`,
      [id],
    )
    await client.query('COMMIT')
    const space = await loadSpaceById(id)
    return res.json({ code: 0, data: space })
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined)
    console.error('[spaces/dissolve]', error)
    return res.status(500).json({ code: 500, msg: '解除失败' })
  } finally {
    client?.release()
  }
})

spacesRouter.post('/:id/restore', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    if (!/^\d+$/.test(id)) return res.status(400).json({ code: 400, msg: 'invalid id' })
    const restored = await queryOne<{ id: string }>(
      `UPDATE t_space
          SET dissolved_at = NULL,
              dissolved_by = NULL,
              dissolved_by_name = '',
              purge_at = NULL,
              updated_at = now()
        WHERE id = $1 AND dissolved_by = $2 AND purge_at > now()
        RETURNING id::text`,
      [id, req.userId],
    )
    if (!restored) return res.status(403).json({ code: 403, msg: '只有解除发起者可在 7 天内恢复' })
    const space = await loadSpaceById(id)
    return res.json({ code: 0, data: space })
  } catch (error) {
    console.error('[spaces/restore]', error)
    return res.status(500).json({ code: 500, msg: '恢复失败' })
  }
})

spacesRouter.put('/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    if (!/^\d+$/.test(id)) return res.status(400).json({ code: 400, msg: 'invalid id' })
    const uid = Number(req.userId)
    if (isRateLimited(`space:update:user:${uid}`, 20, 60_000)) {
      return res.status(429).json({ code: 429, msg: '操作过于频繁，请稍后再试' })
    }
    const manager = await queryOne<{ id: string }>(
      `SELECT s.id::text
         FROM t_space s
         LEFT JOIN t_space_member sm ON sm.space_id = s.id AND sm.user_id = $2
        WHERE s.id = $1
          AND s.dissolved_at IS NULL
          AND (
            s.owner_id = $2
            OR (s.is_official = TRUE AND s.access_type = 'public' AND sm.role = 'admin')
          )`,
      [id, req.userId],
    )
    if (!manager) return res.status(403).json({ code: 403, msg: '只有创建者或官方管理员可以修改时光圈' })
    const body = req.body || {}
    const name = String(body.name || '').trim().slice(0, 64)
    const keywords = normalizeKeywords(body.keywords)
    const hasCoverUrl = Object.prototype.hasOwnProperty.call(body, 'coverUrl')
    const coverUrl = hasCoverUrl ? normalizeCoverUrl(body.coverUrl, req.userId!) : ''
    if (coverUrl == null) return res.status(400).json({ code: 400, msg: '封面地址不合法' })
    if (
      (name && looksLikeAttackPayload(name)) ||
      keywords.some((item) => looksLikeAttackPayload(item))
    ) {
      console.warn('[spaces/update] blocked suspicious payload', {
        userId: uid,
        spaceId: id,
        namePreview: name.slice(0, 80),
      })
      return res.status(400).json({ code: 400, msg: '圈子名称不合法' })
    }
    // 只在请求真的带了 keywords 时才写这一列。
    // 原来无条件写 $3，而 normalizeKeywords(undefined) 返回 []，
    // 于是一个只改名字的 PUT（service 层就是这么声明的 Partial 入参）会把
    // 已有关键词全部清空。
    const hasKeywords = Object.prototype.hasOwnProperty.call(body, 'keywords')
    const updated = await queryOne<{ id: string }>(
      `UPDATE t_space
          SET name = COALESCE(NULLIF($2, ''), name),
              keywords = CASE WHEN $4::boolean THEN $3::jsonb ELSE keywords END,
              cover_url = CASE WHEN $6::boolean THEN $5 ELSE cover_url END,
              updated_at = now()
        WHERE id = $1
        RETURNING id::text`,
      [id, name, JSON.stringify(keywords), hasKeywords, coverUrl, hasCoverUrl],
    )
    if (!updated) return res.status(404).json({ code: 404, msg: '时光圈不存在' })
    const space = await loadSpaceById(updated.id)
    if (!space) return res.status(404).json({ code: 404, msg: '时光圈不存在' })
    return res.json({ code: 0, data: space })
  } catch (e: any) {
    console.error('[spaces/update]', e)
    return res.status(500).json({ code: 500, msg: 'failed' })
  }
})

/** 官方空间管理员查看完整成员列表，用于任命管理员。 */
spacesRouter.get('/:id/members', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const moderator = await requireOfficialModerator(id, req.userId)
    if (!moderator) return res.status(403).json({ code: 403, msg: '只有管理员可以查看成员管理' })
    const members = await query<MemberRow>(
      `SELECT sm.id::text, sm.user_id::text AS "userId", sm.space_id::text AS "spaceId", sm.role,
              COALESCE(NULLIF(u.nickname, ''), sm.nickname) AS nickname,
              COALESCE(NULLIF(u.avatar_url, ''), sm.avatar_url) AS "avatarUrl",
              '' AS mood, sm.joined_at AS "joinedAt"
         FROM t_space_member sm
         JOIN t_user u ON u.id = sm.user_id
        WHERE sm.space_id = $1
        ORDER BY CASE sm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, sm.joined_at ASC
        LIMIT 500`,
      [id],
    )
    return res.json({ code: 0, data: members.map((member) => ({
      ...member,
      role: member.role === 'owner' ? 'owner' : member.role === 'admin' ? 'admin' : 'member',
    })) })
  } catch (error) {
    console.error('[spaces/members]', error)
    return res.status(500).json({ code: 500, msg: '成员列表加载失败' })
  }
})

/** 官方管理员可以任命或取消其他管理员。 */
spacesRouter.put('/:id/members/:userId/role', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const targetUserId = String(req.params.userId || '')
    const role = req.body?.role === 'admin' ? 'admin' : req.body?.role === 'member' ? 'member' : ''
    if (!/^\d+$/.test(id) || !/^\d+$/.test(targetUserId) || !role) {
      return res.status(400).json({ code: 400, msg: '管理员设置无效' })
    }
    const moderator = await requireOfficialModerator(id, req.userId)
    if (!moderator) return res.status(403).json({ code: 403, msg: '只有官方管理员可以设置管理员' })
    if (targetUserId === moderator.ownerId) return res.status(409).json({ code: 409, msg: '官方账号始终是圈主' })
    if (targetUserId === String(req.userId)) return res.status(409).json({ code: 409, msg: '不能修改自己的管理权限' })
    const updated = await query<{ userId: string }>(
      `UPDATE t_space_member SET role = $3, updated_at = now()
        WHERE space_id = $1 AND user_id = $2 AND role <> 'owner'
        RETURNING user_id::text AS "userId"`,
      [id, targetUserId, role],
    )
    if (!updated.length) return res.status(404).json({ code: 404, msg: '成员不存在' })
    return res.json({ code: 0, data: { ok: true, role } })
  } catch (error) {
    console.error('[spaces/member-role]', error)
    return res.status(500).json({ code: 500, msg: '管理员设置失败' })
  }
})

/** 成员举报公开空间中的内容；同一用户对同一条记录最多保留一份举报。 */
spacesRouter.get('/:id/blocked-members', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const moderator = await requireOfficialModerator(id, req.userId)
    if (!moderator) return res.status(403).json({ code: 403, msg: '只有管理员可以查看发布限制' })
    const members = await query(
      `SELECT sm.user_id::text AS "userId", COALESCE(NULLIF(u.nickname, ''), '圈内成员') AS nickname,
              COALESCE(u.avatar_url, '') AS "avatarUrl", sm.posting_blocked_at AS "blockedAt",
              sm.posting_block_reason AS reason
         FROM t_space_member sm JOIN t_user u ON u.id = sm.user_id
        WHERE sm.space_id = $1 AND sm.posting_blocked_at IS NOT NULL
        ORDER BY sm.posting_blocked_at DESC LIMIT 100`,
      [id],
    )
    return res.json({ code: 0, data: members })
  } catch (error) {
    console.error('[spaces/blocked-members]', error)
    return res.status(500).json({ code: 500, msg: '发布限制加载失败' })
  }
})

spacesRouter.post('/:id/reports', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const entryId = String(req.body?.entryId || '')
    if (!/^\d+$/.test(id) || !/^\d+$/.test(entryId)) return res.status(400).json({ code: 400, msg: '请选择要举报的内容' })
    const uid = Number(req.userId)
    if (isRateLimited(`space:report:user:${uid}`, 8, 60 * 60_000)) {
      return res.status(429).json({ code: 429, msg: '提交过于频繁，请稍后再试' })
    }
    const readable = await queryOne<{ ok: number }>(
      `SELECT 1 AS ok
         FROM t_entry e
         JOIN t_space s ON s.id = e.space_id AND s.id = $1
         JOIN t_space_member m ON m.space_id = s.id AND m.user_id = $3
        WHERE e.id = $2 AND e.deleted = FALSE
          AND e.visibility = 'space' AND s.access_type = 'public' AND s.is_official = TRUE`,
      [id, entryId, req.userId],
    )
    if (!readable) return res.status(404).json({ code: 404, msg: '内容不存在或已处理' })
    const reason = String(req.body?.reason || '不适合公开展示').trim().slice(0, 240)
    await query(
      `INSERT INTO t_space_content_report (space_id, entry_id, reporter_id, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (entry_id, reporter_id)
       DO UPDATE SET reason = EXCLUDED.reason, status = 'pending', resolved_by = NULL,
                     resolved_at = NULL, updated_at = now()`,
      [id, entryId, req.userId, reason],
    )
    return res.json({ code: 0, data: { ok: true } })
  } catch (error) {
    console.error('[spaces/report]', error)
    return res.status(500).json({ code: 500, msg: '举报提交失败' })
  }
})

/** 官方空间管理员查看待处理举报。 */
spacesRouter.get('/:id/reports', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const moderator = await requireOfficialModerator(id, req.userId)
    if (!moderator) return res.status(403).json({ code: 403, msg: '只有管理员可以查看举报' })
    const reports = await query(
      `SELECT r.id::text, r.entry_id::text AS "entryId", r.reporter_id::text AS "reporterId",
              r.reason, r.created_at AS "createdAt", e.title, e.body,
              e.user_id::text AS "authorUserId", COALESCE(NULLIF(u.nickname, ''), '圈内成员') AS "authorName"
         FROM t_space_content_report r
         JOIN t_entry e ON e.id = r.entry_id
         JOIN t_user u ON u.id = e.user_id
        WHERE r.space_id = $1 AND r.status = 'pending'
        ORDER BY r.created_at DESC LIMIT 100`,
      [id],
    )
    return res.json({ code: 0, data: reports })
  } catch (error) {
    console.error('[spaces/reports]', error)
    return res.status(500).json({ code: 500, msg: '举报列表加载失败' })
  }
})

spacesRouter.post('/:id/reports/:reportId/resolve', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const reportId = String(req.params.reportId || '')
    const moderator = await requireOfficialModerator(id, req.userId)
    if (!moderator) return res.status(403).json({ code: 403, msg: '只有管理员可以处理举报' })
    const resolved = await query(
      `UPDATE t_space_content_report
          SET status = 'dismissed', resolved_by = $3, resolved_at = now(), updated_at = now()
        WHERE id = $1 AND space_id = $2 AND status = 'pending'
        RETURNING id`,
      [reportId, id, req.userId],
    )
    if (!resolved.length) return res.status(404).json({ code: 404, msg: '举报不存在或已处理' })
    return res.json({ code: 0, data: { ok: true } })
  } catch (error) {
    console.error('[spaces/resolve-report]', error)
    return res.status(500).json({ code: 500, msg: '举报处理失败' })
  }
})

/** 管理员隐藏公开内容；使用现有软删除语义，作者和成员都会立即看不到。 */
spacesRouter.put('/:id/entries/:entryId/pin', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const entryId = String(req.params.entryId || '')
    const moderator = await requireOfficialModerator(id, req.userId)
    if (!moderator) return res.status(403).json({ code: 403, msg: '只有管理员可以置顶公开内容' })
    const pinned = req.body?.pinned !== false
    const updated = await query(
      `UPDATE t_entry SET pinned = $3, updated_at = now()
        WHERE id = $1 AND space_id = $2 AND visibility = 'space' AND deleted = FALSE
        RETURNING id`,
      [entryId, id, pinned],
    )
    if (!updated.length) return res.status(404).json({ code: 404, msg: '内容不存在或已处理' })
    return res.json({ code: 0, data: { ok: true, pinned } })
  } catch (error) {
    console.error('[spaces/pin-entry]', error)
    return res.status(500).json({ code: 500, msg: '置顶状态更新失败' })
  }
})

spacesRouter.post('/:id/entries/:entryId/hide', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const entryId = String(req.params.entryId || '')
    const moderator = await requireOfficialModerator(id, req.userId)
    if (!moderator) return res.status(403).json({ code: 403, msg: '只有管理员可以处理公开内容' })
    const hidden = await query<{ id: string }>(
      `UPDATE t_entry SET deleted = TRUE, updated_at = now()
        WHERE id = $1 AND space_id = $2 AND visibility = 'space' AND deleted = FALSE
        RETURNING id::text`,
      [entryId, id],
    )
    if (!hidden.length) return res.status(404).json({ code: 404, msg: '内容不存在或已处理' })
    await query(
      `UPDATE t_space_content_report
          SET status = 'resolved', resolved_by = $3, resolved_at = now(), updated_at = now()
        WHERE space_id = $1 AND entry_id = $2 AND status = 'pending'`,
      [id, entryId, req.userId],
    )
    return res.json({ code: 0, data: { ok: true } })
  } catch (error) {
    console.error('[spaces/hide-entry]', error)
    return res.status(500).json({ code: 500, msg: '内容处理失败' })
  }
})

/** 管理员可以暂停或恢复某位成员在公开空间的发布权限。 */
spacesRouter.put('/:id/members/:userId/posting-block', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const targetUserId = String(req.params.userId || '')
    const moderator = await requireOfficialModerator(id, req.userId)
    if (!moderator) return res.status(403).json({ code: 403, msg: '只有管理员可以调整发布权限' })
    const target = await queryOne<{ role: string }>(
      `SELECT role FROM t_space_member WHERE space_id = $1 AND user_id = $2`,
      [id, targetUserId],
    )
    if (!target) return res.status(404).json({ code: 404, msg: '成员不存在' })
    if (target.role === 'owner' || target.role === 'admin') return res.status(409).json({ code: 409, msg: '不能限制管理员账号' })
    const blocked = req.body?.blocked !== false
    const reason = String(req.body?.reason || '').trim().slice(0, 240)
    const updated = await query(
      `UPDATE t_space_member
          SET posting_blocked_at = CASE WHEN $3::boolean THEN now() ELSE NULL END,
              posting_blocked_by = CASE WHEN $3::boolean THEN $4::bigint ELSE NULL END,
              posting_block_reason = CASE WHEN $3::boolean THEN $5 ELSE '' END,
              updated_at = now()
        WHERE space_id = $1 AND user_id = $2
        RETURNING id`,
      [id, targetUserId, blocked, req.userId, reason],
    )
    if (!updated.length) return res.status(404).json({ code: 404, msg: '成员不存在' })
    return res.json({ code: 0, data: { ok: true, blocked } })
  } catch (error) {
    console.error('[spaces/posting-block]', error)
    return res.status(500).json({ code: 500, msg: '发布权限更新失败' })
  }
})

/** 普通成员主动退出；创建者必须先保留圈子归属，不能无主退出。 */
spacesRouter.delete('/:id/members/me', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    if (!/^\d+$/.test(id)) return res.status(400).json({ code: 400, msg: 'invalid id' })
    const member = await queryOne<{ role: string }>(
      `SELECT role FROM t_space_member WHERE space_id = $1 AND user_id = $2`, [id, req.userId],
    )
    if (!member) return res.status(404).json({ code: 404, msg: '你已不在该时光圈' })
    if (member.role === 'owner') return res.status(409).json({ code: 409, msg: '创建者不能直接退出时光圈' })
    await query(`DELETE FROM t_space_member WHERE space_id = $1 AND user_id = $2`, [id, req.userId])
    return res.json({ code: 0, data: { ok: true } })
  } catch (error) {
    console.error('[spaces/leave]', error)
    return res.status(500).json({ code: 500, msg: '退出失败' })
  }
})

/** 创建者（或官方圈管理员）移除成员；已有共同内容继续留在圈中。 */
spacesRouter.delete('/:id/members/:userId', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    const targetUserId = String(req.params.userId || '')
    if (!/^\d+$/.test(id) || !/^\d+$/.test(targetUserId)) return res.status(400).json({ code: 400, msg: 'invalid id' })
    const manager = await queryOne<{ ownerId: string }>(
      `SELECT s.owner_id::text AS "ownerId"
         FROM t_space s
         LEFT JOIN t_space_member sm ON sm.space_id = s.id AND sm.user_id = $2
        WHERE s.id = $1
          AND (s.owner_id = $2 OR (s.is_official = TRUE AND s.access_type = 'public' AND sm.role = 'admin'))`,
      [id, req.userId],
    )
    if (!manager) return res.status(403).json({ code: 403, msg: '只有创建者或官方管理员可以移除成员' })
    if (targetUserId === manager.ownerId) return res.status(409).json({ code: 409, msg: '不能移除圈主' })
    if (targetUserId === String(req.userId)) return res.status(409).json({ code: 409, msg: '不能移除自己' })
    const removed = await query(`DELETE FROM t_space_member WHERE space_id = $1 AND user_id = $2 RETURNING id`, [id, targetUserId])
    if (!removed.length) return res.status(404).json({ code: 404, msg: '成员不存在' })
    return res.json({ code: 0, data: { ok: true } })
  } catch (error) {
    console.error('[spaces/remove-member]', error)
    return res.status(500).json({ code: 500, msg: '移除失败' })
  }
})

/**
 * 加入时光圈。「查邀请 → 消费邀请 → 插成员」必须在同一个事务里，
 * 避免邀请已 UPDATE 成 used，之后插成员失败却没人回滚，导致链接被白白消耗。
 *
 * 空间成员数量不设上限；pair/group 仅保留为历史空间类型与展示信息，
 * 不再作为加入权限或人数限制。
 *
 * 先锁住 t_space 行，可以让同一空间的加入与解除按顺序落库，避免状态交叉。
 * 邀请本身仍是单次消费，成功加入后该链接失效，需要继续邀请时由创建者生成新链接。
 */
spacesRouter.post('/join', async (req, res) => {
  let client: PoolClient | null = null
  try {
    const code = String(req.body?.code || req.body?.inviteCode || '').trim()
    if (!code) return res.status(400).json({ code: 400, msg: '邀请链接无效' })

    client = await getPool().connect()
    await client.query('BEGIN')

    const inviteResult = await client.query<{ spaceId: string }>(
      `SELECT i.space_id::text AS "spaceId"
         FROM t_space_invite i
         JOIN t_space s ON s.id = i.space_id
       WHERE i.code = $1
          AND s.dissolved_at IS NULL
          AND i.revoked_at IS NULL
          AND i.used_at IS NULL
          AND i.expires_at > now()
          FOR UPDATE OF s`,
      [code],
    )
    const invite = inviteResult.rows[0]
    if (!invite) {
      await client.query('ROLLBACK')
      return res.status(404).json({ code: 404, msg: '邀请已失效或已被使用' })
    }

    // 已经是成员时直接返回，不消费邀请链接（避免重复点击把有效邀请浪费掉）。
    const already = await client.query<{ id: string }>(
      `SELECT id::text FROM t_space_member WHERE space_id = $1 AND user_id = $2`,
      [invite.spaceId, req.userId],
    )
    if (already.rowCount) {
      await client.query('ROLLBACK')
      const space = await loadSpaceById(invite.spaceId)
      if (!space) return res.status(404).json({ code: 404, msg: '时光圈不存在' })
      return res.json({ code: 0, data: { ...space, alreadyMember: true } })
    }

    // 单次消费：并发提交时只有一个请求能拿到这行，其余直接失败。
    const consumed = await client.query<{ id: string }>(
      `UPDATE t_space_invite
          SET used_at = now(), used_by = $2
        WHERE code = $1
          AND revoked_at IS NULL
          AND used_at IS NULL
          AND expires_at > now()
        RETURNING id::text`,
      [code, req.userId],
    )
    if (!consumed.rowCount) {
      await client.query('ROLLBACK')
      return res.status(409).json({ code: 409, msg: '邀请已失效或已被使用' })
    }

    await client.query(
      `INSERT INTO t_space_member (space_id, user_id, role, nickname, avatar_url)
       SELECT $1, id, 'member', nickname, avatar_url FROM t_user WHERE id = $2
       ON CONFLICT (space_id, user_id) DO UPDATE
          SET updated_at = now()`,
      [invite.spaceId, req.userId],
    )
    await client.query('COMMIT')

    const space = await loadSpaceById(invite.spaceId)
    if (!space) return res.status(404).json({ code: 404, msg: '时光圈不存在' })
    return res.json({ code: 0, data: { ...space, alreadyMember: false } })
  } catch (e: any) {
    if (client) await client.query('ROLLBACK').catch(() => undefined)
    console.error('[spaces/join]', e)
    return res.status(500).json({ code: 500, msg: 'failed' })
  } finally {
    client?.release()
  }
})
