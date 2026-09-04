import type { Entry } from '@/services/entries'
import { daysUntil, normalizeRepeatRule } from '@/utils/countdown'
import { formatAnnualDateLabel } from '@/utils/lunar'

type AnnualReminderEntry = Pick<
  Entry,
  | 'eventDate'
  | 'calendar'
  | 'recurring'
  | 'repeatRule'
  | 'remindEnabled'
  | 'wxSubscribeStatus'
  | 'wxSubscribeSentAt'
>

type DeliveryReminderEntry = Pick<
  Entry,
  | 'eventDate'
  | 'calendar'
  | 'recurring'
  | 'repeatRule'
  | 'remindEnabled'
  | 'remindAheadDays'
  | 'wxSubscribeStatus'
  | 'wxSubscribeAttempts'
>

/** 提醒发送日是否整日已过（当天内仍算待提醒，允许到点后补发）。 */
function isRemindDayFullyPast(item: DeliveryReminderEntry, now = new Date()): boolean {
  if (!item.eventDate) return false
  const ahead = Math.max(0, Number(item.remindAheadDays) || 0)
  const remaining = daysUntil(
    item.eventDate,
    normalizeRepeatRule(item),
    now,
    item.calendar === 'lunar' ? 'lunar' : 'solar',
  )
  if (remaining < 0) return true
  const scheduled = new Date(now)
  scheduled.setHours(0, 0, 0, 0)
  scheduled.setDate(scheduled.getDate() + remaining - ahead)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return scheduled.getTime() < today.getTime()
}

/** 提醒已失败、过期，或发送日已经过去但仍未成功送达。 */
export function isUndeliveredReminder(item: DeliveryReminderEntry, now = new Date()): boolean {
  const status = item.wxSubscribeStatus || 'none'
  if (status === 'failed' || status === 'expired') return true
  if (status === 'sent') return false
  if (!(item.remindEnabled && (status === 'authorized' || status === 'sending'))) return false
  if ((item.wxSubscribeAttempts || 0) >= 3) return true
  return isRemindDayFullyPast(item, now)
}

/** 各入口统一使用的未送达原因文案。 */
export function undeliveredReminderCopy(item: Pick<Entry, 'wxSubscribeStatus'>): string {
  if (item.wxSubscribeStatus === 'expired') return '未送达 · 日子已过'
  if (item.wxSubscribeStatus === 'failed') return '未送达 · 发送失败'
  return '未送达 · 提醒时间已过'
}

export function annualTargetYear(item: AnnualReminderEntry, now = new Date()): number {
  if (normalizeRepeatRule(item) !== 'yearly') return 0
  const remaining = daysUntil(item.eventDate, 'yearly', now, item.calendar)
  const target = new Date(now)
  target.setHours(0, 0, 0, 0)
  target.setDate(target.getDate() + remaining)
  return target.getFullYear()
}

/** 下一次年度发生是否还需要取得一次新的微信订阅授权。 */
export function annualNeedsAuthorization(item: AnnualReminderEntry, now = new Date()): boolean {
  if (normalizeRepeatRule(item) !== 'yearly') return false

  const activelyAuthorized =
    item.remindEnabled &&
    (item.wxSubscribeStatus === 'authorized' || item.wxSubscribeStatus === 'sending')
  if (activelyAuthorized) return false

  if (item.wxSubscribeStatus !== 'sent') return true
  const sentAt = new Date(item.wxSubscribeSentAt || '')
  if (Number.isNaN(sentAt.getTime())) return true

  // 比较“发送覆盖的年度发生”和“当前下一次年度发生”，兼容跨年提前提醒。
  return annualTargetYear(item, sentAt) < annualTargetYear(item, now)
}

export function formatReminderDate(
  item: Pick<Entry, 'eventDate' | 'calendar' | 'recurring' | 'repeatRule'>,
) {
  if (normalizeRepeatRule(item) !== 'yearly') return item.eventDate
  return formatAnnualDateLabel(item.eventDate, item.calendar)
}
