import { Router } from 'express'
import crypto from 'node:crypto'
import type { PoolClient } from 'pg'
import { getPool, query, queryOne } from '../db.js'
import { attachOptionalAuth, requireAuth } from '../auth.js'
import { daysUntil, normalizeRepeatRule, type RepeatRule } from '../lib/countdown.js'
import { isRateLimited, looksLikeAttackPayload } from '../lib/rateLimit.js'
import { clientMessage } from '../lib/clientError.js'
import { normalizeUserAsset } from '../cos.js'

export const collaborateRouter = Router()

function shanghaiReminderNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0)
  return {
    date: new Date(value('year'), value('month') - 1, value('day')),
    minutes: value('hour') * 60 + value('minute'),
  }
}

/** 分享卡片落地页使用的最小邀请信息；未登录也可查看，只有持有码者能访问。 */
collaborateRouter.get('/collaborate/invite/:inviteCode', async (req, res) => {
  try {
    attachOptionalAuth(req)
    const inviteCode = String(req.params.inviteCode || '').trim()
    if (!inviteCode) return res.status(400).json({ code: 400, msg: '邀请链接无效' })

    const invite = await queryOne<{
      entryId: string
      title: string
      eventDate: string
      inviterNickname: string
      inviterAvatar: string
      expiresAt: string | null
      partnerCount: string
      ownerId: string
      spaceId: string | null
      spaceName: string | null
    }>(
      `SELECT c.entry_id AS "entryId",
              e.title,
              to_char(e.event_date, 'YYYY-MM-DD') AS "eventDate",
              u.nickname AS "inviterNickname",
              u.avatar_url AS "inviterAvatar",
              c.invite_expires_at AS "expiresAt",
              e.user_id AS "ownerId",
              c.target_space_id::text AS "spaceId",
              s.name AS "spaceName",
              (SELECT COUNT(*) FROM t_entry_collaborator p
                WHERE p.entry_id = c.entry_id AND p.role = 'partner')::text AS "partnerCount"
         FROM t_entry_collaborator c
         JOIN t_entry e ON e.id = c.entry_id AND e.deleted = FALSE
         JOIN t_user u ON u.id = c.invited_by
         LEFT JOIN t_space s ON s.id = c.target_space_id AND s.dissolved_at IS NULL
        WHERE c.invite_code = $1 AND c.role = 'pending'`,
      [inviteCode],
    )
    if (!invite) return res.status(404).json({ code: 404, msg: '邀请已失效' })
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
      return res.status(410).json({ code: 410, msg: '邀请已过期，请让对方重新发送' })
    }

    let viewerRole = ''
    if (req.userId) {
      if (Number(invite.ownerId) === req.userId) {
        viewerRole = 'owner'
      } else {
        const member = await queryOne<{ role: string }>(
          `SELECT role FROM t_entry_collaborator
            WHERE entry_id = $1 AND user_id = $2 AND role != 'pending'`,
          [invite.entryId, req.userId],
        )
        viewerRole = member?.role || ''
      }
    }

    return res.json({
      code: 0,
      data: {
        entryId: invite.entryId,
        title: invite.title,
        eventDate: invite.eventDate,
        inviterNickname: invite.inviterNickname || '微信用户',
        inviterAvatar: invite.inviterAvatar || '',
        expiresAt: invite.expiresAt,
        memberCount: Number(invite.partnerCount || 0) + 1,
        maxMembers: null,
        viewerRole,
        spaceId: invite.spaceId || '',
        spaceName: invite.spaceName || '',
      },
    })
  } catch (e: any) {
    console.error('[collaborate/invite-preview]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, '邀请加载失败') })
  }
})

collaborateRouter.use(requireAuth)

/**
 * GET /api/entries/collaborate/my
 * 获取当前用户所有参与共同记录的日子（用于首页显示头像）
 */
collaborateRouter.get('/collaborate/my', async (req, res) => {
  try {
    const rows = await query<{
      entryId: string
      userId: string
      title: string
      nickname: string
      avatarUrl: string
      role: string
    }>(
      `SELECT DISTINCT ON (members."entryId", members."userId")
              members."entryId", members."userId", members.nickname,
              members."avatarUrl", members.role
         FROM (
           SELECT e.id::text AS "entryId", e.user_id::text AS "userId",
                  u.nickname, u.avatar_url AS "avatarUrl", 'owner'::text AS role, 0 AS sort_order
             FROM t_entry e
             JOIN t_user u ON u.id = e.user_id
            WHERE e.deleted = FALSE
              AND (e.user_id = $1 OR EXISTS (
                SELECT 1 FROM t_entry_collaborator mine
                 WHERE mine.entry_id = e.id AND mine.user_id = $1 AND mine.role = 'partner'
              ))
              AND EXISTS (
                SELECT 1 FROM t_entry_collaborator partner
                 WHERE partner.entry_id = e.id AND partner.role = 'partner'
              )
           UNION ALL
           SELECT c.entry_id::text AS "entryId", c.user_id::text AS "userId",
                  u.nickname, u.avatar_url AS "avatarUrl", c.role, 1 AS sort_order
             FROM t_entry_collaborator c
             JOIN t_entry e ON e.id = c.entry_id AND e.deleted = FALSE
             JOIN t_user u ON u.id = c.user_id
            WHERE c.role IN ('owner','partner')
              AND (e.user_id = $1 OR EXISTS (
                SELECT 1 FROM t_entry_collaborator mine
                 WHERE mine.entry_id = e.id AND mine.user_id = $1 AND mine.role = 'partner'
              ))
              AND EXISTS (
                SELECT 1 FROM t_entry_collaborator partner
                 WHERE partner.entry_id = e.id AND partner.role = 'partner'
              )
         ) members
        ORDER BY members."entryId", members."userId", members.sort_order`,
      [req.userId],
    )
    const grouped = new Map<string, Array<{ userId: string; nickname: string; avatarUrl: string; role: string }>>()
    for (const row of rows) {
      const entryId = String(row.entryId)
      const members = grouped.get(entryId) || []
      members.push({
        userId: String(row.userId),
        nickname: row.nickname || '微信用户',
        avatarUrl: row.avatarUrl || '',
        role: row.role,
      })
      grouped.set(entryId, members)
    }
    const result = Object.fromEntries(
      [...grouped.entries()].map(([entryId, members]) => {
        members.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0))
        const partner = members.find((member) => Number(member.userId) !== req.userId) || members[0]
        return [entryId, {
          members,
          partnerNickname: partner?.nickname || '',
          partnerAvatar: partner?.avatarUrl || '',
        }]
      }),
    )
    return res.json({ code: 0, data: result })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * POST /api/entries/:entryId/collaborate/invite
 * 生成邀请码，邀请一个人共同记录这个日子
 */
collaborateRouter.post('/:entryId/collaborate/invite', async (req, res) => {
  try {
    const { entryId } = req.params
    const requestedSpaceId = String(req.body?.spaceId || '').trim()

    // 创建者可以直接生成邀请；其他成员需先走邀请审批流。
    const entry = await queryOne<{ id: string; ownerId: string; ownerType: string; spaceId: string | null }>(
      `SELECT id, user_id AS "ownerId", owner_type AS "ownerType", space_id::text AS "spaceId"
         FROM t_entry
        WHERE id = $1 AND user_id = $2 AND deleted = FALSE AND type = 'anniversary'`,
      [entryId, req.userId],
    )
    if (!entry) return res.status(404).json({ code: 404, msg: '日子不存在' })

    const targetSpaceId = entry.ownerType === 'space' ? String(entry.spaceId || '') : requestedSpaceId
    if (!/^\d+$/.test(targetSpaceId)) {
      return res.status(400).json({ code: 400, msg: '请先选择要同步的共同空间' })
    }
    if (entry.ownerType === 'space' && requestedSpaceId && requestedSpaceId !== targetSpaceId) {
      return res.status(409).json({ code: 409, msg: '这个日子已经属于其他共同空间' })
    }
    const targetSpace = await queryOne<{ id: string; name: string }>(
      `SELECT s.id::text, s.name
         FROM t_space s
         JOIN t_space_member m ON m.space_id = s.id AND m.user_id = $2
        WHERE s.id = $1 AND s.dissolved_at IS NULL`,
      [targetSpaceId, req.userId],
    )
    if (!targetSpace) return res.status(403).json({ code: 403, msg: '你不在这个共同空间中' })

    // 确保日子拥有者自己也在协作者表里（同步 entry 的提醒设置）
    const ownerExists = await queryOne(
      `SELECT 1 FROM t_entry_collaborator WHERE entry_id = $1 AND user_id = $2`,
      [entryId, entry.ownerId],
    )
    if (!ownerExists) {
      await queryOne(
        `INSERT INTO t_entry_collaborator (entry_id, user_id, role, invited_by, remind_enabled, remind_ahead_days, remind_time_minutes, wx_subscribe_accepted)
         SELECT $1, $2, 'owner', $2, remind_enabled, remind_ahead_days, remind_time_minutes,
                wx_subscribe_status IN ('authorized', 'sending')
         FROM t_entry WHERE id = $1
         ON CONFLICT (entry_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
        [entryId, entry.ownerId],
      )
    }

    // 过期邀请不再复用；同一个有效邀请卡片可供空间成员加入，重复接受由唯一索引拦截。
    await query(
      `DELETE FROM t_entry_collaborator
        WHERE entry_id = $1 AND role = 'pending'
          AND (invite_expires_at IS NOT NULL AND invite_expires_at <= now()
               OR target_space_id IS DISTINCT FROM $2::bigint)`,
      [entryId, targetSpaceId],
    )
    await query(
      `UPDATE t_entry_collaborator
          SET invite_expires_at = now() + interval '7 days'
        WHERE entry_id = $1 AND role = 'pending' AND invite_code IS NOT NULL
          AND invite_expires_at IS NULL`,
      [entryId],
    )
    const existing = await queryOne<{ inviteCode: string; expiresAt: string }>(
      `SELECT invite_code AS "inviteCode", invite_expires_at AS "expiresAt"
         FROM t_entry_collaborator
        WHERE entry_id = $1 AND role = 'pending' AND invite_code IS NOT NULL
          AND target_space_id = $2
          AND invite_expires_at > now()
        LIMIT 1`,
      [entryId, targetSpaceId],
    )
    let inviteCode: string
    let expiresAt: string
    if (existing) {
      inviteCode = existing.inviteCode
      expiresAt = existing.expiresAt
    } else {
      inviteCode = crypto.randomBytes(8).toString('hex')
      const created = await queryOne<{ expiresAt: string }>(
        `INSERT INTO t_entry_collaborator
          (entry_id, user_id, role, invite_code, invite_expires_at, target_space_id, invited_by)
         VALUES ($1, NULL, 'pending', $2, now() + interval '7 days', $3, $4)
         RETURNING invite_expires_at AS "expiresAt"`,
        [entryId, inviteCode, targetSpaceId, req.userId],
      )
      expiresAt = created!.expiresAt
    }

    return res.json({ code: 0, data: { inviteCode, entryId, expiresAt, spaceId: targetSpace.id, spaceName: targetSpace.name } })
  } catch (e: any) {
    console.error('[collaborate/invite]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * POST /api/entries/collaborate/join
 * 通过邀请卡片中的安全令牌加入共同记录
 * body: { inviteCode }
 */
collaborateRouter.post('/collaborate/join', async (req, res) => {
  let client: PoolClient | null = null
  try {
    const inviteCode = String(req.body?.inviteCode || '').trim()
    if (!inviteCode) return res.status(400).json({ code: 400, msg: '邀请链接无效' })

    client = await getPool().connect()
    await client.query('BEGIN')

    // 锁定邀请行，避免多人同时加入时突破人数上限。
    const pendingResult = await client.query<{ id: string; entryId: string; invitedBy: string; targetSpaceId: string | null }>(
      `SELECT id, entry_id AS "entryId", invited_by AS "invitedBy", target_space_id::text AS "targetSpaceId"
         FROM t_entry_collaborator
        WHERE invite_code = $1 AND role = 'pending'
          AND (invite_expires_at IS NULL OR invite_expires_at > now())
        FOR UPDATE`,
      [inviteCode],
    )
    const pending = pendingResult.rows[0]
    if (!pending) {
      await client.query('ROLLBACK')
      return res.status(400).json({ code: 400, msg: '邀请已失效或已过期' })
    }

    // 不能邀请自己
    if (Number(pending.invitedBy) === req.userId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ code: 400, msg: '不能邀请自己' })
    }

    if (!pending.targetSpaceId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ code: 400, msg: '邀请缺少共同空间，请让对方重新发送' })
    }
    const targetSpaceResult = await client.query<{ name: string }>(
      `SELECT name FROM t_space WHERE id = $1 AND dissolved_at IS NULL FOR UPDATE`,
      [pending.targetSpaceId],
    )
    if (!targetSpaceResult.rowCount) {
      await client.query('ROLLBACK')
      return res.status(410).json({ code: 410, msg: '对应的共同空间已不存在' })
    }

    // 检查是否已经是协作者
    const existing = await client.query(
      `SELECT 1 FROM t_entry_collaborator WHERE entry_id = $1 AND user_id = $2 AND role != 'pending'`,
      [pending.entryId, req.userId],
    )
    if (existing.rowCount) {
      await client.query('ROLLBACK')
      return res.status(400).json({ code: 400, msg: '你已经在共同记录了' })
    }

    // 插入新的 partner 记录（保留 pending 行供后续人使用）
    const insertedMember = await client.query(
      `INSERT INTO t_entry_collaborator (entry_id, user_id, role, invited_by, joined_at)
       VALUES ($1, $2, 'partner', $3, now())
       ON CONFLICT (entry_id, user_id) WHERE user_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [pending.entryId, req.userId, pending.invitedBy],
    )
    if (!insertedMember.rowCount) {
      await client.query('ROLLBACK')
      return res.status(400).json({ code: 400, msg: '你已经在共同记录了' })
    }

    // 接受这张共同好日子邀请，同时明确加入对应空间；只有到这里才将日子公开到空间。
    await client.query(
      `INSERT INTO t_space_member (space_id, user_id, role, nickname, avatar_url)
       SELECT $1, id, 'member', nickname, avatar_url FROM t_user WHERE id = $2
       ON CONFLICT (space_id, user_id) DO UPDATE SET updated_at = now()`,
      [pending.targetSpaceId, req.userId],
    )
    const moved = await client.query(
      `UPDATE t_entry
          SET owner_type = 'space', space_id = $2, visibility = 'space', updated_at = now()
        WHERE id = $1 AND deleted = FALSE
          AND (owner_type <> 'space' OR space_id = $2)
        RETURNING id`,
      [pending.entryId, pending.targetSpaceId],
    )
    if (!moved.rowCount) {
      await client.query('ROLLBACK')
      return res.status(409).json({ code: 409, msg: '这个日子已经属于其他共同空间' })
    }
    // 这个空间中的既有成员本来就拥有空间可见权限；补齐其日子级提醒席位，默认关闭，
    // 不替任何人代开提醒，也不会覆盖已有个人设置。
    await client.query(
      `INSERT INTO t_entry_collaborator (entry_id, user_id, role, invited_by, joined_at)
       SELECT $1, sm.user_id,
              CASE WHEN sm.user_id = e.user_id THEN 'owner' ELSE 'partner' END,
              e.user_id, sm.joined_at
         FROM t_space_member sm
         JOIN t_entry e ON e.id = $1
        WHERE sm.space_id = $2
       ON CONFLICT (entry_id, user_id) WHERE user_id IS NOT NULL DO NOTHING`,
      [pending.entryId, pending.targetSpaceId],
    )

    // 协作者经审批获得的邀请一次只能加入一人。
    const consumed = await client.query(
      `UPDATE t_invite_request
          SET status = 'consumed', consumed_at = now()
        WHERE invite_code = $1 AND status = 'approved'
        RETURNING id`,
      [inviteCode],
    )
    if (consumed.rowCount) {
      await client.query(`DELETE FROM t_entry_collaborator WHERE id = $1`, [pending.id])
    }

    // 获取日子信息
    const entryResult = await client.query<{ title: string }>(
      `SELECT title FROM t_entry WHERE id = $1`,
      [pending.entryId],
    )
    await client.query('COMMIT')

    return res.json({
      code: 0,
      data: {
        entryId: pending.entryId,
        title: entryResult.rows[0]?.title || '',
        spaceId: pending.targetSpaceId,
        spaceName: targetSpaceResult.rows[0]?.name || '',
      },
    })
  } catch (e: any) {
    if (client) await client.query('ROLLBACK').catch(() => undefined)
    console.error('[collaborate/join]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  } finally {
    client?.release()
  }
})

/**
 * GET /api/entries/:entryId/collaborate
 * 获取某个日子的共同记录信息（协作者 + 回忆数量）
 */
collaborateRouter.get('/:entryId/collaborate', async (req, res) => {
  try {
    const { entryId } = req.params

    const owner = await queryOne<{
      userId: string
      title: string
      nickname: string
      avatarUrl: string
      remindEnabled: boolean
      wxSubscribeStatus: string
      ownerType: string
      spaceId: string | null
    }>(
      `SELECT e.user_id AS "userId", e.title, u.nickname, u.avatar_url AS "avatarUrl",
              e.remind_enabled AS "remindEnabled",
              e.wx_subscribe_status AS "wxSubscribeStatus",
              COALESCE(e.owner_type, 'personal') AS "ownerType",
              e.space_id::text AS "spaceId"
         FROM t_entry e
         JOIN t_user u ON u.id = e.user_id
        WHERE e.id = $1 AND e.deleted = FALSE`,
      [entryId],
    )
    if (!owner) return res.status(404).json({ code: 404, msg: '日子不存在' })

    const requesterIsMember = Number(owner.userId) === req.userId || !!await queryOne(
      `SELECT 1
         FROM t_entry_collaborator
        WHERE entry_id = $1 AND user_id = $2 AND role != 'pending'`,
      [entryId, req.userId],
    )
    if (!requesterIsMember) {
      return res.status(403).json({ code: 403, msg: '无权查看' })
    }

    // 获取协作者列表
    const collaborators = await query<{
      userId: string
      role: string
      joinedAt: string
      nickname: string
      avatarUrl: string
      remindEnabled: boolean
      wxSubscribeStatus: string
    }>(
      `SELECT c.user_id AS "userId", c.role, c.joined_at AS "joinedAt",
              u.nickname, u.avatar_url AS "avatarUrl",
              c.remind_enabled AS "remindEnabled",
              c.wx_subscribe_status AS "wxSubscribeStatus"
         FROM t_entry_collaborator c
         JOIN t_user u ON u.id = c.user_id
        WHERE c.entry_id = $1 AND c.role != 'pending'
        ORDER BY c.joined_at ASC`,
      [entryId],
    )
    if (!collaborators.some((item) => Number(item.userId) === Number(owner.userId))) {
      collaborators.unshift({
        ...owner,
        role: 'owner',
        joinedAt: '',
      })
    } else {
      const ownerMember = collaborators.find((item) => Number(item.userId) === Number(owner.userId))
      if (ownerMember) {
        ownerMember.role = 'owner'
        ownerMember.remindEnabled = owner.remindEnabled
        ownerMember.wxSubscribeStatus = owner.wxSubscribeStatus
      }
    }

    // 回忆数量
    const momentCount = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM t_shared_moment WHERE entry_id = $1`,
      [entryId],
    )

    return res.json({
      code: 0,
      data: {
        title: owner.title,
        ownerType: owner.ownerType,
        spaceId: owner.spaceId,
        collaborators,
        momentCount: Number(momentCount?.count || 0),
        hasPartner: collaborators.some((item) => item.role === 'partner'),
      },
    })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * GET /api/entries/:entryId/collaborate/moments
 * 获取共同回忆列表
 */
collaborateRouter.get('/:entryId/collaborate/moments', async (req, res) => {
  try {
    const { entryId } = req.params

    // 验证是协作者
    const isMember = await queryOne(
      `SELECT 1 FROM t_entry_collaborator WHERE entry_id = $1 AND user_id = $2 AND role != 'pending'`,
      [entryId, req.userId],
    )
    // 或者是日子拥有者
    const isOwner = await queryOne(
      `SELECT 1 FROM t_entry WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
      [entryId, req.userId],
    )
    if (!isMember && !isOwner) {
      return res.status(403).json({ code: 403, msg: '无权查看' })
    }

    const moments = await query(
      `SELECT m.id, m.type, m.body, m.images, m.created_at AS "createdAt",
              m.user_id AS "userId",
              u.nickname AS "authorNickname", u.avatar_url AS "authorAvatar"
         FROM t_shared_moment m
         JOIN t_user u ON u.id = m.user_id
        WHERE m.entry_id = $1
        ORDER BY m.created_at DESC`,
      [entryId],
    )
    return res.json({ code: 0, data: moments })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * POST /api/entries/:entryId/collaborate/moments
 * 添加一条共同回忆（文字/照片）
 * body: { type: 'note'|'photo', body?, images? }
 */
collaborateRouter.post('/:entryId/collaborate/moments', async (req, res) => {
  try {
    const { entryId } = req.params
    const uid = Number(req.userId)

    // 防刷：同一用户全局 / 同一日子 双窗口限流（挡住 TST 等带 token 的扫描）
    if (
      isRateLimited(`moment:user:${uid}`, 20, 60_000) ||
      isRateLimited(`moment:user-hour:${uid}`, 60, 60 * 60_000) ||
      isRateLimited(`moment:entry:${entryId}:user:${uid}`, 10, 60_000)
    ) {
      return res.status(429).json({ code: 429, msg: '操作过于频繁，请稍后再试' })
    }

    // 验证是协作者或拥有者
    const isMember = await queryOne(
      `SELECT 1 FROM t_entry_collaborator WHERE entry_id = $1 AND user_id = $2 AND role != 'pending'`,
      [entryId, req.userId],
    )
    const isOwner = await queryOne(
      `SELECT 1 FROM t_entry WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
      [entryId, req.userId],
    )
    if (!isMember && !isOwner) {
      return res.status(403).json({ code: 403, msg: '无权操作' })
    }

    const { type, body, images } = req.body || {}
    const momentType = type === 'photo' ? 'photo' : 'note'
    const text = String(body || '')
    const imageList = Array.isArray(images)
      ? images
        .map((item) => normalizeUserAsset(item, req.userId!, ['entry']))
        .filter((item): item is string => !!item)
        .slice(0, 9)
      : []

    if (!text.trim() && imageList.length === 0) {
      return res.status(400).json({ code: 400, msg: '请写点什么或添加照片' })
    }
    if (looksLikeAttackPayload(text) || imageList.some((url) => looksLikeAttackPayload(url))) {
      console.warn('[collaborate/moment/create] blocked suspicious payload', {
        userId: uid,
        entryId,
        bodyPreview: text.slice(0, 80),
      })
      return res.status(400).json({ code: 400, msg: '内容无效' })
    }

    const row = await queryOne<{ id: string }>(
      `INSERT INTO t_shared_moment (entry_id, user_id, type, body, images)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [entryId, req.userId, momentType, text.trim(), JSON.stringify(imageList)],
    )
    return res.json({ code: 0, data: { id: row!.id } })
  } catch (e: any) {
    console.error('[collaborate/moment/create]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * DELETE /api/entries/:entryId/collaborate/moments/:momentId
 * 删除自己的回忆
 */
collaborateRouter.delete('/:entryId/collaborate/moments/:momentId', async (req, res) => {
  try {
    await queryOne(
      `DELETE FROM t_shared_moment WHERE id = $1 AND entry_id = $2 AND user_id = $3 RETURNING id`,
      [req.params.momentId, req.params.entryId, req.userId],
    )
    return res.json({ code: 0, data: { ok: true } })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * POST /api/entries/:entryId/collaborate/kick
 * 踢出成员（仅 owner 可操作）
 * body: { userId }
 */
collaborateRouter.post('/:entryId/collaborate/kick', async (req, res) => {
  try {
    const { entryId } = req.params
    const targetUserId = req.body?.userId
    if (!targetUserId) return res.status(400).json({ code: 400, msg: '缺少 userId' })

    // 验证是 owner
    const isOwner = await queryOne(
      `SELECT 1 FROM t_entry WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
      [entryId, req.userId],
    )
    if (!isOwner) return res.status(403).json({ code: 403, msg: '只有创建者可以移除成员' })

    // 不能踢自己
    if (Number(targetUserId) === req.userId) {
      return res.status(400).json({ code: 400, msg: '不能移除自己' })
    }

    const row = await queryOne(
      `DELETE FROM t_entry_collaborator WHERE entry_id = $1 AND user_id = $2 AND role = 'partner' RETURNING id`,
      [entryId, targetUserId],
    )
    if (!row) return res.status(404).json({ code: 404, msg: '该成员不存在' })
    return res.json({ code: 0, data: { ok: true } })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * POST /api/entries/:entryId/collaborate/leave
 * 退出共同记录（partner 退出）
 */
collaborateRouter.post('/:entryId/collaborate/leave', async (req, res) => {
  try {
    const { entryId } = req.params
    const entry = await queryOne<{ ownerType: string }>(
      `SELECT COALESCE(owner_type, 'personal') AS "ownerType"
         FROM t_entry
        WHERE id = $1 AND deleted = FALSE`,
      [entryId],
    )
    if (!entry) return res.status(404).json({ code: 404, msg: '日子不存在' })
    if (entry.ownerType === 'space') {
      return res.status(400).json({ code: 400, msg: '共同空间中的日子不能单独退出' })
    }
    // 只有 partner 可以退出（owner 用 dissolve）
    const row = await queryOne(
      `DELETE FROM t_entry_collaborator WHERE entry_id = $1 AND user_id = $2 AND role = 'partner' RETURNING id`,
      [entryId, req.userId],
    )
    if (!row) return res.status(400).json({ code: 400, msg: '你不是该日子的协作者' })
    return res.json({ code: 0, data: { ok: true } })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * POST /api/entries/:entryId/collaborate/dissolve
 * 解除共同记录（owner 操作，移除所有协作者但保留回忆）
 */
/**
 * GET /api/entries/:entryId/collaborate/remind
 * 获取当前用户在此协作日子的提醒设置
 */
collaborateRouter.get('/:entryId/collaborate/remind', async (req, res) => {
  try {
    const { entryId } = req.params
    const row = await queryOne<{
      remindEnabled: boolean
      remindAheadDays: number
      remindTimeMinutes: number
      wxSubscribeAccepted: boolean
      wxSubscribeStatus: string
      wxSubscribeSentAt: string | null
      wxSubscribeError: string
      wxSubscribeAttempts: number
    }>(
      `SELECT remind_enabled AS "remindEnabled",
              remind_ahead_days AS "remindAheadDays",
              remind_time_minutes AS "remindTimeMinutes",
              wx_subscribe_accepted AS "wxSubscribeAccepted",
              wx_subscribe_status AS "wxSubscribeStatus",
              wx_subscribe_sent_at AS "wxSubscribeSentAt",
              COALESCE(wx_subscribe_error, '') AS "wxSubscribeError",
              COALESCE(wx_subscribe_attempts, 0) AS "wxSubscribeAttempts"
         FROM t_entry_collaborator
        WHERE entry_id = $1 AND user_id = $2 AND role IN ('owner','partner')`,
      [entryId, req.userId],
    )
    if (!row) {
      // fallback: owner 可能不在 collaborator 表里，从 entry 表读
      const ownerReminder = await queryOne(
        `SELECT remind_enabled AS "remindEnabled",
                remind_ahead_days AS "remindAheadDays",
                remind_time_minutes AS "remindTimeMinutes",
                wx_subscribe_status IN ('authorized','sending') AS "wxSubscribeAccepted",
                wx_subscribe_status AS "wxSubscribeStatus",
                wx_subscribe_sent_at AS "wxSubscribeSentAt",
                COALESCE(wx_subscribe_error, '') AS "wxSubscribeError",
                COALESCE(wx_subscribe_attempts, 0) AS "wxSubscribeAttempts"
           FROM t_entry
          WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
        [entryId, req.userId],
      )
      if (!ownerReminder) return res.status(404).json({ code: 404, msg: '未加入此协作' })
      return res.json({ code: 0, data: ownerReminder })
    }
    // 返回所有成员的提醒状态（用于前端展示双方状态）
    const allMembers = await query<{ userId: string; nickname: string; remindEnabled: boolean }>(
      `SELECT c.user_id AS "userId", u.nickname, c.remind_enabled AS "remindEnabled"
         FROM t_entry_collaborator c
         JOIN t_user u ON u.id = c.user_id
        WHERE c.entry_id = $1 AND c.role IN ('owner','partner')`,
      [entryId],
    )
    return res.json({ code: 0, data: { ...row, members: allMembers } })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * POST /api/entries/:entryId/collaborate/remind
 * 设置当前用户在此协作日子的提醒
 * body: { remindEnabled, remindAheadDays?, remindTimeMinutes?, wxSubscribeAccepted? }
 */
collaborateRouter.post('/:entryId/collaborate/remind', async (req, res) => {
  try {
    const { entryId } = req.params
    const b = req.body || {}
    const remindEnabled = !!b.remindEnabled
    const aheadRaw = Number(b.remindAheadDays)
    const timeRaw = Number(b.remindTimeMinutes)
    const remindAheadDays = Number.isFinite(aheadRaw) ? Math.max(0, Math.min(365, Math.floor(aheadRaw))) : 1
    const remindTimeMinutes = Number.isFinite(timeRaw) ? Math.max(0, Math.min(1439, Math.floor(timeRaw))) : 600
    const wxSubscribeAccepted = !!b.wxSubscribeAccepted

    if (remindEnabled) {
      const entry = await queryOne<{
        eventDate: string
        calendar: 'solar' | 'lunar'
        recurring: boolean
        repeatRule: RepeatRule
      }>(
        `SELECT to_char(event_date, 'YYYY-MM-DD') AS "eventDate", calendar, recurring,
                COALESCE(repeat_rule, 'none') AS "repeatRule"
           FROM t_entry
          WHERE id = $1 AND deleted = FALSE`,
        [entryId],
      )
      if (!entry) return res.status(404).json({ code: 404, msg: '日子不存在' })
      const now = shanghaiReminderNow()
      const remaining = daysUntil(
        entry.eventDate,
        normalizeRepeatRule(entry),
        now.date,
        entry.calendar === 'lunar' ? 'lunar' : 'solar',
      )
      const scheduledDayOffset = remaining - remindAheadDays
      if (remaining < 0 || scheduledDayOffset < 0 || (scheduledDayOffset === 0 && remindTimeMinutes <= now.minutes)) {
        return res.status(400).json({
          code: 400,
          msg: '这个提醒时间已经过去，请减少提前天数或选择更晚的时间',
        })
      }
      if (b.validateOnly === true) {
        return res.json({ code: 0, data: { valid: true } })
      }
    }

    const updated = await queryOne<{ role: string }>(
      `UPDATE t_entry_collaborator
          SET remind_enabled = $3,
              remind_ahead_days = $4,
              remind_time_minutes = $5,
              wx_subscribe_accepted = $6,
              wx_subscribe_status = CASE WHEN $6 THEN 'authorized' ELSE 'none' END,
              wx_subscribe_sent_at = CASE WHEN $6 THEN NULL ELSE wx_subscribe_sent_at END,
              wx_subscribe_error = '',
              wx_subscribe_attempts = CASE WHEN $6 THEN 0 ELSE wx_subscribe_attempts END,
              wx_subscribe_last_attempt_at = CASE WHEN $6 THEN NULL ELSE wx_subscribe_last_attempt_at END
        WHERE entry_id = $1 AND user_id = $2 AND role IN ('owner','partner')
        RETURNING role`,
      [entryId, req.userId, remindEnabled, remindAheadDays, remindTimeMinutes, wxSubscribeAccepted],
    )
    const requesterOwnsEntry = !!await queryOne(
      `SELECT 1 FROM t_entry WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
      [entryId, req.userId],
    )
    if (!updated && !requesterOwnsEntry) return res.status(404).json({ code: 404, msg: '未加入此协作' })
    if (updated?.role === 'owner' || requesterOwnsEntry) {
      await query(
        `UPDATE t_entry
            SET remind_enabled = $3,
                remind_ahead_days = $4,
                remind_time_minutes = $5,
                wx_subscribe_status = CASE WHEN $6 THEN 'authorized' ELSE 'none' END,
                wx_subscribe_sent_at = CASE WHEN $6 THEN NULL ELSE wx_subscribe_sent_at END,
                wx_subscribe_error = '',
                wx_subscribe_attempts = CASE WHEN $6 THEN 0 ELSE wx_subscribe_attempts END,
                wx_subscribe_last_attempt_at = CASE WHEN $6 THEN NULL ELSE wx_subscribe_last_attempt_at END,
                updated_at = now()
          WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
        [entryId, req.userId, remindEnabled, remindAheadDays, remindTimeMinutes, wxSubscribeAccepted],
      )
    }
    return res.json({ code: 0, data: { ok: true } })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

collaborateRouter.post('/:entryId/collaborate/dissolve', async (req, res) => {
  try {
    const { entryId } = req.params
    // 验证是 owner
    const isOwner = await queryOne<{ ownerType: string }>(
      `SELECT COALESCE(owner_type, 'personal') AS "ownerType"
         FROM t_entry
        WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
      [entryId, req.userId],
    )
    if (!isOwner) return res.status(403).json({ code: 403, msg: '只有日子创建者可以解除' })
    if (isOwner.ownerType === 'space') {
      return res.status(400).json({ code: 400, msg: '共同空间中的日子请由创建者删除' })
    }
    // 删除所有协作者记录
    await queryOne(`DELETE FROM t_entry_collaborator WHERE entry_id = $1`, [entryId])
    return res.json({ code: 0, data: { ok: true } })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

// ─── 邀请审批流 ───────────────────────────────────────────────

/** 协作者查询自己最近一次邀请审批状态。 */
collaborateRouter.get('/:entryId/collaborate/invite-request/status', async (req, res) => {
  try {
    const { entryId } = req.params
    const isPartner = await queryOne(
      `SELECT 1 FROM t_entry_collaborator
        WHERE entry_id = $1 AND user_id = $2 AND role = 'partner'`,
      [entryId, req.userId],
    )
    if (!isPartner) return res.status(403).json({ code: 403, msg: '你不是这个日子的协作者' })

    const latest = await queryOne<{
      id: string
      status: string
      inviteCode: string | null
      expiresAt: string | null
    }>(
      `SELECT r.id::text AS id, r.status, r.invite_code AS "inviteCode",
              c.invite_expires_at AS "expiresAt"
         FROM t_invite_request r
         LEFT JOIN t_entry_collaborator c ON c.invite_code = r.invite_code AND c.role = 'pending'
        WHERE r.entry_id = $1 AND r.requester_id = $2
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 1`,
      [entryId, req.userId],
    )
    let status = latest?.status || 'none'
    if (status === 'approved' && (!latest?.inviteCode || !latest.expiresAt || new Date(latest.expiresAt).getTime() <= Date.now())) {
      status = 'expired'
    }
    return res.json({
      code: 0,
      data: {
        requestId: latest?.id || '',
        status,
        inviteCode: status === 'approved' ? latest?.inviteCode || '' : '',
      },
    })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * POST /api/entries/:entryId/collaborate/invite-request
 * Partner 发起邀请请求（需 owner 审批）
 */
collaborateRouter.post('/:entryId/collaborate/invite-request', async (req, res) => {
  try {
    const { entryId } = req.params

    // 确认发起人是这个日子的 partner（或 owner）
    const isMember = await queryOne(
      `SELECT 1 FROM t_entry_collaborator WHERE entry_id = $1 AND user_id = $2 AND role IN ('owner', 'partner')`,
      [entryId, req.userId],
    )
    // owner 也可以直接在这里检查
    const isOwner = await queryOne(
      `SELECT 1 FROM t_entry WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
      [entryId, req.userId],
    )
    if (!isMember && !isOwner) {
      return res.status(403).json({ code: 403, msg: '你不是这个日子的成员' })
    }

    // owner 直接走原有 invite 接口，不需要审批
    if (isOwner) {
      return res.status(400).json({ code: 400, msg: '你是创建者，请直接使用邀请功能' })
    }

    // 创建者已批准过的成员，再次点击「+」时返回有效邀请卡。
    const approved = await queryOne<{ requestId: string; inviteCode: string }>(
      `SELECT r.id::text AS "requestId", c.invite_code AS "inviteCode"
         FROM t_invite_request r
         JOIN t_entry_collaborator c ON c.invite_code = r.invite_code
          AND c.role = 'pending'
          AND (c.invite_expires_at IS NULL OR c.invite_expires_at > now())
        WHERE r.entry_id = $1 AND r.requester_id = $2 AND r.status = 'approved'
        ORDER BY r.resolved_at DESC NULLS LAST
        LIMIT 1`,
      [entryId, req.userId],
    )
    if (approved) {
      return res.json({ code: 0, data: { status: 'approved', requestId: approved.requestId, inviteCode: approved.inviteCode } })
    }

    // 检查是否已有 pending 请求
    const existingReq = await queryOne<{ id: string }>(
      `SELECT id::text AS id FROM t_invite_request WHERE entry_id = $1 AND requester_id = $2 AND status = 'pending'`,
      [entryId, req.userId],
    )
    if (existingReq) {
      return res.json({ code: 0, data: { status: 'pending', requestId: existingReq.id, msg: '已在等待创建者审批' } })
    }

    const createdRequest = await queryOne<{ id: string }>(
      `INSERT INTO t_invite_request (entry_id, requester_id) VALUES ($1, $2)
       RETURNING id::text AS id`,
      [entryId, req.userId],
    )

    return res.json({ code: 0, data: { status: 'pending', requestId: createdRequest?.id || '', msg: '邀请请求已发送，等待创建者审批' } })
  } catch (e: any) {
    console.error('[collaborate/invite-request]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * GET /api/entries/:entryId/collaborate/invite-requests
 * Owner 查看待审批的邀请请求
 */
collaborateRouter.get('/:entryId/collaborate/invite-requests', async (req, res) => {
  try {
    const { entryId } = req.params

    // 只有 owner 能看
    const isOwner = await queryOne(
      `SELECT 1 FROM t_entry WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
      [entryId, req.userId],
    )
    if (!isOwner) return res.status(403).json({ code: 403, msg: '无权限' })

    const rows = await query(
      `SELECT r.id, r.requester_id AS "requesterId", r.status, r.created_at AS "createdAt",
              u.nickname AS "requesterNickname", u.avatar_url AS "requesterAvatar"
         FROM t_invite_request r
         JOIN t_user u ON u.id = r.requester_id
        WHERE r.entry_id = $1
        ORDER BY r.created_at DESC`,
      [entryId],
    )

    return res.json({ code: 0, data: rows })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * POST /api/entries/:entryId/collaborate/invite-requests/:requestId/approve
 * Owner 批准邀请请求 → 自动生成邀请码
 */
collaborateRouter.post('/:entryId/collaborate/invite-requests/:requestId/approve', async (req, res) => {
  try {
    const { entryId, requestId } = req.params

    // 只有 owner 能操作
    const isOwner = await queryOne(
      `SELECT 1 FROM t_entry WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
      [entryId, req.userId],
    )
    if (!isOwner) return res.status(403).json({ code: 403, msg: '无权限' })

    // 获取请求
    const invReq = await queryOne<{ id: string; requesterId: string; status: string }>(
      `SELECT id, requester_id AS "requesterId", status FROM t_invite_request WHERE id = $1 AND entry_id = $2`,
      [requestId, entryId],
    )
    if (!invReq) return res.status(404).json({ code: 404, msg: '请求不存在' })
    if (invReq.status !== 'pending') return res.status(400).json({ code: 400, msg: '该请求已处理' })

    // 每次批准生成一张专属、单次使用的 7 天邀请卡。
    const inviteCode = crypto.randomBytes(8).toString('hex')
    await queryOne(
      `INSERT INTO t_entry_collaborator
        (entry_id, user_id, role, invite_code, invite_expires_at, target_space_id, invited_by)
       SELECT $1, NULL, 'pending', $2, now() + interval '7 days', e.space_id, $3
         FROM t_entry e
        WHERE e.id = $1 AND e.owner_type = 'space' AND e.space_id IS NOT NULL`,
      [entryId, inviteCode, invReq.requesterId],
    )
    await queryOne(
      `UPDATE t_invite_request
          SET status = 'approved', resolved_at = now(), resolved_by = $3, invite_code = $4
        WHERE id = $1 AND entry_id = $2`,
      [requestId, entryId, req.userId, inviteCode],
    )

    return res.json({ code: 0, data: { inviteCode, msg: '已同意，对方可以发送邀请了' } })
  } catch (e: any) {
    console.error('[collaborate/approve]', e)
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})

/**
 * POST /api/entries/:entryId/collaborate/invite-requests/:requestId/reject
 * Owner 拒绝邀请请求
 */
collaborateRouter.post('/:entryId/collaborate/invite-requests/:requestId/reject', async (req, res) => {
  try {
    const { entryId, requestId } = req.params

    const isOwner = await queryOne(
      `SELECT 1 FROM t_entry WHERE id = $1 AND user_id = $2 AND deleted = FALSE`,
      [entryId, req.userId],
    )
    if (!isOwner) return res.status(403).json({ code: 403, msg: '无权限' })

    const invReq = await queryOne<{ status: string }>(
      `SELECT status FROM t_invite_request WHERE id = $1 AND entry_id = $2`,
      [requestId, entryId],
    )
    if (!invReq) return res.status(404).json({ code: 404, msg: '请求不存在' })
    if (invReq.status !== 'pending') return res.status(400).json({ code: 400, msg: '该请求已处理' })

    await queryOne(
      `UPDATE t_invite_request SET status = 'rejected', resolved_at = now(), resolved_by = $3 WHERE id = $1 AND entry_id = $2`,
      [requestId, entryId, req.userId],
    )

    return res.json({ code: 0, data: { msg: '已拒绝' } })
  } catch (e: any) {
    return res.status(500).json({ code: 500, msg: clientMessage(e, 'failed') })
  }
})
