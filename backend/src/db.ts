import pg from 'pg'

const { Pool } = pg

let pool: pg.Pool | null = null

/** 支持 DATABASE_URL，或拆分的 PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DATABASE。 */
export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const host = process.env.PG_HOST
  const user = process.env.PG_USER
  const password = process.env.PG_PASSWORD
  const database = process.env.PG_DATABASE || 'daykeep'
  const port = process.env.PG_PORT || '5432'
  if (host && user && password) {
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`
  }
  throw new Error('DATABASE_URL or PG_HOST/PG_USER/PG_PASSWORD required')
}

export function getPool(): pg.Pool {
  if (pool) return pool
  pool = new Pool({
    connectionString: resolveDatabaseUrl(),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })
  pool.on('error', (err) => {
    console.warn('[pg pool] background error:', err.message)
  })
  return pool
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params)
  return res.rows
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

/**
 * 一次性迁移。两个必须成立的性质：
 *
 * 1. 标记与执行在同一个事务里。之前是先 INSERT 占位（自动提交）再执行 SQL，
 *    进程在两者之间被 SIGKILL / OOM 杀掉就会留下占位记录，
 *    补偿的 DELETE 永远不会执行，这条迁移从此被永久跳过且无任何报错。
 *    现在崩溃会连标记一起回滚，下次启动重跑。
 * 2. 抢不到的进程要等，不能直接返回。之前 rowCount 为 0 就 return，
 *    那些实例会在迁移还没跑完时就开始对外服务，读到半回填状态的数据。
 *    现在用 advisory lock 让它们阻塞到迁移完成为止。
 *
 * 注意 sql 会在事务中执行，因此不能传 CREATE INDEX CONCURRENTLY 这类
 * 不允许出现在事务里的语句（那类语句走 buildIndexesInBackground）。
 */
async function runOnce(p: pg.Pool, key: string, sql: string): Promise<void> {
  const client = await p.connect()
  let unlockFailed = false
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext($1)::bigint)`, [key])
    const done = await client.query(
      `SELECT 1 FROM t_schema_migration WHERE key = $1 AND completed_at IS NOT NULL`,
      [key],
    )
    if (done.rowCount) return
    await client.query('BEGIN')
    try {
      // 迁移必须能快速失败：滚动发布时老实例还在写这些表，没有超时的话
      // DDL 会一直等锁，而 ensureSchema 没返回前 app.listen 不会执行，
      // 一个卡住的实例会让后续每个新实例都堵在 advisory lock 上，整队起不来。
      await client.query(`SET LOCAL lock_timeout = '5s'`)
      await client.query(`SET LOCAL statement_timeout = '60s'`)
      await client.query(
        `INSERT INTO t_schema_migration (key, completed_at) VALUES ($1, now())
         ON CONFLICT (key) DO UPDATE SET completed_at = now()`,
        [key],
      )
      await client.query(sql)
      await client.query('COMMIT')
      console.log(`[db] migration applied: ${key}`)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    }
  } finally {
    // advisory lock 是会话级的。解锁失败却把连接放回池子，这条连接会一直
    // 持有锁，之后同 key 的 runOnce 会无限等待，所以解锁失败就销毁连接。
    try {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1)::bigint)`, [key])
    } catch (error) {
      unlockFailed = true
      console.error(`[db] advisory unlock failed for ${key}`, error)
    }
    client.release(unlockFailed ? new Error(`advisory unlock failed: ${key}`) : undefined)
  }
}

/**
 * 数据回填/整理类迁移用这个：失败只记日志，不让 ensureSchema 抛。
 *
 * ensureSchema 失败会 process.exit(1)（index.ts），而 runOnce 出错时会连
 * 完成标记一起回滚，于是每次重启都以同样的方式失败——一个跑不过的回填会把
 * 整个 API 拖进崩溃循环。建表和加列必须成功，但历史数据整理不该有这个权力。
 */
async function runOnceBestEffort(p: pg.Pool, key: string, sql: string): Promise<void> {
  try {
    await runOnce(p, key, sql)
  } catch (error) {
    console.error(`[db] migration skipped (will retry next boot): ${key}`, error)
  }
}

/**
 * 大表索引用 CONCURRENTLY 构建，且不阻塞启动。
 * CONCURRENTLY 不能出现在事务或多语句查询中，因此必须单独发送。
 */
type BackgroundIndex = { name: string; create: string }

const BACKGROUND_INDEXES: BackgroundIndex[] = [
  {
    name: 'idx_entry_space',
    create: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entry_space
               ON t_entry (space_id, deleted, event_date)
               WHERE space_id IS NOT NULL`,
  },
]

/**
 * CREATE INDEX CONCURRENTLY 失败（超时、死锁、构建期间被中断）不会回滚，
 * 而是留下一个 indisvalid = false 的残索引。它最坑的地方是不会自愈：
 * 查询规划器不用它，写入却要维护它，而下次启动的 IF NOT EXISTS 看见同名
 * 对象就直接跳过——于是这个只有代价没有收益的索引会永久留在库里。
 *
 * 所以建之前先按 pg_index.indisvalid 检查，发现残索引就 DROP 掉重建。
 */
async function dropInvalidIndex(p: pg.Pool, name: string): Promise<void> {
  const invalid = await p.query(
    `SELECT 1
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = $1
        AND n.nspname = ANY (current_schemas(FALSE))
        AND i.indisvalid = FALSE`,
    [name],
  )
  if (!invalid.rowCount) return
  console.warn(`[db] dropping invalid index: ${name}`)
  // DROP ... CONCURRENTLY 不能在事务块里执行，这里用的是池连接的隐式事务，没问题。
  await p.query(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`)
}

function buildIndexesInBackground(p: pg.Pool): void {
  void (async () => {
    for (const index of BACKGROUND_INDEXES) {
      try {
        await dropInvalidIndex(p, index.name)
        await p.query(index.create)
      } catch (error: any) {
        // 索引缺失只影响查询性能，不应让服务起不来。
        console.error(`[db] background index build failed (${index.name}):`, error?.message || error)
      }
    }
  })()
}

export async function ensureSchema(): Promise<void> {
  const p = getPool()
  await p.query(`
    CREATE TABLE IF NOT EXISTS t_schema_migration (
      key        TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE t_schema_migration ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
  `)
  await p.query(`
    CREATE TABLE IF NOT EXISTS t_user (
      id            BIGSERIAL PRIMARY KEY,
      openid        VARCHAR(64) NOT NULL UNIQUE,
      union_id      VARCHAR(64),
      nickname      VARCHAR(64) NOT NULL DEFAULT '微信用户',
      avatar_url    VARCHAR(512) NOT NULL DEFAULT '',
      prefs         JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_user_openid ON t_user (openid);

    CREATE TABLE IF NOT EXISTS t_entry (
      id                 BIGSERIAL PRIMARY KEY,
      user_id            BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      type               VARCHAR(16) NOT NULL,
      title              VARCHAR(128) NOT NULL DEFAULT '',
      body               TEXT NOT NULL DEFAULT '',
      event_date         DATE NOT NULL,
      calendar           VARCHAR(8) NOT NULL DEFAULT 'solar',
      recurring          BOOLEAN NOT NULL DEFAULT FALSE,
      repeat_rule        VARCHAR(16) NOT NULL DEFAULT 'none',
      pinned             BOOLEAN NOT NULL DEFAULT FALSE,
      show_in_timeline   BOOLEAN NOT NULL DEFAULT TRUE,
      remind_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
      remind_ahead_days  SMALLINT NOT NULL DEFAULT 1,
      remind_time_minutes SMALLINT NOT NULL DEFAULT 600,
      wx_subscribe_status VARCHAR(16) NOT NULL DEFAULT 'none',
      wx_subscribe_authorized_at TIMESTAMPTZ,
      wx_subscribe_sent_at TIMESTAMPTZ,
      wx_subscribe_last_attempt_at TIMESTAMPTZ,
      wx_subscribe_attempts SMALLINT NOT NULL DEFAULT 0,
      wx_subscribe_error TEXT NOT NULL DEFAULT '',
      todo_status        VARCHAR(16),
      color              VARCHAR(16) NOT NULL DEFAULT '',
      event_at           TIMESTAMPTZ,
      images             TEXT NOT NULL DEFAULT '[]',
      background_url     VARCHAR(512) NOT NULL DEFAULT '',
      location           VARCHAR(256) NOT NULL DEFAULT '',
      client_request_id  VARCHAR(64),
      deleted            BOOLEAN NOT NULL DEFAULT FALSE,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_entry_type CHECK (type IN ('anniversary', 'todo', 'diary'))
    );
    CREATE INDEX IF NOT EXISTS idx_entry_user
      ON t_entry (user_id, deleted, event_date);
    CREATE INDEX IF NOT EXISTS idx_entry_remind
      ON t_entry (user_id, deleted, remind_enabled)
      WHERE remind_enabled = TRUE;

    -- 系统示例只为每位用户创建一次。记录独立于 t_entry，
    -- 因此用户删除示例、清缓存或更换设备后也不会再次补种。
    CREATE TABLE IF NOT EXISTS t_user_seed_state (
      user_id    BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      seed       VARCHAR(64) NOT NULL,
      seeded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, seed)
    );
    CREATE INDEX IF NOT EXISTS idx_user_seed_state_user
      ON t_user_seed_state (user_id);

    CREATE TABLE IF NOT EXISTS t_product_event (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      event_name  VARCHAR(64) NOT NULL,
      properties  JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_product_event_name_time
      ON t_product_event (event_name, created_at DESC);
  `)

  // 补 phone 字段（手机号登录）
  await p.query(`
    ALTER TABLE t_user ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_phone ON t_user (phone) WHERE phone IS NOT NULL AND phone <> '';
  `)

  // 一个业务用户可以拥有多个登录身份。微信小程序与移动 App 的 openid 不同，
  // 通过同一微信开放平台下的 unionid 归并到同一个 t_user，业务数据无需复制。
  await p.query(`
    CREATE TABLE IF NOT EXISTS t_user_identity (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      provider    VARCHAR(32) NOT NULL,
      subject     VARCHAR(128) NOT NULL,
      union_id    VARCHAR(128),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (provider, subject)
    );
    CREATE INDEX IF NOT EXISTS idx_user_identity_user
      ON t_user_identity (user_id);
    CREATE INDEX IF NOT EXISTS idx_user_identity_union
      ON t_user_identity (union_id)
      WHERE union_id IS NOT NULL AND union_id <> '';

    -- unionid 是跨微信端归并账号的唯一锚点。单独映射可让同一用户的
    -- wechat_mp / wechat_app 两条身份共享 unionid，同时保持全局唯一归属。
    CREATE TABLE IF NOT EXISTS t_wechat_union (
      union_id    VARCHAR(128) PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_wechat_union_user
      ON t_wechat_union (user_id);

    -- 兼容既有库：当前历史微信账号均来自小程序；phone_ 前缀是旧手机号账号。
    INSERT INTO t_user_identity (user_id, provider, subject, union_id)
    SELECT id,
           CASE WHEN openid LIKE 'phone\\_%' ESCAPE '\\' THEN 'phone' ELSE 'wechat_mp' END,
           CASE WHEN openid LIKE 'phone\\_%' ESCAPE '\\' THEN substring(openid FROM 7) ELSE openid END,
           NULLIF(union_id, '')
      FROM t_user
    ON CONFLICT (provider, subject) DO UPDATE
       SET union_id = COALESCE(EXCLUDED.union_id, t_user_identity.union_id),
           updated_at = now();

    -- 若历史脏数据中相同 unionid 出现多次，先稳定指向最早的用户；不在启动
    -- 迁移中自动搬动业务数据，避免误合并。后续登录都会复用该唯一归属。
    INSERT INTO t_wechat_union (union_id, user_id)
    SELECT union_id, min(id)
      FROM t_user
     WHERE union_id IS NOT NULL AND union_id <> ''
     GROUP BY union_id
    ON CONFLICT (union_id) DO NOTHING;
  `)

  // 兼容旧库：补昵称/头像列（新建表已含；IF NOT EXISTS 对已有库幂等）
  await p.query(`
    ALTER TABLE t_user ADD COLUMN IF NOT EXISTS nickname VARCHAR(64) NOT NULL DEFAULT '微信用户';
    ALTER TABLE t_user ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512) NOT NULL DEFAULT '';
  `)

  // 兼容已有库：补列 + 从 recurring 迁移；空昵称回填默认「微信用户」
  await p.query(`
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS repeat_rule VARCHAR(16) NOT NULL DEFAULT 'none';
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS images TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS background_url VARCHAR(512) NOT NULL DEFAULT '';
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS location VARCHAR(256) NOT NULL DEFAULT '';
    -- 地点坐标。可空而不是默认 0：0,0 是几内亚湾里的一个真实坐标，
    -- 用它当「没有坐标」的哨兵值会让历史数据在地图上全部堆到那里。
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS wx_subscribe_status VARCHAR(16) NOT NULL DEFAULT 'none';
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS wx_subscribe_authorized_at TIMESTAMPTZ;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS wx_subscribe_sent_at TIMESTAMPTZ;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS wx_subscribe_last_attempt_at TIMESTAMPTZ;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS wx_subscribe_attempts SMALLINT NOT NULL DEFAULT 0;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS wx_subscribe_error TEXT NOT NULL DEFAULT '';
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS remind_time_minutes SMALLINT NOT NULL DEFAULT 600;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(64);
    UPDATE t_entry SET remind_time_minutes = 600
      WHERE remind_time_minutes IS NULL OR remind_time_minutes < 0 OR remind_time_minutes > 1439;
    -- 创建幂等：同一用户同一 client_request_id 只能落一条（含已软删，避免重试再插）
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entry_user_client_request
      ON t_entry (user_id, client_request_id)
      WHERE client_request_id IS NOT NULL AND btrim(client_request_id) <> '';
    UPDATE t_entry
       SET repeat_rule = 'yearly'
     WHERE recurring = TRUE AND (repeat_rule IS NULL OR repeat_rule = 'none');
    CREATE INDEX IF NOT EXISTS idx_entry_wx_subscribe
      ON t_entry (wx_subscribe_status, remind_enabled, deleted)
      WHERE wx_subscribe_status = 'authorized' AND remind_enabled = TRUE AND deleted = FALSE;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS owner_type VARCHAR(16) NOT NULL DEFAULT 'personal';
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS space_id BIGINT;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) NOT NULL DEFAULT 'private';
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS entry_kind VARCHAR(24) NOT NULL DEFAULT 'normal';
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS commitment_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
    -- owner_type/visibility/entry_kind 的历史回填改为一次性迁移（见 runOnce），
    -- 不在每次进程启动时全表扫描 t_entry。
    ALTER TABLE t_user ALTER COLUMN nickname SET DEFAULT '微信用户';
    ALTER TABLE t_user ADD COLUMN IF NOT EXISTS prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
    -- 会话版本：登录/登出递增后，旧 JWT 即使未过期也全部失效（防扫描复用泄漏 token）
    ALTER TABLE t_user ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
    UPDATE t_user SET nickname = '微信用户' WHERE nickname IS NULL OR btrim(nickname) = '';
  `)

  // V2 时光圈最小模型。第一版只需要 owner/member 两级角色。
  await p.query(`
    CREATE TABLE IF NOT EXISTS t_space (
      id               BIGSERIAL PRIMARY KEY,
      owner_id         BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      name             VARCHAR(128) NOT NULL,
      type             VARCHAR(16) NOT NULL DEFAULT 'pair',
      cover_url        VARCHAR(512) NOT NULL DEFAULT '',
      keywords         JSONB NOT NULL DEFAULT '[]'::jsonb,
      dissolved_at     TIMESTAMPTZ,
      dissolved_by     BIGINT REFERENCES t_user(id) ON DELETE SET NULL,
      dissolved_by_name VARCHAR(64) NOT NULL DEFAULT '',
      purge_at          TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_space_type CHECK (type IN ('pair', 'group'))
    );
    CREATE INDEX IF NOT EXISTS idx_space_owner ON t_space (owner_id, created_at DESC);
    ALTER TABLE t_space ADD COLUMN IF NOT EXISTS dissolved_at TIMESTAMPTZ;
    ALTER TABLE t_space ADD COLUMN IF NOT EXISTS dissolved_by BIGINT REFERENCES t_user(id) ON DELETE SET NULL;
    ALTER TABLE t_space ADD COLUMN IF NOT EXISTS dissolved_by_name VARCHAR(64) NOT NULL DEFAULT '';
    ALTER TABLE t_space ADD COLUMN IF NOT EXISTS purge_at TIMESTAMPTZ;
    -- 公开体验圈与亲友圈是不同的访问模型。type 继续描述关系形态，
    -- access_type / join_policy / post_policy 分别描述可见性、加入和发布权限。
    ALTER TABLE t_space ADD COLUMN IF NOT EXISTS access_type VARCHAR(16) NOT NULL DEFAULT 'private';
    ALTER TABLE t_space ADD COLUMN IF NOT EXISTS join_policy VARCHAR(16) NOT NULL DEFAULT 'invite';
    ALTER TABLE t_space ADD COLUMN IF NOT EXISTS post_policy VARCHAR(16) NOT NULL DEFAULT 'members';
    ALTER TABLE t_space ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE t_space ADD COLUMN IF NOT EXISTS official_key VARCHAR(64);
    CREATE INDEX IF NOT EXISTS idx_space_purge_at ON t_space (purge_at) WHERE purge_at IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_space_official_key
      ON t_space (official_key) WHERE official_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS t_space_member (
      id          BIGSERIAL PRIMARY KEY,
      space_id    BIGINT NOT NULL REFERENCES t_space(id) ON DELETE CASCADE,
      user_id     BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      role        VARCHAR(16) NOT NULL DEFAULT 'member',
      nickname    VARCHAR(64) NOT NULL DEFAULT '',
      avatar_url  VARCHAR(512) NOT NULL DEFAULT '',
      mood        VARCHAR(32) NOT NULL DEFAULT '',
      joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_space_member_role CHECK (role IN ('owner', 'member')),
      UNIQUE (space_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_space_member_user ON t_space_member (user_id, joined_at DESC);
    ALTER TABLE t_space_member ADD COLUMN IF NOT EXISTS posting_blocked_at TIMESTAMPTZ;
    ALTER TABLE t_space_member ADD COLUMN IF NOT EXISTS posting_blocked_by BIGINT REFERENCES t_user(id) ON DELETE SET NULL;
    ALTER TABLE t_space_member ADD COLUMN IF NOT EXISTS posting_block_reason VARCHAR(240) NOT NULL DEFAULT '';
    ALTER TABLE t_space_member DROP CONSTRAINT IF EXISTS chk_space_member_role;
    ALTER TABLE t_space_member ADD CONSTRAINT chk_space_member_role CHECK (role IN ('owner', 'admin', 'member'));

    CREATE TABLE IF NOT EXISTS t_space_content_report (
      id          BIGSERIAL PRIMARY KEY,
      space_id    BIGINT NOT NULL REFERENCES t_space(id) ON DELETE CASCADE,
      entry_id    BIGINT NOT NULL REFERENCES t_entry(id) ON DELETE CASCADE,
      reporter_id BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      reason      VARCHAR(240) NOT NULL DEFAULT '',
      status      VARCHAR(16) NOT NULL DEFAULT 'pending',
      resolved_by BIGINT REFERENCES t_user(id) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (entry_id, reporter_id)
    );
    CREATE INDEX IF NOT EXISTS idx_space_content_report_pending
      ON t_space_content_report (space_id, created_at DESC) WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS t_mood_history (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      mood_date   DATE NOT NULL,
      mood        VARCHAR(32) NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_mood_history_value CHECK (
        mood IN ('sunny', 'cloudy', 'rainy', 'storm', 'rainbow') OR mood LIKE 'custom:%'
      ),
      UNIQUE (user_id, mood_date)
    );
    CREATE INDEX IF NOT EXISTS idx_mood_history_user_date ON t_mood_history (user_id, mood_date DESC);

    CREATE TABLE IF NOT EXISTS t_space_invite (
      id          BIGSERIAL PRIMARY KEY,
      space_id    BIGINT NOT NULL REFERENCES t_space(id) ON DELETE CASCADE,
      created_by  BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      code        VARCHAR(64) NOT NULL UNIQUE,
      expires_at  TIMESTAMPTZ NOT NULL,
      invite_code VARCHAR(64),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at  TIMESTAMPTZ,
      -- 单次使用：加入成功即消费，避免一条码被无限次转发使用
      used_at     TIMESTAMPTZ,
      used_by     BIGINT REFERENCES t_user(id) ON DELETE SET NULL
    );
    ALTER TABLE t_space_invite ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
    ALTER TABLE t_space_invite ADD COLUMN IF NOT EXISTS used_by BIGINT REFERENCES t_user(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_space_invite_space ON t_space_invite (space_id, created_at DESC);
    -- code 已有 UNIQUE 约束索引，无需再建一条重复索引
    DROP INDEX IF EXISTS idx_space_invite_code;
  `)

  // V2 默契测试基础版：固定题库，结果沉淀到时光圈。
  await p.query(`
    CREATE TABLE IF NOT EXISTS t_quiz (
      id              BIGSERIAL PRIMARY KEY,
      space_id        BIGINT NOT NULL REFERENCES t_space(id) ON DELETE CASCADE,
      created_by      BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      target_user_id  BIGINT,
      questions       JSONB NOT NULL DEFAULT '[]'::jsonb,
      answers         JSONB NOT NULL DEFAULT '{}'::jsonb,
      score           SMALLINT,
      summary         TEXT NOT NULL DEFAULT '',
      status          VARCHAR(16) NOT NULL DEFAULT 'answering',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_quiz_status CHECK (status IN ('answering', 'completed'))
    );
    CREATE INDEX IF NOT EXISTS idx_quiz_space ON t_quiz (space_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quiz_created_by ON t_quiz (created_by, created_at DESC);
  `)

  await p.query(`
    CREATE TABLE IF NOT EXISTS t_daily_answer (
      id             BIGSERIAL PRIMARY KEY,
      question_date  DATE NOT NULL,
      question_key   VARCHAR(64) NOT NULL,
      scope_key      VARCHAR(80) NOT NULL,
      space_id       BIGINT REFERENCES t_space(id) ON DELETE CASCADE,
      user_id        BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      entry_id       BIGINT REFERENCES t_entry(id) ON DELETE SET NULL,
      answer         TEXT NOT NULL DEFAULT '',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (question_date, scope_key, user_id)
    );
    ALTER TABLE t_daily_answer ADD COLUMN IF NOT EXISTS entry_id BIGINT REFERENCES t_entry(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_daily_answer_scope_date ON t_daily_answer (scope_key, question_date DESC);
    CREATE TABLE IF NOT EXISTS t_daily_custom_question (
      question_date DATE NOT NULL,
      scope_key     VARCHAR(80) NOT NULL,
      space_id      BIGINT REFERENCES t_space(id) ON DELETE CASCADE,
      created_by    BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      question      VARCHAR(240) NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (question_date, scope_key)
    );
  `)

  await p.query(`
    CREATE TABLE IF NOT EXISTS t_insight (
      id             BIGSERIAL PRIMARY KEY,
      user_id        BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      insight_type   VARCHAR(24) NOT NULL,
      title          VARCHAR(120) NOT NULL,
      content        TEXT NOT NULL,
      action_type    VARCHAR(24) NOT NULL DEFAULT 'none',
      action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      source_digest  CHAR(64) NOT NULL,
      dismissed_at  TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, source_digest)
    );
    CREATE INDEX IF NOT EXISTS idx_insight_user_created ON t_insight (user_id, created_at DESC);
  `)

  // 旧独立胶囊表已废弃（业务在 t_entry.capsule_*）；线上无历史数据，直接删除
  await p.query(`DROP TABLE IF EXISTS t_capsule`)

  // 旧独立「双人日记本」已废弃（业务在 entries collaborate + t_shared_moment）；线上无历史数据，直接删除
  await p.query(`
    DROP TABLE IF EXISTS t_shared_diary_invite;
    DROP TABLE IF EXISTS t_shared_entry;
    DROP TABLE IF EXISTS t_shared_diary_member;
    DROP TABLE IF EXISTS t_shared_diary;
  `)

  await p.query(`
    CREATE TABLE IF NOT EXISTS t_feedback (
      id          BIGSERIAL PRIMARY KEY,
      environment VARCHAR(16) NOT NULL DEFAULT 'testing',
      source      VARCHAR(16) NOT NULL,
      category    VARCHAR(32) NOT NULL,
      content     TEXT NOT NULL,
      contact     VARCHAR(128) NOT NULL DEFAULT '',
      image_urls  TEXT[] NOT NULL DEFAULT '{}'::text[],
      user_id     BIGINT REFERENCES t_user(id) ON DELETE SET NULL,
      client_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      status      VARCHAR(16) NOT NULL DEFAULT 'new',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_feedback_environment CHECK (environment IN ('testing', 'production')),
      CONSTRAINT chk_feedback_source CHECK (source IN ('website', 'mini-program', 'app')),
      CONSTRAINT chk_feedback_status CHECK (status IN ('new', 'triaging', 'resolved', 'closed'))
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_environment_status
      ON t_feedback (environment, status, created_at DESC);
    ALTER TABLE t_feedback
      ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}'::text[];

    -- “历史上的今天”按月日缓存。内容变化很慢，避免每位用户重复请求外部数据源。
    CREATE TABLE IF NOT EXISTS t_history_day_cache (
      month_day   CHAR(5) PRIMARY KEY,
      source      VARCHAR(32) NOT NULL,
      payload     JSONB NOT NULL,
      fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_day_cache_expires
      ON t_history_day_cache (expires_at);
  `)

  // 时间胶囊字段（融入 t_entry）
  await p.query(`
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS capsule_unlock_at TIMESTAMPTZ;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS capsule_unlocked BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS capsule_unlock_mode VARCHAR(16) NOT NULL DEFAULT 'scheduled';
    ALTER TABLE t_entry ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE INDEX IF NOT EXISTS idx_entry_capsule ON t_entry (capsule_unlock_at) WHERE capsule_unlock_at IS NOT NULL AND capsule_unlocked = FALSE;
  `)

  // 共同记录（日子级协作）
  await p.query(`
    CREATE TABLE IF NOT EXISTS t_entry_collaborator (
      id            BIGSERIAL PRIMARY KEY,
      entry_id      BIGINT NOT NULL REFERENCES t_entry(id) ON DELETE CASCADE,
      user_id       BIGINT REFERENCES t_user(id) ON DELETE CASCADE,
      role          VARCHAR(16) NOT NULL DEFAULT 'partner',
      invite_code   VARCHAR(32),
      invite_expires_at TIMESTAMPTZ,
      target_space_id BIGINT REFERENCES t_space(id) ON DELETE SET NULL,
      invited_by    BIGINT REFERENCES t_user(id),
      joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      remind_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
      remind_ahead_days  SMALLINT NOT NULL DEFAULT 1,
      remind_time_minutes SMALLINT NOT NULL DEFAULT 600,
      wx_subscribe_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      wx_subscribe_status VARCHAR(16) NOT NULL DEFAULT 'none',
      wx_subscribe_sent_at TIMESTAMPTZ,
      wx_subscribe_error TEXT NOT NULL DEFAULT '',
      wx_subscribe_attempts INTEGER NOT NULL DEFAULT 0,
      wx_subscribe_last_attempt_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_entry_collab_entry ON t_entry_collaborator (entry_id);
    CREATE INDEX IF NOT EXISTS idx_entry_collab_user ON t_entry_collaborator (user_id);

    CREATE TABLE IF NOT EXISTS t_shared_moment (
      id            BIGSERIAL PRIMARY KEY,
      entry_id      BIGINT NOT NULL REFERENCES t_entry(id) ON DELETE CASCADE,
      user_id       BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      type          VARCHAR(16) NOT NULL DEFAULT 'note',
      body          TEXT NOT NULL DEFAULT '',
      images        TEXT NOT NULL DEFAULT '[]',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_moment_type CHECK (type IN ('note', 'photo'))
    );
    CREATE INDEX IF NOT EXISTS idx_shared_moment_entry ON t_shared_moment (entry_id, created_at DESC);

    -- 共同空间随手记的共同编辑申请。申请记录负责审批留痕，真正的编辑权限
    -- 仍落在 t_entry_collaborator(role=partner)，避免分享链接本身成为授权凭证。
    CREATE TABLE IF NOT EXISTS t_entry_edit_request (
      id            BIGSERIAL PRIMARY KEY,
      entry_id      BIGINT NOT NULL REFERENCES t_entry(id) ON DELETE CASCADE,
      requester_id  BIGINT NOT NULL REFERENCES t_user(id) ON DELETE CASCADE,
      status        VARCHAR(16) NOT NULL DEFAULT 'pending',
      resolved_by   BIGINT REFERENCES t_user(id) ON DELETE SET NULL,
      resolved_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT chk_entry_edit_request_status
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'revoked'))
    );
    CREATE INDEX IF NOT EXISTS idx_entry_edit_request_entry
      ON t_entry_edit_request (entry_id, status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entry_edit_request_pending
      ON t_entry_edit_request (entry_id, requester_id)
      WHERE status = 'pending';
  `)

  // 兼容已存在的 t_entry_collaborator 表：加提醒字段
  await p.query(`
    ALTER TABLE t_entry_collaborator ADD COLUMN IF NOT EXISTS remind_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE t_entry_collaborator ADD COLUMN IF NOT EXISTS remind_ahead_days SMALLINT NOT NULL DEFAULT 1;
    ALTER TABLE t_entry_collaborator ADD COLUMN IF NOT EXISTS remind_time_minutes SMALLINT NOT NULL DEFAULT 600;
    ALTER TABLE t_entry_collaborator ADD COLUMN IF NOT EXISTS wx_subscribe_accepted BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE t_entry_collaborator ADD COLUMN IF NOT EXISTS wx_subscribe_status VARCHAR(16) NOT NULL DEFAULT 'none';
    ALTER TABLE t_entry_collaborator ADD COLUMN IF NOT EXISTS wx_subscribe_sent_at TIMESTAMPTZ;
    ALTER TABLE t_entry_collaborator ADD COLUMN IF NOT EXISTS wx_subscribe_error TEXT NOT NULL DEFAULT '';
    ALTER TABLE t_entry_collaborator ADD COLUMN IF NOT EXISTS wx_subscribe_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE t_entry_collaborator ADD COLUMN IF NOT EXISTS wx_subscribe_last_attempt_at TIMESTAMPTZ;
    UPDATE t_entry_collaborator
       SET wx_subscribe_status = 'authorized'
     WHERE wx_subscribe_accepted = TRUE AND wx_subscribe_status = 'none';
    ALTER TABLE t_entry_collaborator ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
    ALTER TABLE t_entry_collaborator ADD COLUMN IF NOT EXISTS target_space_id BIGINT REFERENCES t_space(id) ON DELETE SET NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entry_collab_invite_code
      ON t_entry_collaborator (invite_code)
      WHERE invite_code IS NOT NULL;

    -- 历史版本只在接口层检查成员是否存在，并发接受不同邀请时可能产生重复成员。
    -- owner 优先保留；partner 重复时优先保留仍开启提醒或已有订阅状态的一条。
    WITH ranked_members AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY entry_id, user_id
               ORDER BY
                 CASE WHEN role = 'owner' THEN 0 ELSE 1 END,
                 CASE WHEN remind_enabled THEN 0 ELSE 1 END,
                 CASE wx_subscribe_status
                   WHEN 'authorized' THEN 0
                   WHEN 'sending' THEN 1
                   WHEN 'sent' THEN 2
                   ELSE 3
                 END,
                 id ASC
             ) AS member_rank
        FROM t_entry_collaborator
       WHERE user_id IS NOT NULL
    )
    DELETE FROM t_entry_collaborator c
     USING ranked_members r
     WHERE c.id = r.id AND r.member_rank > 1;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_entry_collab_entry_user
      ON t_entry_collaborator (entry_id, user_id)
      WHERE user_id IS NOT NULL;

    -- 兼容已有共同日子和约定：内容按空间共享，提醒席位按成员独立。
    INSERT INTO t_entry_collaborator (
      entry_id, user_id, role, invited_by, joined_at,
      remind_enabled, remind_ahead_days, remind_time_minutes,
      wx_subscribe_accepted, wx_subscribe_status
    )
    SELECT e.id, sm.user_id,
           CASE WHEN sm.user_id = e.user_id THEN 'owner' ELSE 'partner' END,
           e.user_id, sm.joined_at,
           CASE WHEN sm.user_id = e.user_id THEN e.remind_enabled ELSE FALSE END,
           CASE WHEN sm.user_id = e.user_id THEN e.remind_ahead_days ELSE 1 END,
           CASE WHEN sm.user_id = e.user_id THEN e.remind_time_minutes ELSE 600 END,
           CASE WHEN sm.user_id = e.user_id THEN e.wx_subscribe_status IN ('authorized', 'sending') ELSE FALSE END,
           CASE WHEN sm.user_id = e.user_id THEN e.wx_subscribe_status ELSE 'none' END
      FROM t_entry e
      JOIN t_space_member sm ON sm.space_id = e.space_id
      JOIN t_space space ON space.id = e.space_id AND space.access_type <> 'public'
     WHERE e.deleted = FALSE
       AND e.type IN ('anniversary', 'todo')
       AND e.owner_type = 'space'
       AND e.visibility = 'space'
    ON CONFLICT (entry_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;

    -- owner 在 entry 表中的设置是权威值；修复早期默认 false 的 owner 席位。
    UPDATE t_entry_collaborator c
       SET role = 'owner',
           remind_enabled = e.remind_enabled,
           remind_ahead_days = e.remind_ahead_days,
           remind_time_minutes = e.remind_time_minutes,
           wx_subscribe_accepted = e.wx_subscribe_status IN ('authorized', 'sending'),
           wx_subscribe_status = e.wx_subscribe_status,
           wx_subscribe_sent_at = e.wx_subscribe_sent_at,
           wx_subscribe_error = COALESCE(e.wx_subscribe_error, ''),
           wx_subscribe_attempts = COALESCE(e.wx_subscribe_attempts, 0),
           wx_subscribe_last_attempt_at = e.wx_subscribe_last_attempt_at
      FROM t_entry e
     WHERE c.entry_id = e.id AND c.user_id = e.user_id
       AND e.deleted = FALSE AND e.owner_type = 'space'
       AND e.type IN ('anniversary', 'todo');

    CREATE OR REPLACE FUNCTION dk_sync_space_entry_reminder_members()
    RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND (
        OLD.owner_type IS DISTINCT FROM NEW.owner_type OR
        OLD.space_id IS DISTINCT FROM NEW.space_id OR
        NEW.visibility IS DISTINCT FROM OLD.visibility OR
        NEW.deleted = TRUE OR
        NEW.type = 'diary'
      ) THEN
        DELETE FROM t_entry_collaborator WHERE entry_id = NEW.id;
      END IF;

      IF NEW.deleted = FALSE
         AND NEW.owner_type = 'space'
         AND NEW.visibility = 'space'
         AND NEW.space_id IS NOT NULL
         AND NEW.type IN ('anniversary', 'todo') THEN
        INSERT INTO t_entry_collaborator (
          entry_id, user_id, role, invited_by, joined_at,
          remind_enabled, remind_ahead_days, remind_time_minutes,
          wx_subscribe_accepted, wx_subscribe_status,
          wx_subscribe_sent_at, wx_subscribe_error,
          wx_subscribe_attempts, wx_subscribe_last_attempt_at
        ) VALUES (
          NEW.id, NEW.user_id, 'owner', NEW.user_id, now(),
          NEW.remind_enabled, NEW.remind_ahead_days, NEW.remind_time_minutes,
          NEW.wx_subscribe_status IN ('authorized', 'sending'), NEW.wx_subscribe_status,
          NEW.wx_subscribe_sent_at, COALESCE(NEW.wx_subscribe_error, ''),
          COALESCE(NEW.wx_subscribe_attempts, 0), NEW.wx_subscribe_last_attempt_at
        )
        ON CONFLICT (entry_id, user_id) WHERE user_id IS NOT NULL
        DO UPDATE SET
          role = 'owner',
          remind_enabled = EXCLUDED.remind_enabled,
          remind_ahead_days = EXCLUDED.remind_ahead_days,
          remind_time_minutes = EXCLUDED.remind_time_minutes,
          wx_subscribe_accepted = EXCLUDED.wx_subscribe_accepted,
          wx_subscribe_status = EXCLUDED.wx_subscribe_status,
          wx_subscribe_sent_at = EXCLUDED.wx_subscribe_sent_at,
          wx_subscribe_error = EXCLUDED.wx_subscribe_error,
          wx_subscribe_attempts = EXCLUDED.wx_subscribe_attempts,
          wx_subscribe_last_attempt_at = EXCLUDED.wx_subscribe_last_attempt_at;

        INSERT INTO t_entry_collaborator (entry_id, user_id, role, invited_by, joined_at)
        SELECT NEW.id, sm.user_id, 'partner', NEW.user_id, sm.joined_at
          FROM t_space_member sm
          JOIN t_space space ON space.id = sm.space_id AND space.access_type <> 'public'
         WHERE sm.space_id = NEW.space_id AND sm.user_id <> NEW.user_id
        ON CONFLICT (entry_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_sync_space_entry_reminder_members ON t_entry;
    CREATE TRIGGER trg_sync_space_entry_reminder_members
      AFTER INSERT OR UPDATE OF owner_type, space_id, visibility, type, deleted,
        remind_enabled, remind_ahead_days, remind_time_minutes, wx_subscribe_status,
        wx_subscribe_sent_at, wx_subscribe_error, wx_subscribe_attempts,
        wx_subscribe_last_attempt_at
      ON t_entry
      FOR EACH ROW EXECUTE FUNCTION dk_sync_space_entry_reminder_members();

    CREATE OR REPLACE FUNCTION dk_sync_new_space_member_reminder_entries()
    RETURNS trigger AS $$
    BEGIN
      INSERT INTO t_entry_collaborator (entry_id, user_id, role, invited_by, joined_at)
      SELECT e.id, NEW.user_id,
             CASE WHEN e.user_id = NEW.user_id THEN 'owner' ELSE 'partner' END,
             e.user_id, NEW.joined_at
        FROM t_entry e
        JOIN t_space space ON space.id = e.space_id AND space.access_type <> 'public'
       WHERE e.space_id = NEW.space_id
         AND e.deleted = FALSE
         AND e.owner_type = 'space'
         AND e.visibility = 'space'
         AND e.type IN ('anniversary', 'todo')
      ON CONFLICT (entry_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_sync_new_space_member_reminder_entries ON t_space_member;
    CREATE TRIGGER trg_sync_new_space_member_reminder_entries
      AFTER INSERT ON t_space_member
      FOR EACH ROW EXECUTE FUNCTION dk_sync_new_space_member_reminder_entries();

    CREATE OR REPLACE FUNCTION dk_remove_space_member_reminder_entries()
    RETURNS trigger AS $$
    BEGIN
      DELETE FROM t_entry_collaborator c
       USING t_entry e
       WHERE c.entry_id = e.id
         AND c.user_id = OLD.user_id
         AND c.role = 'partner'
         AND e.space_id = OLD.space_id
         AND e.owner_type = 'space';
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_remove_space_member_reminder_entries ON t_space_member;
    CREATE TRIGGER trg_remove_space_member_reminder_entries
      AFTER DELETE ON t_space_member
      FOR EACH ROW EXECUTE FUNCTION dk_remove_space_member_reminder_entries();
  `)

  // 邀请审批请求表
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS t_invite_request (
      id SERIAL PRIMARY KEY,
      entry_id INTEGER NOT NULL REFERENCES t_entry(id),
      requester_id INTEGER NOT NULL REFERENCES t_user(id),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      resolved_by INTEGER REFERENCES t_user(id),
      invite_code VARCHAR(32),
      consumed_at TIMESTAMPTZ
    );
    ALTER TABLE t_invite_request ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32);
    ALTER TABLE t_invite_request ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_invite_req_entry ON t_invite_request (entry_id, status);
    CREATE INDEX IF NOT EXISTS idx_invite_req_code ON t_invite_request (invite_code)
      WHERE invite_code IS NOT NULL;
  `)

  // V2 时光圈字段的历史回填：只跑一次，不在每次启动时全表扫描。
  // owner_type/visibility 的列默认值已经保证新老行合法，这里只需要修正
  // 「历史胶囊记录 entry_kind 仍是 normal」这一项。
  await runOnceBestEffort(
    getPool(),
    'v2_entry_kind_capsule_backfill',
    `UPDATE t_entry
        SET entry_kind = 'capsule'
      WHERE entry_kind = 'normal'
        AND capsule_unlock_at IS NOT NULL`,
  )

  // 旧版前端会把随机胶囊标成 capsule，却把 null 的解锁日期直接交给后端保存。
  // 这些记录能在时间轴按 entry_kind 展示，但永远不会进入到期扫描。为未解锁的
  // 随机胶囊补 1–365 天内的新随机日期，让既有数据重新回到完整生命周期。
  await runOnceBestEffort(
    getPool(),
    'random_capsule_missing_unlock_at_backfill',
    `UPDATE t_entry
        SET capsule_unlock_at = now() + interval '1 day' * (1 + floor(random() * 365)),
            updated_at = now()
      WHERE entry_kind = 'capsule'
        AND capsule_unlock_mode = 'random'
        AND capsule_unlock_at IS NULL
        AND capsule_unlocked = FALSE`,
  )

  // 心情从五种预设扩展为「预设或一个自定义 Emoji」。接口仍会做严格的 Emoji
  // 序列校验；数据库这里只放宽长度和格式，以便成员状态与近七日历史共同保存。
  await runOnceBestEffort(
    getPool(),
    'custom_emoji_mood_support',
    `ALTER TABLE t_space_member ALTER COLUMN mood TYPE VARCHAR(32);
     ALTER TABLE t_mood_history ALTER COLUMN mood TYPE VARCHAR(32);
     ALTER TABLE t_mood_history DROP CONSTRAINT IF EXISTS chk_mood_history_value;
     ALTER TABLE t_mood_history ADD CONSTRAINT chk_mood_history_value
       CHECK (mood IN ('sunny', 'cloudy', 'rainy', 'storm', 'rainbow') OR mood LIKE 'custom:%');`,
  )

  // 默契测试要求同一时光圈内同一对成员最多只有一场未完成的测试，
  // 否则双方会各自答一份互不相干的答卷，永远算不出默契度。
  // LEAST/GREATEST 把「谁发起的」抹平，使 (A,B) 与 (B,A) 落到同一个键。
  //
  // 建索引前要清掉历史重复行（此前每次打开页面都会 INSERT 一条），但只能删
  // 真正没人动过的空场次：answers = '{}' 必须显式判断。原来只按
  // status <> 'completed' 删，会把「一方已提交、等对方作答」的 answering 场次
  // 一起删掉，而保留的偏偏是 id 最大、最可能还没人答的那条——等于挑着把有答卷的删了。
  //
  // 已经有人作答的重复场次不能删，但留着又会让唯一索引建不起来，所以第二步把
  // 它们里较旧的收成 completed（score 为 NULL，normalizeQuiz 会当作无分数处理），
  // 数据保留、索引也能建。t_quiz 是本次发布新建的表，线上没有历史行，
  // 这两步实际只在开发库里清理迭代期间产生的脏数据。
  //
  // 先 LOCK 表再删：CREATE UNIQUE INDEX（非 CONCURRENTLY）到语句执行时才拿
  // ACCESS EXCLUSIVE，滚动发布时老实例在 DELETE 快照之后新插的一行会直接把
  // 建索引搞失败，而 runOnce 失败会回滚完成标记，于是每次重启都以同样方式失败。
  await runOnceBestEffort(
    getPool(),
    'v2_quiz_open_pair_unique',
    `LOCK TABLE t_quiz IN SHARE ROW EXCLUSIVE MODE;
     DELETE FROM t_quiz q
      WHERE q.status <> 'completed'
        AND q.target_user_id IS NOT NULL
        AND q.answers = '{}'::jsonb
        AND q.id < (
          SELECT MAX(q2.id) FROM t_quiz q2
           WHERE q2.status <> 'completed'
             AND q2.target_user_id IS NOT NULL
             AND q2.space_id = q.space_id
             AND LEAST(q2.created_by, q2.target_user_id) = LEAST(q.created_by, q.target_user_id)
             AND GREATEST(q2.created_by, q2.target_user_id) = GREATEST(q.created_by, q.target_user_id)
        );
     UPDATE t_quiz q
        SET status = 'completed', updated_at = now()
      WHERE q.status <> 'completed'
        AND q.target_user_id IS NOT NULL
        AND q.id < (
          SELECT MAX(q2.id) FROM t_quiz q2
           WHERE q2.status <> 'completed'
             AND q2.target_user_id IS NOT NULL
             AND q2.space_id = q.space_id
             AND LEAST(q2.created_by, q2.target_user_id) = LEAST(q.created_by, q.target_user_id)
             AND GREATEST(q2.created_by, q2.target_user_id) = GREATEST(q.created_by, q.target_user_id)
        );
     CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_open_pair
       ON t_quiz (space_id, LEAST(created_by, target_user_id), GREATEST(created_by, target_user_id))
       WHERE status <> 'completed' AND target_user_id IS NOT NULL;`,
  )

  // 默契测试改为「一个时光圈一场」：圈里的人共用同一份题，不再按两人配对。
  await runOnceBestEffort(
    getPool(),
    'v2_quiz_open_space_unique',
    `LOCK TABLE t_quiz IN SHARE ROW EXCLUSIVE MODE;
     UPDATE t_quiz q
        SET status = 'completed', updated_at = now()
      WHERE q.status <> 'completed'
        AND q.id < (
          SELECT MAX(q2.id) FROM t_quiz q2
           WHERE q2.status <> 'completed' AND q2.space_id = q.space_id
        );
     CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_open_space
       ON t_quiz (space_id)
       WHERE status <> 'completed';`,
  )

  // 个人版不再给「仅自己」写入演示随手记。这里只清理由稳定幂等键创建的
  // 系统记录，并永久记录已处理状态，避免旧客户端或清缓存后再次补种。
  await p.query(`
    INSERT INTO t_user_seed_state (user_id, seed)
    SELECT DISTINCT user_id,
           CASE client_request_id
             WHEN 'seed:diary_welcome' THEN 'diary_welcome'
             ELSE 'diary_tomato_eggs'
           END
      FROM t_entry
     WHERE owner_type = 'personal'
       AND client_request_id IN ('seed:diary_welcome', 'seed:diary_tomato_eggs')
    ON CONFLICT (user_id, seed)
    DO UPDATE SET updated_at = now();

    UPDATE t_entry
       SET deleted = TRUE, updated_at = now()
     WHERE owner_type = 'personal'
       AND client_request_id IN ('seed:diary_welcome', 'seed:diary_tomato_eggs')
       AND deleted = FALSE;
  `)

  // 官方体验圈使用独立系统账号发布内置内容，但由一个真实微信账号担任管理员。
  // 这里每次启动都幂等校正，既能迁移已经由 id=1 创建的旧体验圈，也能在
  // 全新空库中直接创建；内置记录使用稳定 client_request_id，重复部署不重复。
  const officialAvatarUrl = String(process.env.OFFICIAL_AVATAR_URL || '').trim()
  // node-postgres 的参数化查询只能包含一条 SQL，系统账号先单独 upsert；
  // 后面的多条幂等迁移保持 simple query，避免线上启动时报 42601。
  await p.query(
    `INSERT INTO t_user (openid, nickname, avatar_url)
     VALUES ('system:daykeep-official', '只我们官方', $1)
     ON CONFLICT (openid) DO UPDATE SET
       nickname = '只我们官方',
       avatar_url = EXCLUDED.avatar_url,
       updated_at = now()`,
    [officialAvatarUrl],
  )
  await p.query(`
    INSERT INTO t_space (
      owner_id, name, type, keywords, cover_url,
      access_type, join_policy, post_policy, is_official, official_key
    )
    SELECT official.id, '只我们·体验圈', 'group', '["官方体验","一起记录","写给未来"]'::jsonb, '',
           'public', 'open', 'members', TRUE, 'daykeep-experience'
      FROM t_user official
     WHERE official.openid = 'system:daykeep-official'
    ON CONFLICT (official_key) WHERE official_key IS NOT NULL
    DO UPDATE SET
      owner_id = EXCLUDED.owner_id,
      access_type = 'public',
      join_policy = 'open',
      post_policy = 'members',
      is_official = TRUE,
      dissolved_at = NULL,
      dissolved_by = NULL,
      dissolved_by_name = '',
      purge_at = NULL,
      updated_at = now();

    UPDATE t_entry e
       SET user_id = official.id, updated_at = now()
      FROM t_space s, t_user official
     WHERE e.space_id = s.id
       AND s.official_key = 'daykeep-experience'
       AND official.openid = 'system:daykeep-official'
       AND e.client_request_id IN (
         'official-experience-welcome-v1',
         'official-experience-memory-v1',
         'official-experience-commitment-v1',
         'official-experience-capsule-v1'
       )
       AND e.user_id <> official.id;

    INSERT INTO t_space_member (space_id, user_id, role, nickname, avatar_url)
    SELECT s.id, u.id, 'owner', u.nickname, u.avatar_url
      FROM t_space s
      JOIN t_user u ON u.openid = 'system:daykeep-official'
     WHERE s.official_key = 'daykeep-experience'
    ON CONFLICT (space_id, user_id) DO UPDATE
      SET role = 'owner', nickname = EXCLUDED.nickname, avatar_url = EXCLUDED.avatar_url, updated_at = now();

    UPDATE t_space_member sm
       SET role = 'member', updated_at = now()
      FROM t_space s, t_user official
     WHERE sm.space_id = s.id
       AND s.official_key = 'daykeep-experience'
       AND official.openid = 'system:daykeep-official'
       AND sm.user_id <> official.id
       AND sm.role <> 'member';

    INSERT INTO t_entry (
      user_id, type, title, body, event_date, event_at, pinned, show_in_timeline,
      owner_type, space_id, visibility, entry_kind, images, client_request_id
    )
    SELECT official.id, 'diary', '欢迎来到只我们·体验圈',
           '这里是一个可以放心试用的公开空间。看看大家怎样记录当下、约定未来，再决定要不要建立属于自己的小圈子。',
           current_date, now(), TRUE, FALSE,
           'space', s.id, 'space', 'normal', '[]', 'official-experience-welcome-v1'
      FROM t_space s
      JOIN t_user official ON official.openid = 'system:daykeep-official'
     WHERE s.official_key = 'daykeep-experience'
    ON CONFLICT (user_id, client_request_id)
      WHERE client_request_id IS NOT NULL AND btrim(client_request_id) <> '' DO NOTHING;

    INSERT INTO t_entry (
      user_id, type, title, body, event_date, event_at, pinned, show_in_timeline,
      owner_type, space_id, visibility, entry_kind, images, client_request_id
    )
    SELECT official.id, 'diary', '今天想记住的一件小事',
           '不需要写得完整。一句话、一张照片，甚至只是此刻的心情，都可以成为以后想回来的地方。',
           current_date - 1, now() - interval '1 day', FALSE, FALSE,
           'space', s.id, 'space', 'normal', '[]', 'official-experience-memory-v1'
      FROM t_space s
      JOIN t_user official ON official.openid = 'system:daykeep-official'
     WHERE s.official_key = 'daykeep-experience'
    ON CONFLICT (user_id, client_request_id)
      WHERE client_request_id IS NOT NULL AND btrim(client_request_id) <> '' DO NOTHING;

    INSERT INTO t_entry (
      user_id, type, title, body, event_date, event_at, repeat_rule, show_in_timeline,
      remind_enabled, owner_type, space_id, visibility, entry_kind, commitment_meta,
      images, client_request_id
    )
    SELECT official.id, 'anniversary', '一起认真生活的小约定',
           '选一个期待的日子，让约定不只停留在“下次一定”。',
           DATE '2027-01-01', TIMESTAMP '2027-01-01 10:00:00', 'none', TRUE,
           FALSE, 'space', s.id, 'space', 'commitment', '{}'::jsonb,
           '[]', 'official-experience-commitment-v1'
      FROM t_space s
      JOIN t_user official ON official.openid = 'system:daykeep-official'
     WHERE s.official_key = 'daykeep-experience'
    ON CONFLICT (user_id, client_request_id)
      WHERE client_request_id IS NOT NULL AND btrim(client_request_id) <> '' DO NOTHING;

    -- 官方新年约定使用固定展示日期；已有环境也要同步校正，不能只影响新库。
    UPDATE t_entry e
       SET event_date = DATE '2027-01-01',
           event_at = TIMESTAMP '2027-01-01 10:00:00',
           updated_at = now()
      FROM t_space s, t_user official
     WHERE e.space_id = s.id
       AND s.official_key = 'daykeep-experience'
       AND official.openid = 'system:daykeep-official'
       AND e.user_id = official.id
       AND e.client_request_id = 'official-experience-commitment-v1'
       AND (e.event_date <> DATE '2027-01-01'
         OR e.event_at <> TIMESTAMP '2027-01-01 10:00:00');

    -- 个人空间的系统小约定也统一为 2027 年元旦。
    -- 仅匹配稳定 seed 标识，不会改动用户自行创建的同名约定。
    UPDATE t_entry
       SET event_date = DATE '2027-01-01',
           event_at = CASE
             WHEN event_at IS NULL THEN NULL
             ELSE DATE '2027-01-01' + event_at::time
           END,
           updated_at = now()
     WHERE owner_type = 'personal'
       AND (client_request_id = 'seed:self_promise'
         OR body LIKE '%__dk_seed:self_promise__%')
       AND event_date <> DATE '2027-01-01';

    INSERT INTO t_entry (
      user_id, type, title, body, event_date, event_at, show_in_timeline,
      remind_enabled, owner_type, space_id, visibility, entry_kind,
      capsule_unlock_at, capsule_unlocked, capsule_unlock_mode,
      images, client_request_id
    )
    SELECT official.id, 'diary', '写给未来的我们',
           '等它开启时，希望我们仍然愿意认真感受生活，也还记得今天为什么出发。',
           current_date, now(), FALSE,
           FALSE, 'space', s.id, 'space', 'capsule',
           now() + interval '90 days', FALSE, 'scheduled',
           '[]', 'official-experience-capsule-v1'
      FROM t_space s
      JOIN t_user official ON official.openid = 'system:daykeep-official'
     WHERE s.official_key = 'daykeep-experience'
    ON CONFLICT (user_id, client_request_id)
      WHERE client_request_id IS NOT NULL AND btrim(client_request_id) <> '' DO NOTHING;
  `)

  // 系统账号无法登录，因此公开体验圈必须保留一个可操作的真实管理员。
  // 生产环境可用 OFFICIAL_ADMIN_OPENID 精确指定；未配置时选最早加入的
  // 非系统成员，用于平滑迁移已有数据。上面先幂等降级、这里再晋级，
  // 可确保指定人永远是唯一真实管理员。
  const officialAdminOpenid = String(process.env.OFFICIAL_ADMIN_OPENID || '').trim()
  await p.query(
    `WITH admin_candidate AS (
       SELECT sm.id
         FROM t_space_member sm
         JOIN t_space s ON s.id = sm.space_id
         JOIN t_user u ON u.id = sm.user_id
        WHERE s.official_key = 'daykeep-experience'
          AND u.openid <> 'system:daykeep-official'
          AND ($1 = '' OR u.openid = $1)
        ORDER BY sm.joined_at ASC, sm.id ASC
        LIMIT 1
     )
     UPDATE t_space_member sm
        SET role = 'admin', updated_at = now()
       FROM admin_candidate candidate
      WHERE sm.id = candidate.id`,
    [officialAdminOpenid],
  )

  console.log('[pg] schema ready')

  // 索引在后台并发构建，不阻塞启动，也不锁表。
  buildIndexesInBackground(getPool())
}
