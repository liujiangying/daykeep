import { describe, expect, it } from 'vitest'
import { resolveQuickEntryType } from './quickEntryIntent.js'

describe('resolveQuickEntryType', () => {
  it('keeps an explicitly requested date as an anniversary', () => {
    expect(resolveQuickEntryType('todo', '记录一个日期，10天后，需要提醒')).toBe('anniversary')
    expect(resolveQuickEntryType('todo', '添加日子：8月20日体检，提前一天通知我')).toBe('anniversary')
  })

  it('keeps an explicitly requested todo as a todo', () => {
    expect(resolveQuickEntryType('anniversary', '记录一个待办，明天下班取快递')).toBe('todo')
  })

  it('does not turn birthdays into todos because they need reminders', () => {
    expect(resolveQuickEntryType('todo', '8月3日是妈妈生日，每年提前一天提醒我')).toBe('anniversary')
  })

  it('uses the model result when the user did not explicitly name a type', () => {
    expect(resolveQuickEntryType('todo', '下周五之前交水电费，提前一天提醒我')).toBe('todo')
    expect(resolveQuickEntryType('diary', '今天下雨，心情很平静')).toBe('diary')
  })
})
