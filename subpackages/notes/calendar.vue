<template>
  <view class="page" :style="pageStyle">
    <view class="calendar-card">
      <view class="month-bar">
        <view class="month-controls">
          <button class="month-btn" @tap="shiftMonth(-1)">‹</button>
          <view class="month-title">
            <text>{{ monthLabel }}</text>
          </view>
          <button class="month-btn" @tap="shiftMonth(1)">›</button>
        </view>
        <button v-if="!isTodaySelected" class="today-btn" @tap="goToday">回到今天</button>
      </view>
      <view class="week-row">
        <text v-for="week in WEEKS" :key="week">{{ week }}</text>
      </view>
      <view class="day-grid">
        <view
          v-for="cell in cells"
          :key="cell.key"
          class="day-cell"
          :class="{
            muted: !cell.inMonth,
            selected: cell.key === selectedDate,
            today: cell.key === todayKey,
            filled: cell.inMonth && dayItems(cell.key).length,
            photo: !!diaryCover(cell.key),
          }"
          @tap="cell.inMonth && selectDate(cell.key)"
        >
          <image v-if="diaryCover(cell.key)" class="day-cover" :src="diaryCover(cell.key)" mode="aspectFill" />
          <view v-else-if="cell.inMonth" class="day-blank" />
          <text class="day-number">{{ cell.day }}</text>
          <view v-if="cell.inMonth && markerCount(cell.key)" class="markers">
            <view v-if="hasDiary(cell.key)" class="marker diary" />
            <view v-if="hasTodo(cell.key)" class="marker todo" />
            <view v-if="hasAnniversary(cell.key)" class="marker anniversary" />
          </view>
          <text v-if="dayItems(cell.key).length > 1" class="more-count">+{{ dayItems(cell.key).length - 1 }}</text>
        </view>
      </view>
      <view class="legend">
        <view><text class="legend-dot diary" />随手记</view>
        <view><text class="legend-dot todo" />待办</view>
        <view><text class="legend-dot anniversary" />重要日</view>
      </view>
    </view>

    <view class="day-section">
      <view class="day-head">
        <view>
          <text class="day-heading">{{ selectedLabel }}</text>
          <text v-if="selectedEntries.length" class="day-count">{{ selectedEntries.length }} 条记录</text>
        </view>
        <button class="create-btn" @tap="createDiary"><text class="create-plus">＋</text>写一笔</button>
      </view>

      <view v-if="selectedEntries.length" class="entry-wall" :class="{ single: selectedEntries.length === 1 }">
        <view v-for="(column, columnIndex) in selectedWallColumns" :key="columnIndex" class="entry-wall-column">
          <view
            v-for="item in column"
            :key="item.id"
            class="memory-card"
            :class="{ 'photo-card': !!item.images?.[0], 'text-only': !item.images?.[0] }"
            @tap="openEntry(item)"
          >
            <image v-if="item.images?.[0]" class="memory-image" :src="item.images[0]" mode="aspectFill" />
            <view class="memory-copy" :class="{ 'text-only-copy': !item.images?.[0] }">
              <view class="memory-label-row">
                <text class="memory-kind">{{ typeLabel(item) }}</text>
                <text class="memory-time">{{ entryMeta(item) }}</text>
              </view>
              <text class="memory-title">{{ entryTitle(item) }}</text>
              <text v-if="entrySummary(item)" class="memory-summary">{{ entrySummary(item) }}</text>
              <view v-if="item.location || item.tags?.length" class="memory-foot">
                <text v-if="item.location">{{ item.location }}</text>
                <text v-if="item.tags?.length">{{ entryTagsText(item) }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
      <view v-else class="empty-day">
        <view class="empty-day-mark"><text>✦</text></view>
        <text>{{ ownerType === 'space' ? '这一天，还没有共同留下什么' : '这一天，留一点想记住的事吧' }}</text>
      </view>
    </view>

    <!-- 历史故事只做入口，完整内容在独立页面阅读。 -->
    <view class="history-section">
      <view class="history-heading-row">
        <text class="history-title">历史上的今天</text>
        <text v-if="historyDay?.stories.length" class="history-count">{{ historyDay.stories.length }} 个故事</text>
      </view>
      <view v-if="historyLoading" class="history-entry history-skeleton">
        <view class="skeleton-line wide" />
        <view class="skeleton-line" />
      </view>
      <view v-else-if="historyDay?.stories.length" class="history-entry" @tap="openHistory">
        <view class="history-copy">
          <text class="history-kicker">那年今天</text>
          <text class="history-name">{{ historyDay.stories[0].title }}</text>
          <text class="history-desc">{{ historyDay.stories[0].description }}</text>
        </view>
        <text class="chevron">›</text>
      </view>
      <view v-else class="history-unavailable" @tap="loadHistory">
        <text>{{ historyError || '这一天的历史故事暂未收录' }}</text>
        <text v-if="historyError" class="history-retry">重新加载</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { isLoggedIn } from '@/services/auth'
import { listCalendarEntries, type Entry, type EntryOwnerType } from '@/services/entries'
import { getPreferredSpaceId } from '@/services/spacePreference'
import { displayDiaryBody } from '@/services/systemEntries'
import { getHistoryDay, type HistoryDay } from '@/subpackages/shared/api/history'

const { pageStyle } = useThemePage()
const WEEKS = ['一', '二', '三', '四', '五', '六', '日']
const cursor = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const selectedDate = ref(dateKey(new Date()))
const entries = ref<Entry[]>([])
const loading = ref(false)
const historyDay = ref<HistoryDay | null>(null)
const historyLoading = ref(false)
const historyError = ref('')
const ownerType = ref<EntryOwnerType>('personal')
const spaceId = ref<string | null>(null)
let historyRequestId = 0
let monthRequestId = 0
let skipInitialShowReload = false

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function entryDate(item: Entry) {
  return (item.type === 'diary' ? item.eventAt || item.eventDate : item.eventDate).slice(0, 10)
}
const monthKey = computed(() => `${cursor.value.getFullYear()}-${String(cursor.value.getMonth() + 1).padStart(2, '0')}`)
const monthLabel = computed(() => `${cursor.value.getFullYear()}年${cursor.value.getMonth() + 1}月`)
const todayKey = dateKey(new Date())
const isTodaySelected = computed(() => selectedDate.value === todayKey)
const entriesByDate = computed(() => {
  const map = new Map<string, Entry[]>()
  entries.value.forEach((item) => {
    const key = entryDate(item)
    map.set(key, [...(map.get(key) || []), item])
  })
  return map
})
const cells = computed(() => {
  const first = new Date(cursor.value.getFullYear(), cursor.value.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + 1, 0).getDate()
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return { key: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === cursor.value.getMonth() }
  })
})
function entryMoment(item: Entry) {
  const raw = item.type === 'diary' ? item.eventAt || item.eventDate : item.eventAt || item.eventDate
  const parsed = new Date(String(raw || '').replace(' ', 'T')).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}
const selectedEntries = computed(() => [...(entriesByDate.value.get(selectedDate.value) || [])]
  .sort((a, b) => entryMoment(b) - entryMoment(a)))
const selectedWallColumns = computed(() => {
  if (selectedEntries.value.length <= 1) return [selectedEntries.value]
  const columns: [Entry[], Entry[]] = [[], []]
  const occupied = [0, 0]
  selectedEntries.value.forEach((item) => {
    const target = occupied[0] <= occupied[1] ? 0 : 1
    columns[target].push(item)
    const textLength = displayDiaryBody(item.body || '').trim().length
    occupied[target] += item.images?.[0] ? 2.1 : 1 + Math.min(textLength / 140, .65)
  })
  return columns
})
const selectedLabel = computed(() => {
  const [year, month, day] = selectedDate.value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return selectedDate.value === todayKey ? `今天 · ${month}月${day}日` : `${month}月${day}日 · ${weekday}`
})

function dayItems(key: string) { return entriesByDate.value.get(key) || [] }
function diaryItems(key: string) { return dayItems(key).filter((item) => item.type === 'diary') }
function diaryCover(key: string) { return diaryItems(key).find((item) => item.images?.[0])?.images?.[0] || '' }
function hasDiary(key: string) { return diaryItems(key).length > 0 }
function hasTodo(key: string) { return dayItems(key).some((item) => item.type === 'todo') }
function hasAnniversary(key: string) { return dayItems(key).some((item) => item.type === 'anniversary') }
function markerCount(key: string) { return Number(hasDiary(key)) + Number(hasTodo(key)) + Number(hasAnniversary(key)) }

async function loadMonth() {
  if (!isLoggedIn()) { uni.reLaunch({ url: '/pages/login/login' }); return }
  const requestId = ++monthRequestId
  const requestedMonth = monthKey.value
  const requestedOwnerType = ownerType.value
  const requestedSpaceId = spaceId.value
  loading.value = true
  try {
    const loaded = await listCalendarEntries(requestedMonth, {
      ownerType: requestedOwnerType,
      spaceId: requestedSpaceId,
    })
    if (requestId !== monthRequestId) return
    // 兼容尚未更新的服务端，同时防止任何异常响应把其他空间记录绘制进日历。
    const scoped = loaded.filter((item) => requestedOwnerType === 'space'
      ? item.ownerType === 'space' && String(item.spaceId || '') === String(requestedSpaceId || '')
      : (item.ownerType || 'personal') === 'personal' && !item.spaceId)
    entries.value = dedupeCalendarEntries(scoped)
  } catch (error: any) {
    if (requestId === monthRequestId) uni.showToast({ title: error?.message || '日历加载失败', icon: 'none' })
  } finally {
    if (requestId === monthRequestId) loading.value = false
  }
}

/**
 * 旧版本曾可能在请求超时后重复创建完全相同的记录。
 * 日历只折叠“内容、记录时刻和附件均一致”的副本，不按标题粗暴合并，
 * 因此用户在不同时间主动写下的同名记录仍会分别保留。
 */
function dedupeCalendarEntries(list: Entry[]) {
  const seen = new Set<string>()
  return list.filter((item) => {
    const fingerprint = JSON.stringify([
      item.type,
      (item.title || '').trim(),
      (item.body || '').trim(),
      item.eventAt || item.eventDate,
      item.capsuleUnlockAt || '',
      item.repeatRule || '',
      item.images || [],
    ])
    if (seen.has(fingerprint)) return false
    seen.add(fingerprint)
    return true
  })
}
function shiftMonth(delta: number) {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1)
  selectedDate.value = dateKey(cursor.value)
  void loadMonth()
  void loadHistory()
}
function goToday() {
  cursor.value = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  selectedDate.value = todayKey
  void loadMonth()
  void loadHistory()
}
function selectDate(key: string) {
  if (selectedDate.value === key) return
  selectedDate.value = key
  void loadHistory()
}
function createDiary() {
  const scope = ownerType.value === 'space' && spaceId.value
    ? `ownerType=space&spaceId=${encodeURIComponent(spaceId.value)}`
    : 'ownerType=personal'
  uni.navigateTo({ url: `/subpackages/notes/edit?type=diary&date=${selectedDate.value}&${scope}` })
}
function isLockedCapsule(item: Entry) {
  return item.type === 'diary' && !!item.capsuleUnlockAt && !item.capsuleUnlocked
}
function openEntry(item: Entry) {
  const url = item.type !== 'diary' && item.entryKind === 'commitment'
    ? `/subpackages/commitment/detail?id=${encodeURIComponent(item.id)}`
    : item.type === 'diary' && !!item.capsuleUnlockAt
    ? `/subpackages/capsule/locked?id=${encodeURIComponent(item.id)}`
    : item.type === 'diary'
      ? `/subpackages/notes/edit?id=${item.id}`
      : `/subpackages/day/detail?id=${item.id}`
  uni.navigateTo({ url })
}
function openHistory() { uni.navigateTo({ url: `/subpackages/notes/history?date=${selectedDate.value}` }) }
function typeLabel(item: Entry) {
  if (isLockedCapsule(item)) return '时间胶囊'
  if (item.entryKind === 'commitment') return '约定'
  if (item.type === 'anniversary') return '好日子'
  return item.type === 'todo' ? '待办' : ownerType.value === 'space' ? '共同记录' : '随手记'
}
function entryTitle(item: Entry) {
  if (isLockedCapsule(item)) return '一颗待解锁的时间胶囊'
  if (item.type !== 'diary') return item.title || typeLabel(item)
  return displayDiaryBody(item.body || '').split(/\n/).find(Boolean)?.slice(0, 42) || item.title || '这一刻'
}
function entrySummary(item: Entry) {
  if (isLockedCapsule(item)) return '写给以后的一段话，等待约定时间再打开'
  const body = displayDiaryBody(item.body || '').trim()
  if (!body || body === entryTitle(item)) return ''
  return body.slice(0, 72)
}
function entryTagsText(item: Entry) {
  return (item.tags || []).slice(0, 2).map((tag) => `#${tag}`).join(' ')
}
function shortDate(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return matched ? `${Number(matched[2])}月${Number(matched[3])}日` : value
}
function entryMeta(item: Entry) {
  if (isLockedCapsule(item)) return `${shortDate(item.capsuleUnlockAt!)}解锁`
  return item.type === 'diary'
    ? (item.eventAt || item.eventDate).slice(11, 16) || '今天'
    : item.type === 'todo'
      ? (item.todoStatus === 'done' ? '已完成' : '待办事项')
      : item.eventDate
}

async function loadHistory() {
  const requestId = ++historyRequestId
  const [, month, day] = selectedDate.value.split('-').map(Number)
  historyLoading.value = true
  historyError.value = ''
  historyDay.value = null
  try {
    const result = await getHistoryDay(month, day)
    if (requestId === historyRequestId) historyDay.value = result
  } catch (error: any) {
    if (requestId === historyRequestId) historyError.value = error?.message || '历史故事加载失败'
  } finally {
    if (requestId === historyRequestId) historyLoading.value = false
  }
}

onLoad((query: Record<string, string> = {}) => {
  skipInitialShowReload = true
  const explicitOwnerType = query.ownerType === 'space' || query.ownerType === 'personal'
  ownerType.value = query.ownerType === 'space' ? 'space' : 'personal'
  spaceId.value = ownerType.value === 'space' ? String(query.spaceId || '').trim() || null : null
  if (!explicitOwnerType) {
    const preferredId = getPreferredSpaceId()
    if (preferredId) {
      ownerType.value = 'space'
      spaceId.value = preferredId
    }
  }
  if (!monthKey.value.startsWith(todayKey.slice(0, 7))) selectedDate.value = dateKey(cursor.value)
  void loadMonth()
  void loadHistory()
})
onShow(() => {
  if (skipInitialShowReload) {
    skipInitialShowReload = false
    return
  }
  void loadMonth()
})
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding: 20rpx 24rpx calc(72rpx + env(safe-area-inset-bottom)); background: radial-gradient(circle at 90% 4%, rgba(233,218,171,.24), transparent 27%), linear-gradient(180deg, #f3f7f5 0, var(--dk-bg) 520rpx); color: var(--dk-ink); box-sizing: border-box; }
.month-bar { position: relative; display: flex; align-items: center; justify-content: center; min-height: 76rpx; margin-bottom: 12rpx; }
.month-controls { display: flex; align-items: center; justify-content: center; gap: 14rpx; }
.month-title { min-width: 188rpx; font-size: var(--dk-fs-title, 36rpx); font-weight: 720; text-align: center; letter-spacing: -.01em; }
.month-btn { width: 50rpx; height: 50rpx; padding: 0; border: 1rpx solid rgba(47,111,106,.08); border-radius: 50%; color: var(--dk-feature-brand, #2f6f6a); background: rgba(228,240,238,.72); font-size: 39rpx; font-weight: 300; line-height: 45rpx; }
.month-btn::after,.today-btn::after,.create-btn::after { border: 0; }
.today-btn { position: absolute; right: 2rpx; top: 12rpx; height: 48rpx; margin: 0; padding: 0 17rpx; border: 0; border-radius: 999rpx; color: var(--dk-feature-brand, #2f6f6a); background: rgba(228,240,238,.74); font-size: var(--dk-fs-caption, 23rpx); font-weight: 600; line-height: 48rpx; }
.calendar-card { position: relative; overflow: hidden; padding: 18rpx 18rpx 20rpx; border: 1rpx solid rgba(47,111,106,.05); border-radius: 32rpx; background: linear-gradient(155deg, rgba(255,255,255,.98), rgba(250,252,250,.96)); box-shadow: 0 18rpx 48rpx rgba(32,67,61,.07); }
.calendar-card::before { position: absolute; top: -100rpx; right: -80rpx; width: 250rpx; height: 250rpx; border-radius: 50%; background: rgba(237,221,173,.13); content: ''; pointer-events: none; }
.week-row,.day-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 7rpx; }
.week-row { position: relative; margin: 2rpx 0 13rpx; color: #98a19d; font-size: var(--dk-fs-caption, 23rpx); text-align: center; }
.day-cell { position: relative; aspect-ratio: 1 / 1; min-width: 0; overflow: hidden; border: 2rpx solid transparent; border-radius: 50%; background: transparent; box-sizing: border-box; transition: background .18s ease; }
.day-cell:nth-child(7n + 6) .day-number,.day-cell:nth-child(7n) .day-number { color: #778f88; }
.day-cell.muted { opacity: .18; }.day-cell.filled { border-radius: 17rpx; background: rgba(228,240,238,.68); }
.day-cell.photo { border-radius: 17rpx; box-shadow: 0 5rpx 12rpx rgba(28,49,45,.12); }
.day-cell.today:not(.photo) { border-color: rgba(47,111,106,.45); }.day-cell.selected:not(.photo) { border-color: var(--dk-brand); background: var(--dk-brand-soft); box-shadow: 0 0 0 3rpx rgba(47,111,106,.08); }
.day-cell.photo.selected { border-color: #fff; box-shadow: 0 0 0 3rpx var(--dk-brand), 0 6rpx 15rpx rgba(28,49,45,.18); }
.day-cover,.day-blank { position: absolute; inset: 0; width: 100%; height: 100%; }.day-cover { opacity: .9; }.day-blank { background: transparent; }
.day-number { position: absolute; top: 50%; left: 0; right: 0; z-index: 1; color: var(--dk-ink); font-size: var(--dk-fs-body, 29rpx); font-weight: 520; text-align: center; transform: translateY(-50%); }
.day-cell.today .day-number { color: var(--dk-brand); font-weight: 700; }.day-cover ~ .day-number { color: #fff; text-shadow: 0 1rpx 4rpx rgba(0,0,0,.4); }
.markers { position: absolute; z-index: 1; right: 7rpx; bottom: 7rpx; display: flex; gap: 3rpx; }.marker,.legend-dot { width: 8rpx; height: 8rpx; border-radius: 50%; background: #c3cac6; }.marker.diary,.legend-dot.diary { background: var(--dk-brand); }.marker.todo,.legend-dot.todo { background: #d5a14d; }.marker.anniversary,.legend-dot.anniversary { background: #c1a56f; }.more-count { position: absolute; z-index: 2; right: 5rpx; top: 4rpx; padding: 1rpx 5rpx; border-radius: 999rpx; color: #fff; background: rgba(20,32,30,.62); font-size: 18rpx; }
.legend { position: relative; display: flex; justify-content: center; gap: 10rpx; margin-top: 20rpx; color: var(--dk-muted); font-size: 21rpx; }.legend view { display: flex; align-items: center; gap: 7rpx; padding: 8rpx 13rpx; border-radius: 999rpx; background: rgba(241,245,243,.88); }
.day-section { margin-top: 20rpx; padding: 25rpx 23rpx; border: 1rpx solid rgba(216,190,124,.13); border-radius: 28rpx; background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(255,251,241,.9)); box-shadow: 0 12rpx 32rpx rgba(74,60,31,.045); }
.day-head { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; padding-bottom: 20rpx; }.day-heading { display: block; font-size: var(--dk-fs-title, 36rpx); font-weight: 650; }.day-count { display: block; margin-top: 7rpx; color: var(--dk-muted); font-size: var(--dk-fs-caption, 23rpx); }.create-btn { display: inline-flex; height: 54rpx; flex-shrink: 0; align-items: center; gap: 4rpx; margin: 0; padding: 0 18rpx; border: 1rpx solid var(--dk-feature-brand, #2f6f6a); border-radius: 999rpx; color: var(--dk-feature-brand, #2f6f6a); background: transparent; font-size: var(--dk-fs-meta, 25rpx); line-height: 52rpx; }.create-plus { font-size: 30rpx; font-weight: 300; line-height: 1; }
.entry-wall { display: flex; align-items: flex-start; gap: 14rpx; }
.entry-wall-column { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 14rpx; }
.entry-wall.single .entry-wall-column { width: 100%; flex-basis: 100%; }
.memory-card { width: 100%; overflow: hidden; border-radius: 22rpx; background: var(--dk-surface); box-shadow: 0 9rpx 25rpx rgba(28,49,45,.06); }
.memory-card.text-only { border: 1rpx solid var(--dk-line); box-shadow: 0 6rpx 18rpx rgba(28,49,45,.04); }
.memory-image { display: block; width: 100%; height: 210rpx; }
.memory-copy { padding: 17rpx 18rpx 19rpx; }
.text-only-copy { padding: 18rpx; }
.memory-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8rpx; }
.memory-kind { flex-shrink: 0; padding: 4rpx 10rpx; border-radius: 14rpx; color: var(--dk-feature-brand, #2f6f6a); background: var(--dk-feature-brand-soft, #e4f0ee); font-size: 17rpx; font-weight: 700; }
.memory-time { min-width: 0; overflow: hidden; color: var(--dk-muted); font-size: 17rpx; text-overflow: ellipsis; white-space: nowrap; }
.memory-title { display: -webkit-box; margin-top: 12rpx; overflow: hidden; color: var(--dk-ink); font-size: 26rpx; font-weight: 700; line-height: 1.42; word-break: break-word; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.memory-summary { display: -webkit-box; margin-top: 7rpx; overflow: hidden; color: var(--dk-muted); font-size: 20rpx; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.text-only .memory-summary { -webkit-line-clamp: 2; }
.memory-foot { display: flex; margin-top: 14rpx; overflow: hidden; gap: 8rpx; color: var(--dk-muted); font-size: 17rpx; white-space: nowrap; }
.memory-foot text { overflow: hidden; text-overflow: ellipsis; }
.chevron { align-self: center; color: var(--dk-muted); font-size: 34rpx; line-height: 1; }.empty-day { display: flex; min-height: 128rpx; align-items: center; justify-content: center; gap: 17rpx; padding: 24rpx; border: 0; border-radius: 21rpx; color: #66716d; background: linear-gradient(135deg, rgba(228,240,238,.68), rgba(251,244,222,.7)); font-size: var(--dk-fs-body, 28rpx); line-height: 1.45; text-align: left; box-sizing: border-box; }.empty-day-mark { display: flex; width: 55rpx; height: 55rpx; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; color: var(--dk-brand); background: rgba(255,255,255,.72); box-shadow: 0 6rpx 18rpx rgba(47,111,106,.09); font-size: 25rpx; }
.history-section { margin-top: 28rpx; padding: 24rpx 2rpx 0; border-top: 1rpx solid rgba(47,111,106,.08); }
.history-heading-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16rpx; }
.history-title { color: var(--dk-muted); font-size: var(--dk-fs-meta, 25rpx); font-weight: 600; }
.history-count { color: var(--dk-muted); font-size: var(--dk-fs-caption, 23rpx); }
.history-entry { display: flex; align-items: center; gap: 16rpx; min-height: 128rpx; padding: 20rpx 22rpx; border: 1rpx solid rgba(212,184,112,.18); border-radius: 22rpx; background: linear-gradient(135deg, rgba(255,251,239,.98), rgba(247,251,248,.98)); box-shadow: 0 10rpx 27rpx rgba(74,60,31,.045); box-sizing: border-box; }
.history-copy { flex: 1; min-width: 0; }
.history-kicker { display: block; margin-bottom: 7rpx; color: #a07d36; font-size: 20rpx; font-weight: 650; letter-spacing: .06em; }
.history-name { display: block; overflow: hidden; color: var(--dk-ink); font-size: var(--dk-fs-label, 28rpx); font-weight: 650; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.history-desc { display: -webkit-box; overflow: hidden; margin-top: 8rpx; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: var(--dk-muted); font-size: var(--dk-fs-caption, 23rpx); line-height: 1.5; }
.history-unavailable { display: flex; align-items: center; justify-content: space-between; padding: 22rpx 4rpx; color: var(--dk-muted); font-size: var(--dk-fs-caption, 23rpx); }
.history-retry { color: var(--dk-brand); }
.history-skeleton { display: block; }
.skeleton-line { width: 64%; height: 20rpx; margin-top: 18rpx; border-radius: 8rpx; background: #edf0ee; }
.skeleton-line.wide { width: 88%; height: 24rpx; margin-top: 6rpx; }
</style>
