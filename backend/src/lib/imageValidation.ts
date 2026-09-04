export type SupportedImage = {
  mime: 'image/jpeg' | 'image/png' | 'image/webp'
  ext: 'jpg' | 'png' | 'webp'
  width: number
  height: number
}

/**
 * 图片校验失败的文案是写给用户看的（格式不支持、超过多少 MB），
 * 标记 expose 让 clientMessage 放行；未标记的异常一律只回兜底文案。
 */
export class ImageValidationError extends Error {
  readonly expose = true

  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function invalid(message = '仅支持有效的 JPEG、PNG 或 WebP 图片'): never {
  throw new ImageValidationError(message)
}

function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 45 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  let offset = 8
  let width = 0
  let height = 0
  let chunkIndex = 0
  let sawEnd = false
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const next = offset + 12 + length
    if (next > buf.length) return null
    if (chunkIndex === 0) {
      if (type !== 'IHDR' || length !== 13) return null
      width = buf.readUInt32BE(offset + 8)
      height = buf.readUInt32BE(offset + 12)
      const compression = buf[offset + 18]
      const filter = buf[offset + 19]
      const interlace = buf[offset + 20]
      if (compression !== 0 || filter !== 0 || interlace > 1) return null
    }
    if (type === 'IEND') {
      if (length !== 0 || next !== buf.length) return null
      sawEnd = true
      break
    }
    offset = next
    chunkIndex += 1
  }
  return sawEnd && width && height ? { width, height } : null
}

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 12 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) return null
  let offset = 2
  while (offset + 4 <= buf.length) {
    while (offset < buf.length && buf[offset] === 0xff) offset += 1
    if (offset >= buf.length) return null
    const marker = buf[offset++]
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > buf.length) return null
    const length = buf.readUInt16BE(offset)
    if (length < 2 || offset + length > buf.length) return null
    if (JPEG_SOF.has(marker)) {
      if (length < 7) return null
      const height = buf.readUInt16BE(offset + 3)
      const width = buf.readUInt16BE(offset + 5)
      return width && height ? { width, height } : null
    }
    offset += length
  }
  return null
}

function webpSize(buf: Buffer): { width: number; height: number } | null {
  if (
    buf.length < 30 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP' ||
    buf.readUInt32LE(4) + 8 !== buf.length
  ) return null

  let offset = 12
  while (offset + 8 <= buf.length) {
    const type = buf.toString('ascii', offset, offset + 4)
    const length = buf.readUInt32LE(offset + 4)
    const data = offset + 8
    const next = data + length + (length % 2)
    if (next > buf.length) return null
    if (type === 'VP8X') {
      if (length < 10 || (buf[data] & 0x02) !== 0) return null // 不接受动画 WebP
      const width = 1 + buf.readUIntLE(data + 4, 3)
      const height = 1 + buf.readUIntLE(data + 7, 3)
      return { width, height }
    }
    if (type === 'VP8L') {
      if (length < 5 || buf[data] !== 0x2f) return null
      const bits = buf.readUInt32LE(data + 1)
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      }
    }
    if (type === 'VP8 ') {
      if (
        length < 10 ||
        buf[data + 3] !== 0x9d ||
        buf[data + 4] !== 0x01 ||
        buf[data + 5] !== 0x2a
      ) return null
      return {
        width: buf.readUInt16LE(data + 6) & 0x3fff,
        height: buf.readUInt16LE(data + 8) & 0x3fff,
      }
    }
    offset = next
  }
  return null
}

export function validateImageBuffer(
  buf: Buffer,
  options: { maxBytes: number; maxDimension?: number; maxPixels?: number },
): SupportedImage {
  if (!Buffer.isBuffer(buf) || !buf.length) invalid('图片内容为空或已损坏')
  if (buf.length > options.maxBytes) {
    throw new ImageValidationError(`图片大小不能超过 ${Math.floor(options.maxBytes / 1024 / 1024)}MB`, 413)
  }

  let image: SupportedImage | null = null
  const png = pngSize(buf)
  if (png) image = { mime: 'image/png', ext: 'png', ...png }
  if (!image) {
    const jpeg = jpegSize(buf)
    if (jpeg) image = { mime: 'image/jpeg', ext: 'jpg', ...jpeg }
  }
  if (!image) {
    const webp = webpSize(buf)
    if (webp) image = { mime: 'image/webp', ext: 'webp', ...webp }
  }
  if (!image) invalid()

  const maxDimension = options.maxDimension ?? 12000
  const maxPixels = options.maxPixels ?? 40_000_000
  if (
    image.width <= 0 || image.height <= 0 ||
    image.width > maxDimension || image.height > maxDimension ||
    image.width * image.height > maxPixels
  ) {
    invalid('图片尺寸过大，请压缩或裁剪后重试')
  }
  return image
}

/**
 * 先做轻量结构检查，再由 libvips 真正解码并重新编码。
 * 不保留原文件字节与元数据，避免 SVG、伪装格式、损坏文件和 polyglot 原样进入公开存储。
 */
export async function sanitizeImageBuffer(
  input: Buffer,
  options: { maxBytes: number; maxDimension?: number; maxPixels?: number },
): Promise<SupportedImage & { buffer: Buffer }> {
  const detected = validateImageBuffer(input, options)
  const maxDimension = options.maxDimension ?? 12000
  const maxPixels = options.maxPixels ?? 40_000_000
  try {
    const pipeline = sharp(input, {
      failOn: 'error',
      limitInputPixels: maxPixels,
      animated: false,
    }).rotate()
    const metadata = await pipeline.metadata()
    if (
      metadata.format !== detected.ext &&
      !(metadata.format === 'jpeg' && detected.ext === 'jpg')
    ) invalid()
    if ((metadata.pages || 1) > 1) invalid('不支持动图，请选择静态图片')
    const width = metadata.autoOrient?.width || metadata.width || detected.width
    const height = metadata.autoOrient?.height || metadata.height || detected.height
    if (
      width <= 0 || height <= 0 || width > maxDimension || height > maxDimension ||
      width * height > maxPixels
    ) invalid('图片尺寸过大，请压缩或裁剪后重试')

    let output: Buffer
    if (detected.ext === 'jpg') {
      output = await pipeline.jpeg({ quality: 90, progressive: true }).toBuffer()
    } else if (detected.ext === 'png') {
      output = await pipeline.png({ compressionLevel: 9 }).toBuffer()
    } else {
      output = await pipeline.webp({ quality: 90 }).toBuffer()
    }
    if (!output.length || output.length > options.maxBytes) {
      throw new ImageValidationError(
        `处理后的图片大小不能超过 ${Math.floor(options.maxBytes / 1024 / 1024)}MB`,
        output.length > options.maxBytes ? 413 : 400,
      )
    }
    return { ...detected, width, height, buffer: output }
  } catch (error) {
    if (error instanceof ImageValidationError) throw error
    invalid('图片已损坏或无法解析，请重新选择')
  }
}

export function decodeBase64Image(value: unknown): Buffer {
  if (typeof value !== 'string' || !value.trim()) invalid('图片内容为空')
  const raw = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
  const compact = raw.replace(/\s+/g, '')
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    invalid('图片编码无效')
  }
  const buf = Buffer.from(compact, 'base64')
  if (!buf.length || buf.toString('base64').replace(/=+$/, '') !== compact.replace(/=+$/, '')) {
    invalid('图片编码无效')
  }
  return buf
}
import sharp from 'sharp'
