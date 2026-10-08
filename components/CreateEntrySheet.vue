<template>
  <view class="create-sheet">
    <view class="sheet-handle" />
    <view class="sheet-close dk-hit" hover-class="dk-press" :hover-stay-time="60" @tap="emit('close')">×</view>

    <view class="primary-entry" hover-class="dk-press" :hover-stay-time="60" @tap="select('text')">
      <view class="primary-copy">
        <text class="primary-title">写下这一刻</text>
        <text class="primary-desc">从一句话开始，照片也可以稍后补充</text>
      </view>
      <text class="primary-action">开始</text>
    </view>

    <view class="scene-grid">
      <view class="scene-entry" hover-class="dk-press" :hover-stay-time="60" @tap="select('photo')">
        <text class="scene-title">照片开始</text>
        <text class="scene-desc">选一张画面</text>
      </view>
      <view class="scene-entry" hover-class="dk-press" :hover-stay-time="60" @tap="select('capsule')">
        <text class="scene-title">时间胶囊</text>
        <text class="scene-desc">寄给未来</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
type CreateEntryMode = 'text' | 'photo' | 'capsule'

const emit = defineEmits<{
  close: []
  select: [mode: CreateEntryMode]
}>()

function select(mode: CreateEntryMode) {
  emit('select', mode)
}

</script>

<style lang="scss" scoped>
.create-sheet {
  position: relative;
  width: 100%;
  padding: var(--dk-space-3, 24rpx) var(--dk-space-4, 32rpx) calc(var(--dk-space-3, 24rpx) + env(safe-area-inset-bottom));
  border-radius: var(--dk-radius-xl, 32rpx) var(--dk-radius-xl, 32rpx) 0 0;
  background: var(--dk-surface, #fff);
  box-shadow: 0 -16rpx 54rpx rgba(20, 34, 32, .16);
  box-sizing: border-box;
}
.sheet-handle { width: 64rpx; height: 7rpx; margin: 0 auto var(--dk-space-3, 24rpx); border-radius: var(--dk-radius-pill, 999rpx); background: var(--dk-line, #dfe5e3); }
.sheet-close { position: absolute; top: 17rpx; right: 28rpx; display: flex; width: 52rpx; height: 52rpx; align-items: center; justify-content: center; border-radius: 50%; color: var(--dk-muted); background: var(--dk-bg-soft, #f1f4f3); font-size: 36rpx; font-weight: 300; line-height: 1; }
.primary-entry { display: flex; min-height: 132rpx; align-items: center; gap: var(--dk-space-3, 24rpx); padding: var(--dk-space-3, 24rpx) 26rpx; border: 1rpx solid var(--dk-brand-soft, #e4f0ee); border-radius: var(--dk-radius-lg, 24rpx); background: linear-gradient(135deg, var(--dk-brand-soft, #e4f0ee), rgba(255, 255, 255, .92)); box-sizing: border-box; }
.primary-copy { min-width: 0; flex: 1; }
.primary-title { display: block; color: var(--dk-ink); font-size: var(--dk-fs-label, 31rpx); font-weight: 750; }
.primary-desc { display: block; margin-top: var(--dk-space-1, 8rpx); color: var(--dk-muted); font-size: var(--dk-fs-caption, 22rpx); line-height: 1.45; }
.primary-action { flex-shrink: 0; padding: 14rpx 22rpx; border-radius: var(--dk-radius-pill, 999rpx); color: #fff; background: var(--dk-brand); font-size: var(--dk-fs-caption, 23rpx); font-weight: 700; }
.scene-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--dk-space-1, 12rpx); margin-top: 14rpx; }
.scene-entry { display: flex; min-width: 0; min-height: 112rpx; flex-direction: column; justify-content: center; padding: 18rpx; border-radius: var(--dk-radius-lg, 24rpx); background: var(--dk-bg-soft, #f1f4f3); box-sizing: border-box; }
.scene-title { overflow: hidden; color: var(--dk-ink); font-size: var(--dk-fs-meta, 25rpx); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.scene-desc { display: block; margin-top: 7rpx; color: var(--dk-muted); font-size: var(--dk-fs-caption, 20rpx); }
</style>
