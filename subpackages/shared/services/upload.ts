import { API_BASE, getAccessToken, request } from '@/api/request'

function isRemoteUrl(s: string) {
  if (!/^https?:\/\//i.test(s)) return false
  const host = (s.match(/^https?:\/\/([^/:?#]+)/i)?.[1] || '').toLowerCase()
  // 微信开发者工具会用 http://tmp/... 表示本地临时文件，
  // 它不是公网地址，必须先上传到 COS 才能交给后端或视觉模型。
  return !!host && host !== 'tmp' && host !== 'localhost' && host !== '127.0.0.1'
}

function isBundledAsset(s: string) {
  return /^\/?static\//i.test(s)
}

function parseUploadResponse(data: unknown): string {
  const body = typeof data === 'string' ? JSON.parse(data || '{}') : data as any
  if (body?.code && body.code !== 0) throw new Error(body.msg || 'upload failed')
  const url = body?.data?.url || body?.url
  if (!url) throw new Error('upload failed')
  return url
}

function friendlyUploadError(status: number, message?: string) {
  if (status === 413 || /too large|file size|limit_file_size/i.test(message || '')) {
    return '这张图片有点大，自动压缩后仍无法上传。请先裁剪图片，或换一张后重试'
  }
  return message || (status ? `图片上传失败（${status}）` : '图片上传失败，请稍后重试')
}

function uploadLocalFile(filePath: string, url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const token = getAccessToken()
    uni.uploadFile({
      url: API_BASE + url,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : undefined,
      success: (res) => {
        try {
          if ((res.statusCode || 0) >= 400) {
            const body = typeof res.data === 'string' ? JSON.parse(res.data || '{}') : res.data as any
            reject(new Error(friendlyUploadError(res.statusCode || 0, body?.msg)))
            return
          }
          resolve(parseUploadResponse(res.data))
        } catch (e) {
          reject(e)
        }
      },
      fail: reject,
    })
  })
}

function getLocalFileSize(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    uni.getFileInfo({
      filePath,
      success: (res) => resolve(res.size),
      fail: reject,
    })
  })
}

function getLocalImageSize(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    uni.getImageInfo({
      src: filePath,
      success: (res) => resolve({ width: res.width, height: res.height }),
      fail: reject,
    })
  })
}

function compressLocalImage(
  filePath: string,
  info: { width: number; height: number },
  maxEdge: number,
  quality: number,
): Promise<string> {
  const scale = Math.min(1, maxEdge / Math.max(info.width, info.height))
  return new Promise((resolve, reject) => {
    uni.compressImage({
      src: filePath,
      quality,
      compressedWidth: Math.max(1, Math.round(info.width * scale)),
      compressedHeight: Math.max(1, Math.round(info.height * scale)),
      success: (res) => res.tempFilePath ? resolve(res.tempFilePath) : reject(new Error('图片压缩失败')),
      fail: reject,
    })
  })
}

/** 日记照片上传前自动收敛到约 4MB，兼顾手机原图和开发者工具临时文件。 */
async function prepareEntryImage(filePath: string): Promise<string> {
  const TARGET_BYTES = 4 * 1024 * 1024
  try {
    if (await getLocalFileSize(filePath) <= TARGET_BYTES) return filePath
    const info = await getLocalImageSize(filePath)
    const attempts = [
      { maxEdge: 1920, quality: 80 },
      { maxEdge: 1600, quality: 68 },
      { maxEdge: 1280, quality: 56 },
    ]
    let smallestPath = filePath
    let smallestSize = Number.POSITIVE_INFINITY
    for (const attempt of attempts) {
      try {
        const path = await compressLocalImage(filePath, info, attempt.maxEdge, attempt.quality)
        const size = await getLocalFileSize(path)
        if (size < smallestSize) {
          smallestPath = path
          smallestSize = size
        }
        if (size <= TARGET_BYTES) return path
      } catch (error) {
        console.warn('[upload] image compression attempt failed:', error)
      }
    }
    return smallestPath
  } catch (error) {
    console.warn('[upload] image compression unavailable, trying original:', error)
    return filePath
  }
}

/** 上传单张配图，返回 COS 公网 URL */
export async function uploadEntryImage(image: string): Promise<string> {
  if (isRemoteUrl(image) || isBundledAsset(image)) return image
  if (!image.startsWith('data:')) {
    const uploadPath = await prepareEntryImage(image)
    return uploadLocalFile(uploadPath, '/api/upload/entry-image')
  }
  const payload = image
  const data = await request<{ url: string }>({
    url: '/api/upload/entry-image',
    method: 'POST',
    data: { image: payload },
  })
  if (!data?.url) throw new Error('upload failed')
  return data.url
}

/** 上传时光圈共同封面，复用日记图片的压缩与安全校验链路。 */
export async function uploadSpaceCover(image: string): Promise<string> {
  if (isRemoteUrl(image)) return image
  if (!image.startsWith('data:')) {
    const uploadPath = await prepareEntryImage(image)
    return uploadLocalFile(uploadPath, '/api/upload/space-cover')
  }
  const data = await request<{ url: string }>({
    url: '/api/upload/space-cover',
    method: 'POST',
    data: { image },
  })
  if (!data?.url) throw new Error('upload failed')
  return data.url
}

/** 批量上传：3 张并发一批，部分失败不阻塞其余 */
export async function resolveImagesForSave(images: string[]): Promise<string[]> {
  const items = images.slice(0, 9).filter(Boolean)
  const results: string[] = []
  const errors: string[] = []
  const BATCH = 3
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH)
    const settled = await Promise.allSettled(batch.map((img) => uploadEntryImage(img)))
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        results.push(r.value)
      } else {
        const message = r.reason?.message || String(r.reason || '')
        errors.push(message)
        console.warn('[upload] image failed:', message)
        // 跳过失败的图片，不中断整体保存
      }
    }
  }
  if (results.length === 0 && items.length > 0) {
    throw new Error(errors[0] || '图片上传失败，请检查网络后重试')
  }
  return results
}

export async function uploadAvatar(image: string): Promise<string> {
  if (isRemoteUrl(image)) return image
  if (!image.startsWith('data:')) return uploadLocalFile(image, '/api/upload/avatar')
  const payload = image
  const data = await request<{ url: string }>({
    url: '/api/upload/avatar',
    method: 'POST',
    data: { image: payload },
  })
  if (!data?.url) throw new Error('upload failed')
  return data.url
}

/** 上传问题反馈截图；该接口允许官网和未登录用户使用。 */
export async function uploadFeedbackImage(image: string): Promise<string> {
  if (isRemoteUrl(image)) return image
  if (image.startsWith('data:')) throw new Error('请重新选择图片后上传')
  return uploadLocalFile(image, '/api/feedback/upload')
}
