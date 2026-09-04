import { getPool } from './db.js'

let lastPurgeCheckAt = 0
let purgeInFlight: Promise<number> | null = null

/** 永久清理已超过 7 天恢复期的时光圈及其共同内容。 */
export async function purgeExpiredSpaces(): Promise<number> {
  const now = Date.now()
  if (purgeInFlight) return purgeInFlight
  if (now - lastPurgeCheckAt < 60_000) return 0
  lastPurgeCheckAt = now
  purgeInFlight = runPurgeExpiredSpaces()
  try {
    return await purgeInFlight
  } finally {
    purgeInFlight = null
  }
}

async function runPurgeExpiredSpaces(): Promise<number> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const expired = await client.query<{ id: string }>(
      `SELECT id::text
         FROM t_space
        WHERE purge_at IS NOT NULL AND purge_at <= now()
        FOR UPDATE`,
    )
    const ids = expired.rows.map((row) => row.id)
    if (!ids.length) {
      await client.query('COMMIT')
      return 0
    }
    // 旧邀请审批表没有 ON DELETE CASCADE，必须先清理，否则会阻塞条目删除。
    await client.query(
      `DELETE FROM t_invite_request
        WHERE entry_id IN (SELECT id FROM t_entry WHERE space_id = ANY($1::bigint[]))`,
      [ids],
    )
    await client.query(`DELETE FROM t_entry WHERE space_id = ANY($1::bigint[])`, [ids])
    await client.query(`DELETE FROM t_space WHERE id = ANY($1::bigint[])`, [ids])
    await client.query('COMMIT')
    return ids.length
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
