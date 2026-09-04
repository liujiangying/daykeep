import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { getPool, query, queryOne } from '../db.js'
import { dailyQuestionForDate } from '../lib/dailyQuestionBank.js'

export const dailyQuestionsRouter = Router()
dailyQuestionsRouter.use(requireAuth)

function shanghaiDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
  const date = new Date(Date.UTC(get('year'), get('month') - 1, get('day') + offsetDays))
  return date.toISOString().slice(0, 10)
}

async function resolveScope(userId: string | number, spaceIdInput: unknown) {
  const spaceId = String(spaceIdInput || '').trim()
  if (!spaceId) return { scopeKey: `personal:${userId}`, spaceId: null, canCustomize: true, isPublic: false }
  if (!/^\d+$/.test(spaceId)) return null
  const member = await queryOne<{ role: string; accessType: string }>(
    `SELECT m.role, s.access_type AS "accessType"
       FROM t_space_member m JOIN t_space s ON s.id = m.space_id AND s.dissolved_at IS NULL
      WHERE m.space_id = $1 AND m.user_id = $2`,
    [spaceId, userId],
  )
  return member ? { scopeKey: `space:${spaceId}`, spaceId, canCustomize: member.role === 'owner', isPublic: member.accessType === 'public' } : null
}

dailyQuestionsRouter.get('/today', async (req, res) => {
  try {
    const scope = await resolveScope(req.userId!, req.query.spaceId)
    if (!scope) return res.status(403).json({ code: 403, msg: '无权查看该时光圈' })
    const today = shanghaiDate()
    const yesterday = shanghaiDate(-1)
    const customs = await query<{ questionDate: string; question: string }>(
      `SELECT question_date::text AS "questionDate", question FROM t_daily_custom_question WHERE scope_key = $1 AND question_date IN ($2::date,$3::date)`,
      [scope.scopeKey, today, yesterday],
    )
    const customByDate = new Map(customs.map((item) => [item.questionDate, item.question]))
    const currentSystem = dailyQuestionForDate(today)
    const previousSystem = dailyQuestionForDate(yesterday)
    const current = { key: customByDate.has(today) ? `custom-${today}` : currentSystem.key, text: customByDate.get(today) || currentSystem.text }
    const previous = { key: customByDate.has(yesterday) ? `custom-${yesterday}` : previousSystem.key, text: customByDate.get(yesterday) || previousSystem.text }
    const mine = await queryOne<{ answer: string; entryId: string | null }>(
      `SELECT answer, entry_id::text AS "entryId" FROM t_daily_answer WHERE question_date = $1::date AND scope_key = $2 AND user_id = $3`,
      [today, scope.scopeKey, req.userId],
    )
    const revealed = await query<{ userId: string; nickname: string; avatarUrl: string; answer: string }>(
      `SELECT a.user_id::text AS "userId", u.nickname, u.avatar_url AS "avatarUrl", a.answer
         FROM t_daily_answer a JOIN t_user u ON u.id = a.user_id
        WHERE a.question_date = $1::date AND a.scope_key = $2
        ORDER BY a.created_at ASC
        LIMIT 100`,
      [yesterday, scope.scopeKey],
    )
    return res.json({ code: 0, data: {
      date: today, questionKey: current.key, question: current.text, answered: !!mine, myAnswer: mine?.answer || '', canCustomize: scope.canCustomize,
      isPersonal: !scope.spaceId,
      isPublic: scope.isPublic,
      savedAsEntry: !!mine?.entryId,
      yesterday: { date: yesterday, question: previous.text, answers: revealed },
    } })
  } catch (error) {
    console.error('[daily-question/today]', error)
    return res.status(500).json({ code: 500, msg: '每日一问加载失败' })
  }
})

dailyQuestionsRouter.put('/today/answer', async (req, res) => {
  try {
    const scope = await resolveScope(req.userId!, req.body?.spaceId)
    if (!scope) return res.status(403).json({ code: 403, msg: '无权回答该时光圈的问题' })
    const answer = String(req.body?.answer || '').trim().slice(0, 2000)
    if (!answer) return res.status(400).json({ code: 400, msg: '先写下你的答案' })
    const date = shanghaiDate()
    const custom = await queryOne<{ question: string }>(`SELECT question FROM t_daily_custom_question WHERE question_date = $1::date AND scope_key = $2`, [date, scope.scopeKey])
    const system = dailyQuestionForDate(date)
    const question = custom ? { key: `custom-${date}`, text: custom.question } : system
    if (scope.spaceId) {
      const row = await queryOne<{ answer: string; updatedAt: string }>(
        `INSERT INTO t_daily_answer (question_date, question_key, scope_key, space_id, user_id, answer)
         VALUES ($1::date, $2, $3, $4::bigint, $5, $6)
         ON CONFLICT (question_date, scope_key, user_id)
         DO UPDATE SET answer = EXCLUDED.answer, question_key = EXCLUDED.question_key, updated_at = now()
         RETURNING answer, updated_at AS "updatedAt"`,
        [date, question.key, scope.scopeKey, scope.spaceId, req.userId, answer],
      )
      return res.json({ code: 0, data: { ...row, entryId: null, savedAsEntry: false } })
    }

    // 个人空间的“今日灵感”不是另一份孤立数据：保存即生成一条仅自己可见的
    // 当日随手记；再次修改会更新同一条记录。答案与记录放在同一事务，避免半成功。
    const client = await getPool().connect()
    try {
      await client.query('BEGIN')
      const clientRequestId = `daily-question:${date}`
      const title = `今日灵感｜${question.text}`.slice(0, 128)
      const entryResult = await client.query<{ id: string }>(
        `INSERT INTO t_entry (
           user_id, type, title, body, event_date, event_at, calendar, recurring, repeat_rule,
           pinned, show_in_timeline, remind_enabled, color, images, background_url, location,
           client_request_id, owner_type, visibility, entry_kind, tags
         ) VALUES (
           $1, 'diary', $2, $3, $4::date, now(), 'solar', FALSE, 'none',
           FALSE, FALSE, FALSE, '', '[]', '', '', $5, 'personal', 'private', 'normal', '["今日灵感"]'::jsonb
         )
         ON CONFLICT (user_id, client_request_id)
           WHERE client_request_id IS NOT NULL AND btrim(client_request_id) <> ''
         DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, event_date = EXCLUDED.event_date,
                       event_at = now(), deleted = FALSE, updated_at = now()
         RETURNING id::text AS id`,
        [req.userId, title, answer, date, clientRequestId],
      )
      const entryId = entryResult.rows[0].id
      const answerResult = await client.query<{ answer: string; updatedAt: string }>(
        `INSERT INTO t_daily_answer (question_date, question_key, scope_key, space_id, user_id, entry_id, answer)
         VALUES ($1::date, $2, $3, NULL, $4, $5::bigint, $6)
         ON CONFLICT (question_date, scope_key, user_id)
         DO UPDATE SET answer = EXCLUDED.answer, question_key = EXCLUDED.question_key,
                       entry_id = EXCLUDED.entry_id, updated_at = now()
         RETURNING answer, updated_at AS "updatedAt"`,
        [date, question.key, scope.scopeKey, req.userId, entryId, answer],
      )
      await client.query('COMMIT')
      return res.json({ code: 0, data: { ...answerResult.rows[0], entryId, savedAsEntry: true } })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('[daily-question/answer]', error)
    return res.status(500).json({ code: 500, msg: '答案保存失败' })
  }
})

dailyQuestionsRouter.put('/today/question', async (req, res) => {
  try {
    const scope = await resolveScope(req.userId!, req.body?.spaceId)
    if (!scope) return res.status(403).json({ code: 403, msg: '无权修改该时光圈的问题' })
    if (!scope.canCustomize) return res.status(403).json({ code: 403, msg: '只有时光圈创建者可以自定义问题' })
    const question = String(req.body?.question || '').trim().slice(0, 240)
    if (question.length < 4) return res.status(400).json({ code: 400, msg: '问题至少写 4 个字' })
    const date = shanghaiDate()
    const answered = await queryOne(`SELECT 1 AS ok FROM t_daily_answer WHERE question_date = $1::date AND scope_key = $2 LIMIT 1`, [date, scope.scopeKey])
    if (answered) return res.status(409).json({ code: 409, msg: '今天已经有人作答，不能再更换问题' })
    await query(
      `INSERT INTO t_daily_custom_question (question_date, scope_key, space_id, created_by, question)
       VALUES ($1::date,$2,$3::bigint,$4,$5)
       ON CONFLICT (question_date, scope_key) DO UPDATE SET question = EXCLUDED.question, created_by = EXCLUDED.created_by`,
      [date, scope.scopeKey, scope.spaceId, req.userId, question],
    )
    return res.json({ code: 0, data: { date, questionKey: `custom-${date}`, question } })
  } catch (error) {
    console.error('[daily-question/customize]', error)
    return res.status(500).json({ code: 500, msg: '问题保存失败' })
  }
})
