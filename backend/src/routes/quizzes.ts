import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { query, queryOne } from '../db.js'

export const quizzesRouter = Router()
quizzesRouter.use(requireAuth)

type QuizQuestion = {
  id: string
  text: string
  options: string[]
}

type QuizRow = {
  id: string
  spaceId: string
  createdBy: string
  targetUserId: string | null
  questions: unknown
  answers: unknown
  score: number | null
  summary: string
  status: string
}

/** 每个参与者一份答案：{ [userId]: { [questionId]: option } } */
type AnswerSheets = Record<string, Record<string, string>>

const DEFAULT_QUESTIONS: QuizQuestion[] = [
  {
    id: 'happy-day',
    text: '你觉得我们最快乐的一天是？',
    options: ['一起出门的那天', '认真聊天的晚上', '完成一个约定的时候'],
  },
  {
    id: 'weekend',
    text: '如果周末只有一天空闲，我们最可能去哪？',
    options: ['咖啡店', '公园散步', '在家休息'],
  },
  {
    id: 'keyword',
    text: '我们最近最常提到的词是什么？',
    options: ['雨天', '咖啡', '旅行'],
  },
]

function uniqueOptions(values: unknown[], fallback: string[]) {
  const options = [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]
  for (const item of fallback) if (!options.includes(item)) options.push(item)
  return options.slice(0, 3)
}

/** 新场次从圈子共同资产取题材；只读取 visibility=space 的内容，不碰成员私人记录。 */
async function questionsForSpace(spaceId: string): Promise<QuizQuestion[]> {
  const space = await queryOne<{ keywords: unknown }>(`SELECT keywords FROM t_space WHERE id = $1`, [spaceId])
  const rows = await query<{ title: string; location: string; entryKind: string }>(
    `SELECT title, location, entry_kind AS "entryKind" FROM t_entry
      WHERE space_id = $1 AND visibility = 'space' AND deleted = FALSE
      ORDER BY COALESCE(event_at, created_at) DESC LIMIT 30`,
    [spaceId],
  )
  const rawKeywords = Array.isArray(space?.keywords) ? space.keywords : []
  const interests = uniqueOptions(rawKeywords, ['散步', '一起吃饭', '旅行'])
  const places = uniqueOptions(rows.map((item) => item.location), ['熟悉的街区', '公园', '家里'])
  const plans = uniqueOptions(
    rows.filter((item) => item.entryKind === 'commitment').map((item) => item.title),
    ['一起出门走走', '认真聊聊天', '在家休息'],
  )
  return [
    { id: 'shared-interest', text: '哪件事最像我们最近共同在乎的？', options: interests },
    { id: 'shared-place', text: '如果现在一起出门，我们更可能选哪里？', options: places },
    { id: 'shared-plan', text: '下一件最想一起完成的事是？', options: plans },
  ]
}

function normalizeQuestions(input: unknown): QuizQuestion[] {
  if (!Array.isArray(input)) return DEFAULT_QUESTIONS
  const result = input.map((item: any) => ({
    id: String(item?.id || ''),
    text: String(item?.text || ''),
    options: Array.isArray(item?.options) ? item.options.map((option: unknown) => String(option)) : [],
  })).filter((item) => item.id && item.text && item.options.length)
  return result.length ? result : DEFAULT_QUESTIONS
}

/** 单人答卷：只保留题库内的题目与合法选项，避免写入任意键值。 */
function normalizeSheet(input: unknown, questions: QuizQuestion[]): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const source = input as Record<string, unknown>
  const output: Record<string, string> = {}
  for (const question of questions) {
    const picked = String(source[question.id] ?? '')
    if (picked && question.options.includes(picked)) output[question.id] = picked
  }
  return output
}

/** 历史/异常数据兜底：非嵌套结构一律视为空，重新按参与者收集。 */
function normalizeSheets(input: unknown): AnswerSheets {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const output: AnswerSheets = {}
  for (const [userId, sheet] of Object.entries(input as Record<string, unknown>)) {
    if (!/^\d+$/.test(userId)) continue
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) continue
    const entries: Record<string, string> = {}
    for (const [questionId, option] of Object.entries(sheet as Record<string, unknown>)) {
      entries[String(questionId)] = String(option || '')
    }
    output[userId] = entries
  }
  return output
}

function summaryForScore(score: number) {
  if (score >= 90) return '你们的答案几乎一致，日常偏好已经很有默契。'
  if (score >= 60) return '你们在多数问题上想法一致，还有一点小差异。'
  if (score > 0) return '你们的答案差别不小，正好可以聊聊各自的想法。'
  return '这一轮答案完全不同，可以互相说说为什么这样选。'
}

/** 真实默契度：双方对同一题选择相同选项的比例。 */
function scoreSheets(
  questions: QuizQuestion[],
  mine: Record<string, string>,
  theirs: Record<string, string>,
) {
  const total = questions.length
  if (!total) return 0
  const matched = questions.filter(
    (question) => !!mine[question.id] && mine[question.id] === theirs[question.id],
  ).length
  return Math.round((matched / total) * 100)
}

/** 圈内已作答成员两两比对，取平均默契度。 */
function scoreGroup(questions: QuizQuestion[], sheets: AnswerSheets, userIds: string[]) {
  const ready = userIds.filter((userId) => isSheetComplete(questions, sheets[userId] || {}))
  if (ready.length < 2) return 0
  let total = 0
  let pairs = 0
  for (let i = 0; i < ready.length; i += 1) {
    for (let j = i + 1; j < ready.length; j += 1) {
      total += scoreSheets(questions, sheets[ready[i]] || {}, sheets[ready[j]] || {})
      pairs += 1
    }
  }
  return pairs ? Math.round(total / pairs) : 0
}

function isSheetComplete(questions: QuizQuestion[], sheet: Record<string, string>) {
  return questions.every((question) => !!sheet[question.id])
}

/** 唯一投影：三处（读取/创建/结算）共用，避免字段列表各自漂移。 */
const QUIZ_SELECT = `
  id::text, space_id::text AS "spaceId", created_by::text AS "createdBy",
  target_user_id::text AS "targetUserId",
  questions, answers, score, summary, status
`

async function spaceMemberIds(spaceId: string) {
  const rows = await query<{ userId: string }>(
    `SELECT user_id::text AS "userId" FROM t_space_member WHERE space_id = $1`,
    [spaceId],
  )
  return rows.map((row) => row.userId)
}

/** 一个时光圈同时只进行一场测试，圈里的人共用这一份题。 */
async function findQuizForSpace(spaceId: string, openOnly: boolean) {
  return queryOne<QuizRow>(
    `SELECT ${QUIZ_SELECT} FROM t_quiz
      WHERE space_id = $1
        ${openOnly ? `AND status <> 'completed'` : ''}
      ORDER BY (status <> 'completed') DESC, id DESC
      LIMIT 1`,
    [spaceId],
  )
}

async function ensureSpaceMember(spaceId: string, userId: number) {
  if (!/^\d+$/.test(spaceId)) return false
  const member = await queryOne<{ id: string }>(
    `SELECT id::text FROM t_space_member WHERE space_id = $1 AND user_id = $2`,
    [spaceId, userId],
  )
  return !!member
}

async function validateSpace(req: any, spaceId: string) {
  if (!await ensureSpaceMember(spaceId, req.userId!)) {
    return { status: 403, msg: '无权在该时光圈发起默契测试' }
  }
  const memberIds = await spaceMemberIds(spaceId)
  if (memberIds.length < 2) {
    return { status: 400, msg: '这个时光圈还只有你一个人，先邀请对方加入再来测默契。' }
  }
  return null
}

/** 未完成时不返回任何分数，避免前端把中间态当成结果展示。 */
async function presentQuiz(row: QuizRow) {
  const questions = normalizeQuestions(row.questions)
  const sheets = normalizeSheets(row.answers)
  const memberIds = await spaceMemberIds(String(row.spaceId))
  const answeredBy = Object.keys(sheets).filter((userId) => isSheetComplete(questions, sheets[userId] || {}))
  const base = {
    id: String(row.id),
    spaceId: String(row.spaceId),
    createdBy: String(row.createdBy),
    questions,
    status: row.status === 'completed' ? 'completed' : 'answering',
    answeredBy,
    memberCount: memberIds.length,
    answeredCount: answeredBy.length,
  }
  if (row.status !== 'completed' || row.score == null) return base
  return {
    ...base,
    result: {
      id: String(row.id),
      spaceId: String(row.spaceId),
      score: Number(row.score),
      summary: row.summary || summaryForScore(Number(row.score)),
    },
  }
}

/**
 * GET /api/quizzes/current?spaceId=
 * 进入页面先读这个圈子当前这一场：进行中的直接接着答，
 * 刚结算完的把结果读回来。
 */
quizzesRouter.get('/current', async (req, res) => {
  try {
    const spaceId = String(req.query?.spaceId || '').trim()
    const invalid = await validateSpace(req, spaceId)
    if (invalid) return res.status(invalid.status).json({ code: invalid.status, msg: invalid.msg })
    const row = await findQuizForSpace(spaceId, false)
    return res.json({ code: 0, data: { quiz: row ? await presentQuiz(row) : null } })
  } catch (error: any) {
    console.error('[quizzes/current]', error)
    return res.status(500).json({ code: 500, msg: 'failed' })
  }
})

/**
 * 发起测试。必须是「取已有的未完成场次，没有才新建」：
 * 圈里每个人进入页面时都会走到这里，如果无条件 INSERT，
 * 就会各答一份互不相干的答卷，永远算不出默契度。
 */
quizzesRouter.post('/', async (req, res) => {
  try {
    const spaceId = String(req.body?.spaceId || '').trim()
    const invalid = await validateSpace(req, spaceId)
    if (invalid) return res.status(invalid.status).json({ code: invalid.status, msg: invalid.msg })

    const existing = await findQuizForSpace(spaceId, true)
    if (existing) return res.json({ code: 0, data: await presentQuiz(existing) })

    const questions = await questionsForSpace(spaceId)
    const created = await queryOne<QuizRow>(
      `INSERT INTO t_quiz (space_id, created_by, questions)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (space_id) WHERE status <> 'completed' DO NOTHING
       RETURNING ${QUIZ_SELECT}`,
      [spaceId, req.userId, JSON.stringify(questions)],
    )
    const row = created || await findQuizForSpace(spaceId, true)
    if (!row) return res.status(500).json({ code: 500, msg: '创建失败' })
    return res.json({ code: 0, data: await presentQuiz(row) })
  } catch (error: any) {
    console.error('[quizzes/create]', error)
    return res.status(500).json({ code: 500, msg: 'failed' })
  }
})

/** 提交「我」这一份答案；圈里的人都答完后才结算默契度。 */
quizzesRouter.post('/:id/finish', async (req, res) => {
  try {
    const id = String(req.params.id || '')
    if (!/^\d+$/.test(id)) return res.status(400).json({ code: 400, msg: 'invalid id' })
    const existing = await queryOne<QuizRow>(
      `SELECT ${QUIZ_SELECT} FROM t_quiz
        WHERE id = $1
          AND space_id IN (SELECT space_id FROM t_space_member WHERE user_id = $2)`,
      [id, req.userId],
    )
    if (!existing) return res.status(404).json({ code: 404, msg: '默契测试不存在' })

    const me = String(req.userId)
    if (existing.status === 'completed') {
      return res.status(409).json({ code: 409, msg: '这次默契测试已经完成，不能重复提交' })
    }

    const questions = normalizeQuestions(existing.questions)
    const sheets = normalizeSheets(existing.answers)
    if (isSheetComplete(questions, sheets[me] || {})) {
      return res.status(409).json({ code: 409, msg: '你已经提交过答案，等其他人作答即可' })
    }
    const mySheet = normalizeSheet(req.body?.answers, questions)
    if (!isSheetComplete(questions, mySheet)) {
      return res.status(400).json({ code: 400, msg: '请把所有问题都作答后再提交' })
    }
    const merged = await queryOne<QuizRow>(
      `UPDATE t_quiz
          SET answers = COALESCE(answers, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb),
              updated_at = now()
        WHERE id = $1
          AND status <> 'completed'
        RETURNING ${QUIZ_SELECT}`,
      [id, me, JSON.stringify(mySheet)],
    )
    if (!merged) return res.status(409).json({ code: 409, msg: '这次默契测试已经完成，不能重复提交' })

    const mergedSheets = normalizeSheets(merged.answers)
    const memberIds = await spaceMemberIds(String(merged.spaceId))
    const allAnswered = memberIds.length >= 2 && memberIds.every((userId) => isSheetComplete(questions, mergedSheets[userId] || {}))
    if (!allAnswered) return res.json({ code: 0, data: await presentQuiz(merged) })

    const score = scoreGroup(questions, mergedSheets, memberIds)
    const row = await queryOne<QuizRow>(
      `UPDATE t_quiz
          SET score = $2,
              summary = $3,
              status = 'completed',
              updated_at = now()
        WHERE id = $1
          AND status <> 'completed'
        RETURNING ${QUIZ_SELECT}`,
      [id, score, summaryForScore(score)],
    )
    if (!row) {
      const settled = await queryOne<QuizRow>(
        `SELECT ${QUIZ_SELECT} FROM t_quiz WHERE id = $1`,
        [id],
      )
      return res.json({ code: 0, data: await presentQuiz(settled || merged) })
    }
    return res.json({ code: 0, data: await presentQuiz(row) })
  } catch (error: any) {
    console.error('[quizzes/finish]', error)
    return res.status(500).json({ code: 500, msg: 'failed' })
  }
})
