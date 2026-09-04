import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { query } from '../db.js'

export const analyticsRouter = Router()
analyticsRouter.use(requireAuth)

const ALLOWED_EVENTS = new Set([
  'onboarding_viewed',
  'onboarding_skipped',
  'onboarding_personal_selected',
  'onboarding_private_space_selected',
  'official_space_joined',
  'official_space_left',
  'official_personal_write_started',
  'official_public_write_started',
])

analyticsRouter.post('/events', async (req, res) => {
  try {
    const eventName = String(req.body?.eventName || '').trim()
    if (!ALLOWED_EVENTS.has(eventName)) return res.status(400).json({ code: 400, msg: 'invalid event' })
    const source = req.body?.properties
    const properties = source && typeof source === 'object' && !Array.isArray(source)
      ? Object.fromEntries(Object.entries(source).slice(0, 12).map(([key, value]) => [
        String(key).slice(0, 40),
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? typeof value === 'string' ? value.slice(0, 120) : value
          : null,
      ]))
      : {}
    await query(
      `INSERT INTO t_product_event (user_id, event_name, properties) VALUES ($1, $2, $3::jsonb)`,
      [req.userId, eventName, JSON.stringify(properties)],
    )
    return res.json({ code: 0, data: { ok: true } })
  } catch (error) {
    console.error('[analytics/event]', error)
    return res.status(500).json({ code: 500, msg: 'failed' })
  }
})
