import { describe, expect, it } from 'vitest'
import type { Entry } from './entries'
import {
  annualNeedsAuthorization,
  annualTargetYear,
  formatReminderDate,
  isUndeliveredReminder,
  undeliveredReminderCopy,
} from './reminderPresentation'

function yearly(overrides: Partial<Entry> = {}): Entry {
  return {
    id: '1',
    type: 'anniversary',
    title: '生日',
    body: '',
    eventDate: '2026-08-03',
    calendar: 'solar',
    recurring: true,
    repeatRule: 'yearly',
    pinned: false,
    showInTimeline: true,
    remindEnabled: false,
    remindAheadDays: 0,
    wxSubscribeStatus: 'none',
    todoStatus: null,
    color: '',
    ...overrides,
  }
}

const aug4 = new Date(2026, 7, 4, 11)

describe('annual reminder presentation', () => {
  it('counts an unconfigured yearly item as authorization needed for its next occurrence', () => {
    const item = yearly()
    expect(annualTargetYear(item, aug4)).toBe(2027)
    expect(annualNeedsAuthorization(item, aug4)).toBe(true)
  })

  it('does not ask again while the next yearly occurrence is actively authorized', () => {
    const item = yearly({ remindEnabled: true, wxSubscribeStatus: 'authorized' })
    expect(annualNeedsAuthorization(item, aug4)).toBe(false)
  })

  it('asks again after a sent annual occurrence rolls to the following year', () => {
    const item = yearly({
      wxSubscribeStatus: 'sent',
      wxSubscribeSentAt: '2026-08-03T10:00:00+08:00',
    })
    expect(annualNeedsAuthorization(item, aug4)).toBe(true)
  })

  it('keeps a cross-year early send associated with the occurrence it covered', () => {
    const item = yearly({
      eventDate: '2026-01-02',
      wxSubscribeStatus: 'sent',
      wxSubscribeSentAt: '2026-12-31T10:00:00+08:00',
    })
    expect(annualNeedsAuthorization(item, new Date(2027, 0, 1, 11))).toBe(false)
  })

  it('shows only month and day for yearly items', () => {
    expect(formatReminderDate(yearly())).toBe('8月3日')
    expect(formatReminderDate(yearly({ repeatRule: 'none', recurring: false }))).toBe('2026-08-03')
  })
})

describe('reminder delivery presentation', () => {
  it('treats failed and expired reminders as undelivered with a specific reason', () => {
    expect(isUndeliveredReminder(yearly({ wxSubscribeStatus: 'failed' }), aug4)).toBe(true)
    expect(undeliveredReminderCopy({ wxSubscribeStatus: 'failed' })).toBe('未送达 · 发送失败')
    expect(isUndeliveredReminder(yearly({ wxSubscribeStatus: 'expired' }), aug4)).toBe(true)
    expect(undeliveredReminderCopy({ wxSubscribeStatus: 'expired' })).toBe('未送达 · 日子已过')
  })

  it('treats an authorized reminder whose reminder day has passed as undelivered', () => {
    const item = yearly({
      eventDate: '2026-08-03',
      recurring: false,
      repeatRule: 'none',
      remindEnabled: true,
      wxSubscribeStatus: 'authorized',
    })
    expect(isUndeliveredReminder(item, aug4)).toBe(true)
    expect(undeliveredReminderCopy(item)).toBe('未送达 · 提醒时间已过')
  })

  it('does not mark future or already sent reminders as undelivered', () => {
    const future = yearly({
      eventDate: '2026-08-05',
      recurring: false,
      repeatRule: 'none',
      remindEnabled: true,
      wxSubscribeStatus: 'authorized',
    })
    expect(isUndeliveredReminder(future, aug4)).toBe(false)
    expect(isUndeliveredReminder(yearly({ wxSubscribeStatus: 'sent' }), aug4)).toBe(false)
  })
})
