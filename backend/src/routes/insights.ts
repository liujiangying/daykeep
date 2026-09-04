import crypto from 'node:crypto'
import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { query } from '../db.js'
import { insightDaysUntil, isInsightDateActionable } from '../lib/insightDates.js'

export const insightsRouter = Router()
insightsRouter.use(requireAuth)

type InsightDraft = {
  type: string
  title: string
  content: string
  actionType: string
  spaceId?: string
  validThrough?: string
}
type InsightScope = { key: string; spaceId: string | null; name: string }
type StoredInsight = {
  id: string
  type: string
  title: string
  content: string
  actionType: string
  actionPayload: Record<string, unknown>
  dismissedAt: string | null
  createdAt: string
}
const INSIGHT_FIELDS = `id::text, insight_type AS "type", title, content, action_type AS "actionType",
  action_payload AS "actionPayload", dismissed_at AS "dismissedAt", created_at AS "createdAt"`
const MAX_WEEKLY_INSIGHTS = 3

function shanghaiDateKey(value: string | number | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function insightPayload(scope: InsightScope, draft: InsightDraft) {
  return {
    spaceId: scope.spaceId,
    scopeKey: scope.key,
    ...(draft.validThrough ? { validThrough: draft.validThrough } : {}),
  }
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return value.toISOString().slice(0, 10)
}

async function resolveScope(userId: string | number, rawSpaceId: unknown): Promise<InsightScope | null> {
  const spaceId = String(rawSpaceId || '').trim()
  if (!spaceId) return { key: `insight-v3:personal:${userId}`, spaceId: null, name: '仅自己' }
  if (!/^\d+$/.test(spaceId)) return null
  const rows = await query<{ name: string }>(
    `SELECT s.name FROM t_space s JOIN t_space_member m ON m.space_id = s.id
      WHERE s.id = $1 AND m.user_id = $2 LIMIT 1`,
    [spaceId, userId],
  )
  return rows[0] ? { key: `insight-v3:space:${spaceId}`, spaceId, name: rows[0].name } : null
}

function actionableAnniversaryDraft(
  upcoming: { title: string; eventDate: string; spaceId: string | null; days: number },
  scope: InsightScope,
  records: Array<{ title: string; body: string }>,
): InsightDraft {
  const dateParts = upcoming.eventDate.slice(0, 10).split('-').map(Number)
  const dateLabel = `${dateParts[1]}月${dateParts[2]}日`
  const rawTitle = upcoming.title.trim()
  const birthdaySubject = rawTitle.replace(/的?生日$/, '').trim()
  const title = /生日/.test(rawTitle) && birthdaySubject
    ? `庆祝${birthdaySubject}的生日`
    : `为「${rawTitle}」准备一点心意`
  const sourceText = records.map((item) => `${item.title} ${item.body}`).join(' ')
  const interest = ['咖啡', '电影', '散步', '旅行', '日料', '公园', '露营', '甜品', '猫', '狗']
    .find((word) => sourceText.includes(word))
  let suggestion = '可以提前挑一份贴合对方近来喜好的小礼物，或约一顿喜欢的饭，再写一张只属于你们的小卡片。'
  if (/[猫狗]|宠物/.test(rawTitle)) {
    suggestion = '可以提前准备它喜欢的零食或一个新玩具，再挑几张照片做个小回顾，让这一天更有仪式感。'
  } else if (interest) {
    suggestion = `最近的记录里出现过“${interest}”，可以从这个线索准备一份小惊喜，或提前约一次和${interest}有关的小安排。`
  } else if (!/生日/.test(rawTitle)) {
    suggestion = '可以翻翻最近的共同记录，挑一个反复出现的小愿望，提前安排一顿饭、一次散步或一封信。'
  }
  return {
    type: 'anniversary',
    title,
    content: `${dateLabel}是${rawTitle}，${suggestion}`,
    actionType: 'commitment',
    spaceId: upcoming.spaceId || scope.spaceId || undefined,
    validThrough: addDays(shanghaiDateKey(), upcoming.days),
  }
}

async function buildDrafts(userId: string | number, scope: InsightScope): Promise<{ drafts: InsightDraft[]; digest: string }> {
  const entryScopeSql = scope.spaceId
    ? `e.owner_type = 'space' AND e.space_id = $1`
    : `COALESCE(e.owner_type, 'personal') = 'personal' AND e.space_id IS NULL AND e.user_id = $1`
  // resolveScope 已经完成当前用户的空间成员鉴权；数据查询本身只需要一个 scope 参数。
  // 之前空间模式使用 $2 却传 [userId, spaceId]，$1 没出现在 SQL 中，PostgreSQL
  // 会报 42P18「could not determine data type of parameter $1」，导致接口持续 500。
  const entryParams = [scope.spaceId || userId]
  const records = await query<{ title: string; body: string; eventDate: string; spaceId: string | null; spaceName: string | null }>(
    `SELECT e.title, left(e.body, 180) AS body, e.event_date::text AS "eventDate", e.space_id::text AS "spaceId", s.name AS "spaceName"
       FROM t_entry e LEFT JOIN t_space s ON s.id = e.space_id
      WHERE e.deleted = FALSE AND e.created_at >= now() - interval '180 days'
        AND e.capsule_unlock_at IS NULL
        AND NOT (
          COALESCE(e.entry_kind, 'normal') = 'commitment'
          AND e.event_date < (now() AT TIME ZONE 'Asia/Shanghai')::date
          AND COALESCE(e.recurring, FALSE) = FALSE
          AND COALESCE(e.repeat_rule, 'none') = 'none'
        )
        AND ${entryScopeSql}
      ORDER BY e.created_at DESC LIMIT 40`, entryParams,
  )
  const anniversaries = await query<{ title: string; eventDate: string; spaceId: string | null; recurring: boolean; repeatRule: string }>(
    `SELECT e.title, e.event_date::text AS "eventDate", e.space_id::text AS "spaceId",
            COALESCE(e.recurring, FALSE) AS recurring, COALESCE(e.repeat_rule, 'none') AS "repeatRule"
       FROM t_entry e
      WHERE e.deleted = FALSE AND e.type = 'anniversary'
        AND (
          e.event_date >= (now() AT TIME ZONE 'Asia/Shanghai')::date
          OR COALESCE(e.recurring, FALSE) = TRUE
          OR COALESCE(e.repeat_rule, 'none') <> 'none'
        )
        AND ${entryScopeSql}
      ORDER BY e.event_date LIMIT 30`, entryParams,
  )
  const moods = scope.spaceId
    ? await query<{ nickname: string; mood: string; spaceId: string }>(
      `SELECT m.nickname, m.mood, m.space_id::text AS "spaceId" FROM t_space_member m
        WHERE m.user_id <> $1 AND m.space_id = $2 AND m.mood IN ('rainy','storm','cloudy') LIMIT 8`,
      [userId, scope.spaceId],
    )
    : []
  const today = shanghaiDateKey()
  const actionableAnniversaries = anniversaries
    .map((item) => ({ ...item, days: insightDaysUntil(item.eventDate, item.recurring, item.repeatRule, today) }))
    .filter((item) => isInsightDateActionable(item.eventDate, item.recurring, item.repeatRule, today))
    .sort((a, b) => a.days - b.days)
  const upcoming = actionableAnniversaries[0]
  const anniversaryFallback = upcoming ? actionableAnniversaryDraft(upcoming, scope, records) : null
  const source = JSON.stringify({ scope: scope.key, records, anniversaries: actionableAnniversaries, moods, today })
  const digest = crypto.createHash('sha256').update(source).digest('hex')
  let drafts: InsightDraft[] = []
  if (anniversaryFallback) {
    drafts.unshift(anniversaryFallback)
  }
  const lowMood = moods[0]
  if (lowMood && drafts.length < MAX_WEEKLY_INSIGHTS && !drafts.some((draft) => draft.type === 'care')) {
    drafts.push({ type: 'care', title: `${lowMood.nickname} 最近的心情有些阴天`, content: '也许一句不追问原因的关心，或约一次轻松散步，会让彼此更靠近。这里不会展示对方的记录内容。', actionType: 'diary', spaceId: lowMood.spaceId })
  }
  if (drafts.length < MAX_WEEKLY_INSIGHTS) {
    const recordTexts = records.map((item) => `${item.title} ${item.body}`)
    const interests = ['咖啡', '电影', '散步', '旅行', '日料', '公园', '露营'].filter((word) => recordTexts.filter((text) => text.includes(word)).length >= 2)
    if (interests[0] && !drafts.some((draft) => draft.type === 'preference')) drafts.push({ type: 'preference', title: `最近常出现“${interests[0]}”`, content: `把喜欢变成一次真实约定：找个空闲时间，一起安排一次${interests[0]}相关的小探索。`, actionType: 'commitment', spaceId: records.find((item) => `${item.title} ${item.body}`.includes(interests[0]))?.spaceId || undefined })
  }
  if (drafts.length < MAX_WEEKLY_INSIGHTS) {
    // 一条真实回忆已经足够给出“延续记录”的建议，只是不足以推断长期偏好。
    // 不能因此返回空数组，让前端一直显示一个仿佛仍在异步生成的占位状态。
    const latestRecord = records.find((item) => item.title.trim() || item.body.trim())
    if (latestRecord) {
      const rawTitle = latestRecord.title.trim()
      const genericTitles = new Set(['此刻', '随手记', '共同回忆', '未命名记录'])
      const memoryName = rawTitle && !genericTitles.has(rawTitle) ? `「${rawTitle.slice(0, 24)}」` : '最近这段回忆'
      drafts.push({
        type: 'care',
        title: `把${memoryName}接着写下去`,
        content: '它已经被好好留下来了。可以再补一句当时最想记住的细节，或把下一次想一起做的事约成一个日子。',
        actionType: 'diary',
        spaceId: latestRecord.spaceId || scope.spaceId || undefined,
      })
    }
  }
  const priority = { anniversary: 0, care: 1, preference: 2 } as Record<string, number>
  return { drafts: drafts.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9)).slice(0, MAX_WEEKLY_INSIGHTS), digest }
}

insightsRouter.get('/', async (req, res) => {
  try {
    const scope = await resolveScope(req.userId!, req.query.spaceId)
    if (!scope) return res.status(403).json({ code: 403, msg: '无权查看该空间的小贴士' })
    const activeRows = await query<StoredInsight>(
      `SELECT ${INSIGHT_FIELDS} FROM t_insight
        WHERE user_id = $1 AND action_payload->>'scopeKey' = $2 AND dismissed_at IS NULL
        ORDER BY created_at DESC LIMIT 30`,
      [req.userId, scope.key],
    )
    const expiredCommitments = await query<{ title: string }>(
      `SELECT DISTINCT e.title
         FROM t_entry e
        WHERE e.deleted = FALSE
          AND COALESCE(e.entry_kind, 'normal') = 'commitment'
          AND e.event_date < (now() AT TIME ZONE 'Asia/Shanghai')::date
          AND COALESCE(e.recurring, FALSE) = FALSE
          AND COALESCE(e.repeat_rule, 'none') = 'none'
          AND ${scope.spaceId
            ? `e.owner_type = 'space' AND e.space_id = $1`
            : `COALESCE(e.owner_type, 'personal') = 'personal' AND e.space_id IS NULL AND e.user_id = $1`}`,
      [scope.spaceId || req.userId],
    )
    const expiredTitles = expiredCommitments.map((item) => item.title.trim()).filter(Boolean)
    const hasExpiredReference = activeRows.some((item) => {
      const text = `${item.title} ${item.content}`
      return expiredTitles.some((title) => text.includes(title))
    })
    const weekly = await query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM t_insight WHERE user_id = $1 AND action_payload->>'scopeKey' = $2 AND created_at >= date_trunc('week', now())`, [req.userId, scope.key])
    const remaining = Math.max(0, MAX_WEEKLY_INSIGHTS - Number(weekly[0]?.total || 0))
    const today = shanghaiDateKey()
    const needsDailyRefresh = activeRows.length > 0 && activeRows.every((item) => shanghaiDateKey(item.createdAt) !== today)
    const hasExpiredAnniversary = activeRows.some((item) => {
      if (item.type !== 'anniversary') return false
      const validThrough = String(item.actionPayload?.validThrough || '')
      // 旧卡片没有有效期，强制重建一次；新卡片过了当天便自动退出。
      return !/^\d{4}-\d{2}-\d{2}$/.test(validThrough) || validThrough < today
    })
    const needsContentRefresh = needsDailyRefresh || hasExpiredReference || hasExpiredAnniversary
    let generated: Awaited<ReturnType<typeof buildDrafts>> | null = null
    if (needsContentRefresh) {
      // 相对日期文案不能跨天复用。这里原位更新仍在展示的卡片，不新增周额度，
      // 也不会让用户已经“不再显示”的卡片重新出现。
      generated = await buildDrafts(req.userId!, scope)
      const { drafts, digest } = generated
      for (const [index, row] of activeRows.entries()) {
        const draft = drafts[index]
        if (!draft) {
          await query(`UPDATE t_insight SET dismissed_at = now() WHERE id = $1 AND user_id = $2`, [row.id, req.userId])
          continue
        }
        const itemDigest = crypto.createHash('sha256').update(`${digest}:${index}:${draft.title}`).digest('hex')
        await query(
          `UPDATE t_insight SET insight_type = $1, title = $2, content = $3, action_type = $4,
             action_payload = $5::jsonb, source_digest = $6, created_at = now()
           WHERE id = $7 AND user_id = $8`,
          [draft.type, draft.title, draft.content, draft.actionType, JSON.stringify(insightPayload(scope, draft)), itemDigest, row.id, req.userId],
        )
      }
    }
    if (activeRows.length < MAX_WEEKLY_INSIGHTS && remaining > 0) {
      generated ||= await buildDrafts(req.userId!, scope)
      const { drafts, digest } = generated
      const occupiedTitles = new Set(needsContentRefresh
        ? drafts.slice(0, activeRows.length).map((draft) => draft.title)
        : activeRows.map((row) => row.title))
      const candidates = drafts.filter((draft) => !occupiedTitles.has(draft.title)).slice(0, remaining)
      for (const [index, draft] of candidates.entries()) {
        const itemDigest = crypto.createHash('sha256').update(`${digest}:${index}:${draft.title}`).digest('hex')
        await query(
          `INSERT INTO t_insight (user_id, insight_type, title, content, action_type, action_payload, source_digest)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT (user_id, source_digest) DO NOTHING`,
          [req.userId, draft.type, draft.title, draft.content, draft.actionType, JSON.stringify(insightPayload(scope, draft)), itemDigest],
        )
      }
    }
    const rows = await query(`SELECT ${INSIGHT_FIELDS} FROM t_insight WHERE user_id = $1 AND action_payload->>'scopeKey' = $2 AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 30`, [req.userId, scope.key])
    return res.json({ code: 0, data: rows })
  } catch (error) {
    console.error('[insights/list]', error)
    return res.status(500).json({ code: 500, msg: '洞察生成失败' })
  }
})

insightsRouter.post('/:id/dismiss', async (req, res) => {
  const id = String(req.params.id || '')
  if (!/^\d+$/.test(id)) return res.status(400).json({ code: 400, msg: 'invalid id' })
  await query(`UPDATE t_insight SET dismissed_at = now() WHERE id = $1 AND user_id = $2`, [id, req.userId])
  return res.json({ code: 0, data: { ok: true } })
})
