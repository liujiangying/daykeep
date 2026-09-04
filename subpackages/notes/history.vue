<template>
  <view class="page" :style="pageStyle">
    <view v-if="loading" class="story-list">
      <view v-for="item in 3" :key="item" class="story-card skeleton-card">
        <view class="skeleton title-line" />
        <view class="skeleton copy-line" />
        <view class="skeleton copy-line short" />
      </view>
    </view>

    <view v-else-if="stories.length" class="story-list">
      <view v-for="story in stories" :key="story.id" class="story-card">
        <text class="story-title">{{ story.title }}</text>
        <text class="story-description">{{ story.description }}</text>
      </view>
      <text class="source-note">内容来自 {{ source }}，历史资料可能持续修订</text>
    </view>

    <view v-else class="empty-state">
      <text class="empty-title">故事暂时没有加载出来</text>
      <text class="empty-copy">{{ error || '稍后再回来看看吧' }}</text>
      <button class="retry-btn" @tap="loadStories">重新加载</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { getHistoryDay, type HistoryStory } from '@/subpackages/shared/api/history'

const { pageStyle } = useThemePage()
const selectedDate = ref('')
const stories = ref<HistoryStory[]>([])
const source = ref('中文维基百科')
const loading = ref(true)
const error = ref('')

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

async function loadStories() {
  if (!validDate(selectedDate.value)) return
  const [, month, day] = selectedDate.value.split('-').map(Number)
  loading.value = true
  error.value = ''
  try {
    const result = await getHistoryDay(month, day)
    stories.value = result.stories
    source.value = result.source
  } catch (reason: any) {
    stories.value = []
    error.value = reason?.message || '加载失败，请检查网络后重试'
  } finally {
    loading.value = false
  }
}

onLoad((options) => {
  const input = String(options?.date || '')
  selectedDate.value = validDate(input) ? input : new Date().toISOString().slice(0, 10)
  const [, month, day] = selectedDate.value.split('-').map(Number)
  uni.setNavigationBarTitle({ title: `${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日` })
  void loadStories()
})
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding: 26rpx 28rpx calc(64rpx + env(safe-area-inset-bottom)); background: var(--dk-bg); color: var(--dk-ink); box-sizing: border-box; }
.story-list { display: flex; flex-direction: column; gap: 22rpx; }
.story-card { overflow: hidden; padding: 26rpx; border: 1rpx solid rgba(28,36,35,.045); border-radius: 24rpx; background: var(--dk-surface); box-shadow: 0 10rpx 30rpx rgba(26,46,43,.035); }
.story-title { display: block; color: var(--dk-ink); font-size: var(--dk-fs-title, 36rpx); font-weight: 650; line-height: 1.45; }
.story-description { display: block; margin-top: 18rpx; color: var(--dk-muted); font-size: var(--dk-fs-body, 30rpx); line-height: 1.75; text-align: justify; }
.source-note { display: block; padding: 12rpx 12rpx 0; color: var(--dk-muted); font-size: var(--dk-fs-caption, 23rpx); line-height: 1.5; text-align: center; }
.empty-state { display: flex; min-height: 58vh; flex-direction: column; align-items: center; justify-content: center; padding: 40rpx; text-align: center; }
.empty-title { color: var(--dk-ink); font-size: var(--dk-fs-label, 28rpx); font-weight: 600; }
.empty-copy { margin-top: 12rpx; color: var(--dk-muted); font-size: var(--dk-fs-caption, 23rpx); }
.retry-btn { height: 64rpx; margin-top: 28rpx; padding: 0 28rpx; border: 1rpx solid rgba(47,111,106,.22); border-radius: 999rpx; color: var(--dk-brand); background: var(--dk-brand-soft); font-size: var(--dk-fs-meta, 25rpx); line-height: 62rpx; }
.retry-btn::after { border: 0; }
.skeleton-card { min-height: 220rpx; }
.skeleton { border-radius: 10rpx; background: #edf0ee; }
.title-line { width: 76%; height: 34rpx; }
.copy-line { width: 92%; height: 22rpx; margin-top: 22rpx; }
.copy-line.short { width: 62%; margin-top: 14rpx; }
</style>
