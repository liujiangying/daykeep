<template>
  <view class="page" :style="pageStyle">
    <view class="nav" :style="navStyle">
      <view class="nav-inner" :style="navInnerStyle">
        <text class="brand">约定</text>
        <text class="nav-scope">当前：{{ currentScopeLabel }}</text>
      </view>
    </view>
    <view class="nav-spacer" :style="{ height: navTotalHeight + 'px' }" />

    <view v-if="!loggedIn" class="empty login-empty">
      <text class="empty-title">登录后管理约定</text>
      <text class="empty-copy">统一查看约定、重要日子、时间胶囊和提醒状态。</text>
      <button class="login-btn" @tap="goLogin">去登录</button>
    </view>

    <template v-else>
      <view class="overview">
        <view class="overview-copy">
          <view class="overview-main">
            <text class="overview-value">{{ upcomingCount }}</text>
            <text class="overview-title">个事项将在 30 天内到来</text>
          </view>
        </view>
        <view class="overview-side">
          <text class="overview-side-value">{{ sentCount }}</text>
          <text class="overview-side-label">已提醒</text>
        </view>
      </view>

      <view v-if="annualAuthorizationCount" class="annual-tip" @tap="activeFilter = 'off'">
        <view class="annual-tip-dot" />
        <text class="annual-tip-title">{{ annualAuthorizationCount }} 个年度提醒需重新开启</text>
        <text class="annual-tip-action">查看 ›</text>
      </view>

      <view class="search-field">
        <view class="search-glyph" />
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="搜索日期、约定、时间胶囊"
          confirm-type="search"
        />
        <text v-if="searchQuery" class="search-clear" @tap="searchQuery = ''">×</text>
      </view>

      <scroll-view scroll-x class="filters" :show-scrollbar="false">
        <view class="filter-inner">
          <view
            v-for="item in filters"
            :key="item.key"
            class="filter"
            :class="{ on: activeFilter === item.key }"
            @tap="activeFilter = item.key"
          >
            <text>{{ item.label }}</text>
            <text class="filter-count">{{ countFor(item.key) }}</text>
          </view>
        </view>
      </scroll-view>

      <view v-if="reminderSections.length" class="sections">
        <view v-for="section in reminderSections" :key="section.key" class="reminder-section">
          <view class="section-head">
            <text class="section-title">{{ section.label }}</text>
            <text class="section-count">{{ section.items.length }} 项</text>
          </view>

          <view class="list">
            <view
              v-for="item in section.items"
              :key="item.id"
              class="reminder-card"
              @tap="openReminder(item)"
            >
              <view class="status-rail" :style="statusRailStyle(item)" />
              <view class="card-main">
                <view class="card-head">
                  <text class="title">{{ reminderTitle(item) }}</text>
                  <text v-if="isCommitment(item)" class="commitment-tag">约定</text>
                  <text class="status-tag" :style="statusTagStyle(item)">{{ reminderStatusLabel(item) }}</text>
                </view>
                <template v-if="isCapsule(item)">
                  <text class="date-line">{{ capsuleDateLine(item) }}</text>
                  <view class="card-foot">
                    <text class="schedule">{{ capsuleReminderCopy(item) }}</text>
                    <text class="state-copy" :style="stateCopyStyle(item)">{{ reminderStateCopy(item) }}</text>
                  </view>
                </template>
                <template v-else>
                  <text class="date-line">{{ formatReminderDate(item) }} · {{ repeatLabel(item) }} · {{ reminderCountdownLabel(item) }}</text>
                  <text v-if="isCommitment(item)" class="commitment-line">{{ commitmentLine(item) }}</text>
                  <view v-if="isCommitment(item) && commitmentMembers(item).length" class="commitment-members">
                    <view v-for="member in commitmentMembers(item)" :key="member.userId" class="commitment-member" :class="commitmentMemberStatus(item, member.userId)">
                      <image v-if="member.avatarUrl" :src="member.avatarUrl" class="commitment-avatar" mode="aspectFill" /><text v-else class="commitment-avatar fallback">{{ member.nickname.slice(0,1) }}</text>
                    </view>
                  </view>
                  <view class="card-foot">
                    <text class="schedule">{{ isCommitment(item) ? commitmentConfirmCopy(item) : `提前 ${item.remindAheadDays} 天 · ${item.remindTime || '10:00'}` }}</text>
                    <text class="state-copy" :style="stateCopyStyle(item)">{{ reminderStateCopy(item) }}</text>
                  </view>
                  <view v-if="canRespond(item) && myConfirmStatus(item) === 'pending'" class="commitment-response-actions">
                    <text
                      class="commitment-response-btn primary"
                      @tap.stop="respondToCommitment(item, 'confirmed')"
                    >确认参加</text>
                    <text
                      class="commitment-response-btn"
                      @tap.stop="respondToCommitment(item, 'declined')"
                    >暂时无法参加</text>
                  </view>
                  <view
                    v-else-if="canRespond(item)"
                    class="commitment-response-state"
                    :class="myConfirmStatus(item)"
                    @tap.stop="changeCommitmentResponse(item)"
                  >
                    <view class="commitment-response-copy">
                      <text class="commitment-response-mark">{{ myConfirmStatus(item) === 'confirmed' ? '✓' : '—' }}</text>
                      <text>{{ myConfirmStatus(item) === 'confirmed' ? '已确认参加' : '暂时无法参加' }}</text>
                    </view>
                    <text class="commitment-response-change">更改 ›</text>
                  </view>
                  <button v-if="isCommitment(item) && canCreateMemory(item)" class="memory-btn" @tap.stop="createMemoryFromCommitment(item)">活动结束，留下这次美好回忆</button>
                </template>
              </view>
              <text class="chevron">›</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="empty filter-empty">
        <text class="empty-title">{{ emptyTitle }}</text>
        <text class="empty-copy">{{ emptyCopy }}</text>
      </view>
    </template>

  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { isLoggedIn, getCachedUserId, redirectToLoginForSessionError } from '@/services/auth'
import { confirmCommitment, listEntries, type ConfirmStatus, type Entry } from '@/services/entries'
import {
  annualNeedsAuthorization,
  annualTargetYear,
  formatReminderDate,
  isUndeliveredReminder,
  undeliveredReminderCopy,
} from '@/services/reminderPresentation'
import { useThemePage } from '@/composables/useThemePage'
import { getTokens } from '@/services/theme'
import { normalizeRepeatRule } from '@/utils/countdown'
import { listSpaces, type Space, type SpaceMember } from '@/services/spaces'
import { getPreferredSpaceId, setPreferredSpaceId } from '@/services/spacePreference'

type ReminderFilter = 'all' | 'pending' | 'sent' | 'off' | 'capsule' | 'commitment'

const { pageStyle, themeId } = useThemePage()
const tokens = computed(() => getTokens(themeId.value))
const featureTokens = computed(() => getTokens(themeId.value === 'mono' ? 'teal' : themeId.value))
const loggedIn = ref(false)
const list = ref<Entry[]>([])
const activeFilter = ref<ReminderFilter>('all')
const searchQuery = ref('')
/** 正在提交表态的约定 id，避免连点发出两次确认。 */
const confirming = ref('')
const myUserId = computed(() => String(getCachedUserId() || ''))
const spaces = ref<Space[]>([])
const spacesById = computed(() => new Map(spaces.value.map((space) => [space.id, space])))
const currentSpaceId = ref<string | null>(null)
const currentScopeLabel = computed(() => currentSpaceId.value ? spacesById.value.get(currentSpaceId.value)?.name || '当前时光圈' : '仅自己')

function commitmentMembers(item: Entry): SpaceMember[] { return item.spaceId ? spacesById.value.get(item.spaceId)?.members || [] : [] }
function commitmentMemberStatus(item: Entry, userId: string) { return item.commitmentMeta?.confirmStatus?.[userId] || 'pending' }

const filters: { key: ReminderFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'off', label: '待开启' },
  { key: 'pending', label: '待提醒' },
  { key: 'sent', label: '已提醒' },
  { key: 'commitment', label: '约定' },
  { key: 'capsule', label: '时间胶囊' },
]

const statusBarHeight = ref(20)
const navBarHeight = ref(44)
const navPadRight = ref(96)
const navContentOffset = ref(8)
const navBg = ref('#f2f4f3')

const navTotalHeight = computed(() => statusBarHeight.value + navBarHeight.value)
const navStyle = computed(() => ({ paddingTop: `${statusBarHeight.value}px`, backgroundColor: navBg.value }))
const navInnerStyle = computed(() => ({
  height: `${navBarHeight.value}px`,
  paddingRight: `${navPadRight.value}px`,
  paddingTop: `${navContentOffset.value}px`,
  boxSizing: 'border-box' as const,
}))

function isCapsule(item: Entry): boolean {
  // 随机胶囊在解锁前会由后端隐藏 capsuleUnlockAt，不能拿日期是否存在判断类型。
  return !!item.isCapsule || item.entryKind === 'capsule' || !!item.capsuleUnlockAt
}

/** 新约定使用日期形态，历史待办型继续兼容；entryKind 是唯一约定标识。 */
function isCommitment(item: Entry): boolean {
  return item.type !== 'diary' && item.entryKind === 'commitment'
}

function commitmentLine(item: Entry) {
  // 地点只认 Entry.location：commitmentMeta 里不再存地点，避免两处数据分叉。
  return `地点：${item.location || '尚未填写'}`
}

function reminderCountdownLabel(item: Entry) {
  const title = reminderTitle(item)
  const days = Number(item.daysUntil)
  if (!title || !Number.isFinite(days)) return item.countdownLabel || ''
  if (days === 0) return `今天“${title}”`
  if (days > 0) return `距离“${title}”还有${days}日`
  return `“${title}”已经过去${Math.abs(days)}日`
}

/** 当前用户对这条约定的表态；没表过态就是 pending。 */
function myConfirmStatus(item: Entry): ConfirmStatus {
  if (!myUserId.value) return 'pending'
  return item.commitmentMeta?.confirmStatus?.[myUserId.value] || 'pending'
}

/**
 * 只有共同约定需要表态，且约定还没过期/完成时才有意义。
 * 个人约定没有第二个人要确认，展示确认按钮只会制造无效操作。
 */
function canRespond(item: Entry): boolean {
  if (!isCommitment(item) || item.ownerType !== 'space') return false
  if (item.todoStatus === 'done') return false
  return (item.daysUntil ?? 0) >= 0
}

function confirmCopyFor(item: Entry) {
  const status = item.commitmentMeta?.confirmStatus || {}
  const confirmed = Object.values(status).filter((value) => value === 'confirmed').length
  const mine = myConfirmStatus(item)
  if (mine === 'confirmed') {
    // 自己的状态在下方独立展示，这里只补充共同约定的整体进度。
    return confirmed > 1 ? `共 ${confirmed} 人已确认` : '等待其他成员确认'
  }
  if (mine === 'declined') return '可随时更改你的选择'
  return confirmed ? `${confirmed} 人已确认，等你表态` : '还没有人确认'
}

function commitmentConfirmCopy(item: Entry) {
  if (item.ownerType !== 'space') return `提醒 ${item.remindTime || '10:00'}`
  return confirmCopyFor(item)
}

async function respondToCommitment(item: Entry, status: ConfirmStatus) {
  if (myConfirmStatus(item) === status) return
  if (confirming.value === item.id) return
  confirming.value = item.id
  try {
    const updated = await confirmCommitment(item.id, status)
    // 用服务端返回的整条记录替换：确认状态是双方共同写的，本地拼一个只会更快过期。
    const index = list.value.findIndex((row) => row.id === item.id)
    if (index >= 0) list.value.splice(index, 1, updated)
    const message = status === 'confirmed'
      ? '已确认参加'
      : status === 'declined'
        ? '已回复无法参加'
        : '已撤回回复'
    uni.showToast({ title: message, icon: 'none' })
  } catch (e: any) {
    if (await redirectToLoginForSessionError(e)) return
    uni.showToast({ title: e?.message || '操作失败', icon: 'none' })
  } finally {
    confirming.value = ''
  }
}

function changeCommitmentResponse(item: Entry) {
  const current = myConfirmStatus(item)
  if (current === 'pending' || confirming.value === item.id) return
  const alternative: ConfirmStatus = current === 'confirmed' ? 'declined' : 'confirmed'
  uni.showActionSheet({
    itemList: [
      alternative === 'confirmed' ? '改为确认参加' : '改为暂时无法参加',
      '撤回回复',
    ],
    success: ({ tapIndex }) => {
      void respondToCommitment(item, tapIndex === 0 ? alternative : 'pending')
    },
  })
}

function canCreateMemory(item: Entry) {
  if (!isCommitment(item)) return false
  // 与约定详情保持同一口径：约定当天仍用于确认和到场，次日才进入回忆阶段。
  return (item.daysUntil ?? 0) < 0
}

function reminderTitle(item: Entry): string {
  if (isCapsule(item) && !item.capsuleUnlocked) return '时间胶囊'
  return item.title || (isCapsule(item) ? '时间胶囊' : '未命名记录')
}

function reminderStatus(item: Entry): Exclude<ReminderFilter, 'all' | 'commitment'> {
  if (isCapsule(item)) return 'capsule'
  if (item.wxSubscribeStatus === 'sent' && !annualNeedsAuthorization(item)) return 'sent'
  // 过期未送达 / 发送失败：不再冒充「待提醒」
  if (isUndeliveredReminder(item)) return 'off'
  if (
    item.remindEnabled &&
    (item.wxSubscribeStatus === 'authorized' || item.wxSubscribeStatus === 'sending')
  ) return 'pending'
  return 'off'
}

function reminderStatusLabel(item: Entry) {
  if (isCapsule(item)) {
    return item.capsuleUnlocked ? '已解锁' : '待解锁'
  }
  if (isUndeliveredReminder(item)) {
    return item.wxSubscribeStatus === 'expired' ? '已过期' : '未送达'
  }
  if (annualNeedsAuthorization(item)) return '待开启'
  return ({ pending: '待提醒', sent: '已提醒', off: '待开启', capsule: '时间胶囊' } as const)[reminderStatus(item)]
}

function statusRailStyle(item: Entry) {
  const status = reminderStatus(item)
  if (status === 'capsule') {
    return { backgroundColor: item.capsuleUnlocked ? '#aeb6b2' : tokens.value.brand }
  }
  if (status === 'sent') return { backgroundColor: '#9ca5a1' }
  if (isUndeliveredReminder(item)) return { backgroundColor: '#e77e6a' }
  if (status === 'off') return { backgroundColor: '#e9c05a' }
  return { backgroundColor: tokens.value.brand }
}

function statusTagStyle(item: Entry) {
  const status = reminderStatus(item)
  if (status === 'capsule') {
    return item.capsuleUnlocked
      ? { backgroundColor: 'rgba(112, 121, 117, .12)', color: '#68716d' }
      : { backgroundColor: featureTokens.value.brandSoft, color: featureTokens.value.brand }
  }
  if (status === 'sent') return { backgroundColor: 'rgba(112, 121, 117, .12)', color: '#68716d' }
  if (isUndeliveredReminder(item)) return { backgroundColor: 'rgba(231, 126, 106, .14)', color: '#c65b49' }
  if (status === 'off') return { backgroundColor: 'rgba(233, 192, 90, .17)', color: '#b98519' }
  return { backgroundColor: tokens.value.brandSoft, color: tokens.value.brand }
}

function stateCopyStyle(item: Entry) {
  const status = reminderStatus(item)
  if (status === 'capsule') return { color: item.capsuleUnlocked ? '#6d7671' : tokens.value.brand }
  if (status === 'sent') return { color: '#6d7671' }
  if (isUndeliveredReminder(item)) return { color: '#c65b49' }
  if (status === 'off') return { color: '#b98519' }
  return { color: tokens.value.brand }
}

function repeatLabel(item: Entry) {
  const rule = normalizeRepeatRule(item)
  return ({ none: '不重复', weekly: '每周', monthly: '每月', yearly: '每年' } as const)[rule]
}

function formatSentAt(raw?: string | null) {
  const date = new Date(raw || '')
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatCapsuleDate(raw?: string | null) {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function capsuleCountdown(item: Entry) {
  if (item.capsuleUnlockMode === 'random' && !item.capsuleUnlocked) return '等待惊喜揭晓'
  if (!item.capsuleUnlockAt) return ''
  const now = Date.now()
  const unlock = new Date(item.capsuleUnlockAt).getTime()
  if (unlock <= now) return '已到期，可解锁'
  const days = Math.ceil((unlock - now) / 86400000)
  if (days >= 30) {
    const months = Math.round(days / 30)
    return `${months}个月后解锁`
  }
  return `${days}天后解锁`
}

function capsuleDateLine(item: Entry) {
  if (item.capsuleUnlockMode === 'random' && !item.capsuleUnlocked) {
    return '随机惊喜 · 解锁日期保密'
  }
  const date = formatCapsuleDate(item.capsuleUnlockAt)
  return date ? `解锁日期 · ${date}` : '时间胶囊'
}

function capsuleReminderCopy(item: Entry) {
  if (item.capsuleUnlocked) {
    const sentAt = formatSentAt(item.wxSubscribeSentAt)
    return sentAt ? `${sentAt} 已提醒` : '已到约定解锁时间'
  }
  if (['authorized', 'sending'].includes(item.wxSubscribeStatus || '') && item.remindEnabled) {
    return '已开启解锁提醒'
  }
  return '未开启解锁提醒'
}

function reminderStateCopy(item: Entry) {
  const status = reminderStatus(item)
  if (status === 'capsule') {
    if (item.capsuleUnlocked) return '点击查看'
    return capsuleCountdown(item)
  }
  if (status === 'sent') {
    const time = formatSentAt(item.wxSubscribeSentAt)
    return time ? `${time} 已发送` : '已发送提醒'
  }
  if (isUndeliveredReminder(item)) {
    return undeliveredReminderCopy(item)
  }
  if (status === 'pending') return '已开启微信提醒'
  if (annualNeedsAuthorization(item)) return `${annualTargetYear(item)} 年待开启`
  return '点击开启微信提醒'
}

function isCompletedReminder(item: Entry) {
  return isCapsule(item)
    ? !!item.capsuleUnlocked
    : reminderStatus(item) === 'sent' && !annualNeedsAuthorization(item)
}

function upcomingTime(item: Entry) {
  if (isCapsule(item)) {
    const value = new Date(item.capsuleUnlockAt || '').getTime()
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
  }
  if (Number.isFinite(item.daysUntil)) {
    return Date.now() + Number(item.daysUntil) * 86400000
  }
  const value = new Date(item.eventDate).getTime()
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

function completedTime(item: Entry) {
  const raw = item.wxSubscribeSentAt || item.capsuleUnlockAt || item.updatedAt || item.createdAt
  const value = new Date(raw || '').getTime()
  return Number.isFinite(value) ? value : 0
}

const orderedList = computed(() =>
  [...list.value].sort((a, b) => {
    const completedDiff = Number(isCompletedReminder(a)) - Number(isCompletedReminder(b))
    if (completedDiff) return completedDiff
    const timeDiff = isCompletedReminder(a)
      ? completedTime(b) - completedTime(a)
      : upcomingTime(a) - upcomingTime(b)
    if (timeDiff) return timeDiff
    return Number(a.id) - Number(b.id)
  }),
)

const filteredList = computed(() =>
  activeFilter.value === 'all'
    ? orderedList.value
    : activeFilter.value === 'commitment'
      ? orderedList.value.filter((item) => isCommitment(item))
      // 状态是提醒生命周期，不是内容类型；共同约定同样可能待开启、待提醒或已提醒。
      : orderedList.value.filter((item) => reminderStatus(item) === activeFilter.value),
)

const visibleList = computed(() => {
  const keyword = searchQuery.value.trim().toLocaleLowerCase()
  if (!keyword) return filteredList.value
  return filteredList.value.filter((item) => {
    const searchable = [
      reminderTitle(item),
      item.eventDate,
      repeatLabel(item),
      item.countdownLabel,
      isCapsule(item) ? formatCapsuleDate(item.capsuleUnlockAt) : '',
    ].join(' ').toLocaleLowerCase()
    return searchable.includes(keyword)
  })
})

const sectionMeta: {
  key: Exclude<ReminderFilter, 'all'>
  label: string
}[] = [
  { key: 'commitment', label: '共同约定' },
  { key: 'off', label: '待开启' },
  { key: 'pending', label: '待提醒' },
  { key: 'capsule', label: '时间胶囊' },
  { key: 'sent', label: '已提醒' },
]

/**
 * 分区互斥：约定只出现在「共同约定」里。
 *
 * 「共同约定」按 isCommitment 分，其余四个分区按 reminderStatus 分，这两套判定
 * 彼此独立，所以一条开了提醒的约定会同时命中 pending 和 commitment，在全部视图里
 * 渲染成两张卡。两张卡指向同一条记录，各自带一套「我确认 / 来不了」按钮，点了一张
 * 另一张不会跟着变——看上去就像确认没保存。这里让状态分区排除约定。
 */
const reminderSections = computed(() =>
  sectionMeta
    .map((section) => ({
      ...section,
      items: visibleList.value.filter((item) =>
        section.key === 'commitment'
          ? isCommitment(item)
          : !isCommitment(item) && reminderStatus(item) === section.key,
      ),
    }))
    .filter((section) => section.items.length),
)
/**
 * 未来 30 天内尚未结束的事项。提醒是否授权不影响事项是否临近；随机揭晓胶囊
 * 没有对用户公开的确定日期，因此不计入“30 天内”。
 */
const upcomingCount = computed(() => list.value.filter((item) => {
  if (isCapsule(item)) {
    if (item.capsuleUnlocked || item.capsuleUnlockMode === 'random' || !item.capsuleUnlockAt) return false
    const unlockAt = new Date(item.capsuleUnlockAt).getTime()
    if (!Number.isFinite(unlockAt)) return false
    const remainingDays = Math.ceil((unlockAt - Date.now()) / 86400000)
    return remainingDays >= 0 && remainingDays <= 30
  }
  if (item.todoStatus === 'done') return false
  return item.daysUntil != null && item.daysUntil >= 0 && item.daysUntil <= 30
}).length)
const sentCount = computed(
  () => list.value.filter((item) => !isCapsule(item) && reminderStatus(item) === 'sent').length,
)
const annualAuthorizationCount = computed(
  () => list.value.filter((item) => annualNeedsAuthorization(item)).length,
)
function countFor(filter: ReminderFilter) {
  if (filter === 'all') return list.value.length
  if (filter === 'commitment') return list.value.filter((item) => isCommitment(item)).length
  return list.value.filter((item) => reminderStatus(item) === filter).length
}
const emptyTitle = computed(() => searchQuery.value
  ? '没有找到相关约定'
  : ({
      all: '还没有约定或提醒',
      pending: '暂无待提醒事项',
      sent: '暂无已提醒记录',
      off: '暂无待开启事项',
      commitment: '暂无约定',
      capsule: '暂无时间胶囊',
    }[activeFilter.value]))
const emptyCopy = computed(() => activeFilter.value === 'all'
  ? searchQuery.value
    ? '换个关键词再试试。'
    : '创建约定、好日子或时间胶囊后，会统一显示在这里。'
  : '切换其他分类，查看不同状态的约定和提醒。')

function goLogin() {
  uni.reLaunch({ url: '/pages/login/login' })
}

function openReminder(item: Entry) {
  if (isCommitment(item)) {
    uni.navigateTo({ url: `/subpackages/commitment/detail?id=${encodeURIComponent(item.id)}` })
    return
  }
  if (item.isCollaborated) {
    uni.navigateTo({
      url: `/subpackages/day/collaborate?entryId=${encodeURIComponent(item.id)}&title=${encodeURIComponent(item.title || '共同记录')}`,
    })
    return
  }
  if (isCapsule(item)) {
    uni.navigateTo({ url: `/subpackages/capsule/locked?id=${encodeURIComponent(item.id)}` })
    return
  }
  const needsReminderSetup = reminderStatus(item) === 'off' || annualNeedsAuthorization(item)
  const path = needsReminderSetup
    ? `/subpackages/notes/edit?id=${encodeURIComponent(item.id)}`
    : `/subpackages/day/detail?id=${encodeURIComponent(item.id)}`
  uni.navigateTo({ url: path })
}

function createMemoryFromCommitment(item: Entry) {
  const params = [
    'type=diary',
    'from=reminders',
    `sourceTitle=${encodeURIComponent(item.title || '这次约定')}`,
    `sourceDate=${encodeURIComponent(item.eventDate || '')}`,
    `ownerType=${item.ownerType === 'space' ? 'space' : 'personal'}`,
  ]
  if (item.spaceId) params.push(`spaceId=${encodeURIComponent(item.spaceId)}`)
  uni.navigateTo({ url: `/subpackages/notes/edit?${params.join('&')}` })
}

function dedupe(entries: Entry[]) {
  const score = (item: Entry) => {
    const statusScore = reminderStatus(item) === 'pending' ? 3 : reminderStatus(item) === 'sent' ? 2 : 1
    const latest = new Date(item.wxSubscribeSentAt || item.updatedAt || item.createdAt || 0).getTime() || 0
    return statusScore * 10 ** 15 + latest
  }
  const merged = new Map<string, Entry>()
  for (const item of entries) {
    // 胶囊以解锁状态为生命周期依据，不能套用普通日子/提醒的“记录日已过”规则。
    // 尤其随机胶囊在未解锁时会隐藏 capsuleUnlockAt，但后端仍会返回
    // isCapsule / entryKind；必须先识别并保留，否则会在这里被当成过期随手记丢弃。
    if (isCapsule(item)) {
      merged.set(`capsule:${item.id}`, item)
      continue
    }
    if (item.daysUntil != null && item.daysUntil < 0 && item.wxSubscribeStatus !== 'sent') continue
    // 同一日期/待办在重试或历史数据中可能存在多条；提醒中心只展示最新有效的一条。
    // 仅合并同一条提醒的历史/重试记录；重复规则不同（如「不重复」与「每年」）
    // 是两条不同的业务记录，应分别保留。
    const titleKey = item.title
      .replace(/[\s\u200B-\u200D\uFEFF]+/g, '')
      .trim()
    const dateKey = item.eventDate.slice(0, 10)
    const key = [
      item.type,
      titleKey,
      dateKey,
      item.calendar,
      normalizeRepeatRule(item),
    ].join('\u0001')
    const previous = merged.get(key)
    if (!previous || score(item) > score(previous)) merged.set(key, item)
  }
  return [...merged.values()]
}

async function load() {
  loggedIn.value = isLoggedIn()
  if (!loggedIn.value) {
    list.value = []
    spaces.value = []
    currentSpaceId.value = null
    return
  }
  try {
    const preferredId = getPreferredSpaceId() || null
    let loadedSpaces: Space[] | null = null
    loadedSpaces = await listSpaces().catch(() => null)
    if (loadedSpaces) {
      spaces.value = loadedSpaces
      currentSpaceId.value = preferredId && loadedSpaces.some((space) => space.id === preferredId) ? preferredId : null
      if (preferredId && !currentSpaceId.value) setPreferredSpaceId(null)
    } else {
      // 空间接口暂时失败时保留已选 scope，不能静默回到个人空间并展示另一份数据。
      currentSpaceId.value = preferredId
    }
    const ownerType = currentSpaceId.value ? 'space' as const : 'personal' as const
    const res = await listEntries({ reminderCenter: true, pageSize: 200, ownerType, spaceId: currentSpaceId.value })
    list.value = dedupe(res.list)
  } catch (e: any) {
    if (await redirectToLoginForSessionError(e)) {
      loggedIn.value = false
      list.value = []
      return
    }
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
  void load()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 8rpx 32rpx calc(120rpx + env(safe-area-inset-bottom));
  background: var(--dk-bg);
  color: var(--dk-ink);
  box-sizing: border-box;
}
.nav {
  position: fixed;
  inset: 0 0 auto;
  z-index: 20;
  padding-left: 32rpx;
  box-sizing: border-box;
}
.nav-inner { display: flex; align-items: center; gap: 12rpx; overflow: hidden; box-sizing: border-box; }
.brand { flex-shrink: 0; font-size: var(--dk-fs-display, 46rpx); font-weight: 600; letter-spacing: .02em; line-height: 1.2; }
.nav-scope { min-width:0;overflow:hidden;color:var(--dk-muted);font-size:var(--dk-fs-caption, 23rpx);line-height:1.2;text-overflow:ellipsis;white-space:nowrap; }
.overview {
  display: flex; align-items: center; gap: 24rpx; margin: 16rpx 0 26rpx; padding: 24rpx 26rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.72); border-radius: 22rpx;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(255, 254, 251, 0.08) 42%), var(--dk-surface);
  box-shadow: 0 16rpx 36rpx rgba(47, 111, 106, 0.07), 0 2rpx 8rpx rgba(28, 36, 35, 0.03);
}
.overview-copy { flex: 1; min-width: 0; }
.overview-main { display: flex; align-items: baseline; gap: 9rpx; }
.overview-value { color: var(--dk-brand); font-size: var(--dk-fs-title, 36rpx); font-weight: 600; line-height: 1.15; }
.overview-title { color: var(--dk-ink); font-size: var(--dk-fs-label, 26rpx); font-weight: 550; }
.overview-hint { display: block; margin-top: 8rpx; overflow: hidden; color: var(--dk-muted); font-size: var(--dk-fs-caption, 22rpx); text-overflow: ellipsis; white-space: nowrap; }
.overview-side { display: flex; min-width: 104rpx; padding-left: 24rpx; border-left: 1rpx solid var(--dk-line); flex-direction: column; align-items: center; }
.overview-side-value { color: var(--dk-ink); font-size: var(--dk-fs-title, 36rpx); font-weight: 600; line-height: 1.15; }
.overview-side-label { margin-top: 5rpx; color: var(--dk-muted); font-size: var(--dk-fs-caption, 22rpx); }
.annual-tip { display: flex; align-items: center; gap: 14rpx; min-height: 68rpx; margin: -10rpx 0 26rpx; padding: 0 22rpx; border-radius: 18rpx; background: var(--dk-feature-brand-soft, #e4f0ee); box-sizing: border-box; }
.annual-tip-dot { width: 10rpx; height: 10rpx; flex-shrink: 0; border-radius: 50%; background: var(--dk-feature-brand, #2f6f6a); }
.annual-tip-title { flex: 1; min-width: 0; color: var(--dk-ink, #1c2423); font-size: var(--dk-fs-meta, 24rpx); font-weight: 550; }
.annual-tip-action { flex-shrink: 0; color: var(--dk-feature-brand, #2f6f6a); font-size: var(--dk-fs-caption, 22rpx); font-weight: 600; }
.search-field { display: flex; align-items: center; gap: 16rpx; height: 68rpx; margin-bottom: 18rpx; padding: 0 20rpx; border: 1rpx solid rgba(255, 255, 255, 0.65); border-radius: 18rpx; color: var(--dk-muted); background: linear-gradient(180deg, rgba(255, 255, 255, 0.45), var(--dk-surface)); box-sizing: border-box; box-shadow: 0 8rpx 20rpx rgba(47, 111, 106, 0.04); }
.search-glyph { position: relative; width: 22rpx; height: 22rpx; flex-shrink: 0; border: 3rpx solid currentColor; border-radius: 50%; box-sizing: border-box; }
.search-glyph::after { content: ''; position: absolute; right: -7rpx; bottom: -5rpx; width: 9rpx; height: 3rpx; border-radius: 3rpx; background: currentColor; transform: rotate(45deg); transform-origin: left center; }
.search-input { flex: 1; min-width: 0; height: 66rpx; color: var(--dk-ink); font-size: var(--dk-fs-meta, 24rpx); line-height: 66rpx; }
.search-clear { display: flex; align-items: center; justify-content: center; width: 34rpx; height: 34rpx; flex-shrink: 0; border-radius: 50%; color: var(--dk-muted); background: var(--dk-bg-soft); font-size: 28rpx; line-height: 1; }
.filters { width: calc(100% + 64rpx); margin-left: -32rpx; margin-bottom: 24rpx; white-space: nowrap; }
.filter-inner { display: inline-flex; gap: 14rpx; padding: 0 32rpx; }
.filter { display: inline-flex; flex-direction: row; align-items: center; justify-content: center; gap: 8rpx; height: 58rpx; padding: 0 22rpx; border-radius: 999rpx; background: var(--dk-surface); border: 1rpx solid var(--dk-line); color: var(--dk-muted); font-size: var(--dk-fs-meta, 25rpx); white-space: nowrap; line-height: 58rpx; box-sizing: border-box; }
.filter.on { color: #fff; background: var(--dk-brand); border-color: var(--dk-brand); }
.filter-count { min-width: 22rpx; text-align: center; font-size: var(--dk-fs-caption, 22rpx); opacity: .72; }
.sections { display: flex; flex-direction: column; gap: 34rpx; }
.reminder-section { min-width: 0; }
.section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12rpx; padding: 0 6rpx; }
.section-title { color: var(--dk-ink); font-size: var(--dk-fs-label, 26rpx); font-weight: 600; }
.section-count { color: var(--dk-muted); font-size: var(--dk-fs-caption, 22rpx); }
.list { display: flex; min-width: 0; flex-direction: column; gap: 18rpx; }
.reminder-card { display: flex; align-items: stretch; min-height: 154rpx; overflow: hidden; border: 1rpx solid rgba(255, 255, 255, 0.65); border-radius: 22rpx; background: linear-gradient(180deg, rgba(255, 255, 255, 0.45), var(--dk-surface)); box-shadow: 0 16rpx 36rpx rgba(47, 111, 106, 0.07), 0 2rpx 8rpx rgba(28, 36, 35, 0.03); }
.reminder-card:active { background: var(--dk-bg-soft); box-shadow: none; }
.status-rail { flex: 0 0 5rpx; background: #c7cdca; }
.status-rail.pending { background: var(--dk-brand); }.status-rail.sent { background: #9ca5a1; }.status-rail.off { background: #e9c05a; }
.card-main { flex: 1; min-width: 0; padding: 21rpx 14rpx 19rpx 22rpx; }
.card-head { display: flex; align-items: center; gap: 12rpx; }
.title { flex: 1; min-width: 0; overflow: hidden; font-size: var(--dk-fs-body, 30rpx); font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.commitment-tag { flex-shrink: 0; padding: 3rpx 10rpx; border-radius: 999rpx; color: var(--dk-feature-brand, #2f6f6a); background: var(--dk-feature-brand-soft, #e4f0ee); font-size: 20rpx; font-weight: 650; }
.status-tag { flex-shrink: 0; padding: 3rpx 10rpx; border-radius: 999rpx; font-size: 20rpx; background: var(--dk-brand-soft); color: var(--dk-brand); }
.status-tag.sent { background: rgba(112, 121, 117, .12); color: #68716d; }.status-tag.off { background: rgba(233, 192, 90, .17); color: #b98519; }
.date-line { display: block; margin-top: 9rpx; overflow: hidden; color: var(--dk-muted); font-size: var(--dk-fs-meta, 24rpx); text-overflow: ellipsis; white-space: nowrap; }
.commitment-line { display: block; margin-top: 7rpx; overflow: hidden; color: var(--dk-brand); font-size: var(--dk-fs-caption, 22rpx); text-overflow: ellipsis; white-space: nowrap; }
.commitment-members{display:flex;margin-top:12rpx}.commitment-member{width:42rpx;height:42rpx;margin-right:-7rpx;padding:0;border:0;border-radius:50%;background:transparent}.commitment-member.confirmed{background:transparent}.commitment-member.declined{opacity:.42}.commitment-avatar{display:flex;width:100%;height:100%;align-items:center;justify-content:center;border:0;border-radius:50%;font-size:17rpx}.commitment-avatar.fallback{color:var(--dk-feature-brand,#2f6f6a);background:var(--dk-feature-brand-soft,#e4f0ee)}
.card-foot { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-top: 13rpx; }
.schedule, .state-copy { overflow: hidden; font-size: var(--dk-fs-caption, 22rpx); text-overflow: ellipsis; white-space: nowrap; }.schedule { color: var(--dk-muted); }.state-copy { max-width: 46%; color: var(--dk-brand); text-align: right; }.status-rail.sent + .card-main .state-copy { color: #6d7671; }.status-rail.off + .card-main .state-copy { color: #b98519; }
.memory-btn { height: 54rpx; margin: 16rpx 0 0; padding: 0 20rpx; border: 0; border-radius: 999rpx; color: #fff; background: var(--dk-brand); font-size: var(--dk-fs-caption, 23rpx); font-weight: 650; line-height: 54rpx; }
.memory-btn::after { border: 0; }
.commitment-response-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12rpx; margin-top: 16rpx; }
.commitment-response-btn { padding: 0 16rpx; border: 1rpx solid var(--dk-line, #dde3e1); border-radius: 14rpx; color: var(--dk-muted); background: transparent; font-size: var(--dk-fs-caption, 23rpx); line-height: 58rpx; text-align: center; }
.commitment-response-btn.primary { border-color: var(--dk-brand); color: #fff; background: var(--dk-brand); font-weight: 550; }
.commitment-response-state { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-top: 16rpx; padding: 14rpx 16rpx; border-radius: 14rpx; background: var(--dk-feature-brand-soft, #e4f0ee); }
.commitment-response-state.declined { background: var(--dk-bg, #f2f4f3); }
.commitment-response-copy { display: flex; align-items: center; gap: 9rpx; color: var(--dk-feature-brand, #2f6f6a); font-size: var(--dk-fs-caption, 23rpx); font-weight: 550; }
.commitment-response-state.declined .commitment-response-copy { color: var(--dk-muted); }
.commitment-response-mark { font-size: 23rpx; line-height: 1; }
.commitment-response-change { flex-shrink: 0; color: var(--dk-muted); font-size: 20rpx; }
.chevron { display: flex; align-items: center; padding: 0 16rpx 0 0; color: var(--dk-line-strong, #aeb8b4); font-size: 36rpx; font-weight: 200; }
.empty { padding: 110rpx 26rpx; text-align: center; }.empty-title { display: block; color: var(--dk-ink); font-size: 30rpx; font-weight: 500; }.empty-copy { display: block; margin-top: 14rpx; color: var(--dk-muted); font-size: 24rpx; line-height: 1.7; }.filter-empty { padding-top: 90rpx; }
.login-btn { width: 230rpx; margin-top: 32rpx; color: #fff; background: var(--dk-brand); border-radius: 999rpx; font-size: 26rpx; }.login-btn::after { border: none; }
</style>
