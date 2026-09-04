<template>
  <view class="page" :style="pageStyle">
    <view class="hero">
      <text class="week-range">{{ weekRange }}</text>
      <text class="scope-name">{{ scopeName }}</text>
      <text class="hero-title">这一周，留下了<br />{{ reviewItems.length }} 个片段</text>
      <view class="stats">
        <view><text class="stat-number">{{ memoryCount }}</text><text class="stat-label">记录</text></view>
        <view><text class="stat-number">{{ appointmentCount }}</text><text class="stat-label">约定与日子</text></view>
        <view><text class="stat-number">{{ photoCount }}</text><text class="stat-label">照片</text></view>
      </view>
    </view>

    <view v-if="loading" class="state">
      <text class="state-mark">⌛</text>
      <text>正在整理这一周…</text>
    </view>

    <view v-else-if="!reviewItems.length" class="state empty-state">
      <text class="empty-title">这一周还没有留下片段</text>
      <text class="empty-copy">有些日子安安静静，也值得被记住。</text>
    </view>

    <view v-else class="review-section">
      <view class="section-heading">
        <text class="section-title">本周回忆墙</text>
        <text class="section-copy">按发生的时间铺开</text>
      </view>
      <view class="memory-wall">
        <view v-for="(column, columnIndex) in wallColumns" :key="columnIndex" class="wall-column">
          <view
            v-for="item in column"
            :key="item.id"
            class="memory-card"
            :class="[cardClass(item), `kind-${kindOf(item)}`]"
            @tap="openItem(item)"
          >
            <image v-if="item.images?.[0]" class="card-image" :src="item.images[0]" mode="aspectFill" />
            <view class="card-copy" :class="{ 'text-only-copy': !item.images?.[0] }">
              <view class="card-label-row" :class="{ 'date-only': !kindLabel(item) }">
                <text v-if="kindLabel(item)" class="kind-label">{{ kindLabel(item) }}</text>
                <text class="card-date">{{ shortDate(item) }}</text>
              </view>
              <text class="card-title">{{ titleOf(item) }}</text>
              <text v-if="summaryOf(item)" class="card-summary">{{ summaryOf(item) }}</text>
              <view class="card-meta">
                <text>{{ authorOf(item) }}</text>
                <text v-if="item.location">· {{ item.location }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
      <text class="review-ending">这一周的故事，先收藏到这里。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { fetchMe, getCachedUserId } from '@/services/auth'
import { listEntries, type Entry, type EntryOwnerType } from '@/services/entries'
import { getSpace, type SpaceMember } from '@/services/spaces'
import { displayDiaryBody } from '@/services/systemEntries'

const { pageStyle } = useThemePage()
const loading = ref(true)
const ownerType = ref<EntryOwnerType>('personal')
const spaceId = ref('')
const scopeName = ref('只属于我的这一周')
const entries = ref<Entry[]>([])
const members = ref<SpaceMember[]>([])
const myName = ref('我')

function localDateStart(value: Date) {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

const weekStart = computed(() => {
  const today = localDateStart(new Date())
  today.setDate(today.getDate() - 6)
  return today
})

const weekEnd = computed(() => {
  const end = localDateStart(new Date())
  end.setDate(end.getDate() + 1)
  return end
})

function parseLocalDate(value?: string | null) {
  if (!value) return null
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function kindOf(item: Entry) {
  if (item.isCapsule || item.entryKind === 'capsule') return 'capsule'
  if (item.entryKind === 'commitment') return 'commitment'
  if (item.type === 'anniversary') return 'day'
  if (item.type === 'todo') return 'todo'
  return 'memory'
}

function reviewMoment(item: Entry) {
  if (kindOf(item) === 'capsule') return parseLocalDate(item.capsuleUnlockAt)
  if (item.type === 'diary') return parseLocalDate(item.eventAt || item.createdAt || item.eventDate)
  return parseLocalDate(item.eventAt || item.eventDate)
}

function belongsToWeek(item: Entry) {
  if (kindOf(item) === 'capsule' && !item.capsuleUnlocked) return false
  const moment = reviewMoment(item)
  return !!moment && moment >= weekStart.value && moment < weekEnd.value
}

const reviewItems = computed(() => entries.value
  .filter(belongsToWeek)
  .sort((a, b) => (reviewMoment(b)?.getTime() || 0) - (reviewMoment(a)?.getTime() || 0)))
const memoryCount = computed(() => reviewItems.value.filter((item) => kindOf(item) === 'memory').length)
const appointmentCount = computed(() => reviewItems.value.filter((item) => ['commitment', 'day', 'todo'].includes(kindOf(item))).length)
const photoCount = computed(() => reviewItems.value.reduce((sum, item) => sum + (item.images?.length || 0), 0))
const wallColumns = computed(() => {
  const columns: [Entry[], Entry[]] = [[], []]
  const occupied = [0, 0]
  reviewItems.value.forEach((item) => {
    // 一张图片卡约等于两张紧凑文字卡；始终放入当前较短的一列，
    // 既保留时间顺序，也避免简单单双分列造成整块空白。
    const target = occupied[0] <= occupied[1] ? 0 : 1
    columns[target].push(item)
    occupied[target] += item.images?.[0] ? 2 : 1
  })
  return columns
})

function formatMonthDay(value: Date) {
  return `${value.getMonth() + 1}月${value.getDate()}日`
}

const weekRange = computed(() => {
  const end = new Date(weekEnd.value)
  end.setDate(end.getDate() - 1)
  return `${formatMonthDay(weekStart.value)} — ${formatMonthDay(end)}`
})

function titleOf(item: Entry) {
  if (item.type !== 'diary') return item.title || kindLabel(item)
  return displayDiaryBody(item.body || '').split(/\n/).find(Boolean)?.slice(0, 42) || '这一刻'
}

function summaryOf(item: Entry) {
  if (item.type !== 'diary') {
    if (kindOf(item) === 'capsule') return '过去写下的话，在这周重新打开'
    return item.body?.trim().slice(0, 56) || ''
  }
  const body = displayDiaryBody(item.body || '').trim()
  return body === titleOf(item) ? '' : body.slice(0, 58)
}

function kindLabel(item: Entry) {
  const labels: Record<string, string> = {
    memory: ownerType.value === 'space' ? '' : '随手记',
    commitment: '约定',
    day: '好日子',
    todo: '待办',
    capsule: '已开启胶囊',
  }
  return labels[kindOf(item)]
}

function shortDate(item: Entry) {
  const moment = reviewMoment(item)
  if (!moment) return ''
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${moment.getMonth() + 1}.${String(moment.getDate()).padStart(2, '0')} · 周${weekdays[moment.getDay()]}`
}

function authorOf(item: Entry) {
  if (ownerType.value === 'personal') return '由我记录'
  const member = members.value.find((candidate) => String(candidate.userId) === String(item.userId || ''))
  const name = member?.nickname || item.authorName?.trim() || (String(item.userId || '') === String(getCachedUserId() || '') ? myName.value : '圈内成员')
  return `由 ${name} 记录`
}

function cardClass(item: Entry) {
  if (!item.images?.[0]) return 'text-only'
  return 'photo-card'
}

function openItem(item: Entry) {
  if ((item.isCapsule || item.entryKind === 'capsule') && !item.capsuleUnlocked) {
    uni.navigateTo({ url: `/subpackages/capsule/locked?id=${encodeURIComponent(item.id)}` })
  } else if (item.entryKind === 'commitment') {
    uni.navigateTo({ url: `/subpackages/commitment/detail?id=${encodeURIComponent(item.id)}` })
  } else if (item.type === 'diary') {
    uni.navigateTo({ url: `/subpackages/notes/edit?type=diary&id=${encodeURIComponent(item.id)}&from=weekly-review` })
  } else {
    uni.navigateTo({ url: `/subpackages/day/detail?id=${encodeURIComponent(item.id)}` })
  }
}

async function loadAllEntries() {
  const args = ownerType.value === 'space'
    ? { ownerType: 'space' as const, spaceId: spaceId.value, pageSize: 100 }
    : { ownerType: 'personal' as const, pageSize: 100 }
  const firstPage = await listEntries(args)
  const all = [...firstPage.list]
  for (let page = 2; all.length < firstPage.total; page += 1) {
    const next = await listEntries({ ...args, page })
    if (!next.list.length) break
    all.push(...next.list)
  }
  entries.value = all
}

onLoad(async (query: any) => {
  ownerType.value = query?.ownerType === 'space' ? 'space' : 'personal'
  spaceId.value = String(query?.spaceId || '').trim()
  try {
    if (ownerType.value === 'space' && spaceId.value) {
      const [space] = await Promise.all([getSpace(spaceId.value), loadAllEntries()])
      scopeName.value = space.name
      members.value = space.members || []
    } else {
      const [me] = await Promise.all([fetchMe().catch(() => null), loadAllEntries()])
      myName.value = me?.nickname || '我'
      scopeName.value = `${myName.value}的这一周`
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '本周回顾加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
})
</script>

<style scoped lang="scss">
.page{min-height:100vh;padding:24rpx 26rpx calc(68rpx + env(safe-area-inset-bottom));box-sizing:border-box;background:var(--dk-bg);color:var(--dk-ink)}
.hero{position:relative;overflow:hidden;padding:38rpx 34rpx 30rpx;border-radius:34rpx;background:linear-gradient(145deg,#e4f1ed 0%,#f8f2df 64%,#f4e5d9 100%);box-shadow:0 16rpx 42rpx rgba(36,74,67,.08)}
.hero::before,.hero::after{position:absolute;border-radius:50%;content:'';pointer-events:none}.hero::before{top:-90rpx;right:-36rpx;width:270rpx;height:270rpx;background:rgba(255,255,255,.38)}.hero::after{right:118rpx;bottom:-120rpx;width:220rpx;height:220rpx;background:rgba(116,163,153,.12)}
.week-range,.scope-name,.hero-title,.stats{position:relative;z-index:1}.week-range{display:block;color:var(--dk-brand);font-size:22rpx;font-weight:700;letter-spacing:1rpx}.scope-name{display:block;margin-top:10rpx;color:var(--dk-muted);font-size:23rpx}.hero-title{display:block;margin-top:25rpx;font-size:45rpx;font-weight:800;line-height:1.24;letter-spacing:-1rpx}.stats{display:flex;margin-top:34rpx;padding-top:25rpx;border-top:1rpx solid rgba(65,102,95,.15)}.stats view{display:flex;min-width:0;flex:1;align-items:baseline;gap:8rpx}.stat-number{font-size:32rpx;font-weight:800}.stat-label{color:var(--dk-muted);font-size:21rpx}
.review-section{margin-top:38rpx}.section-heading{display:flex;margin:0 6rpx 20rpx;align-items:flex-end;justify-content:space-between}.section-title{font-size:32rpx;font-weight:800}.section-copy{color:var(--dk-muted);font-size:21rpx}
.memory-wall{display:flex;align-items:flex-start;gap:18rpx}.wall-column{display:flex;min-width:0;flex:1;flex-direction:column;gap:18rpx}.memory-card{width:100%;overflow:hidden;border-radius:26rpx;background:var(--dk-surface);box-shadow:0 10rpx 30rpx rgba(28,49,45,.065)}.memory-card.text-only{border:1rpx solid var(--dk-line);box-shadow:0 7rpx 20rpx rgba(28,49,45,.045)}.card-image{display:block;width:100%;height:220rpx}.card-copy{padding:20rpx 21rpx 22rpx}.text-only-copy{padding:20rpx 21rpx}.card-label-row{display:flex;align-items:center;justify-content:space-between;gap:10rpx}.card-label-row.date-only{justify-content:flex-end}.kind-label{padding:5rpx 12rpx;border-radius:15rpx;color:var(--dk-brand);background:var(--dk-brand-soft);font-size:18rpx;font-weight:700}.card-date{overflow:hidden;color:var(--dk-muted);font-size:18rpx;white-space:nowrap}.card-title{display:-webkit-box;margin-top:14rpx;overflow:hidden;font-size:27rpx;font-weight:760;line-height:1.42;-webkit-box-orient:vertical;-webkit-line-clamp:2}.card-summary{display:-webkit-box;margin-top:8rpx;overflow:hidden;color:var(--dk-muted);font-size:21rpx;line-height:1.55;-webkit-box-orient:vertical;-webkit-line-clamp:2}.text-only .card-summary{-webkit-line-clamp:1}.card-meta{display:flex;margin-top:16rpx;overflow:hidden;color:var(--dk-muted);font-size:18rpx;white-space:nowrap}.card-meta text{overflow:hidden;text-overflow:ellipsis}.review-ending{display:block;margin:38rpx 0 6rpx;color:var(--dk-muted);font-size:22rpx;text-align:center}
.state{display:flex;min-height:600rpx;align-items:center;justify-content:center;flex-direction:column;color:var(--dk-muted);font-size:24rpx;text-align:center}.state-mark{margin-bottom:18rpx;font-size:36rpx}.empty-title{color:var(--dk-ink);font-size:30rpx;font-weight:760}.empty-copy{margin-top:10rpx;font-size:22rpx}
</style>
