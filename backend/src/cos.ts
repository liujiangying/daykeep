import COS from 'cos-nodejs-sdk-v5'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config, requireCosConfigured } from './config.js'

let cosInternal: COS | null = null

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

export function publicUrl(key: string): string {
  const publicDomain = `${config.cos.bucket}.cos.${config.cos.region}.myqcloud.com`
  const publicHost = config.cos.publicHost || publicDomain
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `https://${publicHost}/${encoded}`
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
  return publicUrl(key)
}
