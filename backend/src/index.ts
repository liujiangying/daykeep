import express from 'express'
import path from 'node:path'
import { ensureSchema, queryOne } from './db.js'
import { authRouter } from './routes/auth.js'
import { entriesRouter } from './routes/entries.js'
import { uploadRouter } from './routes/upload.js'
import { capsuleRouter } from './routes/capsule.js'
import { collaborateRouter } from './routes/collaborate.js'
import { feedbackRouter } from './routes/feedback.js'
import { historyRouter } from './routes/history.js'
import { spacesRouter } from './routes/spaces.js'
import { quizzesRouter } from './routes/quizzes.js'
import { dailyQuestionsRouter } from './routes/dailyQuestions.js'
import { insightsRouter } from './routes/insights.js'
import { analyticsRouter } from './routes/analytics.js'
import { loadRuntimeEnv } from './runtimeEnv.js'
import { notifyOperationalAlert } from './alerts.js'

await loadRuntimeEnv()

const app = express()
// 图片 base64 中转上传需要更大 body（单张约数 MB）
app.use(express.json({ limit: '12mb' }))

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, name: 'daykeep', ts: Date.now() })
})
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, name: 'daykeep', ts: Date.now() })
})
app.get('/readyz', async (_req, res) => {
  try {
    await queryOne('SELECT 1 AS ok')
    return res.json({ ok: true, name: 'daykeep-api', database: true, ts: Date.now() })
  } catch (error) {
    console.error('[alert][api] readiness database check failed', error)
    return res.status(503).json({ ok: false, name: 'daykeep-api', database: false, ts: Date.now() })
  }
})

// App 版本检查（轻量无鉴权）
app.get('/api/app/version', (_req, res) => {
  res.json({
    code: 0,
    data: {
      version: process.env.APP_VERSION || '0.1.0',
      desc: process.env.APP_UPDATE_DESC || '',
      downloadUrl: process.env.APP_DOWNLOAD_URL || '',
      forceUpdate: false,
    },
  })
})

app.use('/api/auth', authRouter)
app.use('/api/entries', collaborateRouter)
app.use('/api/entries', entriesRouter)
app.use('/api/upload', uploadRouter)
app.use('/api/capsules', capsuleRouter)
app.use('/api/feedback', feedbackRouter)
app.use('/api/history', historyRouter)
app.use('/api/spaces', spacesRouter)
app.use('/api/quizzes', quizzesRouter)
app.use('/api/daily-questions', dailyQuestionsRouter)
app.use('/api/insights', insightsRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')))

// 官网静态站与 API 同域托管：根路径为 website，/api 为接口。
const websiteDir = path.resolve(process.cwd(), '../website')
// 禁止对外暴露 README、.env、.git 等敏感/非站点文件（安全扫描敏感文件泄露）
const blockedStaticPath =
  /(?:^|\/)(?:readme(?:\.(?:md|txt))?|\.env(?:\..*)?|package(?:-lock)?\.json|tsconfig\.json|\.git(?:\/|$)|\.svn(?:\/|$)|\.idea(?:\/|$)|(?:error|access)\.log|.*\.(?:key|pem|crt|cfg|ini)|web\.config|\.htaccess|\.ds_store)$/i
app.use((req, res, next) => {
  const pathname = (req.path || '').split('?')[0]
  if (blockedStaticPath.test(pathname)) {
    return res.status(404).type('text/plain').send('Not Found')
  }
  return next()
})
app.use(
  express.static(websiteDir, {
    index: 'index.html',
    fallthrough: true,
    dotfiles: 'deny',
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      } else if (/\.(css|js|png|jpg|jpeg|webp|svg|ico)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400')
      }
    },
  }),
)
app.get(['/', '/index.html'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(path.join(websiteDir, 'index.html'))
})

const port = Number(process.env.PORT) || 3000

async function main() {
  try {
    await ensureSchema()
  } catch (e: any) {
    console.error('[alert][api] schema initialization failed:', e?.message || e)
    await notifyOperationalAlert('api-schema-init-failed', 'API 数据库初始化失败', e)
    throw e
  }
  app.listen(port, '0.0.0.0', () => {
    console.log(`[daykeep] listening on 0.0.0.0:${port}`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
