import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { sanitizeImageBuffer } from './imageValidation'

describe('sanitizeImageBuffer', () => {
  it.each([
    ['jpeg', 'image/jpeg', 'jpg'],
    ['png', 'image/png', 'png'],
    ['webp', 'image/webp', 'webp'],
  ] as const)('decodes and normalizes %s images', async (format, mime, ext) => {
    const source = sharp({
      create: { width: 32, height: 24, channels: 3, background: '#2f6f6a' },
    })
    const input = await source.toFormat(format).withMetadata({ comment: 'private metadata' }).toBuffer()
    const result = await sanitizeImageBuffer(input, { maxBytes: 1024 * 1024 })
    const metadata = await sharp(result.buffer).metadata()

    expect(result).toMatchObject({ mime, ext, width: 32, height: 24 })
    expect(metadata.format).toBe(format)
    expect(metadata.exif).toBeUndefined()
  })

  it.each([
    ['plain text', Buffer.from('not an image')],
    ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ['fake jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
  ])('rejects %s disguised as an image', async (_name, input) => {
    await expect(sanitizeImageBuffer(input, { maxBytes: 1024 * 1024 })).rejects.toMatchObject({ status: 400 })
  })

  it('rejects valid images with appended active content', async () => {
    const jpeg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: 'white' },
    }).jpeg().toBuffer()
    const polyglot = Buffer.concat([jpeg, Buffer.from('<script>alert(1)</script>')])
    await expect(sanitizeImageBuffer(polyglot, { maxBytes: 1024 * 1024 })).rejects.toMatchObject({ status: 400 })
  })

  it('rejects excessive dimensions', async () => {
    const input = await sharp({
      create: { width: 12001, height: 1, channels: 3, background: 'white' },
    }).png().toBuffer()
    await expect(sanitizeImageBuffer(input, { maxBytes: 1024 * 1024 })).rejects.toMatchObject({ status: 400 })
  })
})
