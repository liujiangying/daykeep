import http from 'node:http'
import { ensureSchema, queryOne } from './db.js'
import {
  getReminderSchedulerHealth,
  startReminderScheduler,
} from './reminderScheduler.js'
import { loadRuntimeEnv } from './runtimeEnv.js'
import { notifyOperationalAlert } from './alerts.js'

await loadRuntimeEnv()

const healthPort = Number(process.env.WORKER_HEALTH_PORT || 3001)

async function readiness() {
  const scheduler = getReminderSchedulerHealth()
  try {
    await queryOne('SELECT 1 AS ok')
    return { ok: scheduler.healthy, database: true, scheduler }
  } catch (error) {
    console.error('[alert][reminder-worker] readiness database check failed', error)
    return { ok: false, database: false, scheduler }
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.url === '/healthz') {
    const scheduler = getReminderSchedulerHealth()
    const ok = scheduler.started && !scheduler.stale
    res.statusCode = ok ? 200 : 503
    res.end(JSON.stringify({ ok, name: 'daykeep-reminder-worker', scheduler, ts: Date.now() }))
    return
  }
  if (req.url === '/readyz' || req.url === '/health') {
    const state = await readiness()
    res.statusCode = state.ok ? 200 : 503
    res.end(JSON.stringify({ ...state, name: 'daykeep-reminder-worker', ts: Date.now() }))
    return
  }
  res.statusCode = 404
  res.end(JSON.stringify({ ok: false }))
})

async function main() {
  await ensureSchema()
  await startReminderScheduler({ keepAlive: true })
  server.listen(healthPort, '0.0.0.0', () => {
    console.log(`[reminder-worker] health listening on 0.0.0.0:${healthPort}`)
  })
}

process.on('unhandledRejection', (error) => {
  console.error('[alert][reminder-worker] unhandled rejection', error)
  process.exit(1)
})
process.on('uncaughtException', (error) => {
  console.error('[alert][reminder-worker] uncaught exception', error)
  process.exit(1)
})

main().catch((error) => {
  console.error('[alert][reminder-worker] startup failed', error)
  void notifyOperationalAlert('reminder-worker-startup-failed', '提醒 Worker 启动失败', error)
    .finally(() => process.exit(1))
})
