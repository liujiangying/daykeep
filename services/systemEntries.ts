/**
 * 共享示例：首次进入且尚无日期/待办时，为当前用户写入一份可编辑、可删除的真实数据。
 * 每人一份；删光后不再自动补种。
 *
 * 内置日期：
 * 1. 微信发布 — 自 2011-01-21 起算
 * 2. 今年 — 自上年 12-31 锚点，展示「已经」= 今年第几天（实时）
 * 3. 给自己的小约定 — 未来 7 天
 *
 * 内置随手记（可多条；老用户会按 seed 补种缺失项）：
 * 1. diary_welcome — 欢迎文案 + 三张系统配图
 * 2. diary_tomato_eggs — 「西红柿炒蛋」示例 + 一张系统配图
 */
import { fetchMe, getCachedUserId } from '@/services/auth'
import {
  createEntry,
  updateEntry,
  deleteEntry,
  getEntrySeedState,
  markEntrySeeds,
  type Entry,
  type EntryInput,
} from '@/services/entries'

const SEED_KEY_PREFIX = 'dk_shared_seed_v2_'
/** v1：只种过欢迎随手记；v2：按 seed 分项记录，支持多条内置并给老用户补种 */
const DIARY_SEED_KEY_PREFIX_V1 = 'dk_diary_welcome_seed_v1_'
const DIARY_SEED_KEY_PREFIX_V2 = 'dk_diary_seeds_v2_'

/** 微信正式发布日 */
const WECHAT_RELEASE_DATE = '2011-01-21'

const OLD_ANN_TITLES = ['认识记日子的日子', '第一次打开记日子']

function ymd(d: Date) {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(n: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d
}

/** 上年最后一天：到今天的「已经」天数 = 今年第几天 */
function yearAnchorDate() {
  return `${new Date().getFullYear() - 1}-12-31`
}

function seedBody(seed: string) {
  return `__dk_seed:${seed}__`
}

function hasSeedMarker(entry: Entry, seed: string) {
  return (entry.body || '').includes(seedBody(seed))
}

type SeedFlags = { todo?: boolean; anniversary?: boolean; diary?: boolean }

function seedKey(userId: string | number) {
  return `${SEED_KEY_PREFIX}${userId}`
}

function readFlags(userId: string | number): SeedFlags {
  try {
    const raw = uni.getStorageSync(seedKey(userId))
    if (!raw) return {}
    if (typeof raw === 'string') return JSON.parse(raw) as SeedFlags
    return (raw as SeedFlags) || {}
  } catch {
    return {}
  }
}

function writeFlags(userId: string | number, flags: SeedFlags) {
  try {
    uni.setStorageSync(seedKey(userId), JSON.stringify(flags))
  } catch {
    /* ignore */
  }
}

function diarySeedKeyV1(userId: string | number) {
  return `${DIARY_SEED_KEY_PREFIX_V1}${userId}`
}

function diarySeedKeyV2(userId: string | number) {
  return `${DIARY_SEED_KEY_PREFIX_V2}${userId}`
}

type DiarySeedFlags = Record<string, boolean>

function readDiarySeedFlags(userId: string | number): DiarySeedFlags {
  try {
    const raw = uni.getStorageSync(diarySeedKeyV2(userId))
    if (raw) {
      if (typeof raw === 'string') return JSON.parse(raw) as DiarySeedFlags
      return (raw as DiarySeedFlags) || {}
    }
  } catch {
    /* ignore */
  }
  // 兼容 v1：已种过欢迎日记的老用户，标记 welcome 已完成，其余 seed 仍可补种
  try {
    if (uni.getStorageSync(diarySeedKeyV1(userId))) {
      return { diary_welcome: true }
    }
  } catch {
    /* ignore */
  }
  return {}
}

function writeDiarySeedFlags(userId: string | number, flags: DiarySeedFlags) {
  try {
    uni.setStorageSync(diarySeedKeyV2(userId), JSON.stringify(flags))
  } catch {
    /* ignore */
  }
}

function todoSeedInput(): EntryInput {
  return {
    type: 'todo',
    title: TODO_SEED_TITLE,
    eventDate: ymd(addDays(0)),
    calendar: 'solar',
    repeatRule: 'none',
    showInTimeline: true,
    remindAheadDays: 1,
    todoStatus: 'pending',
    clientRequestId: 'seed:todo_welcome',
  }
}

const TODO_SEED_TITLE = '开始使用待办功能，点击右侧圆圈标记为已完成'
const LEGACY_TODO_SEED_TITLES = ['开始使用待办功能，点击左侧标记为已完成']

const COS_PUBLIC_HOST =
  (import.meta.env.VITE_COS_PUBLIC_HOST as string | undefined)?.replace(/\/$/, '') || ''
const COS_PREFIX =
  (import.meta.env.VITE_COS_PREFIX as string | undefined)?.replace(/^\/|\/$/g, '') || ''
const DIARY_SEED_IMAGE_DIR = COS_PUBLIC_HOST
  ? `${COS_PUBLIC_HOST}/${COS_PREFIX ? `${COS_PREFIX}/` : ''}system/diary`
  : ''
/** 识别系统配图：COS 路径或历史本地 static 路径 */
const DIARY_SEED_IMAGE_HINTS = ['/system/diary/', '/static/system-diary/']

type DiarySeedDef = {
  seed: string
  title: string
  text: string
  eventDate: string
  eventAt: string
  images: string[]
  /** 正文匹配（兼容无标记的旧数据） */
  textHints: string[]
}

const DIARY_SEEDS: DiarySeedDef[] = [
  {
    seed: 'diary_welcome',
    title: '欢迎来到只我们',
    text: '欢迎来到只我们。\n有些生活不必公开，只想留给我们。你可以先写下一件今天想记住的小事，也可以邀请最在乎的人，一起把生活留在这里。',
    eventDate: '2026-07-20',
    eventAt: '2026-07-20 20:20:00',
    images: DIARY_SEED_IMAGE_DIR ? [
      `${DIARY_SEED_IMAGE_DIR}/modern-city-night.jpg`,
      `${DIARY_SEED_IMAGE_DIR}/underwater-world.jpg`,
      `${DIARY_SEED_IMAGE_DIR}/cyberpunk-city.jpg`,
    ] : [],
    textHints: ['欢迎来到只我们', '这里是随手记，欢迎记录下一闪而过'],
  },
  {
    seed: 'diary_tomato_eggs',
    title: '西红柿炒蛋～',
    text:
      '西红柿炒蛋～\n材料：几个西红柿和几颗鸡蛋。把西红柿洗净切片，鸡蛋打散备用。锅里倒点油，等油热了，倒入打散的鸡蛋，轻轻翻炒至凝固，盛出备用。接着在锅里再加点油，放入西红柿片翻炒，加少许盐调味，直到西红柿变软出汁。最后把炒好的鸡蛋倒回锅里，与西红柿一起翻炒均匀，再撒上一点葱花提香。\n\n简单的步骤，却有一种家的味道。坐在餐桌旁，闻着香气，心情也变得格外愉快。🌞🍅🍳\n' +
      `${'　'.repeat(12)}——示例`,
    eventDate: '2026-07-28',
    eventAt: '2026-07-28 16:59:18',
    images: [`${DIARY_SEED_IMAGE_DIR}/tomato-eggs.png`],
    textHints: ['西红柿炒蛋～', '材料：几个西红柿和几颗鸡蛋', '——示例'],
  },
]

/** 防止 onShow / 热重载短时间并发触发多次创建 */
const diarySeedTasks = new Map<string, Promise<Entry[]>>()
let sharedSeedTask: Promise<Entry[]> | null = null

function diarySeedBody(def: DiarySeedDef) {
  return `${def.text}\n${seedBody(def.seed)}`
}

function diarySeedInput(def: DiarySeedDef): EntryInput {
  return {
    type: 'diary',
    title: def.title,
    body: diarySeedBody(def),
    eventDate: def.eventDate,
    eventAt: def.eventAt,
    calendar: 'solar',
    repeatRule: 'none',
    pinned: false,
    showInTimeline: false,
    remindEnabled: false,
    remindAheadDays: 1,
    images: [...def.images],
    clientRequestId: `seed:${def.seed}`,
  }
}

function diaryEventAtKey(item: Entry) {
  return (item.eventAt || '').replace('T', ' ').slice(0, 16)
}

function hasSystemDiaryImages(item: Entry) {
  return (item.images || []).some((src) =>
    DIARY_SEED_IMAGE_HINTS.some((hint) => String(src).includes(hint)),
  )
}

function looksLikeGarbageDiaryBody(body: string) {
  const text = (body || '').trim()
  if (!text) return false
  if (/^https?:\/\//i.test(text)) return true
  if (/^aHR0c/i.test(text)) return true // base64('http...')
  if (/ttstqq\.com/i.test(text)) return true
  return false
}

function matchDiarySeed(item: Entry, def: DiarySeedDef): boolean {
  if (item.type !== 'diary') return false
  const body = item.body || ''
  const title = item.title || ''
  if (hasSeedMarker(item, def.seed)) return true

  if (def.seed === 'diary_welcome') {
    if (def.textHints.some((hint) => body.includes(hint))) return true
    if (item.eventDate === def.eventDate && diaryEventAtKey(item) === def.eventAt.slice(0, 16)) {
      return true
    }
    if (looksLikeGarbageDiaryBody(body) && item.eventDate === def.eventDate) return true
    if (
      (item.images || []).some((src) =>
        def.images.some((img) => String(src).includes(img.split('/').pop() || '')),
      )
    ) {
      return true
    }
    return false
  }

  if (def.seed === 'diary_tomato_eggs') {
    const images = item.images || []
    if (images.some((src) => String(src).includes('tomato-eggs'))) return true
    // 早期误种：标题/正文带「西红柿炒蛋」，时间戳固定为种子时间，正文很短或无标记
    if (
      (title.includes('西红柿炒蛋') || body.includes('西红柿炒蛋')) &&
      diaryEventAtKey(item) === def.eventAt.slice(0, 16)
    ) {
      return true
    }
    if (body.includes('材料：几个西红柿和几颗鸡蛋') && body.includes('——示例')) return true
    if (
      (title.includes('西红柿炒蛋') || body.includes('西红柿炒蛋')) &&
      def.textHints.every((hint) => body.includes(hint))
    ) {
      return true
    }
    return false
  }

  return def.textHints.some((hint) => body.includes(hint))
}

function diarySeedScore(item: Entry, def: DiarySeedDef) {
  let score = 0
  const body = item.body || ''
  const title = item.title || ''
  if (hasSeedMarker(item, def.seed)) score += 8
  if (def.textHints.some((hint) => body.includes(hint))) score += 6
  if (hasSystemDiaryImages(item)) score += 4
  if ((item.images || []).length >= def.images.length) score += 2
  if (looksLikeGarbageDiaryBody(body)) score -= 10
  if (item.pinned) score -= 1
  if (def.seed === 'diary_tomato_eggs') {
    if (body.includes('材料：几个西红柿和几颗鸡蛋')) score += 10
    if ((item.images || []).some((src) => String(src).includes('tomato-eggs'))) score += 6
    // 早期残缺种子：标题=正文=西红柿炒蛋
    if (title.includes('西红柿炒蛋') && body.trim() === title.trim()) score -= 12
    if (body.length < 40) score -= 6
  }
  return score
}

export function displayDiaryBody(body: string) {
  // 种子标记仅供识别，展示时一律去掉（欢迎日记等）
  return (body || '').replace(/__dk_seed:[\w-]+__/g, '').trim()
}

/** 列表层兜底：每种内置随手记只留一条 */
export function dedupeWelcomeDiaries(list: Entry[]): Entry[] {
  let next = list
  for (const def of DIARY_SEEDS) {
    const rows = next.filter((item) => matchDiarySeed(item, def))
    if (rows.length <= 1) continue
    const keep = [...rows].sort((a, b) => diarySeedScore(b, def) - diarySeedScore(a, def))[0]
    const drop = new Set(rows.filter((item) => item.id !== keep.id).map((item) => item.id))
    next = next.filter((item) => !drop.has(item.id))
  }
  return next
}

/**
 * 首次无随手记时写入内置示例；已有欢迎日记的老用户会补种「西红柿炒蛋」。
 * 服务端按用户永久记录 seed；删除、清缓存或换设备后均不会再次补种。
 */
export async function ensureDiarySeed(existing: Entry[]): Promise<Entry[]> {
  let userId: string | number
  try {
    const me = await fetchMe()
    userId = me.id
  } catch {
    return existing
  }

  const taskKey = String(userId)
  const running = diarySeedTasks.get(taskKey)
  if (running) return running

    const task = (async () => {
    let list = dedupeWelcomeDiaries([...existing])
    const flags = readDiarySeedFlags(userId)
    let dirtyFlags = false
    const seedsToMark = new Set<string>()

    // 服务端状态是最终依据；本地标记只在接口短暂不可用时充当兼容兜底。
    try {
      const serverSeeds = await getEntrySeedState()
      for (const seed of serverSeeds) {
        if (!flags[seed]) {
          flags[seed] = true
          dirtyFlags = true
        }
      }
    } catch (error) {
      console.warn('[seed] pull diary seed state failed, fallback to local state', error)
    }

    for (const def of DIARY_SEEDS) {
      const rows = list.filter((item) => matchDiarySeed(item, def))
      if (rows.length) {
        const keep = [...rows].sort((a, b) => diarySeedScore(b, def) - diarySeedScore(a, def))[0]
        const duplicateIds = new Set(rows.filter((item) => item.id !== keep.id).map((item) => item.id))
        if (duplicateIds.size) {
          await Promise.all(
            [...duplicateIds].map((id) =>
              deleteEntry(id).catch((error) =>
                console.warn('[seed] remove duplicate diary failed', id, error),
              ),
            ),
          )
          list = list.filter((item) => !duplicateIds.has(item.id))
        }

        const patch: Partial<EntryInput> = {}
        if (keep.pinned) patch.pinned = false
        const keepBody = keep.body || ''
        const expectedBody = diarySeedBody(def)
        if (looksLikeGarbageDiaryBody(keepBody) && def.seed === 'diary_welcome') {
          patch.body = expectedBody
          patch.title = def.title
        } else if (
          def.textHints.some((hint) => keepBody.includes(hint)) &&
          (!hasSeedMarker(keep, def.seed) || displayDiaryBody(keepBody) !== def.text)
        ) {
          // 无标记，或正文与最新内置文案不一致（如缺「西红柿炒蛋～」）时回写
          patch.body = expectedBody
          patch.title = def.title
        }
        const imgs = keep.images || []
        const needsSystemImages =
          !imgs.length ||
          imgs.some((src) => String(src).includes('/static/system-diary/')) ||
          (def.seed === 'diary_tomato_eggs' &&
            !imgs.some((src) => String(src).includes('tomato-eggs')))
        if (needsSystemImages) patch.images = [...def.images]

        if (Object.keys(patch).length) {
          try {
            const updated = await updateEntry(keep.id, patch)
            list = list.map((item) => (item.id === updated.id ? updated : item))
          } catch (error) {
            console.warn('[seed] normalize diary failed', keep.id, error)
            if (patch.pinned === false) {
              list = list.map((item) =>
                item.id === keep.id ? { ...item, pinned: false } : item,
              )
            }
          }
        }

        if (!flags[def.seed]) {
          flags[def.seed] = true
          dirtyFlags = true
        }
        seedsToMark.add(def.seed)
        continue
      }

      // 服务端或本地已标记且列表没有 → 视为用户删过，不再补种。
      if (flags[def.seed]) continue

      try {
        const row = await createEntry(diarySeedInput(def))
        list = [row, ...list]
        flags[def.seed] = true
        dirtyFlags = true
        seedsToMark.add(def.seed)
      } catch (error) {
        console.warn(`[seed] diary ${def.seed} failed`, error)
      }
    }

    if (dirtyFlags) writeDiarySeedFlags(userId, flags)
    if (seedsToMark.size) {
      try {
        await markEntrySeeds([...seedsToMark])
      } catch (error) {
        // 创建接口本身也会写入服务端状态；这里主要用于回填无标记的旧数据。
        console.warn('[seed] persist diary seed state failed', error)
      }
    }
    return dedupeWelcomeDiaries(list)
  })()

  diarySeedTasks.set(taskKey, task)
  try {
    return await task
  } finally {
    diarySeedTasks.delete(taskKey)
  }
}

type AnnSeedDef = {
  seed: string
  title: string
  createDate: () => string
  syncDate?: () => string
}

const ANN_SEEDS: AnnSeedDef[] = [
  {
    seed: 'wechat_release',
    title: '微信发布',
    createDate: () => WECHAT_RELEASE_DATE,
  },
  {
    seed: 'year_progress',
    title: '今年',
    createDate: () => yearAnchorDate(),
    syncDate: () => yearAnchorDate(),
  },
  {
    seed: 'self_promise',
    title: '给自己的小约定',
    createDate: () => ymd(addDays(7)),
  },
]

function annSeedInput(def: AnnSeedDef): EntryInput {
  return {
    type: 'anniversary',
    title: def.title,
    body: seedBody(def.seed),
    eventDate: def.createDate(),
    calendar: 'solar',
    repeatRule: 'none',
    showInTimeline: true,
    remindAheadDays: 1,
    clientRequestId: `seed:${def.seed}`,
  }
}

function findAnnSeed(list: Entry[], def: AnnSeedDef): Entry | undefined {
  return (
    list.find((x) => x.type === 'anniversary' && hasSeedMarker(x, def.seed)) ||
    list.find((x) => x.type === 'anniversary' && x.title === def.title)
  )
}

function daysBetween(eventDate: string, today = new Date()) {
  const [y, m, d] = eventDate.slice(0, 10).split('-').map(Number)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const target = new Date(y, m - 1, d)
  return Math.round((target.getTime() - start.getTime()) / 86400000)
}

function withDays(entry: Entry, eventDate: string): Entry {
  return {
    ...entry,
    eventDate,
    daysUntil: daysBetween(eventDate),
  }
}

/**
 * 若该用户尚未种过且当前没有对应类型数据，则写入共享示例。
 * 日期示例会做版本迁移；「今年」每次对齐到上年 12-31 锚点。
 */
async function ensureSharedSeedsInner(existing: Entry[]): Promise<Entry[]> {
  let userId: string | number = getCachedUserId()
  if (!userId) {
    try {
      const me = await fetchMe()
      userId = me.id
    } catch {
      return existing
    }
  }

  const flags = readFlags(userId)
  let list = [...existing]
  let dirty = false

  // 先清理历史并发产生的重复内置日期；仅按隐藏 seed 标记识别，
  // 不会误删用户自己创建的同名记录。
  for (const def of ANN_SEEDS) {
    const rows = list.filter(
      (item) =>
        item.type === 'anniversary' && hasSeedMarker(item, def.seed),
    )
    const duplicateIds = new Set(rows.slice(1).map((item) => item.id))
    if (!duplicateIds.size) continue
    await Promise.all(
      [...duplicateIds].map((id) =>
        deleteEntry(id).catch((error) =>
          console.warn('[seed] remove duplicate anniversary failed', id, error),
        ),
      ),
    )
    list = list.filter((item) => !duplicateIds.has(item.id))
  }

  // —— 待办 ——
  const hasTodo = list.some((x) => x.type === 'todo')
  if (!hasTodo && !flags.todo) {
    try {
      list = [await createEntry(todoSeedInput()), ...list]
      flags.todo = true
      dirty = true
    } catch (e) {
      console.warn('[seed] todo failed', e)
    }
  } else if (hasTodo && !flags.todo) {
    flags.todo = true
    dirty = true
  }

  const legacyTodo = list.find((x) => x.type === 'todo' && LEGACY_TODO_SEED_TITLES.includes(x.title || ''))
  if (legacyTodo) {
    try {
      const updated = await updateEntry(legacyTodo.id, { title: TODO_SEED_TITLE })
      list = list.map((item) => (item.id === updated.id ? updated : item))
    } catch {
      list = list.map((item) => (item.id === legacyTodo.id ? { ...item, title: TODO_SEED_TITLE } : item))
    }
  }

  // —— 日期：迁移旧示例 + 补齐 4 条内置 ——
  const hasAnn = list.some((x) => x.type === 'anniversary')
  const hadOldAnn = list.some(
    (x) => x.type === 'anniversary' && OLD_ANN_TITLES.includes(x.title),
  )
  if (!flags.anniversary) {
    try {
      if (!hasAnn) {
        const rows = await Promise.all(ANN_SEEDS.map((def) => createEntry(annSeedInput(def))))
        list = [...rows, ...list]
      } else if (hadOldAnn) {
        for (const old of list.filter(
          (x) => x.type === 'anniversary' && OLD_ANN_TITLES.includes(x.title),
        )) {
          await deleteEntry(old.id)
          list = list.filter((x) => x.id !== old.id)
        }
        for (const def of ANN_SEEDS) {
          if (findAnnSeed(list, def)) continue
          const row = await createEntry(annSeedInput(def))
          list = [row, ...list]
        }
      }
      flags.anniversary = true
      dirty = true
    } catch (e) {
      console.warn('[seed] anniversary failed', e)
    }
  }

  // 「今年」实时对齐锚点，并本地重算天数
  const yearDef = ANN_SEEDS.find((x) => x.seed === 'year_progress')!
  const yearEntry = findAnnSeed(list, yearDef)
  if (yearEntry && yearDef.syncDate) {
    const want = yearDef.syncDate()
    if (yearEntry.eventDate !== want) {
      try {
        const updated = await updateEntry(yearEntry.id, {
          eventDate: want,
          body: seedBody(yearDef.seed),
          title: yearDef.title,
        })
        list = list.map((x) => (x.id === updated.id ? updated : x))
      } catch {
        list = list.map((x) =>
          x.id === yearEntry.id ? withDays({ ...yearEntry, title: yearDef.title }, want) : x,
        )
      }
    } else {
      list = list.map((x) =>
        x.id === yearEntry.id ? withDays(yearEntry, yearEntry.eventDate) : x,
      )
    }
  }

  // 微信发布：展示用固定发布日重算（不强制写库）
  const wechatDef = ANN_SEEDS.find((x) => x.seed === 'wechat_release')!
  const wechatEntry = findAnnSeed(list, wechatDef)
  if (wechatEntry) {
    list = list.map((x) =>
      x.id === wechatEntry.id
        ? withDays({ ...wechatEntry, eventDate: WECHAT_RELEASE_DATE }, WECHAT_RELEASE_DATE)
        : x,
    )
  }

  if (dirty) writeFlags(userId, flags)
  return list
}

/** 页面多次 onShow 时共享同一个播种任务，防止并发重复创建。 */
export async function ensureSharedSeeds(existing: Entry[]): Promise<Entry[]> {
  if (sharedSeedTask) return sharedSeedTask
  sharedSeedTask = ensureSharedSeedsInner(existing)
  try {
    return await sharedSeedTask
  } finally {
    sharedSeedTask = null
  }
}
