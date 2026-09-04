import { Router, type NextFunction, type Request, type Response } from 'express'
import crypto from 'node:crypto'
import multer from 'multer'
import { attachOptionalAuth } from '../auth.js'
import { config } from '../config.js'
import { buildFeedbackObjectKey, putObject, publicUrl } from '../cos.js'
import { queryOne } from '../db.js'
import { sanitizeImageBuffer } from '../lib/imageValidation.js'
import { clientMessage } from '../lib/clientError.js'

export const feedbackRouter = Router()

const VALID_CATEGORIES = new Set(['bug', 'suggestion', 'account', 'other'])
const VALID_SOURCES = new Set(['website', 'mini-program', 'app'])
const RATE_WINDOW_MS = 30 * 60 * 1000
const RATE_LIMIT = 5
const rateBuckets = new Map<string, { count: number; resetAt: number }>()
const feedbackUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

function uploadFile(req: Request, res: Response, next: NextFunction) {
  feedbackUpload.single('file')(req, res, (error) => {
    if (!error) return next()
    const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    return res.status(status).json({ code: status, msg: status === 413 ? '图片不能超过 5MB' : '图片上传失败' })
  })
}

function normalizeText(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

function environmentName() {
  const nodeEnv = config.nodeEnv.toLowerCase()
  return nodeEnv === 'production' || nodeEnv === 'prod' ? 'production' : 'testing'
}

function isRateLimited(key: string, limit = RATE_LIMIT) {
  const now = Date.now()
  const current = rateBuckets.get(key)
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  current.count += 1
  return current.count > limit
}

function clientMeta(body: any) {
  return {
    platform: normalizeText(body?.clientMeta?.platform, 40),
    appVersion: normalizeText(body?.clientMeta?.appVersion, 64),
    page: normalizeText(body?.clientMeta?.page, 256),
    system: normalizeText(body?.clientMeta?.system, 128),
  }
}

function validImageUrls(value: unknown) {
  if (!Array.isArray(value)) return []
  const expectedPrefix = publicUrl(`${config.cos.prefix}/feedback/`).replace(/\/$/, '')
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.startsWith(expectedPrefix))
    .slice(0, 3)
}

/** 反馈附件允许匿名上传，但图片大小、类型、频率均受限。 */
feedbackRouter.post('/upload', uploadFile, async (req, res) => {
  try {
    attachOptionalAuth(req)
    const rateKey = `${req.ip || 'unknown'}:feedback-upload`
    if (isRateLimited(rateKey, 12)) return res.status(429).json({ code: 429, msg: '上传过于频繁，请稍后再试' })
    const file = req.file
    if (!file?.buffer?.length) {
      return res.status(400).json({ code: 400, msg: '请选择图片文件' })
    }
    const image = await sanitizeImageBuffer(file.buffer, { maxBytes: 5 * 1024 * 1024 })
    const key = buildFeedbackObjectKey(image.ext, crypto.randomBytes(4).toString('hex'))
    const url = await putObject(key, image.buffer, image.mime)
    return res.json({ code: 0, data: { url } })
  } catch (error: any) {
    console.error('[feedback:upload]', error?.message || error)
    const status = Number(error?.status) || 500
    return res.status(status).json({ code: status, msg: clientMessage(error, '图片上传失败，请稍后重试') })
  }
})

async function notifyFeedbackCreated(id: string, environment: string, source: string, category: string) {
  const webhook = String(process.env.FEEDBACK_WEBHOOK_URL || '').trim()
  if (!webhook) return
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: {
          // 通知中不携带用户反馈正文和联系方式，避免在群聊扩散私密信息。
          content: `[在乎] 新反馈 #${id}\n环境：${environment}\n来源：${source}\n类型：${category}`,
        },
      }),
    })
  } catch (error) {
    console.warn('[feedback] webhook notification failed', error)
  }
}

feedbackRouter.post('/', async (req, res) => {
  try {
    attachOptionalAuth(req)
    const content = normalizeText(req.body?.content, 2000)
    const category = normalizeText(req.body?.category, 32)
    const source = normalizeText(req.body?.source, 32) || 'website'
    const contact = normalizeText(req.body?.contact, 128)
    const honeypot = normalizeText(req.body?.website, 64)
    const imageUrls = validImageUrls(req.body?.imageUrls)

    if (honeypot) return res.status(400).json({ code: 400, msg: '提交失败，请稍后重试' })
    if (!VALID_CATEGORIES.has(category)) {
      return res.status(400).json({ code: 400, msg: '请选择反馈类型' })
    }
    if (!VALID_SOURCES.has(source)) {
      return res.status(400).json({ code: 400, msg: '反馈来源无效' })
    }
    if (content.length < 5) {
      return res.status(400).json({ code: 400, msg: '请至少填写 5 个字，方便我们理解问题' })
    }

    const rateKey = `${req.ip || 'unknown'}:${source}`
    if (isRateLimited(rateKey)) {
      return res.status(429).json({ code: 429, msg: '提交过于频繁，请稍后再试' })
    }

    const environment = environmentName()
    const row = await queryOne<{ id: string }>(
      `INSERT INTO t_feedback
        (environment, source, category, content, contact, image_urls, user_id, client_meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        environment,
        source,
        category,
        content,
        contact,
        imageUrls,
        req.userId ?? null,
        JSON.stringify(clientMeta(req.body)),
      ],
    )
    if (!row) throw new Error('feedback insert failed')

    void notifyFeedbackCreated(row.id, environment, source, category)
    return res.json({ code: 0, data: { id: row.id, environment } })
  } catch (error: any) {
    console.error('[feedback:create]', error)
    return res.status(500).json({ code: 500, msg: '反馈提交失败，请稍后重试' })
  }
})
