<template>
  <view class="page" :style="pageStyle">
    <view class="nav" :style="navStyle">
      <view class="nav-inner" :style="navInnerStyle">
        <text class="brand">随手记</text>
        <text class="nav-scope">当前：{{ currentScopeLabel }}</text>
      </view>
    </view>
    <view class="nav-spacer" :style="{ height: navTotalHeight + 'px' }" />

    <view v-if="!loggedIn" class="empty login-empty">
      <text class="login-empty-copy">登录后开始写随手记</text>
      <button class="btn" @tap="goLogin">去登录</button>
    </view>

    <template v-else>
      <view v-if="loading && !entriesStore.list.length" class="empty-wrap">
        <text class="empty-t">加载中…</text>
      </view>

      <view v-else-if="!list.length" class="empty-wrap">
        <text class="empty-t">还没有随手记</text>
        <button class="calendar-empty-entry" @tap="openCalendar">打开回忆日历</button>
      </view>

      <template v-else>
        <view class="filter-row">
          <scroll-view class="filters" scroll-x :show-scrollbar="false">
            <view class="filter-inner">
              <text
                v-for="item in filterOptions"
                :key="item.value"
                class="filter"
                :class="{ on: filter === item.value }"
                @tap="filter = item.value"
              >{{ item.label }}</text>
            </view>
          </scroll-view>
          <button
            class="search-entry"
            :class="{ on: searchOpen }"
            aria-label="搜索随手记"
            @tap="toggleSearch"
          >
            <view class="search-glyph" />
          </button>
        </view>

        <view v-if="searchOpen" class="search-panel">
          <view class="search-field">
            <view class="search-glyph field-glyph" />
            <input
              v-model="searchQuery"
              class="search-input"
              placeholder="搜索随手记内容"
              :focus="searchOpen"
              confirm-type="search"
            />
            <text v-if="searchQuery" class="search-clear" @tap.stop="clearSearch">×</text>
          </view>
          <text class="search-hint">搜索标题和正文</text>
        </view>

        <view class="calendar-preview" role="button" aria-label="打开回忆日历" @tap="openCalendar">
          <view class="calendar-preview-head">
            <view class="calendar-preview-name">
              <view class="calendar-glyph">
                <view class="calendar-glyph-bar" />
                <view class="calendar-glyph-dots"><view /><view /><view /></view>
              </view>
              <text>回忆日历</text>
            </view>
            <text class="calendar-preview-more">查看全部 ›</text>
          </view>
          <view class="calendar-preview-week">
            <view
              v-for="day in calendarPreviewDays"
              :key="day.key"
              class="calendar-preview-day"
              :class="{ today: day.today }"
            >
              <text class="calendar-preview-weekday">{{ day.weekday }}</text>
              <view class="calendar-preview-date">
                <text>{{ day.day }}</text>
                <view v-if="day.recorded" class="calendar-preview-dot" />
              </view>
            </view>
          </view>
        </view>

        <view v-if="!groups.length" class="filter-empty">
          <text>{{ searchQuery ? '没有找到相关的随手记' : '暂无符合条件的随手记' }}</text>
        </view>

        <view v-else class="timeline-wrap">
          <view class="timeline-actions">
            <button class="collapse-all-entry" @tap="toggleAllDays">
              {{ areAllDaysCollapsed ? '全部展开' : '全部收起' }}
              <view class="collapse-all-chevron" :class="{ closed: areAllDaysCollapsed }" />
            </button>
          </view>

          <view class="timeline">
            <view
              v-for="group in groups"
              :key="group.key"
              class="timeline-group"
              :class="{ collapsed: isDayCollapsed(group.key) }"
            >
              <view
                class="time-axis"
                hover-class="time-axis-active"
                :aria-expanded="!isDayCollapsed(group.key)"
                @tap="toggleDay(group.key)"
              >
                <view class="day-heading">
                  <text class="day-label">{{ group.label }}</text>
                  <view class="fold-chevron" :class="{ closed: isDayCollapsed(group.key) }" />
                </view>
                <text class="day-date">{{ group.dateLabel }}</text>
                <view class="axis-dot" />
                <view class="axis-line" />
              </view>

              <view class="cards">
                <view
                  v-if="isDayCollapsed(group.key)"
                  class="collapsed-card"
                  @tap="toggleDay(group.key)"
                >
                  <text>{{ group.items.length }} 条随手记</text>
                  <text class="collapsed-action">展开</text>
                </view>
                <view
                  v-for="item in visibleGroupItems(group)"
                  :key="item.id"
                  class="note-card"
                  :class="{ 'capsule-card': item.isCapsule }"
                  @tap="openEntry(item)"
                >
                  <view class="card-main">
                    <view class="excerpt-row">
                      <text class="excerpt">{{ excerpt(item) }}</text>
                      <text v-if="item.pinned" class="pin">置顶</text>
                      <text v-if="item.tags?.includes('今日灵感')" class="pin">今日灵感</text>
                      <text v-if="item.isCapsule" class="capsule-unlocked-tag">已解锁胶囊</text>
                    </view>
                    <view class="detail">
                      <text class="detail-time">
                        {{ item.isCapsule ? capsuleDetail(item) : detailTime(item) }}
                      </text>
                      <text v-if="item.ownerType === 'space'" class="entry-author">由 {{ entryAuthorName(item) }} 记录</text>
                    </view>
                  </view>
                  <view v-if="item.images?.length" class="cover-wrap">
                    <image class="cover" :src="item.images[0]" mode="aspectFill" />
                    <text v-if="item.images.length > 1" class="image-count">+{{ item.images.length - 1 }}</text>
                  </view>
                </view>
                <button
                  v-if="!isDayCollapsed(group.key) && group.items.length > 3 && !searchQuery"
                  class="day-more"
                  @tap="toggleAllDayItems(group.key)"
                >
                  {{ isAllDayItemsVisible(group.key) ? '收起部分记录' : `展开其余 ${group.items.length - 3} 条` }}
                </button>
              </view>
            </view>
          </view>
        </view>
      </template>
    </template>

    <view v-if="loggedIn && !showCreateMenu" class="fab-row">
      <button class="fab" aria-label="新建随手记" hover-class="fab-hover" @tap.stop="openCreateMenu"><text class="fab-plus">+</text></button>
    </view>

    <view v-if="showCreateMenu" class="create-mask" @tap="showCreateMenu = false">
      <view class="create-sheet-host" @tap.stop>
        <CreateEntrySheet
          @close="showCreateMenu = false"
          @select="runCreateAction"
        />
      </view>
    </view>

  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onShareAppMessage, onShow } from '@dcloudio/uni-app'
import CreateEntrySheet from '@/components/CreateEntrySheet.vue'
import { isLoggedIn } from '@/services/auth'
import { type Entry } from '@/services/entries'
import { listSpaces, type Space } from '@/services/spaces'
import { getPreferredSpaceId } from '@/services/spacePreference'
import { useEntriesStore } from '@/stores/entries'
import { displayDiaryBody } from '@/services/systemEntries'
import { useThemePage } from '@/composables/useThemePage'
import { getTokens } from '@/services/theme'

const { pageStyle, themeId } = useThemePage()
const entriesStore = useEntriesStore()

const loggedIn = ref(false)
const loading = computed(() => entriesStore.loading)
type NoteFilter = 'all' | 'today' | 'week' | 'images'
const filter = ref<NoteFilter>('all')
const searchOpen = ref(false)
const searchQuery = ref('')
const showCreateMenu = ref(false)
const currentSpaceId = ref<string | null>(null)
const currentSpace = ref<Space | null>(null)
const currentScopeLabel = computed(() => currentSpaceId.value ? currentSpace.value?.name || '当前时光圈' : '仅自己')
const collapsedDayKeys = ref<string[]>([])
const expandedDayKeys = ref<string[]>([])
const filterOptions: { value: NoteFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'today', label: '今天' },
  { value: 'week', label: '近 7 天' },
  { value: 'images', label: '有图片' },
]
type CreateMode = 'text' | 'photo' | 'capsule'

function dedupeDiaries(items: Entry[]) {
  const byContent = new Map<string, Entry>()
  for (const item of items) {
    // 历史版本可能在图片上传前后各创建一次。相同用户、正文和秒级记录时间
    // 视为同一笔，优先展示图片更完整的版本。
    const key = [item.userId || '', item.body || '', item.eventAt || item.eventDate || ''].join('\u0000')
    const current = byContent.get(key)
    if (!current) {
      byContent.set(key, item)
      continue
    }
    const currentImages = current.images?.length || 0
    const nextImages = item.images?.length || 0
    if (nextImages > currentImages || (nextImages === currentImages && String(item.updatedAt || '') > String(current.updatedAt || ''))) {
      byContent.set(key, item)
    }
  }
  return [...byContent.values()]
}

const list = computed(() => {
  const diaries = dedupeDiaries(entriesStore.byType('diary'))
  // 筛选统一在 filteredList 中按日记实际记录时间处理。不要在这里先按
  // eventDate 过滤：编辑日记日期后，它可能与 eventAt 不一致，会把“今天”误筛空。
  return [...diaries].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    const ta = a.eventAt || a.eventDate || ''
    const tb = b.eventAt || b.eventDate || ''
    return tb.localeCompare(ta)
  })
})

const statusBarHeight = ref(20)
const navBarHeight = ref(44)
const navPadRight = ref(96)
const navContentOffset = ref(8)
const navBg = ref('#f2f4f3')

const navTotalHeight = computed(() => statusBarHeight.value + navBarHeight.value)
const navStyle = computed(() => ({
  paddingTop: `${statusBarHeight.value}px`,
  backgroundColor: navBg.value,
}))
const navInnerStyle = computed(() => ({
  height: `${navBarHeight.value}px`,
  paddingRight: `${navPadRight.value}px`,
  paddingTop: `${navContentOffset.value}px`,
  boxSizing: 'border-box' as const,
}))

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function localDate(dateText: string) {
  const [year, month, day] = dateText.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function daysAgo(dateText: string) {
  const date = localDate(dateText)
  return Math.round((startOfToday().getTime() - date.getTime()) / 86400000)
}

function calendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const calendarPreviewDays = computed(() => {
  const today = startOfToday()
  const recordedKeys = new Set(
    list.value
      .filter((item) => !item.isCapsule || item.capsuleUnlocked)
      .map((item) => (item.eventAt || item.eventDate).slice(0, 10)),
  )
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() + index - 3)
    const key = calendarDateKey(date)
    return {
      key,
      weekday: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()],
      day: date.getDate(),
      today: index === 3,
      recorded: recordedKeys.has(key),
    }
  })
})

const filteredList = computed(() => {
  let filtered = list.value.filter((item) => !item.isCapsule || item.capsuleUnlocked)
  if (filter.value === 'images') filtered = filtered.filter((item) => !!item.images?.length)
  if (filter.value === 'today') {
    filtered = filtered.filter((item) => daysAgo(item.eventAt || item.eventDate) === 0)
  } else if (filter.value === 'week') {
    filtered = filtered.filter((item) => {
      const diff = daysAgo(item.eventAt || item.eventDate)
      return diff >= 0 && diff < 7
    })
  }
  const keywords = searchQuery.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!keywords.length) return filtered
  return filtered.filter((item) => {
    const searchable = `${item.title || ''} ${displayDiaryBody(item.body || '')}`
      .toLocaleLowerCase()
      .replace(/\s+/g, ' ')
    return keywords.every((keyword) => searchable.includes(keyword))
  })
})

const groups = computed(() => {
  const grouped = new Map<string, Entry[]>()
  for (const item of filteredList.value) {
    const key = (item.eventAt || item.eventDate).slice(0, 10)
    const rows = grouped.get(key) || []
    rows.push(item)
    grouped.set(key, rows)
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => {
      const diff = daysAgo(key)
      const date = localDate(key)
      const label =
        diff === 0
          ? '今天'
          : diff === 1
            ? '昨天'
            : diff > 1
              ? `${diff}天前`
              : `${Math.abs(diff)}天后`
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const dateLabel = `${month}.${day} · ${WEEKDAYS[date.getDay()]}`
      return { key, label, dateLabel, items }
    })
})

function isDayCollapsed(key: string) {
  return collapsedDayKeys.value.includes(key)
}

const areAllDaysCollapsed = computed(() => {
  return groups.value.length > 0
    && groups.value.every((group) => collapsedDayKeys.value.includes(group.key))
})

function toggleDay(key: string) {
  collapsedDayKeys.value = isDayCollapsed(key)
    ? collapsedDayKeys.value.filter((item) => item !== key)
    : [...collapsedDayKeys.value, key]
}

function toggleAllDays() {
  const visibleKeys = groups.value.map((group) => group.key)
  if (areAllDaysCollapsed.value) {
    collapsedDayKeys.value = collapsedDayKeys.value.filter((key) => !visibleKeys.includes(key))
    return
  }
  collapsedDayKeys.value = [...new Set([...collapsedDayKeys.value, ...visibleKeys])]
}

function isAllDayItemsVisible(key: string) {
  return expandedDayKeys.value.includes(key)
}

function toggleAllDayItems(key: string) {
  expandedDayKeys.value = isAllDayItemsVisible(key)
    ? expandedDayKeys.value.filter((item) => item !== key)
    : [...expandedDayKeys.value, key]
}

function visibleGroupItems(group: { key: string; items: Entry[] }) {
  if (isDayCollapsed(group.key)) return []
  if (searchQuery.value || group.items.length <= 3 || isAllDayItemsVisible(group.key)) {
    return group.items
  }
  return group.items.slice(0, 3)
}

function detailTime(item: Entry) {
  const raw = item.eventAt || `${item.eventDate} 00:00:00`
  const time = raw.includes(' ') ? raw.split(' ')[1]?.slice(0, 8) : ''
  return time || '00:00:00'
}

function entryAuthorName(item: Entry) {
  const userId = String(item.userId || '')
  const member = currentSpace.value?.members?.find((candidate) => String(candidate.userId) === userId)
  return member?.nickname?.trim() || item.authorName?.trim() || '圈内成员'
}

function capsuleDetail(item: Entry) {
  if (!item.capsuleUnlockAt) return '已解锁'
  const date = new Date(item.capsuleUnlockAt)
  if (Number.isNaN(date.getTime())) return '已解锁'
  return `${date.getMonth() + 1}月${date.getDate()}日解锁`
}

function excerpt(item: Entry) {
  const text = displayDiaryBody(item.body || '') || item.title || '随手记'
  return text
}

function goLogin() {
  uni.reLaunch({ url: '/pages/login/login' })
}

function scopeQuery() {
  if (!currentSpaceId.value) return 'ownerType=personal'
  return `ownerType=space&spaceId=${encodeURIComponent(currentSpaceId.value)}`
}

function createWithMode(mode: CreateMode) {
  uni.navigateTo({ url: `/subpackages/notes/edit?type=diary&mode=${mode}&${scopeQuery()}` })
}

function openCreateMenu() {
  showCreateMenu.value = true
}

function runCreateAction(mode: CreateMode) {
  if (!isLoggedIn()) {
    goLogin()
    return
  }
  showCreateMenu.value = false
  if (mode === 'text' || mode === 'photo') {
    createWithMode(mode)
    return
  }
  if (mode === 'capsule') {
    uni.navigateTo({ url: `/subpackages/notes/edit?type=diary&entryKind=capsule&mode=capsule&${scopeQuery()}` })
  }
}

function openCalendar() {
  uni.navigateTo({ url: `/subpackages/notes/calendar?${scopeQuery()}` })
}

onShareAppMessage(() => ({ title: '只我们｜世界很大，这里只我们', path: '/pages/notes/index' }))

function toggleSearch() {
  if (searchOpen.value) {
    searchOpen.value = false
    searchQuery.value = ''
    return
  }
  // 搜索默认覆盖全部日记，避免“今天/近 7 天”筛选让结果看起来像漏搜。
  filter.value = 'all'
  searchOpen.value = true
}

function clearSearch() {
  searchQuery.value = ''
}

function openEntry(item: Entry) {
  const url = item.isCapsule
    ? `/subpackages/capsule/locked?id=${encodeURIComponent(item.id)}`
    : `/subpackages/notes/edit?id=${encodeURIComponent(item.id)}`
  uni.navigateTo({ url })
}

async function load() {
  loggedIn.value = isLoggedIn()
  if (!loggedIn.value) return
  try {
    const preferredId = getPreferredSpaceId()
    currentSpaceId.value = preferredId || null
    // 同一空间再次进入时保留已经加载过的成员资料。
    // 之前每次 onShow 都先清空 currentSpace，缓存里的随手记会短暂显示“圈内成员”，
    // 等空间接口返回后再跳成具体昵称，造成明显闪动。
    if (!preferredId || currentSpace.value?.id !== preferredId) currentSpace.value = null
    if (preferredId) {
      try {
        const spaces = await listSpaces()
        currentSpace.value = spaces.find((space) => space.id === preferredId) || null
        // 首选空间已经不存在或当前用户已退出时，本页安全回到仅自己；不展示其他空间数据。
        if (!currentSpace.value) currentSpaceId.value = null
      } catch {
        // 空间列表暂时失败时仍按已保存的空间 ID 请求，避免静默切回个人空间造成误写。
      }
    }
    const ownerType = currentSpaceId.value ? 'space' as const : 'personal' as const
    await entriesStore.load({ force: true, ownerType, spaceId: currentSpaceId.value })
  } catch (e: any) {
    loggedIn.value = isLoggedIn()
    uni.showToast({ title: e?.message || '加载失败', icon: 'none' })
  }
}

function measureNav() {
  try {
    const sys = uni.getSystemInfoSync()
    statusBarHeight.value = sys.statusBarHeight || 20
    navBg.value = getTokens(themeId.value).bg
    // #ifdef MP-WEIXIN
    const menu = uni.getMenuButtonBoundingClientRect()
    if (menu?.height) {
      navBarHeight.value = menu.height + (menu.top - statusBarHeight.value) * 2
      navPadRight.value = Math.max(96, sys.windowWidth - menu.left + 8)
      navContentOffset.value = Math.max(0, menu.top - statusBarHeight.value)
    }
    // #endif
  } catch {
    /* ignore */
  }
}

onMounted(measureNav)

onShow(() => {
  navBg.value = getTokens(themeId.value).bg
  load()
})
</script>

<style lang="scss" scoped>
.capsule-locked-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 0;
}
.capsule-lock-icon { font-size: 28rpx; }
.capsule-lock-text {
  font-size: 24rpx;
  color: #999;
  font-style: italic;
}
.capsule-unlocked-tag {
  flex-shrink: 0;
  padding: 4rpx 10rpx;
  border: 1rpx solid var(--dk-line);
  border-radius: 999rpx;
  color: var(--dk-brand);
  background: var(--dk-brand-soft);
  font-size: 18rpx;
  line-height: 1.4;
  white-space: nowrap;
}
.page {
  min-height: 100vh;
  padding: 8rpx 40rpx 160rpx;
  background-color: var(--dk-bg);
  color: var(--dk-ink);
}
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding-left: 32rpx;
  box-sizing: border-box;
}
.nav-inner {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: nowrap;
  gap: 12rpx;
  overflow: hidden;
  box-sizing: border-box;
}
.brand {
  flex-shrink: 0;
  font-size: var(--dk-fs-display, 46rpx);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--dk-ink);
  line-height: 1.2;
}
.nav-scope {
  min-width: 0;
  overflow: hidden;
  color: var(--dk-muted);
  font-size: var(--dk-fs-caption, 23rpx);
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin: 16rpx 0 28rpx;
}
.filters {
  flex: 1;
  min-width: 0;
  margin: 0;
  white-space: nowrap;
}
.filter-inner {
  display: inline-flex;
  gap: 14rpx;
  padding-right: 20rpx;
}
.filter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 56rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: var(--dk-surface, #fff);
  color: var(--dk-muted);
  font-size: var(--dk-fs-meta, 24rpx);
  border: 1rpx solid var(--dk-line);
  &.on {
    color: #fff;
    background: var(--dk-brand);
    border-color: var(--dk-brand);
  }
}
.search-entry {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58rpx;
  height: 58rpx;
  flex-shrink: 0;
  padding: 0;
  border: 1rpx solid var(--dk-line);
  border-radius: 16rpx;
  color: var(--dk-muted);
  background: var(--dk-surface);
  &.on { color: var(--dk-brand); border-color: var(--dk-brand); background: var(--dk-brand-soft); }
}
.search-entry::after { border: 0; }
.search-glyph { position: relative; display: inline-block; width: 23rpx; height: 23rpx; border: 3rpx solid currentColor; border-radius: 50%; box-sizing: border-box; }
.search-glyph::after { content: ''; position: absolute; right: -7rpx; bottom: -5rpx; width: 9rpx; height: 3rpx; border-radius: 3rpx; background: currentColor; transform: rotate(45deg); transform-origin: left center; }
.search-panel { display: flex; align-items: center; gap: 14rpx; margin: -12rpx 0 28rpx; }
.search-field { display: flex; flex: 1; min-width: 0; height: 64rpx; align-items: center; gap: 16rpx; padding: 0 18rpx; border: 1rpx solid rgba(255, 255, 255, 0.65); border-radius: 16rpx; color: var(--dk-muted); background: linear-gradient(180deg, rgba(255, 255, 255, 0.45), var(--dk-surface)); box-sizing: border-box; box-shadow: 0 8rpx 20rpx rgba(47, 111, 106, 0.04); }
.field-glyph { width: 21rpx; height: 21rpx; flex-shrink: 0; }
.search-input { flex: 1; min-width: 0; height: 62rpx; color: var(--dk-ink); font-size: var(--dk-fs-meta, 24rpx); line-height: 62rpx; }
.search-clear { display: flex; width: 32rpx; height: 32rpx; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; color: var(--dk-muted); background: var(--dk-bg-soft); font-size: var(--dk-fs-body, 28rpx); line-height: 1; }
.search-hint { flex-shrink: 0; color: var(--dk-muted); font-size: var(--dk-fs-caption, 22rpx); }
.calendar-glyph {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  width: 28rpx;
  height: 29rpx;
  border: 2rpx solid currentColor;
  border-radius: 7rpx;
  box-sizing: border-box;
}
.calendar-glyph::before,
.calendar-glyph::after {
  content: '';
  position: absolute;
  top: -5rpx;
  width: 3rpx;
  height: 8rpx;
  border-radius: 3rpx;
  background: currentColor;
}
.calendar-glyph::before { left: 6rpx; }
.calendar-glyph::after { right: 6rpx; }
.calendar-glyph-bar { width: 100%; height: 7rpx; border-bottom: 2rpx solid currentColor; box-sizing: border-box; }
.calendar-glyph-dots { display: flex; gap: 3rpx; padding: 5rpx 0 4rpx; }.calendar-glyph-dots view { width: 3rpx; height: 3rpx; border-radius: 50%; background: currentColor; }
.calendar-empty-entry {
  height: 58rpx;
  margin-top: 28rpx;
  padding: 0 22rpx;
  border: 1rpx solid var(--dk-line);
  border-radius: 999rpx;
  color: var(--dk-brand);
  background: var(--dk-surface);
  font-size: var(--dk-fs-label, 26rpx);
  line-height: 56rpx;
}
.calendar-empty-entry::after { border: 0; }
.filter-empty {
  padding: 150rpx 20rpx 80rpx;
  text-align: center;
  color: var(--dk-muted);
  font-size: var(--dk-fs-body, 28rpx);
}
.timeline-wrap,
.timeline {
  width: 100%;
}
.calendar-preview {
  margin: -10rpx 0 14rpx;
  padding: 15rpx 18rpx 13rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.7);
  border-radius: 20rpx;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(228, 240, 238, 0.55));
  box-shadow: 0 16rpx 36rpx rgba(47, 111, 106, 0.07), 0 2rpx 8rpx rgba(28, 36, 35, 0.03);
  box-sizing: border-box;
}
.calendar-preview:active { opacity: .78; }
.calendar-preview-head,
.calendar-preview-name {
  display: flex;
  align-items: center;
}
.calendar-preview-head { justify-content: space-between; }
.calendar-preview-name { gap: 10rpx; color: var(--dk-ink); font-size: var(--dk-fs-meta, 24rpx); font-weight: 600; }
.calendar-preview-name .calendar-glyph { width: 22rpx; height: 23rpx; border-radius: 5rpx; color: var(--dk-brand); }
.calendar-preview-more { color: var(--dk-brand); font-size: var(--dk-fs-caption, 21rpx); }
.calendar-preview-week {
  display: flex;
  justify-content: space-between;
  margin-top: 12rpx;
}
.calendar-preview-day {
  display: flex;
  width: 44rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--dk-muted);
}
.calendar-preview-weekday { font-size: 18rpx; line-height: 1.2; }
.calendar-preview-date { position: relative; display: flex; width: 38rpx; height: 38rpx; align-items: center; justify-content: center; margin-top: 4rpx; border-radius: 50%; font-size: 21rpx; line-height: 1; }
.calendar-preview-day.today .calendar-preview-date { color: #fff; background: var(--dk-brand); font-weight: 600; }
.calendar-preview-dot { position: absolute; left: 50%; bottom: 2rpx; width: 5rpx; height: 5rpx; border-radius: 50%; background: var(--dk-brand); transform: translateX(-50%); }
.calendar-preview-day.today .calendar-preview-dot { background: #fff; }
.timeline-actions { display: flex; justify-content: flex-end; min-height: 36rpx; margin: 0 0 6rpx; }
.collapse-all-entry { display: inline-flex; width: auto; height: 36rpx; align-items: center; gap: 8rpx; margin: 0; padding: 0 2rpx 0 12rpx; color: var(--dk-muted); background: transparent; font-size: var(--dk-fs-caption, 21rpx); line-height: 36rpx; }
.collapse-all-entry::after { border: 0; }
.collapse-all-entry:active { color: var(--dk-brand); opacity: .72; }
.collapse-all-chevron { width: 9rpx; height: 9rpx; margin: 0 7rpx 5rpx 0; border-right: 2rpx solid currentColor; border-bottom: 2rpx solid currentColor; transform: rotate(45deg); transition: transform .18s ease; }
.collapse-all-chevron.closed { margin-bottom: -4rpx; transform: rotate(-135deg); }
.timeline-group {
  display: flex;
  align-items: stretch;
  gap: 12rpx;
}
.time-axis {
  position: relative;
  flex-shrink: 0;
  width: 130rpx;
  padding: 5rpx 26rpx 44rpx 0;
  text-align: right;
  box-sizing: border-box;
}
.time-axis-active {
  opacity: 0.62;
}
.day-heading {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9rpx;
  white-space: nowrap;
}
.day-label {
  display: block;
  font-size: var(--dk-fs-label, 26rpx);
  font-weight: 600;
  line-height: 1.25;
  color: var(--dk-ink);
  white-space: nowrap;
}
.fold-chevron {
  width: 9rpx;
  height: 9rpx;
  flex-shrink: 0;
  border-right: 2rpx solid var(--dk-muted);
  border-bottom: 2rpx solid var(--dk-muted);
  transform: rotate(45deg) translateY(-2rpx);
  transition: transform 0.18s ease;
}
.fold-chevron.closed {
  transform: rotate(-45deg) translate(-1rpx, -1rpx);
}
.day-date {
  position: relative;
  z-index: 1;
  display: block;
  margin: 7rpx 6rpx 0 0;
  font-size: 20rpx;
  line-height: 1.3;
  color: var(--dk-muted);
  white-space: nowrap;
}
.axis-dot {
  position: absolute;
  top: 11rpx;
  right: -6rpx;
  z-index: 2;
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: var(--dk-brand);
  box-shadow: 0 0 0 6rpx var(--dk-brand-soft);
}
.axis-line {
  position: absolute;
  top: 10rpx;
  right: -1rpx;
  bottom: -10rpx;
  width: 2rpx;
  background: var(--dk-line);
}
.timeline-group:last-child .axis-line {
  bottom: 44rpx;
}
.cards {
  flex: 1;
  min-width: 0;
  padding: 0 0 40rpx 16rpx;
}
.timeline-group.collapsed .time-axis,
.timeline-group.collapsed .cards {
  padding-bottom: 24rpx;
}
.collapsed-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 76rpx;
  padding: 0 22rpx;
  border: 1rpx dashed var(--dk-line);
  border-radius: 16rpx;
  color: var(--dk-muted);
  background: var(--dk-surface);
  font-size: var(--dk-fs-meta, 24rpx);
  box-sizing: border-box;
}
.collapsed-action {
  color: var(--dk-brand);
  font-size: var(--dk-fs-caption, 22rpx);
}
.note-card {
  display: flex;
  height: 168rpx;
  gap: 18rpx;
  min-height: 168rpx;
  margin-bottom: 18rpx;
  padding: 20rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.65);
  border-radius: 18rpx;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.45), var(--dk-surface, #fff));
  box-shadow:
    0 16rpx 36rpx rgba(47, 111, 106, 0.07),
    0 2rpx 8rpx rgba(28, 36, 35, 0.03);
  box-sizing: border-box;
  &:active {
    opacity: 0.75;
  }
}
.capsule-card {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.45), var(--dk-surface, #fff));
  box-shadow:
    inset 4rpx 0 0 var(--dk-brand),
    0 16rpx 36rpx rgba(47, 111, 106, 0.07),
    0 2rpx 8rpx rgba(28, 36, 35, 0.03);
}
.note-card:last-child {
  margin-bottom: 0;
}
.card-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.pin {
  display: inline-flex;
  flex-shrink: 0;
  padding: 3rpx 9rpx;
  align-items: center;
  border-radius: 999rpx;
  background: var(--dk-feature-brand-soft, #e4f0ee);
  font-size: 18rpx;
  line-height: 1.35;
  color: var(--dk-feature-brand, #2f6f6a);
}
.excerpt-row {
  display: flex;
  min-height: 0;
  align-items: flex-start;
  gap: 12rpx;
}
.excerpt {
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: var(--dk-fs-label, 26rpx);
  line-height: 1.4;
  color: var(--dk-ink);
  word-break: break-word;
}
.detail {
  display: flex;
  min-width: 0;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8rpx 14rpx;
  margin-top: auto;
  padding-top: 8rpx;
  overflow: hidden;
  font-size: var(--dk-fs-caption, 23rpx);
  line-height: 1.35;
  color: var(--dk-muted);
}
.detail-time {
  min-width: 0;
  overflow: hidden;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entry-author {
  min-width: 0;
  overflow: hidden;
  color: var(--dk-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cover-wrap {
  position: relative;
  flex-shrink: 0;
  width: 128rpx;
  height: 128rpx;
  align-self: center;
}
.cover {
  width: 100%;
  height: 100%;
  border-radius: 12rpx;
  background: var(--dk-brand-soft);
}
.image-count {
  position: absolute;
  right: 6rpx;
  bottom: 6rpx;
  min-width: 34rpx;
  height: 30rpx;
  padding: 0 7rpx;
  border-radius: 999rpx;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  font-size: 18rpx;
  line-height: 30rpx;
  text-align: center;
}
.day-more {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60rpx;
  margin: 4rpx 0 0;
  padding: 0;
  border: 0;
  border-radius: 14rpx;
  color: var(--dk-brand);
  background: var(--dk-brand-soft);
  font-size: var(--dk-fs-meta, 24rpx);
  line-height: 60rpx;
}
.day-more::after {
  border: 0;
}
.empty {
  padding: 60rpx 0;
  text-align: center;
  color: var(--dk-muted);
  font-size: var(--dk-fs-body, 28rpx);
}
.login-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
}
.login-empty-copy {
  display: block;
  line-height: 1.55;
}
.login-empty .btn {
  margin: 0;
}
.empty-wrap {
  min-height: calc(100vh - 280px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-bottom: 80rpx;
  box-sizing: border-box;
}
.empty-t {
  font-size: var(--dk-fs-title, 30rpx);
  color: var(--dk-muted);
}
.btn {
  margin-top: 28rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 40rpx;
  height: 72rpx;
  line-height: 72rpx;
  font-size: var(--dk-fs-body, 28rpx);
  color: #fff;
  background: var(--dk-brand);
  border-radius: 12rpx;
  border: none;
  &::after {
    border: none;
  }
  &.ghost {
    margin-left: 16rpx;
    color: var(--dk-brand);
    background: transparent;
    border: 1rpx solid var(--dk-brand);
  }
}
.fab {
  position: fixed;
  right: 28rpx;
  bottom: calc(72px + env(safe-area-inset-bottom));
  width: 88rpx;
  height: 88rpx;
  padding: 0;
  margin: 0;
  overflow: hidden;
  line-height: 86rpx;
  border: 0;
  border-radius: 50%;
  background: var(--dk-brand, #2f6f6a);
  box-shadow: 0 10rpx 24rpx rgba(28,82,75,.22);
  color: #fff;
  font-size: 0;
  text-align: center;
  z-index: 999;
  transition: box-shadow 160ms ease, transform 160ms ease;
  &::after {
    border: none;
  }
}
.fab-plus { position: relative; z-index: 1; display: inline-block; width: 100%; height: 100%; color: #fff; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size: 52rpx; font-weight: 300; line-height: 84rpx; }
.fab-hover {
  transform: scale(.94);
  box-shadow: 0 6rpx 16rpx rgba(28,82,75,.18);
}
.create-mask { position: fixed; z-index: 1200; inset: 0; display: flex; align-items: flex-end; background: rgba(14,24,23,.42); }
.create-sheet-host { width: 100%; }
</style>
