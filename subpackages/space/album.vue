<template>
  <view class="page" :style="pageStyle">
    <view class="head">
      <text class="eyebrow">{{ spaceName || '我们的时光' }}</text>
      <text class="title">{{ selectedYear }} 年时光册</text>
      <text class="summary">{{ yearRecords.length }} 个片段 · {{ photoCount }} 张照片 · {{ placeCount }} 个地点</text>
    </view>

    <scroll-view scroll-x class="years" :show-scrollbar="false">
      <view class="year-list">
        <button v-for="year in years" :key="year" class="year-chip" :class="{ on: year === selectedYear }" @tap="selectedYear = year">{{ year }}</button>
      </view>
    </scroll-view>

    <view v-if="loading" class="empty">正在整理这一年的时光…</view>
    <view v-else-if="!yearRecords.length" class="empty">
      <text class="empty-title">这一页还空着</text>
      <button class="record-button" @tap="createMemory">写下第一条</button>
    </view>
    <view v-else class="months">
      <view v-for="group in monthGroups" :key="group.month" class="month">
        <view class="month-head"><text class="month-number">{{ group.month }}</text><text class="month-label">月 · {{ group.items.length }} 个片段</text></view>
        <view class="memory-grid">
          <view v-for="item in group.items" :key="item.id" class="memory" @tap="openRecord(item)">
            <image class="cover" :src="recordCover(item)" mode="aspectFill" />
            <text class="memory-title">{{ recordTitle(item) }}</text>
            <text class="memory-meta">{{ Number(item.eventDate.slice(8, 10)) }} 日{{ item.location ? ` · ${item.location}` : '' }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { getSpace } from '@/services/spaces'
import { entryBackgroundUrl, listEntries, type Entry } from '@/services/entries'
import { displayDiaryBody } from '@/services/systemEntries'

const { pageStyle } = useThemePage()
const loading = ref(true)
const spaceId = ref('')
const spaceName = ref('')
const records = ref<Entry[]>([])
const selectedYear = ref(new Date().getFullYear())
const visualRecords = computed(() => records.value.filter((item) => !!recordCover(item)))
const years = computed(() => {
  const found = new Set(visualRecords.value.map((item) => Number(item.eventDate.slice(0, 4))).filter(Boolean))
  found.add(new Date().getFullYear())
  return [...found].sort((a, b) => b - a)
})
const yearRecords = computed(() => visualRecords.value.filter((item) => Number(item.eventDate.slice(0, 4)) === selectedYear.value))
const photoCount = computed(() => yearRecords.value.reduce((sum, item) => sum + (item.images?.length || 0), 0))
const placeCount = computed(() => new Set(yearRecords.value.map((item) => item.location?.trim()).filter(Boolean)).size)
const monthGroups = computed(() => {
  const groups = new Map<number, Entry[]>()
  for (const item of yearRecords.value) {
    const month = Number(item.eventDate.slice(5, 7))
    groups.set(month, [...(groups.get(month) || []), item])
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([month, items]) => ({ month, items }))
})

function recordTitle(item: Entry) {
  return item.type === 'diary' ? displayDiaryBody(item.body || '').split(/\n/)[0]?.slice(0, 36) || '共同回忆' : item.title
}

function recordCover(item: Entry) {
  return item.images?.[0] || entryBackgroundUrl(item)
}

function createMemory() {
  uni.navigateTo({ url: `/subpackages/notes/edit?type=diary&ownerType=space&spaceId=${encodeURIComponent(spaceId.value)}` })
}

function openRecord(item: Entry) {
  if (item.isCapsule && !item.capsuleUnlocked) uni.navigateTo({ url: `/subpackages/capsule/locked?id=${encodeURIComponent(item.id)}` })
  else if (item.type !== 'diary' && item.entryKind === 'commitment') uni.navigateTo({ url: `/subpackages/commitment/detail?id=${encodeURIComponent(item.id)}` })
  else uni.navigateTo({ url: `/subpackages/notes/edit?id=${encodeURIComponent(item.id)}` })
}

onLoad(async (query: any) => {
  spaceId.value = String(query?.spaceId || '').trim()
  if (!spaceId.value) { loading.value = false; return }
  try {
    const [space, firstPage] = await Promise.all([
      getSpace(spaceId.value),
      listEntries({ ownerType: 'space', spaceId: spaceId.value, pageSize: 200 }),
    ])
    spaceName.value = space.name
    const all = [...firstPage.list]
    for (let page = 2; all.length < firstPage.total; page += 1) {
      const next = await listEntries({ ownerType: 'space', spaceId: spaceId.value, page, pageSize: 200 })
      if (!next.list.length) break
      all.push(...next.list)
    }
    records.value = all
    const latestYear = years.value[0]
    if (latestYear) selectedYear.value = latestYear
  } catch (error: any) {
    uni.showToast({ title: error?.message || '时光册加载失败', icon: 'none' })
  } finally { loading.value = false }
})
</script>

<style scoped lang="scss">
.page{min-height:100vh;padding:10rpx 30rpx calc(60rpx + env(safe-area-inset-bottom));background:var(--dk-bg);color:var(--dk-ink)}
.head{padding:10rpx 8rpx 18rpx}.eyebrow{display:block;color:var(--dk-brand);font-size:23rpx;font-weight:700}.title{display:block;margin-top:8rpx;font-size:46rpx;font-weight:780}.summary{display:block;margin-top:10rpx;color:var(--dk-muted);font-size:24rpx}
.years{width:100%;margin:12rpx 0 28rpx;white-space:nowrap}.year-list{display:flex;gap:12rpx}.year-chip{height:62rpx;margin:0;padding:0 26rpx;border:1rpx solid var(--dk-line);border-radius:31rpx;background:var(--dk-surface);color:var(--dk-muted);font-size:24rpx;line-height:60rpx}.year-chip::after{border:0}.year-chip.on{border-color:var(--dk-brand);background:var(--dk-brand);color:#fff}
.month{margin-bottom:34rpx}.month-head{display:flex;align-items:baseline;gap:8rpx;margin:0 6rpx 16rpx}.month-number{font-size:45rpx;font-weight:800}.month-label{color:var(--dk-muted);font-size:23rpx}.memory-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18rpx;align-items:start}.memory{overflow:hidden;padding-bottom:18rpx;border-radius:23rpx;background:var(--dk-surface);box-shadow:0 10rpx 28rpx rgba(24,42,39,.06)}.cover{display:block;width:100%;height:224rpx}.memory-title,.memory-meta{display:block;margin:14rpx 18rpx 0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.memory-title{font-size:26rpx;font-weight:700}.memory-meta{margin-top:6rpx;color:var(--dk-muted);font-size:21rpx}
.empty{display:flex;min-height:500rpx;flex-direction:column;align-items:center;justify-content:center;color:var(--dk-muted);font-size:25rpx;text-align:center}.empty-title{color:var(--dk-ink);font-size:34rpx;font-weight:750}.record-button{height:70rpx;margin-top:28rpx;padding:0 30rpx;border:0;border-radius:35rpx;background:var(--dk-brand);color:#fff;font-size:25rpx;line-height:70rpx}.record-button::after{border:0}
</style>
