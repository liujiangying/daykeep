<template>
  <view class="page" :style="pageStyle">
    <view class="setting-card">
      <view class="setting-copy">
        <text class="setting-title">在好日子中显示节日</text>
        <text class="setting-desc">开启后，节日会出现在好日子时间线</text>
      </view>
      <switch
        :checked="settings.enabled"
        :color="tokens.brand"
        @change="toggleEnabled"
      />
    </view>

    <view class="section-head">
      <view>
        <text class="section-title">全年节日</text>
        <text v-if="settings.enabled" class="section-hint">默认展示最近 3 个；手动选择后，将固定展示所选节日并每年循环</text>
      </view>
      <text class="section-count">{{ holidays.length }} 个</text>
    </view>

    <view v-if="settings.enabled && settings.mode === 'custom' && !settings.selectedIds.length" class="empty-tip">
      当前未选择节日，首页暂不显示节日
    </view>

    <view class="holiday-list">
      <view
        v-for="holiday in holidays"
        :key="holiday.id"
        class="holiday-row"
        :class="{ selectable: canSelect }"
        @tap="openHoliday(holiday.id)"
      >
        <view class="holiday-main">
          <view class="name-row">
            <text class="holiday-name">{{ holiday.name }}</text>
            <text v-if="isSelected(holiday.id)" class="visible-tag">{{ settings.mode === 'recent' ? '默认' : '将显示' }}</text>
          </view>
          <view class="date-row">
            <text class="holiday-date">{{ holiday.date }}</text>
            <text class="holiday-calendar">{{ holiday.calendarLabel }}</text>
          </view>
        </view>

        <view class="holiday-tail">
          <text
            class="days"
            :class="{ today: holiday.daysUntil === 0 }"
          >{{ daysLabel(holiday.daysUntil) }}</text>
          <view
            v-if="canSelect"
            class="select-circle"
            :class="{ on: isSelected(holiday.id) }"
            @tap.stop="toggleHoliday(holiday.id)"
          >
            <text v-if="isSelected(holiday.id)" class="check">✓</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useThemePage } from '@/composables/useThemePage'
import { getTokens } from '@/services/theme'
import { getPreferredSpaceId } from '@/services/spacePreference'
import {
  getHolidaySettings,
  listHolidayOccurrences,
  setHolidaySettings,
  syncHolidaySettings,
  RECENT_HOLIDAY_COUNT,
  type HolidaySettings,
} from '@/services/holidays'

const { pageStyle, themeId } = useThemePage()
const tokens = computed(() => getTokens(themeId.value))

const settings = reactive<HolidaySettings>(getHolidaySettings())
const holidays = computed(() => listHolidayOccurrences())
const canSelect = computed(() => settings.enabled)
const effectiveSelectedIds = computed(() =>
  settings.mode === 'recent'
    ? holidays.value.slice(0, RECENT_HOLIDAY_COUNT).map((item) => item.id)
    : settings.selectedIds,
)

function persist() {
  setHolidaySettings({
    enabled: settings.enabled,
    mode: settings.mode,
    selectedIds: [...settings.selectedIds],
  })
}

function toggleEnabled(event: any) {
  settings.enabled = !!event.detail?.value
  persist()
}

function isSelected(id: string) {
  return effectiveSelectedIds.value.includes(id)
}

function toggleHoliday(id: string) {
  if (!canSelect.value) return
  if (settings.mode === 'recent') {
    settings.selectedIds = [...effectiveSelectedIds.value]
    settings.mode = 'custom'
  }
  const index = settings.selectedIds.indexOf(id)
  if (index >= 0) settings.selectedIds.splice(index, 1)
  else settings.selectedIds.push(id)
  persist()
}

function openHoliday(id: string) {
  uni.navigateTo({ url: `/subpackages/day/detail?holiday=${encodeURIComponent(id)}` })
}

function daysLabel(days: number) {
  if (days === 0) return '今天'
  return `还有 ${days} 天`
}

onShow(() => {
  // 内置节日和节气是个人偏好，共同空间固定不展示，也不允许从空间上下文修改。
  if (getPreferredSpaceId()) {
    uni.showToast({ title: '共同空间不展示内置节日', icon: 'none' })
    setTimeout(() => {
      uni.navigateBack({
        fail: () => uni.switchTab({ url: '/pages/mine/index' }),
      })
    }, 500)
    return
  }
  void syncHolidaySettings().then((saved) => {
    settings.enabled = saved.enabled
    settings.mode = saved.mode
    settings.selectedIds = [...saved.selectedIds]
  })
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 32rpx 80rpx;
  background: var(--dk-bg, #f2f4f3);
  color: var(--dk-ink, #1c2423);
}

.setting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  border-radius: 14rpx;
  background: var(--dk-surface, #fff);
}

.setting-copy {
  flex: 1;
  min-width: 0;
}

.setting-title {
  display: block;
  font-size: var(--dk-fs-body, 28rpx);
  font-weight: 500;
}

.setting-desc {
  display: block;
  margin-top: 5rpx;
  font-size: var(--dk-fs-caption, 22rpx);
  color: var(--dk-muted, #6b736f);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 30rpx;
  margin-bottom: 10rpx;
}

.section-title,
.section-count {
  font-size: var(--dk-fs-caption, 22rpx);
  color: var(--dk-muted, #6b736f);
}

.section-hint {
  display: block;
  margin-top: 5rpx;
  color: var(--dk-muted, #6b736f);
  font-size: 20rpx;
}

.empty-tip {
  margin-bottom: 12rpx;
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  color: var(--dk-muted, #6b736f);
  background: var(--dk-brand-soft, #e4f0ee);
  font-size: 22rpx;
}

.holiday-list {
  overflow: hidden;
  border-radius: 14rpx;
  background: var(--dk-surface, #fff);
}

.holiday-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx 22rpx;
  border-bottom: 1rpx solid var(--dk-line, #e2e6e4);
  &:last-child {
    border-bottom: none;
  }
  &.selectable:active {
    background: var(--dk-brand-soft, #e4f0ee);
  }
}

.holiday-main {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.holiday-name {
  font-size: var(--dk-fs-label, 26rpx);
  font-weight: 500;
}

.visible-tag {
  padding: 2rpx 8rpx;
  border-radius: 999rpx;
  font-size: 18rpx;
  color: var(--dk-brand, #2f6f6a);
  background: var(--dk-brand-soft, #e4f0ee);
}

.date-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 7rpx;
}

.holiday-date {
  font-size: var(--dk-fs-body, 28rpx);
  font-weight: 500;
  color: var(--dk-ink, #1c2423);
  font-variant-numeric: tabular-nums;
}

.holiday-calendar {
  font-size: 20rpx;
  color: var(--dk-muted, #6b736f);
}

.holiday-tail {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.days {
  white-space: nowrap;
  font-size: var(--dk-fs-caption, 22rpx);
  color: var(--dk-muted, #6b736f);
  &.today {
    color: var(--dk-brand, #2f6f6a);
    font-weight: 600;
  }
}

.select-circle {
  width: 34rpx;
  height: 34rpx;
  border: 2rpx solid var(--dk-line, #c5ccc9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  &.on {
    border-color: var(--dk-brand, #2f6f6a);
    background: var(--dk-brand, #2f6f6a);
  }
}

.check {
  font-size: 22rpx;
  line-height: 1;
  color: #fff;
}
</style>
