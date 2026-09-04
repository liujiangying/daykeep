<template>
  <view class="page" :style="pageStyle">
    <template v-if="day">
      <view class="share-hero">
        <text class="eyebrow">只我们 · 日子分享</text>
        <view class="poster">
          <image class="poster-bg" :src="background" mode="aspectFill" />
          <view class="poster-shade" />
          <view class="poster-copy">
            <text class="poster-title">{{ day.title }}</text>
            <text class="poster-status">{{ statusText }}</text>
            <text class="poster-number">{{ count }}</text>
            <view class="poster-rule" />
            <text class="poster-date">{{ datePrefix }}{{ dateText }}</text>
            <text v-if="day.calendarLabel" class="poster-calendar">{{ day.calendarLabel }}</text>
          </view>
        </view>
        <text class="share-copy">这是一张只读分享卡片。想一起记录,请通过对方发送的邀请卡加入时光圈。</text>
      </view>

      <view v-if="spaceName" class="space-card">
        <text class="space-kicker">来自时光圈</text>
        <text class="space-name">{{ spaceName }}</text>
      </view>

      <button class="primary" @tap="goHome">打开只我们</button>
    </template>
    <view v-else-if="loading" class="state">正在打开分享页…</view>
    <view v-else class="state">这张分享卡片暂时打不开</view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { entryBackgroundUrl, getEntry } from '@/services/entries'
import { getSpace } from '@/services/spaces'
import { listHolidayOccurrences } from '@/services/holidays'
import { defaultPosterFor, getHolidayPoster, syncHolidayPosters } from '@/services/posters'
import { daysUntil, normalizeRepeatRule, type RepeatRule } from '@/utils/countdown'
import { formatAnnualDateLabel } from '@/utils/lunar'

type SharedDay = {
  id: string
  title: string
  date: string
  backgroundUrl: string
  calendar: 'solar' | 'lunar'
  repeatRule: RepeatRule
  calendarLabel?: string
  spaceId?: string | null
}

const { pageStyle } = useThemePage()
const entryId = ref('')
const holidayId = ref('')
const loading = ref(true)
const day = ref<SharedDay | null>(null)
const spaceName = ref('')

const background = computed(() => day.value?.backgroundUrl || defaultPosterFor(day.value?.id || 'daykeep'))

function decode(value: unknown) {
  const raw = String(value || '')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function parseDate(value: string) {
  const [year, month, date] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, date)
}

function rawDays(date: string) {
  const target = parseDate(date)
  const now = new Date()
  const targetDay = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((targetDay - today) / 86400000)
}

const delta = computed(() => {
  if (!day.value) return 0
  if (holidayId.value) return rawDays(day.value.date)
  return daysUntil(day.value.date, day.value.repeatRule, new Date(), day.value.calendar)
})
const count = computed(() => Math.abs(delta.value))
const statusText = computed(() => {
  if (delta.value === 0) return '就是今天'
  return delta.value < 0 ? '已经走过' : '还有'
})
const datePrefix = computed(() => day.value?.repeatRule === 'yearly' ? '每年：' : '起始日：')
const dateText = computed(() => {
  if (!day.value) return ''
  if (day.value.repeatRule === 'yearly') return formatAnnualDateLabel(day.value.date, day.value.calendar)
  const value = parseDate(day.value.date)
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日 ${weekdays[value.getDay()]}`
})

async function loadSharedDay() {
  loading.value = true
  try {
    if (holidayId.value) {
      await syncHolidayPosters()
      const holiday = listHolidayOccurrences().find((item) => item.id === holidayId.value)
      day.value = holiday
        ? {
            id: `holiday:${holiday.id}`,
            title: holiday.name,
            date: holiday.date,
            backgroundUrl: getHolidayPoster(holiday.id),
            calendar: 'solar',
            repeatRule: 'none',
            calendarLabel: holiday.calendarLabel,
            spaceId: null,
          }
        : null
      return
    }
    if (!entryId.value) {
      day.value = null
      return
    }
    const entry = await getEntry(entryId.value)
    day.value = {
      id: entry.id,
      title: entry.title,
      date: entry.eventDate,
      backgroundUrl: entryBackgroundUrl(entry),
      calendar: entry.calendar === 'lunar' ? 'lunar' : 'solar',
      repeatRule: normalizeRepeatRule(entry),
      calendarLabel: entry.calendar === 'lunar' ? '农历纪念日' : '',
      spaceId: entry.spaceId || null,
    }
    if (entry.spaceId) {
      const space = await getSpace(entry.spaceId).catch(() => null)
      spaceName.value = space?.name || ''
    }
  } catch {
    day.value = null
  } finally {
    loading.value = false
  }
}

function goHome() {
  uni.switchTab({ url: '/pages/timeline/index' })
}

onLoad((query: any) => {
  entryId.value = decode(query?.id)
  holidayId.value = decode(query?.holiday)
  void loadSharedDay()
})

onShareAppMessage(() => ({
  title: day.value ? `${day.value.title} · ${statusText.value}${count.value}` : '只我们',
  path: holidayId.value
    ? `/subpackages/day/share?holiday=${encodeURIComponent(holidayId.value)}`
    : `/subpackages/day/share?id=${encodeURIComponent(entryId.value)}`,
  imageUrl: background.value,
}))
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 36rpx 30rpx calc(54rpx + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, #f2f4f3 0%, #f9f5ec 100%);
  color: var(--dk-ink, #1c2423);
}
.share-hero { max-width: 690rpx; margin: 0 auto; }
.eyebrow { display: block; margin: 8rpx 0 24rpx; color: var(--dk-brand, #2f6f6a); font-size: 23rpx; font-weight: 700; letter-spacing: 6rpx; }
.poster { position: relative; height: 860rpx; overflow: hidden; border-radius: 42rpx; background: #cfd8d5; box-shadow: 0 28rpx 70rpx rgba(28, 45, 42, .16); }
.poster-bg { position: absolute; inset: 0; width: 100%; height: 100%; }
.poster-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(13, 28, 26, .12), rgba(12, 22, 22, .54)); }
.poster-copy { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 72rpx 48rpx; color: #fff; text-align: center; }
.poster-title { font-size: 46rpx; font-weight: 760; line-height: 1.35; text-shadow: 0 6rpx 18rpx rgba(0,0,0,.18); }
.poster-status { margin-top: 62rpx; font-size: 29rpx; }
.poster-number { margin-top: 8rpx; font-size: 184rpx; font-weight: 800; line-height: .96; letter-spacing: -6rpx; }
.poster-rule { width: 160rpx; height: 2rpx; margin: 48rpx 0 32rpx; background: rgba(255,255,255,.55); }
.poster-date { font-size: 27rpx; line-height: 1.5; }
.poster-calendar { margin-top: 14rpx; color: rgba(255,255,255,.78); font-size: 23rpx; }
.share-copy { display: block; margin: 28rpx 8rpx 0; color: #697773; font-size: 24rpx; line-height: 1.7; text-align: center; }
.space-card { max-width: 690rpx; margin: 28rpx auto 0; padding: 26rpx 30rpx; border: 1rpx solid rgba(47,111,106,.12); border-radius: 28rpx; background: rgba(255,255,255,.8); }
.space-kicker,.space-name { display: block; }
.space-kicker { color: #788682; font-size: 22rpx; }
.space-name { margin-top: 8rpx; color: #214a45; font-size: 30rpx; font-weight: 720; }
.primary { width: 100%; max-width: 690rpx; height: 92rpx; margin: 36rpx auto 0; border: 0; border-radius: 999rpx; color: #fff; background: var(--dk-brand, #2f6f6a); font-size: 29rpx; font-weight: 720; line-height: 92rpx; box-shadow: 0 14rpx 32rpx rgba(47,111,106,.18); }
.primary::after { border: 0; }
.state { display: flex; min-height: 70vh; align-items: center; justify-content: center; color: #6f7c78; font-size: 26rpx; }
</style>
