import COS from 'cos-nodejs-sdk-v5'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config, requireCosConfigured } from './config.js'

let cosInternal: COS | null = null
let cosPublic: COS | null = null

const OBJECT_REF_PREFIX = 'cos://'
const SIGNED_URL_CACHE_MAX = 2000

type SignedUrlCacheEntry = {
  url: string
  expiresAt: number
}

/**
 * COS 私有对象的签名参数包含签发时间。同一对象如果在每次接口请求时都重新签名，
 * 小程序会认为 image.src 发生变化并重新解码图片，切换页面时就会明显闪烁。
 *
 * 缓存只保存已经下发给客户端的短期 URL，不改变 Bucket 权限，也不延长 URL 本身
 * 的有效期；临近过期时会自动重新签发。
 */
const signedUrlCache = new Map<string, SignedUrlCacheEntry>()

function hasCosSecrets(): boolean {
  return !!config.cos.secretId.trim() && !!config.cos.secretKey.trim()
}

function getCosInternal(): COS {
  if (cosInternal) return cosInternal
  const internalDomain = `${config.cos.bucket}.cos-internal.${config.cos.region}.tencentcos.cn`
  cosInternal = new COS({
    SecretId: config.cos.secretId,
    SecretKey: config.cos.secretKey,
    Domain: internalDomain,
    Protocol: 'https:',
  })
  return cosInternal
}

function getCosPublic(): COS {
  if (cosPublic) return cosPublic
  cosPublic = new COS({
    SecretId: config.cos.secretId,
    SecretKey: config.cos.secretKey,
    Protocol: 'https:',
  })
  return cosPublic
}

function normalizeKey(key: string): string | null {
  const value = key.replace(/^\/+/, '').trim()
  if (!value || value.includes('..') || value.includes('\\')) return null
  const prefix = config.cos.prefix.replace(/^\/+|\/+$/g, '')
  if (!prefix || (value !== prefix && !value.startsWith(`${prefix}/`))) return null
  return value
}

function configuredCosHosts(): Set<string> {
  const hosts = new Set<string>()
  if (config.cos.bucket) {
    hosts.add(`${config.cos.bucket}.cos.${config.cos.region}.myqcloud.com`.toLowerCase())
  }
  if (config.cos.publicHost) hosts.add(config.cos.publicHost.toLowerCase())
  return hosts
}

export function objectReference(key: string): string {
  const normalized = normalizeKey(key)
  if (!normalized) throw new Error('invalid COS object key')
  return `${OBJECT_REF_PREFIX}${normalized}`
}

/**
 * 将本应用 COS 的对象引用或已签名 URL 归一化为稳定引用。
 * 数据库只保存引用，不保存会过期的签名参数。
 */
export function toObjectReference(input: unknown): string | null {
  const raw = String(input || '').trim()
  if (!raw) return null
  if (raw.startsWith(OBJECT_REF_PREFIX)) {
    const key = normalizeKey(raw.slice(OBJECT_REF_PREFIX.length))
    return key ? `${OBJECT_REF_PREFIX}${key}` : null
  }
  if (!config.cos.bucket) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' || !configuredCosHosts().has(parsed.host.toLowerCase())) return null
    const key = normalizeKey(
      parsed.pathname
        .split('/')
        .filter(Boolean)
        .map((part) => decodeURIComponent(part))
        .join('/'),
    )
    return key ? `${OBJECT_REF_PREFIX}${key}` : null
  } catch {
    return null
  }
}

/** 保留普通外链；仅把当前 Bucket 的 URL 转成稳定引用。 */
export function normalizeStoredAsset(input: unknown): string {
  const raw = String(input || '').trim()
  return toObjectReference(raw) || raw
}

export type UserAssetKind = 'entry' | 'avatar' | 'background' | 'space-cover'

/**
 * 写入用户数据时验证 COS 对象归属。普通外链原样保留；当前 Bucket 的对象必须
 * 位于当前用户和允许的类型目录下，避免利用已知对象 key 让服务端越权代签。
 */
export function normalizeUserAsset(
  input: unknown,
  userId: string | number,
  allowedKinds: UserAssetKind[],
): string | null {
  const raw = String(input || '').trim()
  if (!raw) return ''
  const reference = toObjectReference(raw)
  if (!reference) {
    if (raw.startsWith(OBJECT_REF_PREFIX)) return null
    try {
      const parsed = new URL(raw)
      if (configuredCosHosts().has(parsed.host.toLowerCase())) return null
    } catch {
      // 普通相对地址沿用旧行为；调用方可以按自身字段规则进一步限制。
    }
    return raw
  }
  const allowed = allowedKinds.some((kind) => (
    reference.startsWith(`${OBJECT_REF_PREFIX}${config.cos.prefix}/u${userId}/${kind}/`)
  ))
  return allowed ? reference : null
}

export async function signedObjectUrl(reference: string): Promise<string> {
  const normalized = toObjectReference(reference)
  if (!normalized) return reference
  requireCosConfigured()
  const key = normalized.slice(OBJECT_REF_PREFIX.length)
  const expiresSeconds = Math.max(60, config.cos.urlExpire || 3600)
  const cacheKey = `${config.cos.bucket}|${config.cos.region}|${normalized}`
  const now = Date.now()
  const refreshSafetyMs = Math.min(60_000, Math.max(5_000, expiresSeconds * 100))
  const cached = signedUrlCache.get(cacheKey)
  if (cached && cached.expiresAt - now > refreshSafetyMs) return cached.url
  if (cached) signedUrlCache.delete(cacheKey)

  const url = await new Promise<string>((resolve, reject) => {
    getCosPublic().getObjectUrl(
      {
        Bucket: config.cos.bucket,
        Region: config.cos.region,
        Key: key,
        Sign: true,
        Method: 'GET',
        Expires: expiresSeconds,
        Protocol: 'https:',
      },
      (error, data) => {
        if (error) reject(error)
        else resolve(data.Url)
      },
    )
  })
  signedUrlCache.set(cacheKey, { url, expiresAt: Date.now() + expiresSeconds * 1000 })
  if (signedUrlCache.size > SIGNED_URL_CACHE_MAX) {
    const oldestKey = signedUrlCache.keys().next().value
    if (oldestKey) signedUrlCache.delete(oldestKey)
  }
  return url
}

/** 递归刷新 API 响应中的对象引用；同一响应内相同对象只签名一次。 */
export async function resolveObjectReferences(
  value: unknown,
  cache = new Map<string, Promise<string>>(),
): Promise<unknown> {
  if (typeof value === 'string') {
    if (!value.startsWith(OBJECT_REF_PREFIX)) return value
    let pending = cache.get(value)
    if (!pending) {
      pending = signedObjectUrl(value)
      cache.set(value, pending)
    }
    return await pending
  }
  if (Array.isArray(value)) {
    return await Promise.all(value.map((item) => resolveObjectReferences(item, cache)))
  }
  if (
    value
    && typeof value === 'object'
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    const resolved = await Promise.all(
      Object.entries(value).map(async ([key, item]) => [key, await resolveObjectReferences(item, cache)]),
    )
    return Object.fromEntries(resolved)
  }
  return value
}

/** 对象键：{prefix}/u{userId}/{kind}/{ts}_{rand}.{ext} */
export function buildObjectKey(
  userId: number,
  kind: 'entry' | 'avatar' | 'background' | 'space-cover',
  ext: string,
  rand: string,
): string {
  const safeExt = (ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
  return `${config.cos.prefix}/u${userId}/${kind}/${Date.now()}_${rand}.${safeExt}`
}

/** 匿名问题反馈附件不归属某位用户，单独放在受限前缀下。 */
export function buildFeedbackObjectKey(ext: string, rand: string): string {
  const safeExt = (ext || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
  return `${config.cos.prefix}/feedback/${Date.now()}_${rand}.${safeExt}`
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType?: string,
  fallbackBaseUrl?: string,
): Promise<string> {
  if (!hasCosSecrets()) {
    if (config.nodeEnv === 'production' || config.nodeEnv === 'prod') requireCosConfigured()
    const filePath = path.resolve(process.cwd(), 'uploads', key)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, body)
    console.warn(`[cos:dev-fallback] COS not configured, saved ${contentType || 'application/octet-stream'} to ${filePath}`)
    return `${(fallbackBaseUrl || config.publicBaseUrl).replace(/\/+$/, '')}/uploads/${key.split('/').map(encodeURIComponent).join('/')}`
  }
  requireCosConfigured()
  await new Promise<void>((resolve, reject) => {
    getCosInternal().putObject(
      {
        Bucket: config.cos.bucket,
        Region: config.cos.region,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
      (err: any) => {
        if (err) reject(err)
        else resolve()
      },
    )
  })
  return objectReference(key)
}
