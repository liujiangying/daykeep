import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeStoredAsset,
  normalizeUserAsset,
  objectReference,
  resolveObjectReferences,
  toObjectReference,
} from './cos.js'

const ENV_KEYS = [
  'COS_BUCKET',
  'COS_REGION',
  'COS_PREFIX',
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
  'COS_URL_EXPIRE',
] as const

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

beforeEach(() => {
  process.env.COS_BUCKET = 'daykeep-test-1234567890'
  process.env.COS_REGION = 'ap-guangzhou'
  process.env.COS_PREFIX = 'daykeep'
  process.env.COS_SECRET_ID = 'test-secret-id'
  process.env.COS_SECRET_KEY = 'test-secret-key'
  process.env.COS_URL_EXPIRE = '600'
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('private COS references', () => {
  it('stores only a stable object reference', () => {
    expect(objectReference('daykeep/u1/entry/photo.jpg')).toBe('cos://daykeep/u1/entry/photo.jpg')
    expect(toObjectReference('cos://daykeep/u1/entry/photo.jpg')).toBe(
      'cos://daykeep/u1/entry/photo.jpg',
    )
  })

  it('removes an old signed query before persistence', () => {
    const url =
      'https://daykeep-test-1234567890.cos.ap-guangzhou.myqcloud.com/daykeep/u1/entry/photo.jpg?q-signature=expired'
    expect(normalizeStoredAsset(url)).toBe('cos://daykeep/u1/entry/photo.jpg')
  })

  it('does not claim URLs from other buckets', () => {
    const external = 'https://other.example/avatar.jpg'
    expect(toObjectReference(external)).toBeNull()
    expect(normalizeStoredAsset(external)).toBe(external)
  })

  it('only accepts managed upload references owned by the current user', () => {
    expect(normalizeUserAsset('cos://daykeep/u7/entry/photo.jpg', 7, ['entry'])).toBe(
      'cos://daykeep/u7/entry/photo.jpg',
    )
    expect(normalizeUserAsset('cos://daykeep/u8/entry/photo.jpg', 7, ['entry'])).toBeNull()
    expect(normalizeUserAsset('cos://daykeep/u7/avatar/photo.jpg', 7, ['entry'])).toBeNull()
    expect(normalizeUserAsset('cos://invalid/object.jpg', 7, ['entry'])).toBeNull()
    expect(normalizeUserAsset(
      'https://daykeep-test-1234567890.cos.ap-guangzhou.myqcloud.com/other/object.jpg',
      7,
      ['entry'],
    )).toBeNull()
    expect(normalizeUserAsset('https://third-party.example/avatar.jpg', 7, ['avatar'])).toBe(
      'https://third-party.example/avatar.jpg',
    )
  })

  it('replaces stored references with fresh signed URLs in API payloads', async () => {
    const createdAt = new Date('2026-09-14T08:00:00.000Z')
    const payload = await resolveObjectReferences({
      image: 'cos://daykeep/u1/entry/photo.jpg',
      nested: ['cos://daykeep/u1/entry/photo.jpg'],
      createdAt,
    }) as { image: string; nested: string[]; createdAt: Date }

    expect(payload.image).toMatch(
      /^https:\/\/daykeep-test-1234567890\.cos\.ap-guangzhou\.myqcloud\.com\/daykeep\/u1\/entry\/photo\.jpg\?/,
    )
    expect(payload.image).toContain('q-signature=')
    expect(payload.nested[0]).toBe(payload.image)
    expect(payload.createdAt).toBe(createdAt)
  })

  it('keeps the signed URL stable across API responses until it nears expiry', async () => {
    const now = new Date('2026-09-20T08:00:00.000Z').getTime()
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now)
    const reference = 'cos://daykeep/u1/entry/stable-between-pages.jpg'

    const first = await resolveObjectReferences({ image: reference }) as { image: string }
    dateNow.mockReturnValue(now + 30_000)
    const second = await resolveObjectReferences({ image: reference }) as { image: string }

    expect(second.image).toBe(first.image)
  })
})
