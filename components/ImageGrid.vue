<template>
  <view class="img-grid">
    <view v-for="(img, i) in images" :key="i" class="img-item">
      <image class="img" :src="img" mode="aspectFill" @tap="preview(i)" />
      <text v-if="removable !== false" class="img-del" @tap.stop="remove(i)">×</text>
    </view>
    <view v-if="showAdd !== false && images.length < max" class="img-add" @tap="add">
      <text class="img-add-t">+</text>
      <text class="img-add-s">添加照片</text>
    </view>
  </view>
</template>

<script setup lang="ts">
const props = defineProps<{
  images: string[]
  max?: number
  showAdd?: boolean
  removable?: boolean
}>()

const emit = defineEmits<{
  (e: 'add', paths: string[]): void
  (e: 'remove', index: number): void
}>()

const max = props.max || 9

function preview(i: number) {
  uni.previewImage({ urls: props.images, current: props.images[i] })
}

function remove(i: number) {
  emit('remove', i)
}

function add() {
  const left = max - props.images.length
  if (left <= 0) return
  uni.chooseImage({
    count: left,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const paths = Array.isArray(res.tempFilePaths)
        ? res.tempFilePaths
        : res.tempFilePaths
          ? [res.tempFilePaths]
          : []
      emit('add', paths as string[])
    },
  })
}
</script>

<style scoped>
.img-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 24rpx;
}
.img-item {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  border-radius: 12rpx;
  overflow: hidden;
  background: var(--dk-brand-soft);
}
.img {
  width: 100%;
  height: 100%;
}
.img-del {
  position: absolute;
  top: 6rpx;
  right: 8rpx;
  width: 40rpx;
  height: 40rpx;
  line-height: 36rpx;
  text-align: center;
  font-size: 28rpx;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 50%;
}
.img-add {
  width: 200rpx;
  height: 200rpx;
  border-radius: 12rpx;
  border: 1rpx dashed var(--dk-line);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  background: var(--dk-surface);
}
.img-add-t {
  font-size: 48rpx;
  color: #b0b6b3;
  line-height: 1;
  font-weight: 300;
}
.img-add-s {
  font-size: 20rpx;
  color: #b0b6b3;
}
</style>
