import { query, queryOne } from './db.js'
import { daysUntil, normalizeRepeatRule, type RepeatRule } from './lib/countdown.js'
import {
  sendScheduleSubscribeMessage,
  WeChatSubscribeError,
} from './wechatSubscribe.js'
import { notifyOperationalAlert } from './alerts.js'
import { purgeExpiredSpaces } from './spaceLifecycle.js'

type ReminderRow = {
  id: string
  openid: string
  type: 'anniversary' | 'todo'
  title: string
  body: string
  eventDate: string
  calendar: 'solar' | 'lunar'
  recurring: boolean
  repeatRule: RepeatRule
  remindAheadDays: number
  remindTimeMinutes: number
}

type CollaboratorReminderRow = ReminderRow & { collaboratorId: string }

const PERMANENT_ERROR_CODES = new Set([
  40003, // openid 不正确
  40037, // template_id 不正确
  41030, // page 路径不正确
  43101, // 用户未订阅/订阅次数已用完
  47003, // 模板参数不准确
])

let running = false
let timer: NodeJS.Timeout | null = null

const schedulerState = {
  enabled: true,
  started: false,
  startedAt: 0,
  lastScanStartedAt: 0,
  lastScanCompletedAt: 0,
  lastScanOk: false,
  scanCount: 0,
  scanErrorCount: 0,
  itemErrorCount: 0,
  lastError: '',
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'unknown error')
}

function recordItemError(scope: string, error: unknown) {
  schedulerState.itemErrorCount += 1
  schedulerState.lastError = `${scope}: ${errorText(error)}`
  void notifyOperationalAlert('reminder-item-error', '提醒条目处理异常', schedulerState.lastError)
}

export function getReminderSchedulerHealth(now = Date.now()) {
  const stale = schedulerState.enabled && schedulerState.started && (
    !schedulerState.lastScanCompletedAt || now - schedulerState.lastScanCompletedAt > 3 * 60_000
  )
  return {
    ...schedulerState,
    running,
    stale,
    healthy: !schedulerState.enabled || (
      schedulerState.started && schedulerState.lastScanOk && !stale
    ),
  }
}

/** 用中国时区判断日期和时分，避免容器所在时区改变提醒时刻。 */
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

function ymd(date: Date) {
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function addDays(date: Date, count: number) {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  value.setDate(value.getDate() + count)
  return value
}

function reminderText(days: number) {
  if (days <= 0) return '今天到期，请及时查看'
  return `还有${days}天，请提前做好安排`
}

/** 提醒「日」是否整日已过（当天内仍允许重试到点后发送）。 */
function isRemindDayFullyPast(row: ReminderRow, today: Date) {
  const remaining = daysUntil(row.eventDate, normalizeRepeatRule(row), today, row.calendar)
  if (remaining < 0) return true
  const scheduledDay = addDays(today, remaining - Number(row.remindAheadDays || 0))
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const scheduledStart = new Date(
    scheduledDay.getFullYear(),
    scheduledDay.getMonth(),
    scheduledDay.getDate(),
  )
  return scheduledStart.getTime() < dayStart.getTime()
}

async function reconcileStuckReminders(today: Date) {
  // 发送中卡住：每轮扫描都回收，避免只在进程启动时恢复一次
  await query(
    `UPDATE t_entry
        SET wx_subscribe_status = CASE
              WHEN wx_subscribe_attempts >= 3 THEN 'failed'
              ELSE 'authorized'
            END,
            remind_enabled = CASE
              WHEN wx_subscribe_attempts >= 3 THEN FALSE
              ELSE remind_enabled
            END,
            wx_subscribe_error = CASE
              WHEN wx_subscribe_attempts >= 3
                AND btrim(COALESCE(wx_subscribe_error, '')) = ''
              THEN '多次发送失败，请重新开启微信提醒'
              ELSE wx_subscribe_error
            END,
            updated_at = now()
      WHERE deleted = FALSE
        AND wx_subscribe_status = 'sending'
        AND (
          wx_subscribe_last_attempt_at IS NULL
          OR wx_subscribe_last_attempt_at < now() - interval '15 minutes'
        )`,
  )

  // attempts 打满却仍挂 authorized/sending：收口为失败，避免永远「待提醒」
  await query(
    `UPDATE t_entry
        SET wx_subscribe_status = 'failed',
            remind_enabled = FALSE,
            wx_subscribe_error = CASE
              WHEN btrim(COALESCE(wx_subscribe_error, '')) = '' THEN '多次发送失败，请重新开启微信提醒'
              ELSE wx_subscribe_error
            END,
            updated_at = now()
      WHERE deleted = FALSE
        AND type IN ('anniversary', 'todo')
        AND remind_enabled = TRUE
        AND wx_subscribe_status IN ('authorized', 'sending')
        AND wx_subscribe_attempts >= 3`,
  )

  // 成员提醒拥有独立状态，也要和创建者提醒一样回收中断的 sending、收口重试上限。
  await query(
    `UPDATE t_entry_collaborator
        SET wx_subscribe_status = CASE
              WHEN wx_subscribe_attempts >= 3 THEN 'failed'
              ELSE 'authorized'
            END,
            remind_enabled = CASE
              WHEN wx_subscribe_attempts >= 3 THEN FALSE
              ELSE remind_enabled
            END,
            wx_subscribe_accepted = CASE
              WHEN wx_subscribe_attempts >= 3 THEN FALSE
              ELSE wx_subscribe_accepted
            END,
            wx_subscribe_error = CASE
              WHEN wx_subscribe_attempts >= 3
                AND btrim(COALESCE(wx_subscribe_error, '')) = ''
              THEN '多次发送失败，请重新开启微信提醒'
              ELSE wx_subscribe_error
            END
      WHERE wx_subscribe_status = 'sending'
        AND (
          wx_subscribe_last_attempt_at IS NULL
          OR wx_subscribe_last_attempt_at < now() - interval '15 minutes'
        )`,
  )
  await query(
    `UPDATE t_entry_collaborator
        SET wx_subscribe_status = 'failed',
            remind_enabled = FALSE,
            wx_subscribe_accepted = FALSE,
            wx_subscribe_error = CASE
              WHEN btrim(COALESCE(wx_subscribe_error, '')) = '' THEN '多次发送失败，请重新开启微信提醒'
              ELSE wx_subscribe_error
            END
      WHERE remind_enabled = TRUE
        AND wx_subscribe_status IN ('authorized', 'sending')
        AND wx_subscribe_attempts >= 3`,
  )

  // 曾在提醒日尝试过、但发送日已过仍未发出（覆盖 yearly 滚到下一年的情况）
  await query(
    `UPDATE t_entry
        SET wx_subscribe_status = 'failed',
            remind_enabled = FALSE,
            wx_subscribe_error = CASE
              WHEN btrim(COALESCE(wx_subscribe_error, '')) = ''
              THEN '约定提醒时间已过，未能送达，请调整后重新开启'
              ELSE wx_subscribe_error
            END,
            updated_at = now()
      WHERE deleted = FALSE
        AND type IN ('anniversary', 'todo')
        AND remind_enabled = TRUE
        AND wx_subscribe_status IN ('authorized', 'sending')
        AND wx_subscribe_sent_at IS NULL
        AND wx_subscribe_last_attempt_at IS NOT NULL
        AND (wx_subscribe_last_attempt_at AT TIME ZONE 'Asia/Shanghai')::date
            < (now() AT TIME ZONE 'Asia/Shanghai')::date`,
  )

  const stuck = await query<ReminderRow>(
    `SELECT e.id,
            u.openid,
            e.type,
            e.title,
            e.body,
            to_char(e.event_date, 'YYYY-MM-DD') AS "eventDate",
            e.calendar,
            e.recurring,
            COALESCE(e.repeat_rule, 'none') AS "repeatRule",
            e.remind_ahead_days AS "remindAheadDays",
            COALESCE(e.remind_time_minutes, 600) AS "remindTimeMinutes"
       FROM t_entry e
       JOIN t_user u ON u.id = e.user_id
      WHERE e.deleted = FALSE
        AND e.type IN ('anniversary', 'todo')
        AND e.remind_enabled = TRUE
        AND e.wx_subscribe_status IN ('authorized', 'sending')
      ORDER BY e.event_date ASC
      LIMIT 500`,
  )
  for (const row of stuck) {
    if (!isRemindDayFullyPast(row, today)) continue
    await query(
      `UPDATE t_entry
          SET wx_subscribe_status = 'failed',
              remind_enabled = FALSE,
              wx_subscribe_error = CASE
                WHEN btrim(COALESCE(wx_subscribe_error, '')) = '' THEN '约定提醒时间已过，未能送达，请调整后重新开启'
                ELSE wx_subscribe_error
              END,
              updated_at = now()
        WHERE id = $1
          AND wx_subscribe_status IN ('authorized', 'sending')
          AND remind_enabled = TRUE`,
      [row.id],
    )
    console.warn(`[reminder] marked missed entry=${row.id}`)
  }

  const stuckCollaborators = await query<CollaboratorReminderRow>(
    `SELECT e.id,
            c.id::text AS "collaboratorId",
            u.openid,
            e.type,
            e.title,
            e.body,
            to_char(e.event_date, 'YYYY-MM-DD') AS "eventDate",
            e.calendar,
            e.recurring,
            COALESCE(e.repeat_rule, 'none') AS "repeatRule",
            c.remind_ahead_days AS "remindAheadDays",
            COALESCE(c.remind_time_minutes, 600) AS "remindTimeMinutes"
       FROM t_entry_collaborator c
       JOIN t_entry e ON e.id = c.entry_id AND e.deleted = FALSE
       JOIN t_user u ON u.id = c.user_id
      WHERE c.role = 'partner'
        AND e.type IN ('anniversary', 'todo')
        AND c.remind_enabled = TRUE
        AND c.wx_subscribe_status IN ('authorized', 'sending')
      ORDER BY e.event_date ASC
      LIMIT 500`,
  )
  for (const row of stuckCollaborators) {
    if (!isRemindDayFullyPast(row, today)) continue
    await query(
      `UPDATE t_entry_collaborator
          SET wx_subscribe_status = 'failed',
              remind_enabled = FALSE,
              wx_subscribe_accepted = FALSE,
              wx_subscribe_error = CASE
                WHEN btrim(COALESCE(wx_subscribe_error, '')) = '' THEN '约定提醒时间已过，未能送达，请调整后重新开启'
                ELSE wx_subscribe_error
              END
        WHERE id = $1
          AND wx_subscribe_status IN ('authorized', 'sending')
          AND remind_enabled = TRUE`,
      [row.collaboratorId],
    )
    console.warn(`[reminder] marked missed collaborator=${row.collaboratorId} entry=${row.id}`)
  }
}

async function processReminder(row: ReminderRow, today: Date) {
  const rule = normalizeRepeatRule(row)
  const remaining = daysUntil(row.eventDate, rule, today, row.calendar)

  if (remaining < 0) {
    await query(
      `UPDATE t_entry
          SET wx_subscribe_status = 'expired',
              remind_enabled = FALSE,
              wx_subscribe_error = 'event expired',
              updated_at = now()
        WHERE id = $1 AND wx_subscribe_status IN ('authorized', 'sending')`,
      [row.id],
    )
    return
  }

  // 若用户在原定提前日期之后才授权，则立即补发，不让本次授权白白过期。
  if (remaining > Number(row.remindAheadDays || 0)) return

  const claimed = await queryOne<{ attempts: number }>(
    `UPDATE t_entry
        SET wx_subscribe_status = 'sending',
            wx_subscribe_attempts = wx_subscribe_attempts + 1,
            wx_subscribe_last_attempt_at = now(),
            updated_at = now()
      WHERE id = $1
        AND wx_subscribe_status = 'authorized'
        AND remind_enabled = TRUE
      RETURNING wx_subscribe_attempts AS attempts`,
    [row.id],
  )
  if (!claimed) return

  try {
    const targetDate = ymd(addDays(today, remaining))
    await sendScheduleSubscribeMessage({
      openid: row.openid,
      entryId: row.id,
      title: row.title,
      eventDate: targetDate,
      daysRemaining: remaining,
      reminderText: reminderText(remaining),
    })
    await query(
      `UPDATE t_entry
          SET wx_subscribe_status = 'sent',
              wx_subscribe_sent_at = now(),
              wx_subscribe_error = '',
              remind_enabled = FALSE,
              updated_at = now()
        WHERE id = $1 AND wx_subscribe_status = 'sending'`,
      [row.id],
    )
    console.log(`[reminder] sent entry=${row.id}`)
  } catch (error) {
    const code = error instanceof WeChatSubscribeError ? error.code : 0
    const permanent = PERMANENT_ERROR_CODES.has(code) || claimed.attempts >= 3
    const message = error instanceof Error ? error.message.slice(0, 500) : 'send failed'
    // 先打日志，避免后续写库失败时丢掉微信原始错误
    console.warn(
      `[reminder] send failed entry=${row.id} code=${code || 'network'} msg=${message} attempts=${claimed.attempts}`,
    )
    try {
      await query(
        `UPDATE t_entry
            SET wx_subscribe_status = $2::varchar,
                remind_enabled = CASE WHEN $2::varchar = 'failed' THEN FALSE ELSE remind_enabled END,
                wx_subscribe_error = $3::text,
                updated_at = now()
          WHERE id = $1 AND wx_subscribe_status = 'sending'`,
        [row.id, permanent ? 'failed' : 'authorized', message],
      )
    } catch (dbError) {
      console.error(
        `[reminder] failed to persist send error entry=${row.id} code=${code || 'network'} msg=${message}`,
        dbError,
      )
    }
  }
}

async function processCollaboratorReminder(row: CollaboratorReminderRow, today: Date) {
  const remaining = daysUntil(row.eventDate, normalizeRepeatRule(row), today, row.calendar)
  if (remaining < 0) {
    await query(
      `UPDATE t_entry_collaborator
          SET wx_subscribe_status = 'expired', remind_enabled = FALSE,
              wx_subscribe_accepted = FALSE, wx_subscribe_error = 'event expired'
        WHERE id = $1 AND wx_subscribe_status IN ('authorized', 'sending')`,
      [row.collaboratorId],
    )
    return
  }
  if (remaining > Number(row.remindAheadDays || 0)) return

  const claimed = await queryOne<{ attempts: number }>(
    `UPDATE t_entry_collaborator
        SET wx_subscribe_status = 'sending',
            wx_subscribe_attempts = wx_subscribe_attempts + 1,
            wx_subscribe_last_attempt_at = now()
      WHERE id = $1 AND wx_subscribe_status = 'authorized' AND remind_enabled = TRUE
      RETURNING wx_subscribe_attempts AS attempts`,
    [row.collaboratorId],
  )
  if (!claimed) return

  try {
    await sendScheduleSubscribeMessage({
      openid: row.openid,
      entryId: row.id,
      title: row.title,
      eventDate: ymd(addDays(today, remaining)),
      daysRemaining: remaining,
      reminderText: reminderText(remaining),
    })
    await query(
      `UPDATE t_entry_collaborator
          SET wx_subscribe_status = 'sent', wx_subscribe_sent_at = now(),
              wx_subscribe_error = '', remind_enabled = FALSE,
              wx_subscribe_accepted = FALSE
        WHERE id = $1 AND wx_subscribe_status = 'sending'`,
      [row.collaboratorId],
    )
    console.log(`[reminder] sent collaborator=${row.collaboratorId} entry=${row.id}`)
  } catch (error) {
    const code = error instanceof WeChatSubscribeError ? error.code : 0
    const permanent = PERMANENT_ERROR_CODES.has(code) || claimed.attempts >= 3
    const message = error instanceof Error ? error.message.slice(0, 500) : 'send failed'
    await query(
      `UPDATE t_entry_collaborator
          SET wx_subscribe_status = $2::varchar,
              remind_enabled = CASE WHEN $2::varchar = 'failed' THEN FALSE ELSE remind_enabled END,
              wx_subscribe_accepted = CASE WHEN $2::varchar = 'failed' THEN FALSE ELSE wx_subscribe_accepted END,
              wx_subscribe_error = $3::text
        WHERE id = $1 AND wx_subscribe_status = 'sending'`,
      [row.collaboratorId, permanent ? 'failed' : 'authorized', message],
    )
    console.warn(`[reminder] collaborator send failed collaborator=${row.collaboratorId} code=${code || 'network'}`)
  }
}

type CapsuleRow = {
  id: string
  openid: string
  title: string
  /** pg 可能返回 string 或 Date */
  capsuleUnlockAt: string | Date
}

async function processCapsuleUnlock(row: CapsuleRow) {
  // Mark as sending
  const claimed = await queryOne<{ id: string }>(
    `UPDATE t_entry
        SET wx_subscribe_status = 'sending',
            wx_subscribe_attempts = wx_subscribe_attempts + 1,
            wx_subscribe_last_attempt_at = now(),
            updated_at = now()
      WHERE id = $1
        AND capsule_unlock_at IS NOT NULL
        AND capsule_unlocked = FALSE
        AND remind_enabled = TRUE
        AND wx_subscribe_status = 'authorized'
      RETURNING id`,
    [row.id],
  )
  if (!claimed) return

  try {
    const unlockRaw = row.capsuleUnlockAt
    const unlockDate = String(
      unlockRaw instanceof Date ? unlockRaw.toISOString() : unlockRaw || '',
    ).slice(0, 10)
    if (!unlockDate) throw new Error('capsule unlockAt missing')
    await sendScheduleSubscribeMessage({
      openid: row.openid,
      entryId: row.id,
      title: '🔓 时间胶囊已解锁',
      eventDate: unlockDate,
      daysRemaining: 0,
      reminderText: row.title ? `"${row.title.slice(0, 15)}" 已到期` : '你的时间胶囊已到期，快来查看',
    })
    await query(
      `UPDATE t_entry
          SET wx_subscribe_status = 'sent',
              wx_subscribe_sent_at = now(),
              wx_subscribe_error = '',
              capsule_unlocked = TRUE,
              updated_at = now()
        WHERE id = $1`,
      [row.id],
    )
    console.log(`[capsule] sent unlock notification entry=${row.id}`)
  } catch (error) {
    const code = error instanceof WeChatSubscribeError ? error.code : 0
    const message = error instanceof Error ? error.message.slice(0, 500) : 'send failed'
    // On failure, revert to allow retry (up to 3 attempts handled by attempts counter)
    const attempts = (await queryOne<{ a: number }>(`SELECT wx_subscribe_attempts AS a FROM t_entry WHERE id = $1`, [row.id]))?.a || 0
    const permanent = PERMANENT_ERROR_CODES.has(code) || attempts >= 3
    await query(
      `UPDATE t_entry
          SET wx_subscribe_status = $2::varchar,
              capsule_unlocked = CASE WHEN $2::varchar = 'sent' THEN TRUE ELSE FALSE END,
              wx_subscribe_error = $3::text,
              updated_at = now()
        WHERE id = $1`,
      [row.id, permanent ? 'failed' : 'none', message],
    )
    console.warn(`[capsule] send failed entry=${row.id} code=${code || 'network'}`)
  }
}

export async function runReminderScan() {
  if (running) return
  running = true
  schedulerState.lastScanStartedAt = Date.now()
  schedulerState.lastScanOk = false
  try {
    await purgeExpiredSpaces()
    const now = shanghaiNow()
    await reconcileStuckReminders(now)

    // --- Capsule unlock scan ---
    const capsules = await query<CapsuleRow>(
      `SELECT e.id,
              u.openid,
              e.title,
              e.capsule_unlock_at AS "capsuleUnlockAt"
         FROM t_entry e
         JOIN t_user u ON u.id = e.user_id
        WHERE e.deleted = FALSE
          AND e.capsule_unlock_at IS NOT NULL
          AND e.capsule_unlock_at <= now()
          AND e.capsule_unlocked = FALSE
          AND e.remind_enabled = TRUE
          AND e.wx_subscribe_status = 'authorized'
          AND e.wx_subscribe_attempts < 3
          AND (
            e.wx_subscribe_last_attempt_at IS NULL
            OR e.wx_subscribe_last_attempt_at < now() - interval '15 minutes'
          )
        ORDER BY e.capsule_unlock_at ASC
        LIMIT 200`,
    )
    for (const capsule of capsules) {
      try {
        await processCapsuleUnlock(capsule)
      } catch (error) {
        recordItemError(`capsule entry=${capsule.id}`, error)
        console.error(`[capsule] unexpected error entry=${capsule.id}`, error)
      }
    }
    // 内容解锁与提醒授权相互独立：未开启提醒的胶囊到期后也必须正常解锁。
    await query(
      `UPDATE t_entry
          SET capsule_unlocked = TRUE,
              updated_at = now()
        WHERE deleted = FALSE
          AND capsule_unlock_at IS NOT NULL
          AND capsule_unlock_at <= now()
          AND capsule_unlocked = FALSE`,
    )

    // --- Regular reminder scan ---
    const rows = await query<ReminderRow>(
      `SELECT e.id,
              u.openid,
              e.type,
              e.title,
              e.body,
              to_char(e.event_date, 'YYYY-MM-DD') AS "eventDate",
              e.calendar,
              e.recurring,
              COALESCE(e.repeat_rule, 'none') AS "repeatRule",
              e.remind_ahead_days AS "remindAheadDays",
              COALESCE(e.remind_time_minutes, 600) AS "remindTimeMinutes"
         FROM t_entry e
         JOIN t_user u ON u.id = e.user_id
        WHERE e.deleted = FALSE
          AND e.type IN ('anniversary', 'todo')
          AND (
            e.owner_type <> 'space'
            OR EXISTS (
              SELECT 1 FROM t_space_member sm
              JOIN t_space s ON s.id = sm.space_id AND s.dissolved_at IS NULL
              WHERE sm.space_id = e.space_id AND sm.user_id = e.user_id
            )
          )
          AND (e.todo_status IS NULL OR e.todo_status <> 'done')
          AND e.remind_enabled = TRUE
          AND e.wx_subscribe_status = 'authorized'
          AND e.wx_subscribe_attempts < 3
          AND (
            e.wx_subscribe_last_attempt_at IS NULL
            OR e.wx_subscribe_last_attempt_at < now() - interval '15 minutes'
          )
        ORDER BY e.event_date ASC
        LIMIT 500`,
    )
    for (const row of rows) {
      try {
        const sendAt = Math.max(0, Math.min(1439, Number(row.remindTimeMinutes) || 600))
        if (now.getHours() * 60 + now.getMinutes() < sendAt) continue
        await processReminder(row, now)
      } catch (error) {
        recordItemError(`reminder entry=${row.id}`, error)
        console.error(`[reminder] unexpected error entry=${row.id}`, error)
      }
    }

    // 共同日子的提醒按每位协作者自己的授权和时间独立发送。
    const collaboratorRows = await query<CollaboratorReminderRow>(
      `SELECT e.id,
              c.id::text AS "collaboratorId",
              u.openid,
              e.type,
              e.title,
              e.body,
              to_char(e.event_date, 'YYYY-MM-DD') AS "eventDate",
              e.calendar,
              e.recurring,
              COALESCE(e.repeat_rule, 'none') AS "repeatRule",
              c.remind_ahead_days AS "remindAheadDays",
              COALESCE(c.remind_time_minutes, 600) AS "remindTimeMinutes"
         FROM t_entry_collaborator c
         JOIN t_entry e ON e.id = c.entry_id AND e.deleted = FALSE
         JOIN t_user u ON u.id = c.user_id
        WHERE c.role = 'partner'
          AND e.type IN ('anniversary', 'todo')
          AND (
            e.owner_type <> 'space'
            OR EXISTS (
              SELECT 1 FROM t_space_member sm
              JOIN t_space s ON s.id = sm.space_id AND s.dissolved_at IS NULL
              WHERE sm.space_id = e.space_id AND sm.user_id = c.user_id
            )
          )
          AND (e.todo_status IS NULL OR e.todo_status <> 'done')
          AND c.remind_enabled = TRUE
          AND c.wx_subscribe_status = 'authorized'
          AND c.wx_subscribe_attempts < 3
          AND (
            c.wx_subscribe_last_attempt_at IS NULL
            OR c.wx_subscribe_last_attempt_at < now() - interval '15 minutes'
          )
        ORDER BY e.event_date ASC
        LIMIT 500`,
    )
    for (const row of collaboratorRows) {
      try {
        const sendAt = Math.max(0, Math.min(1439, Number(row.remindTimeMinutes) || 600))
        if (now.getHours() * 60 + now.getMinutes() < sendAt) continue
        await processCollaboratorReminder(row, now)
      } catch (error) {
        recordItemError(`collaborator-reminder id=${row.collaboratorId} entry=${row.id}`, error)
        console.error(`[reminder] unexpected collaborator error id=${row.collaboratorId}`, error)
      }
    }
    schedulerState.lastScanOk = true
  } catch (error) {
    schedulerState.scanErrorCount += 1
    schedulerState.lastError = errorText(error)
    console.error('[alert][reminder] scan failed', error)
    void notifyOperationalAlert('reminder-scan-failed', '提醒扫描失败', error)
  } finally {
    schedulerState.scanCount += 1
    schedulerState.lastScanCompletedAt = Date.now()
    running = false
  }
}

export async function startReminderScheduler(opts: { keepAlive?: boolean } = {}) {
  if (process.env.REMINDER_SCHEDULER_ENABLED === '0') {
    schedulerState.enabled = false
    schedulerState.started = true
    schedulerState.startedAt = Date.now()
    schedulerState.lastScanOk = true
    console.log('[reminder] scheduler disabled')
    return
  }
  schedulerState.enabled = true
  schedulerState.started = true
  schedulerState.startedAt = Date.now()
  // 启动时先跑一轮（含 sending 回收）；之后每分钟扫一次
  await runReminderScan()
  timer = setInterval(() => void runReminderScan(), 60_000)
  if (!opts.keepAlive) timer.unref()
  console.log('[reminder] scheduler started')
}
