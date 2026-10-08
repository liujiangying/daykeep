<template>
  <view class="dk-empty" :class="{ 'dk-empty--compact': compact }">
    <view class="dk-empty-mark" aria-hidden="true">
      <text class="dk-empty-mark-glyph">{{ mark }}</text>
    </view>
    <text class="dk-empty-title">{{ title }}</text>
    <text v-if="desc" class="dk-empty-desc">{{ desc }}</text>
    <view v-if="$slots.action" class="dk-empty-action">
      <slot name="action" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 统一空状态：符号标记 + 主文案 + 副文案 + 行动插槽。
 * 文案保持产品口吻（温暖、有下一步动作），行动区放 .dk-btn 系按钮。
 */
withDefaults(defineProps<{
  /** 符号标记，默认 ✦；也可传 emoji 之外的字符 */
  mark?: string
  title: string
  desc?: string
  /** 紧凑模式：嵌入卡片/容器内时减少上下留白 */
  compact?: boolean
}>(), {
  mark: '✦',
  desc: '',
  compact: false,
})
</script>

<style lang="scss" scoped>
.dk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--dk-space-6, 64rpx) var(--dk-space-4, 32rpx);
  text-align: center;
}
.dk-empty-mark {
  display: flex;
  width: 108rpx;
  height: 108rpx;
  align-items: center;
  justify-content: center;
  border-radius: var(--dk-radius-pill, 999rpx);
  background: var(--dk-bg-soft, #eef2f1);
}
.dk-empty-mark-glyph {
  color: var(--dk-brand, #2f6f6a);
  font-size: 44rpx;
  line-height: 1;
}
.dk-empty-title {
  margin-top: var(--dk-space-3, 24rpx);
  color: var(--dk-ink, #1c2423);
  font-size: var(--dk-fs-label, 30rpx);
  font-weight: 600;
}
.dk-empty-desc {
  max-width: 480rpx;
  margin-top: var(--dk-space-1, 8rpx);
  color: var(--dk-muted, #6b736f);
  font-size: var(--dk-fs-meta, 26rpx);
  line-height: 1.6;
}
.dk-empty-action {
  margin-top: var(--dk-space-4, 32rpx);
}

.dk-empty--compact {
  padding-top: var(--dk-space-2, 16rpx);
  padding-bottom: var(--dk-space-2, 16rpx);
}
</style>
