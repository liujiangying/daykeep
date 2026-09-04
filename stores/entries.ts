import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listEntries, type Entry, type EntryOwnerType, type EntryType } from '@/services/entries'
import { ensureSharedSeeds, ensureDiarySeed } from '@/services/systemEntries'
import { isSessionBoundaryError } from '@/services/auth'

const STORAGE_KEY = 'dk_entries_cache'
const CACHE_TTL = 5 * 60 * 1000 // 5 min

interface CachePayload {
  list: Entry[]
  ts: number
}

/**
 * 缓存必须按「仅自己 / 某个时光圈」分区。
 * 之前只有一个 key，切换时光圈时 TTL 守卫看到 lastFetchAt 还新鲜就直接 return，
 * 结果是显示上一个空间的记录且完全不发请求，并且会把 A 空间的列表写进 B 空间的缓存。
 */
function scopeKeyOf(ownerType?: EntryOwnerType, spaceId?: string | null): string {
  if ((ownerType || 'personal') !== 'space') return 'personal'
  return `space:${spaceId || 'all'}`
}

/** personal 沿用旧 key，避免升级后老用户缓存整体失效。 */
function storageKeyOf(scope: string): string {
  return scope === 'personal' ? STORAGE_KEY : `${STORAGE_KEY}:${scope}`
}

function readCache(scope: string): CachePayload {
  try {
    const raw = uni.getStorageSync(storageKeyOf(scope))
    if (!raw) return { list: [], ts: 0 }
    const payload: CachePayload = typeof raw === 'string' ? JSON.parse(raw) : raw
    return {
      list: Array.isArray(payload.list) ? payload.list : [],
      ts: typeof payload.ts === 'number' ? payload.ts : 0,
    }
  } catch {
    return { list: [], ts: 0 }
  }
}

function writeCache(scope: string, list: Entry[]) {
  writeCacheAt(scope, list, Date.now())
}

function writeCacheAt(scope: string, list: Entry[], ts: number) {
  try {
    const payload: CachePayload = { list, ts }
    uni.setStorageSync(storageKeyOf(scope), JSON.stringify(payload))
  } catch {
    /* storage full or not available */
  }
}

/** 旧版本或并发请求可能污染过缓存；读取和接口返回都必须再次按归属过滤。 */
function entriesForScope(entries: Entry[], targetScope: string): Entry[] {
  if (targetScope === 'personal') {
    return entries.filter((entry) => (entry.ownerType || 'personal') === 'personal' && !entry.spaceId)
  }
  const [kind, spaceId] = targetScope.split(':')
  if (kind !== 'space' || !spaceId || spaceId === 'all') return []
  return entries.filter((entry) => entry.ownerType === 'space' && String(entry.spaceId || '') === spaceId)
}

export const useEntriesStore = defineStore('entries', () => {
  const scope = ref('personal')
  const cache = readCache(scope.value)
  const initialList = entriesForScope(cache.list, scope.value)
  const list = ref<Entry[]>(initialList)
  const loading = ref(false)
  const lastFetchAt = ref(initialList.length === cache.list.length ? cache.ts : 0)
  let loadGeneration = 0

  function persist(next: Entry[]) {
    writeCache(scope.value, next)
  }

  /**
   * 写操作完成后只让对应作用域失效。下一次页面 onShow 会重新拉取，
   * 同时避免首页与好日子在单纯来回切换时各自强制请求同一份数据。
   */
  function invalidate(ownerType: EntryOwnerType = 'personal', spaceId?: string | null) {
    const targetScope = scopeKeyOf(ownerType, ownerType === 'space' ? spaceId : null)
    const cached = readCache(targetScope)
    writeCache(targetScope, cached.list)
    // writeCache 会写入当前时间；这里显式保存 ts=0，确保下一次 load 不命中 TTL。
    try {
      uni.setStorageSync(storageKeyOf(targetScope), JSON.stringify({ list: cached.list, ts: 0 }))
    } catch {
      /* storage unavailable */
    }
    if (scope.value === targetScope) lastFetchAt.value = 0
  }

  /** 切换到另一个作用域：换成该作用域自己的缓存与时间戳，TTL 才不会串味。 */
  function useScope(next: string) {
    if (next === scope.value) return
    scope.value = next
    const cached = readCache(next)
    const safeList = entriesForScope(cached.list, next)
    list.value = safeList
    lastFetchAt.value = cached.ts
    if (safeList.length !== cached.list.length) writeCacheAt(next, safeList, 0)
  }

  /** SWR: 先展示缓存，后台刷新后替换 */
  async function load(opts: { force?: boolean; ownerType?: EntryOwnerType; spaceId?: string | null } = {}) {
    // ownerType 与 spaceId 必须自洽后再用。
    // 后端把 owner_type 和 space_id 两个条件 AND 起来，而空间记录的 owner_type 恒为
    // 'space'，所以 personal + spaceId 必然查出 0 行；scopeKeyOf 又会把这个空结果
    // 归到 'personal' scope，把「仅自己」的缓存冲掉。这里统一丢弃矛盾的 spaceId，
    // 让任何调用方都不可能写坏别的作用域。
    const ownerType = opts.ownerType
    const spaceId = ownerType === 'space' ? opts.spaceId : null
    const targetScope = scopeKeyOf(ownerType, spaceId)
    const generation = ++loadGeneration
    useScope(targetScope)
    // 示例记录只属于「仅自己」，补种到时光圈里会让共同空间凭空出现个人示例。
    const seedable = targetScope === 'personal'

    // 缓存未过期时也要跑随手记补种（老用户补「西红柿炒蛋」等），不能整段跳过
    if (!opts.force && Date.now() - lastFetchAt.value < CACHE_TTL && list.value.length > 0) {
      if (!seedable) {
        loading.value = false
        return
      }
      try {
        const seeded = entriesForScope(await ensureDiarySeed(list.value), targetScope)
        writeCache(targetScope, seeded)
        if (generation === loadGeneration && scope.value === targetScope) {
          list.value = seeded
          lastFetchAt.value = Date.now()
        }
      } catch (error) {
        console.warn('[entries] diary seed on cache hit failed', error)
      }
      if (generation === loadGeneration) loading.value = false
      return
    }

    loading.value = true
    try {
      const res = await listEntries({ pageSize: 200, ownerType, spaceId })
      // 首次/缺示例时补种；已种过则很快返回（内部有 flag）
      let seeded = res.list
      if (seedable) {
        seeded = await ensureSharedSeeds(seeded)
        seeded = await ensureDiarySeed(seeded)
      }
      const safeList = entriesForScope(seeded, targetScope)
      const fetchedAt = Date.now()
      // 用户已经切换空间时，请求结果仍只写回它发起时所属的缓存。
      writeCacheAt(targetScope, safeList, fetchedAt)
      if (generation !== loadGeneration || scope.value !== targetScope) return
      list.value = safeList
      lastFetchAt.value = fetchedAt
    } catch (e: any) {
      // 登录失效必须交给页面更新登录态，不能被缓存降级逻辑吞掉。
      if (isSessionBoundaryError(e)) throw e
      // 网络失败时保留旧缓存数据，不清空；仍尝试本地补种
      if (seedable) {
        try {
          const cached = entriesForScope(readCache(targetScope).list, targetScope)
          const seeded = entriesForScope(await ensureDiarySeed(cached), targetScope)
          writeCache(targetScope, seeded)
          if (generation === loadGeneration && scope.value === targetScope) list.value = seeded
        } catch {
          /* ignore */
        }
      }
      if (generation !== loadGeneration || scope.value !== targetScope) return
      if (entriesForScope(list.value, targetScope).length === 0) {
        // 首次加载失败且无缓存，提示用户
        throw e
      }
      // 有缓存的情况下静默失败
    } finally {
      if (generation === loadGeneration) loading.value = false
    }
  }

  /** 强制刷新。保持当前作用域，不能无声退回「仅自己」。 */
  function refresh() {
    const [kind, id] = scope.value.split(':')
    const isSpace = kind === 'space'
    return load({
      force: true,
      ownerType: isSpace ? 'space' : 'personal',
      spaceId: isSpace && id && id !== 'all' ? id : null,
    })
  }

  /** 按类型过滤 */
  function byType(type: EntryType) {
    return list.value.filter((e) => e.type === type)
  }

  function bySpace(ownerType: EntryOwnerType = 'personal', spaceId?: string | null) {
    return list.value.filter((entry) => {
      const entryOwnerType = entry.ownerType || 'personal'
      if (ownerType === 'personal') return entryOwnerType === 'personal' || !entry.spaceId
      return entryOwnerType === 'space' && (!spaceId || entry.spaceId === spaceId)
    })
  }

  /** 乐观更新单条 */
  function optimisticUpdate(id: string, patch: Partial<Entry>) {
    list.value = list.value.map((e) => (e.id === id ? { ...e, ...patch } : e))
    persist(list.value)
  }

  /** 乐观添加 */
  function optimisticAdd(entry: Entry) {
    list.value = [entry, ...list.value]
    persist(list.value)
  }

  /** 乐观删除 */
  function optimisticRemove(id: string) {
    list.value = list.value.filter((e) => e.id !== id)
    persist(list.value)
  }

  return {
    list,
    loading,
    lastFetchAt,
    load,
    refresh,
    byType,
    bySpace,
    optimisticUpdate,
    optimisticAdd,
    invalidate,
    optimisticRemove,
  }
})
