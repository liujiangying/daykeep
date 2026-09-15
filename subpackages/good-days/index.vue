<template>
  <view class="page" :style="pageStyle">
    <!-- 翻页时钟 -->
    <view class="clock-wrap">
      <text class="clock-date">{{ dateLabel }}</text>
      <view class="flip-row">
        <view v-for="(d, i) in hourDigits" :key="'h' + i" class="digit">
          <view class="digit-face">
            <text class="digit-text">{{ d }}</text>
            <view class="digit-seam" />
          </view>
        </view>
        <view class="colon">
          <view class="dot" />
          <view class="dot" />
        </view>
        <view v-for="(d, i) in minuteDigits" :key="'m' + i" class="digit">
          <view class="digit-face">
            <text class="digit-text">{{ d }}</text>
            <view class="digit-seam" />
          </view>
        </view>
      </view>
    </view>

    <view v-if="!loggedIn" class="empty">
      <text class="empty-t">登录后查看好日子</text>
      <button class="btn" @tap="goLogin">去登录</button>
    </view>

    <view v-else-if="loading && !list.length" class="empty">
      <text class="empty-t">加载中…</text>
    </view>

    <template v-else>
      <!-- 日期 / 待办 -->
      <view class="page-switch">
        <text
          class="ps"
          :class="{ on: pageKind === 'anniversary' }"
          @tap="setPageKind('anniversary')"
        >日期</text>
        <text class="ps-sep">/</text>
        <text
          class="ps"
          :class="{ on: pageKind === 'todo' }"
          @tap="setPageKind('todo')"
        >待办</text>
      </view>

      <!-- 子筛选：默认全部；再点同一项取消筛选 -->
      <view class="sub-tabs">
        <template v-if="pageKind === 'anniversary'">
          <text
            class="st"
            :class="{ on: annTab === 'upcoming' }"
            @tap="setAnnTab('upcoming')"
          >即将到来</text>
          <text class="st-sep">·</text>
          <text
            class="st"
            :class="{ on: annTab === 'past' }"
            @tap="setAnnTab('past')"
          >已经过去</text>
        </template>
        <template v-else>
          <text
            class="st"
            :class="{ on: todoTab === 'open' }"
            @tap="setTodoTab('open')"
          >事项</text>
          <text class="st-sep">·</text>
          <text
            class="st"
            :class="{ on: todoTab === 'done' }"
            @tap="setTodoTab('done')"
          >已完成</text>
          <text class="st-sep">·</text>
          <text
            class="st"
            :class="{ on: todoTab === 'overdue' }"
            @tap="setTodoTab('overdue')"
          >已逾期</text>
        </template>
      </view>

      <view v-if="!visibleList.length" class="empty empty-filter">
        <text class="empty-msg">{{ emptyMessage }}</text>
      </view>

      <view v-else class="list">
        <!-- 待办：备忘录式小字整行 -->
        <template v-if="pageKind === 'todo'">
          <view
            v-for="item in visibleList"
            :key="item.id"
            class="todo-row"
            :class="{ done: isDone(item) }"
            @tap="openEdit(item.id)"
          >
            <view
              class="todo-check"
              :class="{ on: isDone(item) }"
              @tap.stop="onToggleTodo(item)"
            >
              <text v-if="isDone(item)" class="todo-check-mark">✓</text>
            </view>
            <view class="todo-main">
              <text
                v-if="todoCorner(item)"
                class="todo-corner"
                :class="todoCornerClass(item)"
              >{{ todoCorner(item) }}</text>
              <text class="todo-title">{{ item.title }}</text>
              <text class="todo-date">{{ todoDateText(item) }}</text>
            </view>
          </view>
        </template>

        <!-- 日期：倒计时列表 -->
        <template v-else>
          <view
            v-for="row in visibleAnniversaryRows"
            :key="row.entry.id"
            class="cd-row"
            :class="{ dim: row.past }"
            @tap="openEdit(row.entry.id)"
          >
            <view class="cd-main">
              <view class="title-row">
                <text v-if="row.entry.pinned" class="pin">置顶</text>
                <text class="cd-title">{{ row.entry.title }}</text>
                <view v-if="row.members.length" class="collab-badge">
                  <template v-for="member in row.members" :key="member.userId">
                    <image
                      v-if="member.avatarUrl"
                      :src="member.avatarUrl"
                      class="collab-tiny-avatar"
                      mode="aspectFill"
                    />
                    <text v-else class="collab-tiny-avatar collab-tiny-dot">{{ member.nickname?.slice(0, 1) || '人' }}</text>
                  </template>
                  <text v-if="row.memberOverflow" class="collab-tiny-avatar collab-tiny-dot collab-more">+{{ row.memberOverflow }}</text>
                </view>
                <text v-if="row.verb" class="cd-verb">{{ row.verb }}</text>
              </view>
              <text class="cd-meta">{{ row.meta }}</text>
            </view>
            <view
              class="cd-tail"
              :class="{
                soon: row.soon,
                today: row.entry.daysUntil === 0,
                past: row.past,
              }"
            >
              <text class="cd-countdown">{{ row.countdown }}</text>
            </view>
          </view>
        </template>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { onLoad, onShow, onHide } from '@dcloudio/uni-app'
import { fetchMe, getCachedUserId, isLoggedIn, isSessionBoundaryError, isTransientAccessError, logout } from '@/services/auth'
import { toggleTodoDone, type Entry } from '@/services/entries'
import { useEntriesStore } from '@/stores/entries'
import { holidaysForTimeline, syncHolidaySettings } from '@/services/holidays'
import { useThemePage } from '@/composables/useThemePage'
import { listSpaces, type Space } from '@/services/spaces'
import { request } from '@/api/request'
import { getPreferredSpaceId, setPreferredSpaceId } from '@/services/spacePreference'
import { normalizeRepeatRule, repeatRuleLabel } from '@/utils/countdown'
import { formatAnnualDateLabel, formatDateLabel } from '@/utils/lunar'

const { pageStyle } = useThemePage()

const entriesStore = useEntriesStore()
const loggedIn = ref(false)
const loading = computed(() => entriesStore.loading)
const list = computed(() => entriesStore.list)
const pageKind = ref<'anniversary' | 'todo'>('anniversary')
/** all = 默认全部；点选项筛选，再点同一项回到全部 */
const annTab = ref<'all' | 'upcoming' | 'past'>('all')
const todoTab = ref<'all' | 'open' | 'done' | 'overdue'>('all')
const emptyMessage = computed(() => {
  if (pageKind.value === 'anniversary') {
    if (annTab.value === 'upcoming') return '还没有即将到来的日子'
    if (annTab.value === 'past') return '还没有已经过去的日子'
    return '还没有记录日子'
  }
  if (todoTab.value === 'open') return '还没有待完成的事项'
  if (todoTab.value === 'done') return '还没有已完成的事项'
  if (todoTab.value === 'overdue') return '还没有已逾期的事项'
  return '还没有记录事项'
})
const toggling = ref('')
const holidayRevision = ref(0)

const spaces = ref<Space[]>([])
const currentSpaceId = ref<string | null>(null)
const spacesLoaded = ref(false)
const currentSpace = computed(() => spaces.value.find((space) => space.id === currentSpaceId.value) || null)
// 空间归属只认 currentSpaceId，不能从尚未加载完成的 currentSpace 对象推导。
const currentOwnerType = computed(() => (currentSpaceId.value ? 'space' as const : 'personal' as const))

interface GoodDaysCollaborator {
  userId: string
  nickname: string
  avatarUrl: string
  role: string
}
interface GoodDaysCollaboration {
  members?: GoodDaysCollaborator[]
  partnerNickname: string
  partnerAvatar: string
}
const collabMap = ref<Record<string, GoodDaysCollaboration>>({})
const currentUser = ref<GoodDaysCollaborator | null>(null)

function collabMembers(entryId: string | number): GoodDaysCollaborator[] {
  if (currentSpaceId.value && currentSpace.value) {
    return (currentSpace.value.members || []).map((member) => ({
      userId: String(member.userId),
      nickname: member.nickname || '成员',
      avatarUrl: member.avatarUrl || '',
      role: member.role || 'member',
    }))
  }
  const collaboration = collabMap.value[String(entryId)]
  if (!collaboration) return []
  if (Array.isArray(collaboration.members) && collaboration.members.length) {
    return collaboration.members
  }
  const fallbackMembers: GoodDaysCollaborator[] = []
  if (currentUser.value) fallbackMembers.push(currentUser.value)
  if (collaboration.partnerAvatar || collaboration.partnerNickname) {
    fallbackMembers.push({
      userId: `partner-${entryId}`,
      nickname: collaboration.partnerNickname || '共同记录者',
      avatarUrl: collaboration.partnerAvatar || '',
      role: 'partner',
    })
  }
  return fallbackMembers
}

async function loadCollabMap() {
  if (currentSpaceId.value) {
    collabMap.value = {}
    return
  }
  try {
    const [me, data] = await Promise.all([
      fetchMe().catch(() => null),
      request<Record<string, GoodDaysCollaboration>>({
        url: '/api/entries/collaborate/my',
      }),
    ])
    if (me) {
      currentUser.value = {
        userId: String(me.id || getCachedUserId() || 'me'),
        nickname: me.nickname || '我',
        avatarUrl: me.avatarUrl || '',
        role: 'owner',
      }
    }
    collabMap.value = data || {}
  } catch {
    // 页面切换或短暂网络错误时保留上一次结果，避免头像突然消失。
  }
}

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const dateLabel = computed(() => {
  const d = now.value
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${m}月${day}日 ${WEEKDAYS[d.getDay()]}`
})

const hourDigits = computed(() => {
  const h = `${now.value.getHours()}`.padStart(2, '0')
  return [h[0], h[1]]
})

const minuteDigits = computed(() => {
  const m = `${now.value.getMinutes()}`.padStart(2, '0')
  return [m[0], m[1]]
})

function daysValue(item: Entry, fallback = 0) {
  return item.daysUntil == null ? fallback : item.daysUntil
}

function pinFirst(a: Entry, b: Entry) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
  return 0
}

function sortByDays(arr: Entry[], asc: boolean) {
  return [...arr].sort((a, b) => {
    const p = pinFirst(a, b)
    if (p) return p
    const da = daysValue(a)
    const db = daysValue(b)
    return asc ? da - db : db - da
  })
}

type TodoBucket = 'overdue' | 'open' | 'done'

function todoBucket(item: Entry): TodoBucket {
  if (item.todoStatus === 'done') return 'done'
  if (daysValue(item) < 0) return 'overdue'
  return 'open'
}

/** 默认：已逾期 → 事项 → 已完成 */
function sortTodosAll(arr: Entry[]) {
  const order: Record<TodoBucket, number> = { overdue: 0, open: 1, done: 2 }
  return [...arr].sort((a, b) => {
    const p = pinFirst(a, b)
    if (p) return p
    const ca = todoBucket(a)
    const cb = todoBucket(b)
    if (ca !== cb) return order[ca] - order[cb]
    const da = daysValue(a)
    const db = daysValue(b)
    if (ca === 'done') return db - da
    return da - db
  })
}

/** 默认：即将到来在前，已经过去在后 */
function sortAnnAll(arr: Entry[]) {
  return [...arr].sort((a, b) => {
    const p = pinFirst(a, b)
    if (p) return p
    const da = daysValue(a)
    const db = daysValue(b)
    const aUp = da >= 0
    const bUp = db >= 0
    if (aUp !== bUp) return aUp ? -1 : 1
    return aUp ? da - db : db - da
  })
}

const scopedList = computed(() => {
  void holidayRevision.value
  if (pageKind.value === 'todo') {
    return list.value.filter((x) => x.type === 'todo')
  }
  // 内置节日只属于「仅自己」，时光圈里不掺个人节日设置。
  // 同样只认 id：spaces 未加载完时 currentSpace 为 null 会让圈子里短暂混入个人节日。
  const holidays = currentSpaceId.value ? [] : holidaysForTimeline()
  return [
    ...list.value.filter((x) => x.type === 'anniversary'),
    ...holidays,
  ]
})

const visibleList = computed(() => {
  if (pageKind.value === 'todo') {
    const tab = todoTab.value
    if (tab === 'all') return sortTodosAll(scopedList.value)
    const filtered = scopedList.value.filter((x) => todoBucket(x) === tab)
    if (tab === 'done') return sortByDays(filtered, false)
    return sortByDays(filtered, true)
  }
  const tab = annTab.value
  if (tab === 'all') return sortAnnAll(scopedList.value)
  const upcoming = tab === 'upcoming'
  return sortByDays(
    scopedList.value.filter((x) => (upcoming ? daysValue(x) >= 0 : daysValue(x) < 0)),
    upcoming,
  )
})

const visibleAnniversaryRows = computed(() => visibleList.value.map((entry) => {
  const allMembers = collabMembers(entry.id)
  return {
    entry,
    members: allMembers.slice(0, 3),
    memberOverflow: Math.max(0, allMembers.length - 3),
    meta: metaText(entry),
    countdown: countdownText(entry),
    verb: verbText(entry),
    soon: isSoon(entry),
    past: isPastAnn(entry),
  }
}))

function isDone(item: Entry) {
  return item.type === 'todo' && item.todoStatus === 'done'
}

function isOverdue(item: Entry) {
  return item.type === 'todo' && !isDone(item) && daysValue(item) < 0
}

function isPastAnn(item: Entry) {
  return item.type === 'anniversary' && daysValue(item) < 0
}

/** 待办左上角角标：今天 / 已逾期 / 已完成 */
function todoCorner(item: Entry): string {
  if (isDone(item)) return '已完成'
  if (isOverdue(item)) return '已逾期'
  if (daysValue(item) === 0) return '今天'
  return ''
}

function todoCornerClass(item: Entry): string {
  if (isDone(item)) return 'is-done'
  if (isOverdue(item)) return 'is-overdue'
  if (daysValue(item) === 0) return 'is-today'
  return ''
}

function todoDateText(item: Entry): string {
  const raw = item.eventAt || item.eventDate
  const date = item.eventDate?.slice(0, 10) || ''
  const [year, month, day] = date.split('-').map(Number)
  const parsed = year && month && day ? new Date(year, month - 1, day) : null
  const weekday = parsed && !Number.isNaN(parsed.getTime()) ? WEEKDAYS[parsed.getDay()] : ''
  const shortDate = month && day
    ? `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
    : date
  const time = raw.includes(' ') ? raw.split(' ')[1]?.slice(0, 5) : ''
  return [shortDate, weekday, time].filter(Boolean).join(' ')
}

function metaText(item: Entry) {
  if (item.id.startsWith('holiday:')) {
    return `${item.eventDate} · 全年节日`
  }
  const parts: string[] = []
  if (pageKind.value === 'todo') parts.push(`截止 ${item.eventDate}`)
  else {
    const calendar = item.calendar === 'lunar' ? 'lunar' : 'solar'
    parts.push(
      normalizeRepeatRule(item) === 'yearly'
        ? formatAnnualDateLabel(item.eventDate, calendar)
        : formatDateLabel(item.eventDate, calendar),
    )
  }
  const r = repeatRuleLabel(normalizeRepeatRule(item))
  if (r) parts.push(r)
  return parts.join(' · ')
}

/** 左侧：还有 / 已经 / 逾期 */
function verbText(item: Entry) {
  if (isDone(item)) return ''
  const d = item.daysUntil
  if (d == null || d === 0) return ''
  if (d > 0) return '还有'
  // 待办过期未完成用「逾期」，避免和「已完成」混淆
  if (item.type === 'todo') return '逾期'
  return '已经'
}

function dayParts(item: Entry): { mode: 'num'; num: number } | { mode: 'text'; label: string } {
  if (isDone(item)) return { mode: 'text', label: '完成' }
  const d = item.daysUntil
  if (d == null) return { mode: 'text', label: '—' }
  if (d === 0) return { mode: 'text', label: '今天' }
  return { mode: 'num', num: Math.abs(d) }
}

/** 倒计时作为一个完整短语展示，避免「还有/已经」与数字被拆散。 */
function countdownText(item: Entry) {
  const parts = dayParts(item)
  if (parts.mode === 'text') return parts.label
  const prefix = verbText(item)
  return `${prefix ? `${prefix} ` : ''}${parts.num} 天`
}

function isSoon(item: Entry) {
  const d = daysValue(item, 99)
  return d > 0 && d <= 7
}

function startClock() {
  stopClock()
  now.value = new Date()
  // 页面只显示到分钟；分钟级更新可避免小程序每秒为整张列表触发一次 setData。
  timer = setInterval(() => {
    now.value = new Date()
  }, 60_000)
}

function stopClock() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function goLogin() {
  uni.reLaunch({ url: '/pages/login/login' })
}

function setPageKind(k: 'anniversary' | 'todo') {
  pageKind.value = k
}

function setAnnTab(t: 'upcoming' | 'past') {
  annTab.value = annTab.value === t ? 'all' : t
}

function setTodoTab(t: 'open' | 'done' | 'overdue') {
  todoTab.value = todoTab.value === t ? 'all' : t
}

function openEdit(id: string) {
  if (id.startsWith('holiday:')) {
    uni.navigateTo({ url: `/subpackages/day/detail?holiday=${encodeURIComponent(id.slice(8))}` })
    return
  }
  const item = list.value.find((entry) => entry.id === id)
  if (item?.type !== 'diary' && item?.entryKind === 'commitment') {
    uni.navigateTo({ url: `/subpackages/commitment/detail?id=${encodeURIComponent(id)}` })
    return
  }
  uni.navigateTo({ url: `/subpackages/day/detail?id=${encodeURIComponent(id)}` })
}

async function loadSpaces(force = false) {
  if (spacesLoaded.value && !force) return
  try {
    spaces.value = (await listSpaces()).filter((space) => !space.dissolvedAt)
    spacesLoaded.value = true
    if (currentSpaceId.value && !spaces.value.some((space) => space.id === currentSpaceId.value)) {
      currentSpaceId.value = null
      setPreferredSpaceId(null)
    }
  } catch {
    if (!spacesLoaded.value) spaces.value = []
  }
}

async function onToggleTodo(item: Entry) {
  if (toggling.value) return
  const current = entriesStore.list.find((x) => x.id === item.id) || item
  if (current.type !== 'todo') return
  toggling.value = current.id
  const nextStatus = current.todoStatus === 'done' ? 'pending' : 'done'
  const snapshot = { ...current }

  // 乐观更新
  let daysUntil = current.daysUntil
  if (nextStatus === 'done' && daysUntil != null && daysUntil >= 0) {
    daysUntil = daysUntil === 0 ? -1 : -daysUntil
  } else if (nextStatus === 'pending' && daysUntil != null && daysUntil < 0) {
    daysUntil = Math.abs(daysUntil)
  }
  entriesStore.optimisticUpdate(current.id, { todoStatus: nextStatus, daysUntil })

  try {
    const updated = await toggleTodoDone(snapshot)
    entriesStore.optimisticUpdate(updated.id, updated)
  } catch (e: any) {
    entriesStore.optimisticUpdate(snapshot.id, snapshot)
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
  } finally {
    toggling.value = ''
  }
}

async function load() {
  loggedIn.value = isLoggedIn()
  if (!loggedIn.value) return
  try {
    // 好日子可能被创建者从详情页或另一台设备删除；进入完整列表时以服务端为准，
    // 避免 5 分钟 SWR 缓存继续展示已删除、点击后才发现不存在的条目。
    await entriesStore.load({ force: true, ownerType: currentOwnerType.value, spaceId: currentSpaceId.value })
  } catch (e: any) {
    const msg = String(e?.message || '')
    if (isSessionBoundaryError(e)) {
      await logout()
      loggedIn.value = false
      uni.reLaunch({ url: '/pages/login/login' })
      return
    }
    if (isTransientAccessError(e)) {
      loggedIn.value = isLoggedIn()
      uni.showToast({ title: '网络暂不可用，已保留登录状态', icon: 'none', duration: 2500 })
      return
    }
    loggedIn.value = isLoggedIn()
    uni.showToast({ title: msg || '加载失败', icon: 'none' })
  }
}

// 从时光流带上当前空间，避免进来后又跳回「仅自己」。
onLoad((query: Record<string, string> = {}) => {
  currentSpaceId.value = query.spaceId ? decodeURIComponent(query.spaceId) : getPreferredSpaceId()
  if (query.kind === 'todo') pageKind.value = 'todo'
})

onShow(() => {
  startClock()
  holidayRevision.value += 1
  if (isLoggedIn()) {
    void loadSpaces(true).then(() => Promise.all([load(), loadCollabMap()]))
    void syncHolidaySettings()
      .then(() => {
        holidayRevision.value += 1
      })
      .catch(() => undefined)
  } else {
    loggedIn.value = false
  }
})

onHide(stopClock)
onUnmounted(stopClock)
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 40rpx 120rpx;
  background-color: var(--dk-bg, #f2f4f3);
  color: var(--dk-ink, #1c2423);
}

.clock-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 28rpx;
  padding: 24rpx 0 8rpx;
}

.clock-date {
  font-size: var(--dk-fs-label, 26rpx);
  color: var(--dk-muted, #6b736f);
  margin-bottom: 24rpx;
  letter-spacing: 0.04em;
}

.flip-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.digit {
  margin: 0 8rpx;
}

.digit-face {
  position: relative;
  width: 100rpx;
  height: 132rpx;
  border-radius: 16rpx;
  background: linear-gradient(180deg, #3a3a3c 0%, #1c1c1e 48%, #2c2c2e 52%, #141416 100%);
  box-shadow: 0 10rpx 24rpx rgba(0, 0, 0, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.digit-text {
  font-size: var(--dk-fs-hero, 64rpx);
  font-weight: 500;
  color: #f2f2f0;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.digit-seam {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2rpx;
  margin-top: -1rpx;
  background: rgba(0, 0, 0, 0.45);
  box-shadow: 0 1rpx 0 rgba(255, 255, 255, 0.06);
}

.colon {
  width: 28rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18rpx;
  padding: 0 4rpx;
}

.dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: var(--dk-ink, #1c2423);
  opacity: 0.55;
}

.page-switch {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.ps {
  font-size: var(--dk-fs-label, 26rpx);
  color: #a3aaa7;
  letter-spacing: 0.04em;
  &.on {
    color: var(--dk-ink, #1c2423);
    font-weight: 600;
    font-size: var(--dk-fs-title, 30rpx);
  }
}

.ps-sep {
  font-size: var(--dk-fs-meta, 24rpx);
  color: #c8cecb;
}

.sub-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.st {
  font-size: var(--dk-fs-meta, 24rpx);
  color: #b0b6b3;
  letter-spacing: 0.04em;
  &.on {
    color: var(--dk-brand, #2f6f6a);
    font-weight: 500;
  }
}

.st-sep {
  font-size: var(--dk-fs-caption, 22rpx);
  color: #d0d5d2;
}

.empty {
  padding: 60rpx 20rpx;
  text-align: center;
}

.empty-filter {
  padding: 160rpx 40rpx 80rpx;
}

.empty-msg {
  display: block;
  text-align: center;
  font-size: var(--dk-fs-body, 28rpx);
  color: var(--dk-ink, #1c2423);
  letter-spacing: 0.02em;
}

.empty-t {
  display: block;
  font-size: var(--dk-fs-title, 30rpx);
  color: var(--dk-ink, #1c2423);
}

.btn {
  margin-top: 28rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 48rpx;
  height: 72rpx;
  line-height: 72rpx;
  font-size: var(--dk-fs-body, 28rpx);
  color: #fff;
  background: var(--dk-brand, #2f6f6a);
  border-radius: 12rpx;
  border: none;
  &::after {
    border: none;
  }
}

.list {
  margin-top: 8rpx;
}

/* —— 待办：备忘录式 —— */
.todo-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--dk-line, #e2e6e4);
  &.done {
    opacity: 0.55;
  }
}

.todo-check {
  flex-shrink: 0;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  border: 2rpx solid var(--dk-line, #c5ccc9);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  &.on {
    border-color: var(--dk-brand, #2f6f6a);
    background: var(--dk-brand, #2f6f6a);
  }
}

.todo-check-mark {
  font-size: 18rpx;
  color: #fff;
  line-height: 1;
}

.todo-main {
  flex: 1;
  min-width: 0;
}

.todo-corner {
  display: block;
  margin-bottom: 6rpx;
  font-size: var(--dk-fs-caption, 22rpx);
  line-height: 1.2;
  letter-spacing: 0.04em;
  &.is-overdue {
    color: #b42318;
  }
  &.is-today {
    color: var(--dk-brand, #2f6f6a);
  }
  &.is-done {
    color: var(--dk-muted, #6b736f);
  }
}

.todo-title {
  display: block;
  font-size: var(--dk-fs-label, 26rpx);
  line-height: 1.55;
  color: var(--dk-ink, #1c2423);
  white-space: normal;
  word-break: break-word;
}

.todo-date {
  display: block;
  margin-top: 6rpx;
  font-size: var(--dk-fs-caption, 22rpx);
  line-height: 1.3;
  color: var(--dk-muted, #6b736f);
  font-variant-numeric: tabular-nums;
}

/* —— 日期：倒计时行 —— */
.cd-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--dk-line, #e2e6e4);
  &.dim {
    opacity: 0.55;
  }
}

.cd-main {
  flex: 1;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: baseline;
  gap: 10rpx;
  min-width: 0;
}

.pin {
  flex-shrink: 0;
  font-size: var(--dk-fs-caption, 22rpx);
  color: var(--dk-brand, #2f6f6a);
  letter-spacing: 0.06em;
}

.cd-title {
  flex: 0 1 auto;
  max-width: 70%;
  min-width: 0;
  font-size: var(--dk-fs-title, 30rpx);
  font-weight: 500;
  color: var(--dk-ink, #1c2423);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collab-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8rpx;
}

.collab-tiny-avatar {
  width: 32rpx;
  height: 32rpx;
  box-sizing: border-box;
  margin-left: -7rpx;
  border: 2rpx solid var(--dk-bg, #f2f4f3);
  border-radius: 50%;
  &:first-child {
    margin-left: 0;
  }
}

.collab-tiny-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dk-feature-brand, #2f6f6a);
  background: var(--dk-feature-brand-soft, #e4f0ee);
  font-size: 17rpx;
}

.cd-verb {
  flex-shrink: 0;
  font-size: var(--dk-fs-meta, 24rpx);
  color: var(--dk-muted, #6b736f);
}

.cd-meta {
  display: block;
  margin-top: 8rpx;
  font-size: var(--dk-fs-meta, 24rpx);
  color: var(--dk-muted, #6b736f);
}

.cd-tail {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: flex-end;
  min-width: 132rpx;
  padding-left: 16rpx;
}

.cd-countdown {
  font-size: var(--dk-fs-body, 28rpx);
  font-weight: 650;
  line-height: 1.2;
  color: var(--dk-ink, #1c2423);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cd-tail.soon .cd-countdown,
.cd-tail.today .cd-countdown {
  color: var(--dk-accent, #2f6f6a);
}

.cd-tail.past .cd-countdown {
  color: var(--dk-muted, #6b736f);
  font-weight: 500;
}
</style>
