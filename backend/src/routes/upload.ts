import { Router, type NextFunction, type Request, type Response } from 'express'
import crypto from 'node:crypto'
import multer from 'multer'
import { buildObjectKey, putObject } from '../cos.js'
import { requireAuth } from '../auth.js'
import { decodeBase64Image, sanitizeImageBuffer } from '../lib/imageValidation.js'
import { clientMessage } from '../lib/clientError.js'

export const uploadRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
})

const singleImage = upload.single('file')

function handleUploadFile(req: Request, res: Response, next: NextFunction) {
  singleImage(req, res, (err) => {
    if (!err) return next()
    const status = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    const msg = status === 413
      ? '图片大小超过 8MB，请压缩或裁剪后重试'
      : err.message || '图片上传失败'
    return res.status(status).json({ code: status, msg })
  })
}

function parseImageRequest(req: Request): Buffer {
  if (req.file?.buffer?.length) {
    return req.file.buffer
  }
  return decodeBase64Image(req.body?.image)
}

async function uploadImage(req: Request, kind: 'entry' | 'avatar' | 'space-cover') {
  const buf = parseImageRequest(req)
  const max = kind === 'avatar' ? 5 * 1024 * 1024 : 8 * 1024 * 1024
  const image = await sanitizeImageBuffer(buf, { maxBytes: max })
  const rand = crypto.randomBytes(4).toString('hex')
  const key = buildObjectKey(req.userId!, kind, image.ext, rand)
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0]
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0]
  const fallbackBaseUrl = host ? `${proto}://${host}` : undefined
  const url = await putObject(key, image.buffer, image.mime, fallbackBaseUrl)
  return { url, key }
}

/** 日记/条目配图：优先 multipart，兼容旧 base64 */
uploadRouter.post('/entry-image', requireAuth, handleUploadFile, async (req, res) => {
  try {
    const data = await uploadImage(req, 'entry')
    return res.json({ code: 0, data })
  } catch (e: any) {
    const status = e?.status || 500
    console.error('[upload/entry-image]', e?.message || e)
    return res.status(status).json({ code: status, msg: clientMessage(e, 'upload failed') })
  }
})

/** 用户头像 */
uploadRouter.post('/avatar', requireAuth, handleUploadFile, async (req, res) => {
  try {
    const data = await uploadImage(req, 'avatar')
    return res.json({ code: 0, data })
  } catch (e: any) {
    const status = e?.status || 500
    console.error('[upload/avatar]', e?.message || e)
    return res.status(status).json({ code: status, msg: clientMessage(e, 'upload failed') })
  }
})

/** 时光圈共同封面 */
uploadRouter.post('/space-cover', requireAuth, handleUploadFile, async (req, res) => {
  try {
    const data = await uploadImage(req, 'space-cover')
    return res.json({ code: 0, data })
  } catch (e: any) {
    const status = e?.status || 500
    console.error('[upload/space-cover]', e?.message || e)
    return res.status(status).json({ code: status, msg: clientMessage(e, 'upload failed') })
  }
})
