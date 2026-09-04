<template>
  <view class="create-sheet">
    <view class="sheet-handle" />
    <text class="sheet-close" @tap="emit('close')">×</text>

    <view class="primary-entry" @tap="select('text')">
      <view class="primary-copy">
        <text class="primary-title">写下这一刻</text>
        <text class="primary-desc">从一句话开始，照片也可以稍后补充</text>
      </view>
      <text class="primary-action">开始</text>
    </view>

    <view class="scene-grid">
      <view class="scene-entry" @tap="select('photo')">
        <text class="scene-title">照片开始</text>
        <text class="scene-desc">选一张画面</text>
      </view>
      <view class="scene-entry" @tap="select('capsule')">
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
  padding: 24rpx 32rpx calc(30rpx + env(safe-area-inset-bottom));
  border-radius: 36rpx 36rpx 0 0;
  background: var(--dk-surface, #fff);
  box-shadow: 0 -16rpx 54rpx rgba(20, 34, 32, .16);
  box-sizing: border-box;
}
.sheet-handle { width: 64rpx; height: 7rpx; margin: 0 auto 26rpx; border-radius: 999rpx; background: var(--dk-line, #dfe5e3); }
.sheet-close { position: absolute; top: 17rpx; right: 28rpx; display: flex; width: 52rpx; height: 52rpx; align-items: center; justify-content: center; border-radius: 50%; color: var(--dk-muted); background: var(--dk-bg-soft, #f1f4f3); font-size: 36rpx; font-weight: 300; line-height: 1; }
.primary-entry { display: flex; min-height: 132rpx; align-items: center; gap: 24rpx; padding: 24rpx 26rpx; border: 1rpx solid rgba(47, 111, 106, .12); border-radius: 28rpx; background: linear-gradient(135deg, var(--dk-brand-soft, #e4f0ee), rgba(255, 255, 255, .92)); box-sizing: border-box; }
.primary-copy { min-width: 0; flex: 1; }
.primary-title { display: block; color: var(--dk-ink); font-size: 31rpx; font-weight: 750; }
.primary-desc { display: block; margin-top: 8rpx; color: var(--dk-muted); font-size: 22rpx; line-height: 1.45; }
.primary-action { flex-shrink: 0; padding: 14rpx 22rpx; border-radius: 999rpx; color: #fff; background: var(--dk-brand); font-size: 23rpx; font-weight: 700; }
.scene-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12rpx; margin-top: 14rpx; }
.scene-entry { display: flex; min-width: 0; min-height: 112rpx; flex-direction: column; justify-content: center; padding: 18rpx; border-radius: 24rpx; background: var(--dk-bg-soft, #f1f4f3); box-sizing: border-box; }
.scene-title { overflow: hidden; color: var(--dk-ink); font-size: 25rpx; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.scene-desc { display: block; margin-top: 7rpx; color: var(--dk-muted); font-size: 20rpx; }
</style>
