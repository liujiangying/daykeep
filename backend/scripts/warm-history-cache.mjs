#!/usr/bin/env node
/**
 * 预热「历史上的今天」缓存（t_history_day_cache）
 *
 * 部署环境可能无法稳定直连 Wikimedia，因此预先生成缓存。
 * 本脚本须在「能访问维基百科」的机器上运行（如 DevCloud / 办公网），
 * 把精选故事写入 Postgres，供后端直接读缓存。
 *
 * ---------------------------------------------------------------------------
 * 【上线前必查】正式环境上线前，务必对正式库再执行一遍本脚本！
 * 测试库（daykeep_test）与正式库（daykeep）不共用缓存，测环境灌好 ≠ 正式有数据。
 * ---------------------------------------------------------------------------
 *
 * 用法：
 *   # 灌测试库（全年月日，每天最多 30 条重要事件）
 *   PG_HOST=... PG_PORT=5432 PG_USER=daykeep PG_PASSWORD=... PG_DATABASE=daykeep_test \
 *     node backend/scripts/warm-history-cache.mjs
 *
 *   # 只灌某几天（调试）
 *   DAYS=07-28,07-29 LIMIT=30 node backend/scripts/warm-history-cache.mjs
 *
 *   # 正式库（上线前）
 *   PG_DATABASE=daykeep node backend/scripts/warm-history-cache.mjs
 *
 * 环境变量：
 *   PG_* / DATABASE_URL     数据库（必填）
 *   HISTORY_LANGUAGE        维基语言，默认 zh
 *   HISTORY_CACHE_DAYS      缓存有效天数，默认 365
 *   LIMIT                   每天最多条数，默认 30（上限 30）
 *   DAYS                    可选，逗号分隔 MM-DD；不设则灌全年（含 02-29）
 *   SLEEP_MS                请求间隔，默认 200，避免打太快
 *   CONCURRENCY             拉取文件模式并发数，默认 4，最大 6
 *   FETCH_DIR               若设置：只拉取维基并写入该目录的 JSON，不连库
 *   IMPORT_DIR              若设置：只把目录内 JSON 导入数据库，不访问维基
 *                           （集群无维基出网时：本机 FETCH_DIR → kubectl cp → Pod 内 IMPORT_DIR）
 *
 * 说明：集群无法稳定拉取 Wikimedia 配图，故事仅保留文本，不含图片。
 */

import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(path.resolve(process.cwd(), 'package.json'))
const pg = require('pg')

// Wikimedia 要求机器人请求携带可联系的产品标识；缺少联系地址会返回 403。
const UA = 'Daykeep/0.1 (https://daykeep.cn; history-cache-warmer)'
const MAX_LIMIT = 30
const limit = Math.min(MAX_LIMIT, Math.max(1, Number(process.env.LIMIT || 30) || 30))
const language = process.env.HISTORY_LANGUAGE || 'zh'
const cacheDays = Math.max(1, Number(process.env.HISTORY_CACHE_DAYS || 365) || 365)
const sleepMs = Math.max(0, Number(process.env.SLEEP_MS || 200) || 0)
const concurrency = Math.min(6, Math.max(1, Number(process.env.CONCURRENCY || 4) || 4))

function dbConfig() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL }
  const { PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE } = process.env
  if (!PG_HOST || !PG_USER || !PG_PASSWORD || !PG_DATABASE) {
    throw new Error('需要 DATABASE_URL 或 PG_HOST/PG_USER/PG_PASSWORD/PG_DATABASE')
  }
  return {
    host: PG_HOST,
    port: Number(PG_PORT || 5432),
    user: PG_USER,
    password: PG_PASSWORD,
    database: PG_DATABASE,
  }
}

function allMonthDays() {
  // 用闰年生成 02-29
  const days = []
  for (let month = 1; month <= 12; month++) {
    const count = new Date(2024, month, 0).getDate()
    for (let day = 1; day <= count; day++) {
      days.push(`${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    }
  }
  return days
}

function targetDays() {
  const raw = String(process.env.DAYS || '').trim()
  if (!raw) return allMonthDays()
  return raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
}

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function storyTitle(year, text, page) {
  const clause = text.split(/[。；]/)[0]?.split('，').slice(0, 2).join('，') || ''
  const subject =
    clause.length <= 42
      ? clause
      : page?.normalizedtitle || page?.title || `${clause.slice(0, 39)}…`
  return `${year ? `${year}年，` : ''}${subject}`.replace(/[，,]+$/, '')
}

function importanceScore(event) {
  const pages = Array.isArray(event.pages) ? event.pages : []
  const text = plainText(event.text)
  let score = 0
  if (pages.some((p) => p?.thumbnail?.source)) score += 50
  if (pages.length >= 2) score += 12
  if (pages.some((p) => p?.description || p?.extract)) score += 8
  if (text.length >= 60) score += 8
  if (text.length >= 120) score += 4
  const year = Number(event.year)
  if (Number.isFinite(year) && year >= 1900) score += 6
  if (Number.isFinite(year) && year >= 2000) score += 4
  return score
}

function pickImportant(events) {
  return [...events]
    .filter((e) => plainText(e?.text))
    .sort((a, b) => importanceScore(b) - importanceScore(a) || (b.year || 0) - (a.year || 0))
    .slice(0, limit)
}

function normalize(month, day, events) {
  const seen = new Set()
  const stories = []
  for (const event of pickImportant(events)) {
    const description = plainText(event.text)
    if (!description) continue
    const mainPage = event.pages?.find((p) => p?.normalizedtitle || p?.title)
    const year = Number.isFinite(event.year) ? Number(event.year) : null
    const dedupeKey = `${year || ''}:${description}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    stories.push({
      id: `${month}-${day}-${year || 'unknown'}-${stories.length}`,
      year,
      title: storyTitle(event.year, description, mainPage),
      description,
      sourceUrl:
        mainPage?.content_urls?.mobile?.page ||
        mainPage?.content_urls?.desktop?.page ||
        '',
    })
  }
  return {
    month,
    day,
    source: 'Wikimedia / 中文维基百科',
    stories,
    updatedAt: new Date().toISOString(),
  }
}

async function fetchDay(month, day) {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const url = `https://${language}.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  })
  if (!response.ok) throw new Error(`wikimedia ${response.status}`)
  const body = await response.json()
  return normalize(month, day, Array.isArray(body.events) ? body.events : [])
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS t_history_day_cache (
      month_day   CHAR(5) PRIMARY KEY,
      source      VARCHAR(32) NOT NULL,
      payload     JSONB NOT NULL,
      fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL
    )
  `)
}

async function upsert(client, monthDay, payload) {
  await client.query(
    `INSERT INTO t_history_day_cache (month_day, source, payload, fetched_at, expires_at)
     VALUES ($1, $2, $3::jsonb, now(), now() + ($4 * interval '1 day'))
     ON CONFLICT (month_day) DO UPDATE
       SET source = EXCLUDED.source,
           payload = EXCLUDED.payload,
           fetched_at = now(),
           expires_at = EXCLUDED.expires_at`,
    [monthDay, payload.source, JSON.stringify(payload), cacheDays],
  )
}

async function main() {
  console.log('============================================================')
  console.log('历史上的今天 · 缓存预热')
  console.log('【上线前必查】正式库必须单独再跑一遍本脚本，测试库数据不会自动同步。')
  console.log('============================================================')

  const fetchDir = String(process.env.FETCH_DIR || '').trim()
  const importDir = String(process.env.IMPORT_DIR || '').trim()

  if (fetchDir && importDir) {
    throw new Error('FETCH_DIR 与 IMPORT_DIR 不能同时设置')
  }

  if (fetchDir) {
    await mkdir(fetchDir, { recursive: true })
    const days = targetDays()
    let ok = 0
    let fail = 0
    console.log(JSON.stringify({ mode: 'fetch-only', fetchDir, language, limit, days: days.length, concurrency }, null, 2))
    let cursor = 0
    const workers = Array.from({ length: Math.min(concurrency, days.length) }, async () => {
      while (cursor < days.length) {
        const key = days[cursor++]
        const [mm, dd] = key.split('-').map(Number)
        if (!mm || !dd) {
          fail += 1
          continue
        }
        try {
          const payload = await fetchDay(mm, dd)
          await writeFile(path.join(fetchDir, `${key}.json`), JSON.stringify(payload), 'utf8')
          ok += 1
          console.log(`[ok] ${key} stories=${payload.stories.length}`)
        } catch (error) {
          fail += 1
          console.error(`[fail] ${key}`, error?.message || error)
        }
        if (sleepMs) await sleep(sleepMs)
      }
    })
    await Promise.all(workers)
    console.log(`拉取完成：成功 ${ok}，失败 ${fail}`)
    console.log('下一步：把目录拷进能连库的环境，IMPORT_DIR=该目录 再执行导入。')
    return
  }

  console.log(
    JSON.stringify(
      {
        mode: importDir ? 'import-only' : 'fetch+import',
        database: process.env.PG_DATABASE || process.env.DATABASE_URL || '(from DATABASE_URL)',
        language,
        limit,
        cacheDays,
        days: importDir ? `files in ${importDir}` : process.env.DAYS || 'ALL(366)',
      },
      null,
      2,
    ),
  )

  const client = new pg.Client(dbConfig())
  await client.connect()
  await ensureTable(client)

  let ok = 0
  let fail = 0

  if (importDir) {
    const files = (await readdir(importDir)).filter((f) => f.endsWith('.json')).sort()
    for (const file of files) {
      const key = file.replace(/\.json$/, '')
      try {
        const payload = JSON.parse(await readFile(path.join(importDir, file), 'utf8'))
        if (!payload?.stories) throw new Error('invalid payload')
        // 导入时再截断，确保不超过 30
        payload.stories = Array.isArray(payload.stories) ? payload.stories.slice(0, limit) : []
        await upsert(client, key, payload)
        ok += 1
        console.log(`[ok] import ${key} stories=${payload.stories.length}`)
      } catch (error) {
        fail += 1
        console.error(`[fail] import ${key}`, error?.message || error)
      }
    }
  } else {
    const days = targetDays()
    for (const key of days) {
      const [mm, dd] = key.split('-').map(Number)
      if (!mm || !dd) {
        console.warn(`[skip] bad day ${key}`)
        fail += 1
        continue
      }
      try {
        const payload = await fetchDay(mm, dd)
        await upsert(client, key, payload)
        ok += 1
        console.log(`[ok] ${key} stories=${payload.stories.length}`)
      } catch (error) {
        fail += 1
        console.error(`[fail] ${key}`, error?.message || error)
      }
      if (sleepMs) await sleep(sleepMs)
    }
  }

  await client.end()
  console.log('------------------------------------------------------------')
  console.log(`完成：成功 ${ok}，失败 ${fail}`)
  console.log('提醒：上线正式环境前，请改 PG_DATABASE=daykeep（或正式库名）再执行一次。')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
