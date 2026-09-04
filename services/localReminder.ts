/**
 * 本地推送提醒服务
 * 用于纪念日/待办的本地通知弹窗提醒（App 端）
 *
 * 原理：
 * - 登录后 / 每次打开 App 时调用 scheduleAllReminders()
 * - 根据用户的纪念日/待办设置，注册未来 7 天内需要提醒的本地通知
 * - 即使 App 不在前台，系统也会在指定时间弹窗推送
 */

import { request } from '@/api/request'

interface ReminderEntry {
  id: string | number
  title: string
  eventDate: string
  type: 'anniversary' | 'todo'
  remindEnabled: boolean
  remindAheadDays: number
  remindTimeMinutes: number // 一天中的第几分钟提醒，如 600 = 10:00
  repeatRule: string
}

/**
 * 请求通知权限
 */
export function requestNotificationPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    // #ifdef APP-PLUS
    if (plus.os.name === 'iOS') {
      /*
       * iOS 没有 plus.push.getPermission API。DCloud 官方入口是
       * uni.getPushClientId：手动注册模式下会触发系统通知授权，
       * 已授权时直接返回 cid，拒绝或未配置 UniPush 时走 fail。
       */
      uni.getPushClientId({
        success: () => resolve(true),
        fail: () => resolve(false),
      })
    } else {
      // Android 13+ 需要运行时权限
      plus.android?.requestPermissions?.(
        ['android.permission.POST_NOTIFICATIONS'],
        (e) => resolve(e?.granted?.length > 0),
        () => resolve(false),
      )
    }
    // #endif
    // #ifndef APP-PLUS
    resolve(false)
    // #endif
  })
}

/**
 * 清除所有已注册的本地通知
 */
export function clearAllLocalNotifications() {
  // #ifdef APP-PLUS
  try {
    plus.push.clear()
  } catch {
    /* ignore */
  }
  // #endif
}

/**
 * 创建一条本地通知
 */
function createLocalNotification(opts: {
  id: string
  title: string
  body: string
  fireDate: Date
}) {
  // #ifdef APP-PLUS
  try {
    const dateStr = formatNotifyDate(opts.fireDate)
    plus.push.createMessage(opts.body, JSON.stringify({ entryId: opts.id }), {
      title: opts.title,
      when: opts.fireDate,
      delay: undefined,
      // @ts-expect-error - plus.push 的类型里没有 fireDate，运行时需要它
      fireDate: dateStr,
      sound: 'system',
      cover: false,
    })
  } catch (e) {
    console.warn('[localReminder] createMessage failed:', e)
  }
  // #endif
}

function formatNotifyDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}:00`
}

/**
 * 计算距离下一次纪念日的天数
 */
function daysUntilNextOccurrence(eventDateStr: string, repeatRule: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const eventDate = new Date(eventDateStr + 'T00:00:00')

  if (repeatRule === 'none' || repeatRule === '') {
    // 不重复，直接算差值
    const diff = Math.ceil((eventDate.getTime() - today.getTime()) / 86400000)
    return diff
  }

  // yearly repeat
  const thisYear = today.getFullYear()
  let next = new Date(thisYear, eventDate.getMonth(), eventDate.getDate())
  if (next < today) {
    next = new Date(thisYear + 1, eventDate.getMonth(), eventDate.getDate())
  }
  return Math.ceil((next.getTime() - today.getTime()) / 86400000)
}

/**
 * 从后端拉取需要提醒的条目，注册本地通知
 * 调用时机：App 启动 / 登录成功后 / 切到前台
 */
export async function scheduleAllReminders() {
  // #ifdef APP-PLUS
  try {
    // 先清除旧通知避免重复
    clearAllLocalNotifications()

    // 拉取用户的所有开启了提醒的条目
    const entries = await request<ReminderEntry[]>({
      url: '/api/entries/reminders',
    })

    if (!entries || !entries.length) return

    const now = new Date()

    for (const entry of entries) {
      if (!entry.remindEnabled) continue

      const daysUntil = daysUntilNextOccurrence(entry.eventDate, entry.repeatRule)
      const remindDaysBefore = entry.remindAheadDays || 1

      // 计算提醒应该触发的日期（纪念日前 N 天）
      const daysUntilRemind = daysUntil - remindDaysBefore
      if (daysUntilRemind < 0 || daysUntilRemind > 7) continue // 只注册未来7天的

      // 提醒时间（当天的第几分钟）
      const remindMinutes = entry.remindTimeMinutes || 600 // 默认 10:00
      const remindHour = Math.floor(remindMinutes / 60)
      const remindMin = remindMinutes % 60

      const fireDate = new Date(now)
      fireDate.setDate(fireDate.getDate() + daysUntilRemind)
      fireDate.setHours(remindHour, remindMin, 0, 0)

      // 如果已经过了触发时间，跳过
      if (fireDate <= now) continue

      const daysText = daysUntil === 0 ? '今天' : `还有${daysUntil}天`
      const body = entry.type === 'anniversary'
        ? `「${entry.title}」${daysText}！`
        : `待办「${entry.title}」${daysText}到期`

      createLocalNotification({
        id: String(entry.id),
        title: '只我们',
        body,
        fireDate,
      })
    }

    console.log(`[localReminder] scheduled ${entries.length} entries`)

    // 时间胶囊到期提醒
    try {
      const capsules = await request<{ id: string; title: string; unlockAt: string }[]>({
        url: '/api/capsules/pending-unlock',
      })
      for (const cap of capsules || []) {
        const unlockDate = new Date(cap.unlockAt)
        if (unlockDate <= now) continue
        // 解锁当天上午 9 点提醒
        const fireDate = new Date(unlockDate)
        fireDate.setHours(9, 0, 0, 0)
        if (fireDate <= now) continue

        createLocalNotification({
          id: `capsule_${cap.id}`,
          title: '时间胶囊已解锁',
          body: `「${cap.title || '一颗时间胶囊'}」到了开启的时候啦！`,
          fireDate,
        })
      }
    } catch {}

  } catch (e) {
    console.warn('[localReminder] schedule failed:', e)
  }
  // #endif
}
