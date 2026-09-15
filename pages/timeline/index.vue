<template>
  <view class="page" :style="pageStyle">
    <!-- 自定义顶栏 -->
    <view class="nav" :style="navStyle">
      <view class="nav-inner" :style="navInnerStyle">
        <view class="nav-copy">
          <text class="brand">只我们</text>
        </view>
        <view v-if="loggedIn" class="nav-actions">
          <button class="v2-chip primary space-chip" @tap="openSpaceSwitcher"><text class="space-chip-label">{{ currentSpaceLabel }}</text><text class="chip-chevron" /></button>
        </view>
      </view>
    </view>
    <view class="nav-spacer" :style="{ height: navTotalHeight + 'px' }" />

    <view v-if="loggedIn && !currentSpace?.dissolvedAt" class="v2-hero">
      <view class="composer-card">
        <text class="composer-question">{{ composerQuestion }}</text>
        <view class="composer-actions">
          <view class="composer-action type-text" @tap="createDiary('text')">
            <image class="composer-icon" src="../../static/composer/text.png" mode="aspectFit" />
            <text>文字</text>
          </view>
          <view class="composer-action type-photo" @tap="createDiary('photo')">
            <image class="composer-icon" src="../../static/composer/photo.png" mode="aspectFit" />
            <text>照片</text>
          </view>
        </view>
        <view class="composer-secondary-actions">
          <view class="composer-secondary-action" @tap="createCommitment">
            <view class="secondary-copy">
              <text class="secondary-title">创建约定</text>
              <text class="secondary-desc">约好一件未来的事</text>
            </view>
            <text class="secondary-arrow">›</text>
          </view>
          <view class="composer-secondary-action" @tap="createCapsule">
            <view class="secondary-copy">
              <text class="secondary-title">时间胶囊</text>
              <text class="secondary-desc">把此刻寄给以后</text>
            </view>
            <text class="secondary-arrow">›</text>
          </view>
        </view>
        <view v-if="dailyQuestion" class="composer-inspiration" @tap="openDailyQuestion">
          <view class="inspiration-copy">
            <text class="inspiration-label">✦ 今日灵感</text>
            <text class="inspiration-question">{{ dailyQuestion.question }}</text>
          </view>
          <text class="inspiration-action">写一写 ›</text>
        </view>
      </view>
    </view>

    <view v-if="!loggedIn" class="empty">
      <text class="empty-t">登录后查看时间线</text>
      <button class="btn" @tap="goLogin">去登录</button>
    </view>

    <view v-else-if="loading && !scopedList.length" class="empty">
      <text class="empty-t">加载中…</text>
    </view>

    <template v-else>
      <view v-if="!currentSpace?.dissolvedAt" class="feed-tabs">
        <view class="feed-anchor-group">
          <picker
            v-if="feedAnchor === 'past'"
            class="feed-tab-picker"
            mode="date"
            :value="pastPickerValue"
            :start="pastPickerStart"
            :end="pastPickerEnd"
            @change="onFeedDatePick('past', $event)"
          >
            <text class="feed-tab on">{{ feedAnchorLabel('past') }}</text>
          </picker>
          <text v-else class="feed-tab" @tap="selectFeedAnchor('past')">{{ feedAnchorLabel('past') }}</text>
          <text class="feed-tab" :class="{ on: feedAnchor === 'today' }" @tap="selectFeedAnchor('today')">当下</text>
          <picker
            v-if="feedAnchor === 'upcoming'"
            class="feed-tab-picker"
            mode="date"
            :value="upcomingPickerValue"
            :start="upcomingPickerStart"
            :end="upcomingPickerEnd"
            @change="onFeedDatePick('upcoming', $event)"
          >
            <text class="feed-tab on">{{ feedAnchorLabel('upcoming') }}</text>
          </picker>
          <text v-else class="feed-tab" @tap="selectFeedAnchor('upcoming')">{{ feedAnchorLabel('upcoming') }}</text>
        </view>
        <button class="good-days-entry" @tap="openGoodDays">
          <view class="calendar-icon" aria-hidden="true" />
          <text>日子与提醒</text>
          <text class="entry-chevron">›</text>
        </button>
      </view>

      <view v-if="currentSpace?.dissolvedAt" class="circle-card dissolved-circle" @tap="openSpaceDetail">
        <view class="dissolved-circle-mark">已解除</view>
        <text class="circle-title">{{ currentSpace.name }}</text>
        <text class="dissolved-circle-title">{{ currentDissolutionText.title }}</text>
        <text class="dissolved-circle-desc">{{ currentDissolutionText.desc }}</text>
        <text class="circle-detail dissolved-circle-detail">查看详情 ›</text>
      </view>

      <view v-else-if="currentSpace && feedAnchor === 'past'" class="circle-card" @tap="openSpaceDetail">
        <view v-if="currentSpace.coverUrl" class="circle-cover">
          <image class="circle-cover-subject" :src="currentSpace.coverUrl" mode="aspectFill" />
        </view>
        <view v-if="currentSpace.members?.length" class="circle-members">
          <view v-for="member in currentSpace.members.slice(0, 3)" :key="member.id" class="circle-member">
            <image v-if="member.avatarUrl" class="member-avatar" :src="member.avatarUrl" mode="aspectFill" />
            <text v-else class="member-avatar member-initial">{{ member.nickname.slice(0, 1) || '人' }}</text>
            <view v-if="member.mood" class="member-mood">
              <MoodIcon :mood="member.mood" size="badge" />
            </view>
          </view>
          <view v-if="circleMemberOverflow" class="circle-member">
            <text class="member-avatar circle-member-overflow">+{{ circleMemberOverflow }}</text>
          </view>
        </view>
        <view class="circle-head">
          <view class="circle-copy">
            <view class="circle-title-row"><text class="circle-title">{{ currentSpace.name }}</text><text v-if="currentSpace.isOfficial" class="circle-official-badge">官方公开</text></view>
            <text class="circle-meta">{{ currentSpace.isOfficial ? `${currentSpace.memberCount || 1} 位体验者 · ${currentSpace.recordCount} 条公开记录` : `共同 ${currentSpace.recordCount} 条回忆 · ${currentSpace.commitmentCount} 个约定 · ${currentSpaceDays} 天` }}</text>
          </view>
          <text class="circle-detail">详情 ›</text>
        </view>
        <view v-if="currentSpace.keywords.length" class="circle-tags">
          <text v-for="tag in currentSpace.keywords" :key="tag" class="circle-tag">#{{ tag }}</text>
        </view>
        <view class="circle-actions">
          <button @tap.stop="createCommitment">发起约定</button>
          <button @tap.stop="openQuiz">默契测试</button>
          <button @tap.stop="showWeeklyReview">本周回顾</button>
        </view>
      </view>

      <view v-if="!currentSpace?.dissolvedAt && !visibleFeedItems.length" class="empty empty-filter">
        <template v-if="currentSpace">
          <view class="space-empty-mark"><text>✦</text></view>
          <text class="empty-msg">{{ spaceEmptyTitle }}</text>
          <text v-if="spaceEmptyDesc" class="empty-msg-sub">{{ spaceEmptyDesc }}</text>
          <button class="space-empty-action" @tap="runSpaceEmptyAction">{{ feedAnchor === 'upcoming' ? '发起一个约定' : '写下共同回忆' }}</button>
        </template>
        <template v-else>
          <text class="empty-msg">{{ personalEmptyTitle }}</text>
          <text class="empty-msg-sub">{{ personalEmptyDesc }}</text>
          <view v-if="!scopedList.length" class="empty-guides">
            <view class="empty-guide-card" @tap="createAnniversary">
              <view><text class="empty-guide-title">记录第一个纪念日</text><text class="empty-guide-desc">生日、相遇、搬家都可以</text></view>
              <text class="empty-guide-go">开始</text>
            </view>
            <view class="empty-guide-card" @tap="inviteToRecord">
              <view><text class="empty-guide-title">邀请一个人一起记录</text><text class="empty-guide-desc">发给最在乎的那个人</text></view>
              <text class="empty-guide-go">邀请</text>
            </view>
          </view>
        </template>
      </view>

      <view v-else-if="!currentSpace?.dissolvedAt" class="feed-list">
        <view v-for="group in groupedFeedItems" :key="group.month" class="feed-month">
          <view class="month-heading"><text></text><text>{{ group.label }}</text><text></text></view>
          <view
            v-for="item in group.items"
            :key="item.id"
            class="feed-card"
            :class="[`kind-${item.kind}`, { locked: item.locked }]"
            @tap="openFeedItem(item)"
          >
            <view v-if="item.kind === 'diary' && item.cover" class="memory-cover" :style="{ backgroundImage: `url(${item.cover})` }" />
            <view v-else-if="item.kind !== 'diary'" class="feed-kind">{{ item.kindLabel }}</view>
            <view
              v-if="item.toggleable"
              class="feed-check"
              :class="{ on: item.done }"
              @tap.stop="onToggleTodo(item.entry)"
            >{{ item.done ? '✓' : '' }}</view>
            <view v-if="item.locked" class="capsule-seal">封</view>
            <view class="feed-body">
              <text class="feed-title" :class="{ done: item.done }">{{ item.title }}</text>
              <text v-if="item.desc" class="feed-desc">{{ item.desc }}</text>
              <view class="feed-meta-row">
                <view v-if="item.entry.ownerType === 'space' && currentSpace?.members?.length" class="feed-avatars">
                  <view v-for="member in feedMembers(item.entry)" :key="member.id" class="feed-avatar-wrap">
                    <image v-if="member.avatarUrl" class="feed-avatar" :src="member.avatarUrl" mode="aspectFill" />
                    <text v-else class="feed-avatar feed-initial">{{ member.nickname.slice(0, 1) }}</text>
                  </view>
                  <view v-if="feedMemberOverflow(item.entry)" class="feed-avatar-wrap">
                    <text class="feed-avatar feed-avatar-overflow">+{{ feedMemberOverflow(item.entry) }}</text>
                  </view>
                </view>
                <text class="feed-meta">{{ item.meta }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </template>

    <view v-if="showSpaceSwitcher" class="space-switcher-mask" @tap="showSpaceSwitcher = false">
      <view class="space-switcher-sheet" @tap.stop>
        <view class="space-switcher-grabber" />
        <view class="space-switcher-head">
          <view class="space-switcher-heading">
            <text class="space-switcher-title">切换空间</text>
          </view>
          <text class="space-switcher-close" @tap="showSpaceSwitcher = false">×</text>
        </view>
        <scroll-view scroll-y :show-scrollbar="false" class="space-switcher-list" :style="spaceSwitcherListStyle">
          <view class="space-option" :class="{ on: !currentSpaceId }" @tap="selectTimelineSpace(null)">
            <view class="space-option-mark personal"><image v-if="currentUserAvatar" :src="currentUserAvatar" mode="aspectFill" /><text v-else>我</text></view>
            <view class="space-option-copy">
              <text class="space-option-title">仅自己</text>
            </view>
            <view v-if="!currentSpaceId" class="space-option-check"><text>✓</text></view>
          </view>
          <view v-for="item in spaces" :key="item.id" class="space-option" :class="{ on: currentSpaceId === item.id, dissolved: !!item.dissolvedAt }" @tap="selectTimelineSpace(item.id)">
            <view class="space-option-mark"><image v-if="item.coverUrl" :src="item.coverUrl" mode="aspectFill" /><text v-else>{{ item.name.slice(0, 1) || '圈' }}</text></view>
            <view class="space-option-copy">
              <view class="space-option-title-row">
                <text class="space-option-title">{{ item.name }}</text>
                <text v-if="item.isOfficial" class="space-option-state official">官方公开</text>
                <text v-if="item.dissolvedAt" class="space-option-state">已解除</text>
              </view>
            </view>
            <view v-if="currentSpaceId === item.id" class="space-option-check"><text>✓</text></view>
          </view>
        </scroll-view>
        <view class="space-switcher-actions">
          <view v-if="officialExperience && !hasJoinedOfficial" class="space-manage-action official-join-action" @tap="joinOfficialFromSwitcher">
            <text class="space-manage-mark">✦</text>
            <text class="space-manage-title">加入官方体验圈</text>
            <text class="space-manage-arrow">›</text>
          </view>
          <view v-if="!currentSpace || (!currentSpace.isOfficial && isCurrentSpaceOwner && !currentSpace.dissolvedAt)" class="space-manage-action" @tap="inviteFromSpaceSwitcher">
            <text class="space-manage-mark">＋</text>
            <text class="space-manage-title">{{ currentSpace ? '邀请成员加入' : '邀请一起记' }}</text>
            <text class="space-manage-arrow">›</text>
          </view>
          <view class="space-manage-action" @tap="createGroupFromSpaceSwitcher">
            <text class="space-manage-mark">＋</text>
            <text class="space-manage-title">创建多人空间</text>
            <text class="space-manage-arrow">›</text>
          </view>
        </view>
      </view>
    </view>

  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { onShow, onBackPress, onShareAppMessage } from '@dcloudio/uni-app'
import { fetchMe, getCachedUserId, isLoggedIn, isSessionBoundaryError, isTransientAccessError, logout } from '@/services/auth'
import {
  entryBackgroundUrl,
  toggleTodoDone,
  type Entry,
} from '@/services/entries'
import { useEntriesStore } from '@/stores/entries'
import { holidaysForTimeline, syncHolidaySettings } from '@/services/holidays'
import { useThemePage } from '@/composables/useThemePage'
import { getTokens } from '@/services/theme'
import { shouldShowOnboarding } from '@/services/onboarding'
import { getOfficialExperienceSpace, joinOfficialExperienceSpace, listSpaces, type Space, type SpaceMember } from '@/services/spaces'
import { consumeTimelineEntryAnchor, getPreferredSpaceId, setPreferredSpaceId, type TimelineEntryAnchor } from '@/services/spacePreference'
import MoodIcon from '@/components/MoodIcon.vue'
import { displayDiaryBody } from '@/services/systemEntries'
import { getDailyQuestion, type DailyQuestionState } from '@/services/dailyQuestions'
import {
  normalizeRepeatRule,
  repeatRuleLabel,
} from '@/utils/countdown'
import { formatAnnualDateLabel, formatDateLabel } from '@/utils/lunar'
import { spaceDissolutionLines } from '@/utils/spaceLifecycle'
import { trackProductEvent } from '@/services/analytics'

const { pageStyle, themeId } = useThemePage()

const entriesStore = useEntriesStore()
// 登录成功 switchTab 过来时，首帧直接读取刚写入的 Token，避免先闪出未登录占位页。
const loggedIn = ref(isLoggedIn())
const loading = computed(() => entriesStore.loading)
const list = computed(() => entriesStore.list)
const pageKind = ref<'anniversary' | 'todo'>('anniversary')
const toggling = ref('')
const holidayRevision = ref(0)
type FeedAnchor = 'past' | 'today' | 'upcoming'
type FeedKind = 'diary' | 'anniversary' | 'todo' | 'capsule'
interface FeedItem {
  id: string
  kind: FeedKind
  entry: Entry
  title: string
  desc: string
  meta: string
  bucket: FeedAnchor
  sortKey: string
  cover: string
  locked: boolean
  kindLabel: string
  done: boolean
  toggleable: boolean
}
// 首次进入某个空间时按当天内容选择默认分栏；之后保留用户在该空间的选择。
const feedAnchor = ref<FeedAnchor>('past')
const feedMonth = ref('')
const feedDay = ref('')
const activeFeedScopeKey = ref('')
const feedViewByScope = new Map<string, { anchor: FeedAnchor; month: string; day: string }>()
const spaces = ref<Space[]>([])
const officialExperience = ref<Space | null>(null)
const currentSpaceId = ref<string | null>(null)
const spacesLoaded = ref(false)
const dailyQuestion = ref<DailyQuestionState | null>(null)
const showSpaceSwitcher = ref(false)
const currentUserAvatar = ref('')

const currentSpace = computed(() => spaces.value.find((space) => space.id === currentSpaceId.value) || null)
const hasJoinedOfficial = computed(() => spaces.value.some((space) => space.isOfficial))
const circleMemberOverflow = computed(() => {
  const shown = Math.min(currentSpace.value?.members?.length || 0, 3)
  return Math.max(0, Number(currentSpace.value?.memberCount ?? shown) - shown)
})
const spaceSwitcherListStyle = computed(() => ({
  height: `${Math.min(spaces.value.length + 1, 4) * 98}rpx`,
}))
const currentSpaceLabel = computed(() => currentSpace.value ? currentSpace.value.name.replace(/的小圈$/, '') : '仅自己')
const composerQuestion = computed(() => currentSpace.value?.isOfficial ? '分享此刻，或只留给自己' : currentSpace.value ? '把这一刻，留给我们' : '今天，有什么想留下的？')
const currentDissolutionText = computed(() => spaceDissolutionLines(currentSpace.value || {}))
const isCurrentSpaceOwner = computed(() => String(currentSpace.value?.ownerId || '') === String(getCachedUserId() || ''))
const currentOwnerType = computed(() => currentSpace.value ? 'space' as const : 'personal' as const)
// 展示层再做一道归属校验：即使历史缓存或并发请求异常，也绝不把个人记录画进时光圈。
const scopedList = computed(() => list.value.filter((entry) => {
  if (!currentSpace.value) return (entry.ownerType || 'personal') === 'personal' && !entry.spaceId
  return entry.ownerType === 'space' && String(entry.spaceId || '') === String(currentSpace.value.id)
}))
const hasTodayFeed = computed(() => scopedList.value.some((entry) => feedBucket(entry) === 'today'))

function currentFeedScopeKey() {
  return currentSpaceId.value ? `space:${currentSpaceId.value}` : 'personal'
}

function rememberCurrentFeedView() {
  if (!activeFeedScopeKey.value) return
  feedViewByScope.set(activeFeedScopeKey.value, {
    anchor: feedAnchor.value,
    month: feedMonth.value,
    day: feedDay.value,
  })
}

/** 只在首次进入或真正切换空间时决定分栏，不在 onShow/刷新后覆盖用户选择。 */
function applyDefaultFeedAnchor() {
  const scopeKey = currentFeedScopeKey()
  if (activeFeedScopeKey.value === scopeKey) return
  const saved = feedViewByScope.get(scopeKey)
  feedAnchor.value = saved?.anchor ?? (hasTodayFeed.value ? 'today' : 'past')
  feedMonth.value = saved?.month || ''
  feedDay.value = saved?.day || ''
  activeFeedScopeKey.value = scopeKey
}

function applyTimelineEntryAnchor(anchor: TimelineEntryAnchor | null) {
  if (!anchor) return
  feedAnchor.value = anchor
  feedMonth.value = ''
  feedDay.value = ''
  activeFeedScopeKey.value = currentFeedScopeKey()
  feedViewByScope.set(activeFeedScopeKey.value, { anchor, month: '', day: '' })
}
const currentSpaceDays = computed(() => {
  const createdAt = currentSpace.value?.createdAt
  if (!createdAt) return 1
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return 1
  return Math.max(1, Math.floor((Date.now() - created) / 86400000) + 1)
})
const spaceEmptyTitle = computed(() => {
  if (!scopedList.value.length) return '从第一条共同回忆开始'
  if (feedAnchor.value === 'today') return '今天还没有新记录'
  if (feedAnchor.value === 'upcoming') return '还没有即将到来的约定'
  return '这里还没有共同回忆'
})
const spaceEmptyDesc = computed(() => {
  if (!scopedList.value.length) return ''
  if (feedAnchor.value === 'upcoming') return '约好下一次见面、旅行，或者一件想一起完成的小事。'
  if (feedAnchor.value === 'today') return ''
  return '翻到更早的时候，再慢慢把共同的故事补回来。'
})
const personalEmptyTitle = computed(() => {
  if (!scopedList.value.length) return '从第一件在乎的事开始'
  if (feedAnchor.value === 'today') return '今天还没有写下什么'
  if (feedAnchor.value === 'upcoming') return feedMonth.value || feedDay.value ? '这段时间还没有安排' : '未来还留着很多可能'
  return feedMonth.value || feedDay.value ? '这段时间还没有回忆' : '过往还没有留下记录'
})
const personalEmptyDesc = computed(() => {
  if (!scopedList.value.length) return '一句话、一张照片，都是时光的开始'
  if (feedAnchor.value === 'today') return '有想记住的，就从上面写下来吧'
  if (feedAnchor.value === 'upcoming') return '记下一个约定，给期待一个日期'
  return '换个时间看看，或者补记一件往事'
})


/**
 * force: 从创建/加入时光圈的页面返回时必须重新拉。
 * 之前 spacesLoaded 一旦置真就永不失效，新建或加入的圈子在切换器和
 * currentSpace 里都不出现，得重启小程序才能看到。
 */
async function loadSpaces(force = false) {
  if (spacesLoaded.value && !force) return
  try {
    const previousSpaces = new Map(spaces.value.map((space) => [space.id, space]))
    const [loadedSpaces, official] = await Promise.all([
      listSpaces(),
      getOfficialExperienceSpace().catch(() => null),
    ])
    officialExperience.value = official
    // 同一空间刷新或再次进入时，沿用已经加载过的成员资料，直到新响应带回完整成员。
    // 这样信息流不会先显示“圈内成员”，再突然跳成具体昵称。
    spaces.value = loadedSpaces.map((space) => {
      const previous = previousSpaces.get(space.id)
      if (space.members?.length || !previous?.members?.length) return space
      return { ...space, members: previous.members }
    })
    const preferredId = getPreferredSpaceId()
    if (preferredId && spaces.value.some((space) => space.id === preferredId)) currentSpaceId.value = preferredId
    else if (preferredId || (currentSpaceId.value && !spaces.value.some((space) => space.id === currentSpaceId.value))) {
      currentSpaceId.value = null
      setPreferredSpaceId(null)
    }
    spacesLoaded.value = true
  } catch {
    // 保留上一次结果，避免网络抖动时切换器突然变空。
    if (!spacesLoaded.value) spaces.value = []
  }
}

async function loadDailyQuestion() {
  if (currentSpace.value?.dissolvedAt) {
    dailyQuestion.value = null
    return
  }
  try { dailyQuestion.value = await getDailyQuestion(currentSpaceId.value) }
  catch { dailyQuestion.value = null }
}

function openDailyQuestion() {
  const params: string[] = []
  if (currentSpaceId.value) params.push(`spaceId=${encodeURIComponent(currentSpaceId.value)}`)
  if (currentSpace.value?.name) params.push(`spaceName=${encodeURIComponent(currentSpace.value.name)}`)
  uni.navigateTo({ url: `/subpackages/daily-question/answer${params.length ? `?${params.join('&')}` : ''}` })
}

const statusBarHeight = ref(20)
const navBarHeight = ref(44)
const navContentOffset = ref(8)
const navBg = ref('#f2f4f3')

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const navTotalHeight = computed(() => statusBarHeight.value + navBarHeight.value)

const navStyle = computed(() => ({
  paddingTop: `${statusBarHeight.value}px`,
  backgroundColor: navBg.value,
}))

const navInnerStyle = computed(() => ({
  height: `${navBarHeight.value}px`,
  paddingTop: `${navContentOffset.value}px`,
  boxSizing: 'border-box' as const,
}))

function daysValue(item: Entry, fallback = 0) {
  return item.daysUntil == null ? fallback : item.daysUntil
}

function entryDateKey(item: Entry) {
  return String(item.eventAt || item.eventDate || item.createdAt || '').slice(0, 10)
}

/** 重复日子/约定在时间轴上按下一次发生日期展示，而不是永远停在首次创建年份。 */
function timelineDateKey(item: Entry) {
  if (isCapsuleEntry(item) && !item.capsuleUnlocked && item.capsuleUnlockAt) {
    return String(item.capsuleUnlockAt).slice(0, 10)
  }
  const original = entryDateKey(item)
  if (item.type === 'diary' || normalizeRepeatRule(item) === 'none' || item.daysUntil == null || item.daysUntil < 0) {
    return original
  }
  const target = new Date()
  target.setHours(0, 0, 0, 0)
  target.setDate(target.getDate() + item.daysUntil)
  return `${target.getFullYear()}-${`${target.getMonth() + 1}`.padStart(2, '0')}-${`${target.getDate()}`.padStart(2, '0')}`
}

function todayKey() {
  const date = new Date()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function localDateFromKey(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day || 1)
}

function dateKeyOf(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
}

function shiftDateKey(base: string, offset: number) {
  const date = localDateFromKey(base)
  date.setDate(date.getDate() + offset)
  return dateKeyOf(date)
}

function feedBucket(item: Entry): FeedAnchor {
  if (isCapsuleEntry(item) && !item.capsuleUnlocked) return 'upcoming'
  const key = timelineDateKey(item)
  const today = todayKey()
  if (key === today) return 'today'
  // 待办的核心状态是「要不要继续处理」，不是日期是否已经过去：
  // 未完成的过期待办仍应留在「即将到来」里用「逾期」提示，避免被塞进回忆后被用户忽略。
  if (item.type === 'todo') return item.todoStatus === 'done' ? 'past' : 'upcoming'
  if (item.type === 'anniversary') return daysValue(item) < 0 ? 'past' : 'upcoming'
  return key > today ? 'upcoming' : 'past'
}

function feedKind(item: Entry): FeedKind {
  if (isCapsuleEntry(item)) return 'capsule'
  // 日期型约定沿用 anniversary 的日期排序；历史待办型约定仍落在 todo 桶。
  if (item.type === 'todo') return 'todo'
  if (item.type === 'anniversary') return 'anniversary'
  return 'diary'
}

function isCapsuleEntry(item: Entry) {
  return !!item.isCapsule || item.entryKind === 'capsule' || !!item.capsuleUnlockAt
}

function feedTitle(item: Entry) {
  if (item.isCapsule || item.entryKind === 'capsule') return item.title || '时间胶囊'
  if (item.type === 'diary') {
    if (item.tags?.includes('今日灵感')) return item.title.replace(/^今日灵感｜/, '') || '今日灵感'
    return displayDiaryBody(item.body || '').split(/\n/).find((line) => line.trim())?.trim().slice(0, 42) || item.title || '随手记'
  }
  return item.title || '未命名'
}

function feedDesc(item: Entry, kind: FeedKind) {
  if (kind === 'capsule') {
    if (item.capsuleUnlocked) return '时间胶囊 · 已解锁'
    if (item.capsuleUnlockMode === 'random') return '随机胶囊 · 等待惊喜揭晓'
    return `时间胶囊 · ${capsuleCountdown(item) || '等待开启'}`
  }
  if (kind === 'todo') return item.location ? `${item.location} · ${todoDateText(item)}` : todoDateText(item)
  if (kind === 'anniversary') return `${metaText(item)} · ${countdownText(item)}`
  const body = displayDiaryBody(item.body || '').trim()
  if (!body) return ''
  if (item.tags?.includes('今日灵感')) {
    return body === feedTitle(item) ? '' : body.slice(0, 58)
  }
  const lines = body.split(/\n/).map((line) => line.trim()).filter(Boolean)
  return lines.length > 1 ? lines.slice(1).join(' ').slice(0, 58) : ''
}

function feedMeta(item: Entry) {
  // 顶部空间切换已经明确当前为个人空间，卡片内重复“仅自己”只会制造噪音。
  const scope = item.ownerType === 'space' ? `由 ${entryAuthorName(item)} 记录` : ''
  const key = isCapsuleEntry(item) ? `封存于 ${entryDateKey(item)}` : timelineDateKey(item)
  return [key, scope].filter(Boolean).join(' · ')
}

function entryAuthorName(item: Entry) {
  const userId = String(item.userId || '')
  const member = currentSpace.value?.members?.find((candidate) => String(candidate.userId) === userId)
  return member?.nickname?.trim() || item.authorName?.trim() || '圈内成员'
}

function sortedFeedMembers(item: Entry): SpaceMember[] {
  const members = currentSpace.value?.members || []
  const authorId = String(item.userId || '')
  if (!authorId) return members
  const author = members.find((member) => String(member.userId) === authorId)
  if (!author) return members
  return [author, ...members.filter((member) => member.id !== author.id)]
}

function feedMembers(item: Entry) {
  return sortedFeedMembers(item).slice(0, 3)
}

function feedMemberOverflow(item: Entry) {
  return Math.max(0, sortedFeedMembers(item).length - 3)
}

const mixedFeedItems = computed<FeedItem[]>(() => {
  // 依赖 holidayRevision，让 syncHolidaySettings 完成后能重新计算。
  void holidayRevision.value
  // 节日必须并回信息流：旧的 scopedList 被删掉后 holidaysForTimeline 没人调用，
  // 「我的 → 好日子设置」对首页就完全没有效果了。节日只属于个人视图，
  // 在时光圈里看共同内容时不混进来。
  const holidays = currentSpace.value ? [] : holidaysForTimeline()
  const items = [...scopedList.value.filter((item) => !item.id.startsWith('holiday:')), ...holidays]
    .map((entry) => {
      const kind = feedKind(entry)
      const bucket = feedBucket(entry)
      return {
        id: entry.id,
        kind,
        entry,
        title: feedTitle(entry),
        desc: feedDesc(entry, kind),
        meta: feedMeta(entry),
        bucket,
        sortKey: kind === 'capsule' && !entry.capsuleUnlocked && entry.capsuleUnlockMode === 'random'
          ? 'random-capsule'
          : timelineDateKey(entry),
        cover: kind === 'diary'
          ? entry.images?.[0] || entryBackgroundUrl(entry)
          : '',
        locked: kind === 'capsule' && !entry.capsuleUnlocked,
        // 预算好，别在模板里按行调函数：小程序端每次 setData 都会重跑一遍。
        kindLabel: feedKindLabel(kind, entry),
        done: isDone(entry),
        // 节日是本地生成的虚拟条目，不能勾选完成。
        toggleable: kind === 'todo' && !entry.id.startsWith('holiday:'),
      }
    })
  return items.sort((a, b) => {
    if (a.bucket === 'upcoming' && b.bucket === 'upcoming') return a.sortKey.localeCompare(b.sortKey)
    return b.sortKey.localeCompare(a.sortKey)
  })
})

const visibleFeedItems = computed(() => mixedFeedItems.value.filter((item) => {
  if (item.bucket !== feedAnchor.value) return false
  if (feedDay.value) return item.sortKey.slice(0, 10) === feedDay.value
  return !feedMonth.value || item.sortKey.slice(0, 7) === feedMonth.value
}))

const pastPickerStart = '1900-01-01'
const upcomingPickerEnd = '2099-12-31'
const pastPickerEnd = computed(() => shiftDateKey(todayKey(), -1))
const upcomingPickerStart = computed(() => shiftDateKey(todayKey(), 1))
const pastPickerValue = computed(() => pickerValueForAnchor('past'))
const upcomingPickerValue = computed(() => pickerValueForAnchor('upcoming'))

const groupedFeedItems = computed(() => {
  const groups = new Map<string, FeedItem[]>()
  for (const item of visibleFeedItems.value) {
    const month = item.sortKey === 'random-capsule'
      ? 'random-capsule'
      : /^\d{4}-\d{2}/.test(item.sortKey) ? item.sortKey.slice(0, 7) : '其他时间'
    const group = groups.get(month) || []
    group.push(item)
    groups.set(month, group)
  }
  return [...groups.entries()].map(([month, items]) => ({
    month,
    label: month === 'random-capsule'
      ? '等待惊喜'
      : month === '其他时间'
      ? month
      : feedDay.value
        ? `${monthLabel(month)} · ${Number(feedDay.value.slice(8, 10))}日`
        : monthLabel(month),
    items,
  }))
})

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number)
  return year && month ? `${year}年${month}月` : value
}

function feedAnchorLabel(anchor: Exclude<FeedAnchor, 'today'>) {
  const base = anchor === 'past' ? '回忆' : '即将到来'
  return `${base} ▾`
}

function selectFeedAnchor(anchor: FeedAnchor) {
  if (anchor === 'today') {
    feedAnchor.value = anchor
    feedMonth.value = ''
    feedDay.value = ''
    return
  }
  if (feedAnchor.value === anchor) return
  feedAnchor.value = anchor
  feedMonth.value = ''
  feedDay.value = ''
}

function candidateDateForAnchor(anchor: Exclude<FeedAnchor, 'today'>) {
  const candidate = mixedFeedItems.value
    .filter((item) => item.bucket === anchor && /^\d{4}-\d{2}-\d{2}/.test(item.sortKey))
    .map((item) => item.sortKey.slice(0, 10))
    .sort((a, b) => anchor === 'past' ? b.localeCompare(a) : a.localeCompare(b))[0]
  return candidate || (anchor === 'past' ? pastPickerEnd.value : upcomingPickerStart.value)
}

function pickerBounds(anchor: Exclude<FeedAnchor, 'today'>) {
  return anchor === 'past'
    ? { min: pastPickerStart, max: pastPickerEnd.value }
    : { min: upcomingPickerStart.value, max: upcomingPickerEnd }
}

function clampFeedPickerDate(value: string, anchor: Exclude<FeedAnchor, 'today'>) {
  const fallback = candidateDateForAnchor(anchor)
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback
  const range = pickerBounds(anchor)
  if (normalized < range.min) return range.min
  if (normalized > range.max) return range.max
  return normalized
}

function pickerValueForAnchor(anchor: Exclude<FeedAnchor, 'today'>) {
  const currentSelection = feedAnchor.value === anchor
    ? feedDay.value || (feedMonth.value ? `${feedMonth.value}-01` : '')
    : ''
  return clampFeedPickerDate(currentSelection || candidateDateForAnchor(anchor), anchor)
}

function onFeedDatePick(anchor: Exclude<FeedAnchor, 'today'>, event: { detail?: { value?: string } }) {
  const selected = clampFeedPickerDate(String(event.detail?.value || ''), anchor)
  feedAnchor.value = anchor
  uni.showActionSheet({
    itemList: ['查看当天', '查看整月'],
    success: ({ tapIndex }) => {
      feedMonth.value = selected.slice(0, 7)
      feedDay.value = tapIndex === 0 ? selected : ''
    },
  })
}

function feedKindLabel(kind: FeedKind, entry: Entry) {
  if (kind === 'capsule') return entry.capsuleUnlocked ? '时间胶囊' : entry.capsuleUnlockMode === 'random' ? '随机胶囊' : '未拆封'
  if (kind === 'todo') {
    return entry.entryKind === 'commitment' ? '约定' : '待办'
  }
  if (kind === 'anniversary') {
    if (entry.entryKind === 'commitment') return '约定'
    return entry.id.startsWith('holiday:') ? '节日' : '好日子'
  }
  if (entry.tags?.includes('今日灵感')) return '今日灵感'
  return entry.ownerType === 'space' ? '共同回忆' : '随手记'
}

function openFeedItem(item: FeedItem) {
  if (item.kind === 'capsule') {
    uni.navigateTo({ url: `/subpackages/capsule/locked?id=${encodeURIComponent(item.entry.id)}` })
    return
  }
  if (item.entry.type !== 'diary' && item.entry.entryKind === 'commitment') {
    uni.navigateTo({ url: `/subpackages/commitment/detail?id=${encodeURIComponent(item.entry.id)}` })
    return
  }
  if (item.entry.type === 'diary') {
    // 随手记必须回到写作模板：日子详情是纪念日/待办的倒计时页面，
    // 复用它会把“此刻”错误展示成日期，也切断正文、图片和标签的编辑链路。
    uni.navigateTo({
      url: `/subpackages/notes/edit?type=diary&id=${encodeURIComponent(item.entry.id)}&from=timeline`,
    })
    return
  }
  openEdit(item.entry.id)
}

function isDone(item: Entry) {
  return item.type === 'todo' && item.todoStatus === 'done'
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

/** 右侧突出天数 */
function dayParts(item: Entry): { mode: 'num'; num: number } | { mode: 'text'; label: string } {
  if (isDone(item)) return { mode: 'text', label: '完成' }
  const d = item.daysUntil
  if (d == null) return { mode: 'text', label: '—' }
  if (d === 0) return { mode: 'text', label: '今天' }
  return { mode: 'num', num: Math.abs(d) }
}

/** 倒计时作为一个完整短语展示，避免“还有/已经”与数字被拆散。 */
function countdownText(item: Entry) {
  const parts = dayParts(item)
  if (parts.mode === 'text') return parts.label
  const prefix = verbText(item)
  return `${prefix ? `${prefix} ` : ''}${parts.num} 天`
}

function capsuleCountdown(item: Entry): string {
  if (!item.capsuleUnlockAt) return ''
  const target = new Date(item.capsuleUnlockAt)
  if (Number.isNaN(target.getTime())) return ''
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return '即将开启'
  const days = Math.ceil(diff / 86400000)
  // days 已经向上取整，粗粒度再 ceil 会多算一档：31 天会说成「2个月后」、
  // 366 天会说成「2年后」。这里用 floor，并让阈值和除数对齐。
  if (days >= 365) return `${Math.floor(days / 365)}年后开启`
  if (days >= 30) return `${Math.floor(days / 30)}个月后开启`
  return `${days}天后开启`
}

function goLogin() {
  uni.reLaunch({ url: '/pages/login/login' })
}

/**
 * 好日子 chip：跳转到独立的好日子页（翻页时钟 + 日期/待办 + 即将到来/已经过去）。
 * 这里不做信息流筛选——好日子是一个完整页面，不是首页的一个筛选态。
 */
function openGoodDays() {
  if (!isLoggedIn()) {
    goLogin()
    return
  }
  const query = currentSpaceId.value ? `?spaceId=${encodeURIComponent(currentSpaceId.value)}` : ''
  uni.navigateTo({ url: `/subpackages/good-days/index${query}` })
}

function ownerQuery() {
  const params = [`ownerType=${currentOwnerType.value}`]
  if (currentSpaceId.value) params.push(`spaceId=${encodeURIComponent(currentSpaceId.value)}`)
  return params.join('&')
}

function createDiary(mode: 'text' | 'photo' = 'text') {
  if (!isLoggedIn()) {
    goLogin()
    return
  }
  const scope = currentSpace.value?.isOfficial
    ? `ownerType=personal&suggestedPublicSpaceId=${encodeURIComponent(currentSpace.value.id)}`
    : ownerQuery()
  if (currentSpace.value?.isOfficial) void trackProductEvent('official_personal_write_started', { source: 'timeline' })
  uni.navigateTo({ url: `/subpackages/notes/edit?type=diary&from=timeline&mode=${mode}&${scope}` })
}

function createCommitment() {
  uni.navigateTo({ url: `/subpackages/notes/edit?type=anniversary&from=timeline&entryKind=commitment&${ownerQuery()}` })
}

function createAnniversary() {
  uni.navigateTo({ url: `/subpackages/notes/edit?type=anniversary&from=timeline&${ownerQuery()}` })
}

function createCapsule() {
  uni.navigateTo({ url: `/subpackages/notes/edit?type=diary&from=timeline&entryKind=capsule&mode=capsule&${ownerQuery()}` })
}

function runSpaceEmptyAction() {
  if (feedAnchor.value === 'upcoming') createCommitment()
  else createDiary('text')
}

function inviteToRecord() {
  if (currentSpace.value) {
    uni.navigateTo({ url: `/subpackages/space/detail?spaceId=${encodeURIComponent(currentSpace.value.id)}&invite=1` })
    return
  }
  uni.navigateTo({ url: '/subpackages/space/create?type=pair&invite=1' })
}

function openQuiz() {
  if (!currentSpace.value) return
  uni.navigateTo({ url: `/subpackages/quiz/index?spaceId=${encodeURIComponent(currentSpace.value.id)}` })
}

function showWeeklyReview() {
  if (!currentSpace.value) return
  uni.navigateTo({
    url: `/subpackages/review/weekly?ownerType=space&spaceId=${encodeURIComponent(currentSpace.value.id)}`,
  })
}

function openSpaceDetail() {
  if (!currentSpace.value) return
  uni.navigateTo({ url: `/subpackages/space/detail?spaceId=${encodeURIComponent(currentSpace.value.id)}` })
}

async function openSpaceSwitcher() {
  await Promise.all([loadSpaces(), loadCurrentUserAvatar()])
  showSpaceSwitcher.value = true
}

async function loadCurrentUserAvatar(force = false) {
  if (currentUserAvatar.value && !force) return
  try {
    currentUserAvatar.value = (await fetchMe()).avatarUrl || ''
  } catch {
    // 头像加载失败不阻断空间切换，继续使用“我”作为兜底。
  }
}

async function selectTimelineSpace(spaceId: string | null) {
  showSpaceSwitcher.value = false
  rememberCurrentFeedView()
  currentSpaceId.value = spaceId
  setPreferredSpaceId(spaceId)
  // 主动切换归属时必须向服务端确认，不能继续复用旧版本可能污染过的缓存。
  await Promise.all([load(true), loadDailyQuestion()])
  applyDefaultFeedAnchor()
}

function inviteFromSpaceSwitcher() {
  showSpaceSwitcher.value = false
  inviteToRecord()
}

async function joinOfficialFromSwitcher() {
  showSpaceSwitcher.value = false
  try {
    const joined = await joinOfficialExperienceSpace()
    void trackProductEvent('official_space_joined', { source: 'space_switcher' })
    spacesLoaded.value = false
    await loadSpaces(true)
    await selectTimelineSpace(joined.id)
    uni.showToast({ title: '已加入官方体验圈', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加入失败，请稍后再试', icon: 'none' })
  }
}

function createGroupFromSpaceSwitcher() {
  showSpaceSwitcher.value = false
  uni.navigateTo({ url: '/subpackages/space/create?type=group&invite=1' })
}

function openEdit(id: string) {
  if (id.startsWith('holiday:')) {
    uni.navigateTo({ url: `/subpackages/day/detail?holiday=${encodeURIComponent(id.slice(8))}` })
    return
  }
  uni.navigateTo({ url: `/subpackages/day/detail?id=${encodeURIComponent(id)}` })
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

async function load(force = false) {
  loggedIn.value = isLoggedIn()
  if (!loggedIn.value) return
  if (currentSpace.value?.dissolvedAt) return
  try {
    await entriesStore.load({ force, ownerType: currentOwnerType.value, spaceId: currentSpaceId.value })
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

function measureNav() {
  try {
    const sys = uni.getSystemInfoSync()
    statusBarHeight.value = sys.statusBarHeight || 20
    navBg.value = getTokens(themeId.value).bg
    // #ifdef MP-WEIXIN
    const menu = uni.getMenuButtonBoundingClientRect()
    if (menu?.height) {
      navBarHeight.value = menu.height + (menu.top - statusBarHeight.value) * 2
      navContentOffset.value = Math.max(0, menu.top - statusBarHeight.value)
    }
    // #endif
  } catch {
    /* ignore */
  }
}

onMounted(measureNav)

onShareAppMessage(() => ({ title: '只我们｜世界很大，这里只我们', path: '/pages/timeline/index' }))

onShow(() => {
  const entryAnchor = consumeTimelineEntryAnchor()
  navBg.value = getTokens(themeId.value).bg
  holidayRevision.value += 1
  loggedIn.value = isLoggedIn()
  if (!loggedIn.value) {
    uni.reLaunch({ url: '/pages/login/login' })
    return
  }
  if (loggedIn.value && shouldShowOnboarding()) {
    uni.reLaunch({ url: '/pages/onboarding/index' })
    return
  }
  if (loggedIn.value) {
    rememberCurrentFeedView()
    // 先恢复默认空间，再拉该空间的记录；反过来会先展示「仅自己」的数据。
    void loadSpaces(true)
      .then(() => Promise.all([load(), loadDailyQuestion()]))
      .then(() => {
        applyDefaultFeedAnchor()
        applyTimelineEntryAnchor(entryAnchor)
      })
    void loadCurrentUserAvatar(true)
    void syncHolidaySettings()
      .then(() => {
        holidayRevision.value += 1
      })
      .catch(() => undefined)
  } else {
    void load()
  }
})


// #ifdef APP-PLUS
let lastBackTime = 0
onBackPress(() => {
  const now = Date.now()
  if (now - lastBackTime < 2000) {
    ;(plus as any).runtime.quit()
  } else {
    lastBackTime = now
    uni.showToast({ title: '再按一次退出应用', icon: 'none', duration: 1500 })
  }
  return true // 阻止默认返回
})
// #endif
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 0 32rpx 140rpx;
  background-color: var(--dk-bg, #f2f4f3);
  color: var(--dk-ink, #1c2423);
  box-sizing: border-box;
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
}
.collab-tiny-avatar:first-child {
  margin-left: 0;
}
.collab-tiny-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: var(--dk-feature-brand, #2f6f6a);
  font-size: 17rpx;
}

.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 0 32rpx;
  box-sizing: border-box;
}

.nav-inner {
  position: relative;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.nav-copy {
  max-width: 430rpx;
  min-width: 0;
}

.brand {
  display: block;
  font-size: var(--dk-fs-display, 46rpx);
  font-weight: 600;
  letter-spacing: .02em;
  color: var(--dk-ink, #1c2423);
  line-height: 1.2;
}

.nav-actions {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  max-width: 360rpx;
  transform: translate(-50%, -50%);
}

.clock-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 28rpx;
  padding: 12rpx 0 8rpx;
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

.v2-hero {
  margin: 24rpx 0 26rpx;
}

.v2-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 58rpx;
  min-width: 116rpx;
  margin: 0;
  padding: 0 22rpx;
  border: none;
  border-radius: 999rpx;
  background: var(--dk-brand-soft, #e4f0ee);
  color: var(--dk-brand, #2f6f6a);
  font-size: var(--dk-fs-meta, 24rpx);
  font-weight: 650;
  line-height: 58rpx;
  &::after { border: none; }
  &.primary {
    background: rgba(47, 111, 106, 0.12);
    padding-right: 18rpx;
  }
  &.on {
    background: var(--dk-brand, #2f6f6a);
    color: #fff;
  }
}
.chip-mark { margin-right: 8rpx; font-size: 20rpx; }
.space-chip{max-width:190rpx;gap:10rpx}.space-chip-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chip-chevron{width:11rpx;height:11rpx;margin-top:-5rpx;flex:0 0 auto;border-right:3rpx solid currentColor;border-bottom:3rpx solid currentColor;transform:rotate(45deg)}

.composer-card {
  padding: 32rpx 28rpx 26rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.72);
  border-radius: 32rpx;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(255, 254, 251, 0.08) 42%),
    #fffefb;
  box-shadow:
    0 22rpx 48rpx rgba(47, 111, 106, 0.08),
    0 2rpx 10rpx rgba(28, 36, 35, 0.04);
}

.composer-question {
  display: block;
  margin-bottom: 20rpx;
  color: var(--dk-ink, #1c2423);
  font-size: var(--dk-fs-title, 30rpx);
  font-weight: 620;
  letter-spacing: 0.02em;
}

.composer-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
}

.composer-action {
  min-height: 108rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  border-radius: 22rpx;
  background: var(--dk-bg-soft, #eef2f1);
  color: var(--dk-ink, #1c2423);
  font-size: var(--dk-fs-meta, 24rpx);
  font-weight: 600;
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.7);
}
.composer-action.type-text { background: rgba(47, 111, 106, 0.09); }
.composer-action.type-photo { background: rgba(196, 138, 60, 0.11); }

.composer-icon {
  width: 42rpx;
  height: 42rpx;
}
.composer-secondary-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14rpx;margin-top:14rpx}.composer-secondary-action{display:flex;min-width:0;height:88rpx;align-items:center;gap:10rpx;padding:0 18rpx;border:1rpx solid rgba(47,111,106,.08);border-radius:20rpx;background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(47,111,106,.05));box-sizing:border-box;box-shadow:inset 0 1rpx 0 rgba(255,255,255,.7)}.secondary-copy{min-width:0;flex:1}.secondary-title,.secondary-desc{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.secondary-title{color:var(--dk-ink);font-size:var(--dk-fs-meta,25rpx);font-weight:680}.secondary-desc{margin-top:5rpx;color:var(--dk-muted);font-size:var(--dk-fs-caption,23rpx)}.secondary-arrow{flex-shrink:0;color:var(--dk-brand);font-size:27rpx;line-height:1}
.composer-inspiration{display:flex;align-items:center;gap:18rpx;margin-top:24rpx;padding-top:22rpx;border-top:1rpx solid rgba(47,111,106,.1)}
.inspiration-copy{flex:1;min-width:0}.inspiration-label{display:block;color:var(--dk-feature-brand,#2f6f6a);font-size:var(--dk-fs-caption,23rpx);font-weight:750}.inspiration-question{display:-webkit-box;margin-top:7rpx;overflow:hidden;color:var(--dk-ink);font-size:var(--dk-fs-meta,25rpx);font-weight:680;line-height:1.42;-webkit-box-orient:vertical;-webkit-line-clamp:2}.inspiration-action{flex:0 0 auto;color:var(--dk-feature-brand,#2f6f6a);font-size:var(--dk-fs-caption,23rpx);font-weight:750;white-space:nowrap}
.daily-reveal{margin-top:14rpx;padding:22rpx 26rpx;border:1rpx solid var(--dk-line);border-radius:24rpx;background:var(--dk-surface)}.daily-reveal-label{display:block;color:var(--dk-brand);font-size:21rpx;font-weight:700}.daily-reveal-question{display:block;margin:7rpx 0 12rpx;color:var(--dk-ink);font-size:25rpx;font-weight:650}.daily-reveal-row{display:grid;grid-template-columns:120rpx 1fr;gap:14rpx;padding:8rpx 0;color:var(--dk-muted);font-size:22rpx}.daily-reveal-row text:last-child{color:var(--dk-ink)}

.empty-guides { width: 100%; margin-top: 28rpx; }
.empty-guide-card { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-top: 14rpx; padding: 24rpx; border: 1rpx solid var(--dk-line); border-radius: 22rpx; background: var(--dk-surface); text-align: left; }
.empty-guide-title { display: block; color: var(--dk-ink); font-size: var(--dk-fs-label, 28rpx); font-weight: 700; }
.empty-guide-desc { display: block; margin-top: 6rpx; color: var(--dk-muted); font-size: var(--dk-fs-caption, 23rpx); }
.empty-guide-go { flex-shrink: 0; color: var(--dk-brand); font-size: var(--dk-fs-meta, 25rpx); font-weight: 700; }

.space-switcher-mask{position:fixed;z-index:340;inset:0;display:flex;align-items:flex-end;background:rgba(10,18,17,.46);backdrop-filter:blur(5rpx)}
.space-switcher-sheet{width:100%;padding:14rpx 28rpx 16rpx;border:1rpx solid rgba(255,255,255,.72);border-bottom:0;border-radius:42rpx 42rpx 0 0;background:linear-gradient(165deg,rgba(255,255,255,.9),rgba(255,255,255,.66)),var(--dk-surface,#fff);box-shadow:0 -24rpx 70rpx rgba(20,34,32,.2);backdrop-filter:blur(26rpx) saturate(125%);box-sizing:border-box}
.space-switcher-grabber{width:72rpx;height:7rpx;margin:0 auto 17rpx;border-radius:999rpx;background:var(--dk-line)}
.space-switcher-head{display:flex;align-items:center;justify-content:space-between;gap:24rpx;padding:0 4rpx 18rpx}.space-switcher-heading{min-width:0;flex:1}.space-switcher-title{display:block;color:var(--dk-ink);font-size:32rpx;font-weight:780;line-height:1.25}.space-switcher-close{display:flex;width:54rpx;height:54rpx;flex-shrink:0;align-items:center;justify-content:center;border:1rpx solid rgba(255,255,255,.72);border-radius:50%;color:var(--dk-muted);background:rgba(255,255,255,.56);box-shadow:0 6rpx 16rpx rgba(22,37,34,.07),inset 0 1rpx 0 #fff;font-size:34rpx;line-height:1}
.space-switcher-list{overflow:hidden}.space-option{display:flex;min-height:88rpx;align-items:center;gap:14rpx;margin-bottom:10rpx;padding:11rpx 14rpx;border:1rpx solid rgba(28,36,35,.06);border-radius:22rpx;background:rgba(255,255,255,.54);box-shadow:0 7rpx 20rpx rgba(28,49,45,.035),inset 0 1rpx 0 rgba(255,255,255,.82);box-sizing:border-box}.space-option.on{border-color:var(--dk-feature-brand-soft,#e4f0ee);background:linear-gradient(145deg,var(--dk-feature-brand-soft,#e4f0ee),rgba(255,255,255,.74));box-shadow:0 9rpx 24rpx rgba(28,49,45,.055),inset 0 1rpx 0 rgba(255,255,255,.82)}.space-option.dissolved{opacity:.62}.space-option-mark{display:flex;width:58rpx;height:58rpx;flex-shrink:0;align-items:center;justify-content:center;overflow:hidden;border:3rpx solid rgba(255,255,255,.84);border-radius:18rpx;color:var(--dk-feature-brand,#2f6f6a);background:var(--dk-feature-brand-soft,#e4f0ee);box-shadow:0 5rpx 14rpx rgba(27,47,43,.1);font-size:22rpx;font-weight:750;box-sizing:border-box}.space-option-mark.personal{border-radius:50%}.space-option-mark image{width:100%;height:100%;border-radius:inherit}.space-option-copy{display:flex;min-width:0;flex:1;flex-direction:column}.space-option-title-row{display:flex;min-width:0;align-items:center;gap:9rpx}.space-option-title{min-width:0;overflow:hidden;color:var(--dk-ink);font-size:27rpx;font-weight:720;text-overflow:ellipsis;white-space:nowrap}.space-option-state{flex-shrink:0;padding:4rpx 9rpx;border-radius:999rpx;color:var(--dk-muted);background:rgba(255,255,255,.66);font-size:17rpx}.space-option-state.official{color:var(--dk-feature-brand,#2f6f6a);background:var(--dk-feature-brand-soft,#e4f0ee)}.space-option-check{display:flex;width:38rpx;height:38rpx;flex-shrink:0;align-items:center;justify-content:center;border-radius:50%;color:#fff;background:var(--dk-feature-brand,#2f6f6a);box-shadow:0 5rpx 13rpx rgba(47,111,106,.18);font-size:21rpx;font-weight:750}
.space-switcher-actions{display:flex;flex-wrap:wrap;gap:12rpx;margin-top:8rpx;padding-top:18rpx;border-top:1rpx solid var(--dk-line)}.space-manage-action{display:flex;min-width:0;height:72rpx;flex:1;align-items:center;justify-content:center;gap:8rpx;padding:0 12rpx;border:1rpx dashed var(--dk-feature-brand-soft,#e4f0ee);border-radius:20rpx;color:var(--dk-feature-brand,#2f6f6a);background:rgba(255,255,255,.46);box-sizing:border-box}.official-join-action{flex-basis:100%;border-style:solid;background:var(--dk-feature-brand-soft,#e4f0ee)}.space-manage-mark{font-size:25rpx;font-weight:400;line-height:1}.space-manage-title{overflow:hidden;color:var(--dk-ink);font-size:21rpx;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.space-manage-arrow{flex-shrink:0;color:var(--dk-feature-brand,#2f6f6a);font-size:25rpx;line-height:1}
.circle-card {
  margin: 0 0 34rpx;
  padding: 28rpx;
  overflow: hidden;
  border: 1rpx solid rgba(47,111,106,.09);
  border-radius: 30rpx;
  background: radial-gradient(circle at 100% 0,rgba(206,232,226,.5),transparent 38%),rgba(255,254,251,.96);
  box-shadow: 0 14rpx 40rpx rgba(24,42,39,.055);
}
.dissolved-circle{position:relative;padding:34rpx 30rpx;background:linear-gradient(145deg,rgba(255,254,251,.96),rgba(243,239,234,.96));text-align:left}
.dissolved-circle-mark{display:inline-flex;padding:7rpx 14rpx;border-radius:999rpx;color:#a85f57;background:rgba(178,103,93,.1);font-size:21rpx;font-weight:700}
.dissolved-circle .circle-title{margin-top:18rpx}.dissolved-circle-title{display:block;margin-top:20rpx;color:var(--dk-ink);font-size:27rpx;font-weight:700;line-height:1.5}.dissolved-circle-desc{display:block;margin-top:6rpx;color:#a85f57;font-size:23rpx}.dissolved-circle-detail{display:block;margin-top:24rpx;text-align:right}
.circle-cover { position:relative;width:calc(100% + 56rpx);height:300rpx;margin:-28rpx -28rpx 24rpx;overflow:hidden;background:var(--dk-brand-soft); }
.circle-cover-subject{display:block;width:100%;height:100%}

.circle-members { display: flex; align-items: center; min-height: 54rpx; margin-bottom: 18rpx; padding-left: 4rpx; }
.circle-member { position: relative; width: 50rpx; height: 50rpx; margin-left: -10rpx; }
.circle-member:first-child { margin-left: 0; }
.member-avatar { display: flex; width: 50rpx; height: 50rpx; box-sizing: border-box; align-items: center; justify-content: center; border: 4rpx solid #fff; border-radius: 50%; background: var(--dk-feature-brand-soft, #e4f0ee); }
.circle-member-overflow { color:var(--dk-feature-brand,#2f6f6a);background:var(--dk-feature-brand-soft,#e4f0ee);font-size:16rpx;font-weight:750; }
.member-initial { color: var(--dk-feature-brand, #2f6f6a); font-size: 20rpx; font-weight: 750; }
.member-mood { position: absolute; right: -7rpx; bottom: -3rpx; display: flex; width: 28rpx; height: 28rpx; align-items: center; justify-content: center; border: 3rpx solid #fff; border-radius: 50%; background: #fff9e9; font-size: 17rpx; line-height: 1; }

.circle-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}
.circle-copy { min-width: 0; flex: 1; }
.circle-title-row{display:flex;min-width:0;align-items:center;gap:10rpx}.circle-title-row .circle-title{min-width:0}.circle-official-badge{flex-shrink:0;padding:4rpx 9rpx;border-radius:999rpx;color:var(--dk-feature-brand,#2f6f6a);background:var(--dk-feature-brand-soft,#e4f0ee);font-size:17rpx;font-weight:700}

.circle-title {
  display: block;
  overflow: hidden;
  color: var(--dk-ink, #1c2423);
  font-size: var(--dk-fs-title, 32rpx);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.circle-meta {
  display: block;
  margin-top: 8rpx;
  color: var(--dk-muted, #6b736f);
  font-size: var(--dk-fs-meta, 24rpx);
}

.circle-detail {
  flex-shrink: 0;
  color: var(--dk-brand, #2f6f6a);
  font-size: var(--dk-fs-meta, 24rpx);
  font-weight: 650;
  white-space: nowrap;
}

.circle-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 20rpx;
}

.circle-tag {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: var(--dk-brand-soft, #e4f0ee);
  color: var(--dk-brand, #2f6f6a);
  font-size: var(--dk-fs-caption, 22rpx);
}

.circle-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-top: 24rpx;
  button {
    height: 64rpx;
    margin: 0;
    padding: 0;
    border-radius: 999rpx;
    border: 1rpx solid rgba(47, 111, 106, 0.22);
    background: transparent;
    color: var(--dk-brand, #2f6f6a);
    font-size: var(--dk-fs-meta, 24rpx);
    font-weight: 650;
    line-height: 64rpx;
    &::after { border: none; }
  }
}

.feed-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin: 8rpx 2rpx 24rpx;
}

.feed-anchor-group {
  display: flex;
  align-items: center;
  gap: 32rpx;
  min-width: 0;
}

.feed-tab-picker { display: inline-flex; align-items: center; }

.good-days-entry {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 7rpx;
  height: 50rpx;
  margin: 0;
  padding: 0 13rpx;
  border: 0;
  border-radius: 999rpx;
  color: var(--dk-feature-brand, #2f6f6a);
  background: var(--dk-feature-brand-soft, #e4f0ee);
  font-size: 21rpx;
  font-weight: 650;
  line-height: 50rpx;
  white-space: nowrap;
  &::after { border: 0; }
}

.entry-chevron { margin-left: -1rpx; color: currentColor; font-size: 27rpx; font-weight: 400; }

.calendar-icon {
  position: relative;
  width: 24rpx;
  height: 22rpx;
  flex-shrink: 0;
  border: 2rpx solid currentColor;
  border-radius: 5rpx;
  box-sizing: border-box;
}

.calendar-icon::before {
  position: absolute;
  top: 5rpx;
  right: 0;
  left: 0;
  height: 2rpx;
  background: currentColor;
  content: '';
}

.calendar-icon::after {
  position: absolute;
  top: -4rpx;
  left: 5rpx;
  width: 2rpx;
  height: 6rpx;
  border-radius: 2rpx;
  background: currentColor;
  box-shadow: 8rpx 0 0 currentColor;
  content: '';
}

.feed-tab {
  position: relative;
  color: var(--dk-muted, #6b736f);
  font-size: var(--dk-fs-label, 28rpx);
  font-weight: 650;
  line-height: 1.6;
  &.on {
    color: var(--dk-ink, #1c2423);
  }
  &.on::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -8rpx;
    height: 4rpx;
    border-radius: 999rpx;
    background: var(--dk-brand, #2f6f6a);
  }
}

.feed-list {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.feed-month { display: flex; flex-direction: column; gap: 20rpx; }
.month-heading { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12rpx; margin: 10rpx 0 2rpx; color: var(--dk-muted); font-size: var(--dk-fs-meta, 25rpx); font-weight: 700; }
.month-heading text:first-child,.month-heading text:last-child { height: 1rpx; background: var(--dk-line,#d6dedc); }

.feed-card {
  position: relative;
  min-height: 150rpx;
  overflow: hidden;
  border: 1rpx solid rgba(255, 255, 255, 0.65);
  border-radius: 32rpx;
  background: var(--dk-surface, #fff);
  box-shadow:
    0 16rpx 36rpx rgba(47, 111, 106, 0.07),
    0 2rpx 8rpx rgba(28, 36, 35, 0.03);
  &:active {
    opacity: 0.78;
  }
  &.kind-capsule.locked {
    min-height: 300rpx;
    color: #f4e7c4;
    border-color: rgba(244, 231, 196, 0.12);
    background: radial-gradient(circle at 72% 20%,rgba(226,194,123,.16),transparent 34%),linear-gradient(145deg, #17332e, #091815);
  }
  &.kind-todo,&.kind-anniversary { padding: 30rpx 28rpx; }
}

.feed-kind {
  position: absolute;
  left: 22rpx;
  top: 20rpx;
  z-index: 1;
  padding: 5rpx 12rpx;
  border-radius: 999rpx;
  color: var(--dk-feature-brand, #2f6f6a);
  background: var(--dk-feature-brand-soft, #e4f0ee);
  font-size: 20rpx;
  font-weight: 700;
  line-height: 1.3;
}

.memory-cover { position: relative; height: 288rpx; background: linear-gradient(145deg,#a8cdc4,#e8d4ad); background-size: cover; background-position: center; }
.memory-cover::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 72rpx;
  pointer-events: none;
  background: linear-gradient(180deg, transparent, rgba(18, 28, 26, 0.16));
}
.memory-cover .feed-kind { color: #fff; background: rgba(36,66,61,.58); backdrop-filter: blur(8rpx); }

.feed-card.locked .feed-kind {
  color: #f4e7c4;
  background: rgba(255,255,255,.12);
}

.feed-check {
  position: absolute;
  right: 22rpx;
  top: 18rpx;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
  border: 2rpx solid var(--dk-line, #d6dedc);
  border-radius: 999rpx;
  color: #fff;
  font-size: 26rpx;
  line-height: 1;
  &.on {
    border-color: var(--dk-brand, #2f6f6a);
    background: var(--dk-brand, #2f6f6a);
  }
}

.feed-body {
  min-width: 0;
  padding: 28rpx;
}

.kind-todo .feed-body,.kind-anniversary .feed-body { padding: 42rpx 0 0; }
.kind-capsule .feed-body { position: relative; z-index: 2; padding: 116rpx 34rpx 34rpx; text-align: center; }

.feed-title {
  display: block;
  color: var(--dk-ink, #1c2423);
  font-size: var(--dk-fs-title, 31rpx);
  font-weight: 680;
  line-height: 1.35;
  &.done {
    color: var(--dk-ink-3, #8c9a97);
    text-decoration: line-through;
  }
}

.feed-card.locked .feed-title {
  color: #f4e7c4;
}

.feed-desc {
  display: -webkit-box;
  margin-top: 10rpx;
  overflow: hidden;
  color: var(--dk-muted, #6b736f);
  font-size: var(--dk-fs-meta, 24rpx);
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.feed-card.locked .feed-desc {
  color: rgba(244, 231, 196, .76);
}

.feed-meta {
  color: var(--dk-muted, #6b736f);
  font-size: var(--dk-fs-caption, 22rpx);
}
.feed-meta-row { display: flex; align-items: center; margin-top: 16rpx; }
.feed-avatars { display: flex; align-items: center; margin-right: 12rpx; }
.feed-avatar-wrap { width: 44rpx; height: 44rpx; margin-left: -10rpx; }
.feed-avatar-wrap:first-child { margin-left: 0; }
.feed-avatar { display: flex; width: 44rpx; height: 44rpx; box-sizing: border-box; align-items: center; justify-content: center; border: 3rpx solid #fff; border-radius: 50%; background: var(--dk-feature-brand-soft, #e4f0ee); box-shadow: 0 4rpx 10rpx rgba(28, 36, 35, 0.08); }
.feed-initial { color: var(--dk-feature-brand, #2f6f6a); font-size: 16rpx; font-weight: 750; }
.feed-avatar-overflow { color: var(--dk-feature-brand,#2f6f6a); background: var(--dk-feature-brand-soft,#e4f0ee); font-size: 14rpx; font-weight: 750; }

.feed-card.locked .feed-meta {
  color: rgba(244, 231, 196, .56);
}

.capsule-seal {
  position: absolute;
  z-index: 2;
  left: 50%;
  top: 54rpx;
  width: 76rpx;
  height: 76rpx;
  margin-left: -38rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid rgba(244, 231, 196, .28);
  border-radius: 50%;
  color: #f4e7c4;
  font-size: 34rpx;
  font-weight: 800;
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
    color: var(--dk-ink, #1c2423);
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
.circle-card + .empty-filter,
.circle-card + .feed-list { margin-top: 0; }
.space-empty-mark { display: flex; width: 70rpx; height: 70rpx; margin: 0 auto 22rpx; align-items: center; justify-content: center; border-radius: 50%; color: var(--dk-brand); background: var(--dk-brand-soft); font-size: 30rpx; }
.circle-card ~ .empty-filter { margin-top: -6rpx; padding: 44rpx 30rpx 52rpx; border: 1rpx dashed rgba(47,111,106,.16); border-radius: 28rpx; background: rgba(255,255,255,.42); }
.space-empty-action { display: inline-flex; height: 68rpx; margin: 28rpx auto 0; padding: 0 30rpx; align-items: center; justify-content: center; border: 0; border-radius: 999rpx; color: #fff; background: var(--dk-brand); font-size: 24rpx; font-weight: 700; line-height: 68rpx; }
.space-empty-action::after { border: 0; }

.empty-msg {
  display: block;
  text-align: center;
  font-size: var(--dk-fs-body, 28rpx);
  color: var(--dk-ink, #1c2423);
  letter-spacing: 0.02em;
}

.empty-msg-sub {
  display: block;
  margin-top: 12rpx;
  text-align: center;
  font-size: var(--dk-fs-meta, 24rpx);
  color: var(--dk-muted, #6b736f);
}

.empty-t {
  display: block;
  font-size: var(--dk-fs-title, 30rpx);
  color: var(--dk-ink, #1c2423);
}

.empty-s {
  display: block;
  margin-top: 12rpx;
  font-size: var(--dk-fs-meta, 24rpx);
  color: var(--dk-muted, #6b736f);
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
  &.ghost {
    margin-left: 16rpx;
    color: var(--dk-brand, #2f6f6a);
    background: transparent;
    border: 1rpx solid var(--dk-brand, #2f6f6a);
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
.cd-row.with-bg {
  margin-bottom: 20rpx;
  padding: 36rpx 28rpx;
  overflow: hidden;
  border: none;
  border-radius: 22rpx;
  background-size: cover;
  background-position: center;
  box-shadow: 0 16rpx 40rpx rgba(24, 28, 32, 0.08);
}
.cd-row.dim {
  opacity: 0.55;
}

.cd-row.done {
  opacity: 0.45;
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

.cd-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--dk-line, #e2e6e4);
}


.cd-row.dim {
  opacity: 0.55;
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
  &.strike {
    text-decoration: line-through;
  }
}

.cd-verb {
  flex-shrink: 0;
  font-size: var(--dk-fs-meta, 24rpx);
  color: var(--dk-muted, #6b736f);
  &.overdue {
    color: #b42318;
  }
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

.cd-num {
  font-size: var(--dk-fs-num, 40rpx);
  font-weight: 600;
  line-height: 1;
  color: var(--dk-ink, #1c2423);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.cd-unit {
  font-size: var(--dk-fs-caption, 22rpx);
  color: var(--dk-muted, #6b736f);
  line-height: 1;
  padding-bottom: 2rpx;
}

.cd-special {
  font-size: var(--dk-fs-body, 28rpx);
  font-weight: 600;
  color: var(--dk-ink, #1c2423);
  letter-spacing: 0.04em;
}

.cd-tail.soon .cd-num,
.cd-tail.today .cd-special {
  color: var(--dk-accent, #2f6f6a);
}

.cd-tail.overdue .cd-num,
.cd-tail.overdue .cd-special {
  color: #b42318;
}

.cd-tail.past .cd-num {
  color: var(--dk-muted, #6b736f);
  font-weight: 500;
}

</style>
