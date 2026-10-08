<template>
  <view class="dk-skeleton" :class="`dk-sk-${type}`" :style="shapeStyle" />
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * 骨架原语：微光效果来自 App.vue 的全局 .dk-skeleton 类。
 * 通过 type + w/h/size/radius 组合出贴合最终布局的占位，加载完成不跳动。
 */
const props = withDefaults(defineProps<{
  type?: 'line' | 'rect' | 'circle'
  /** 宽度（任意 CSS 值，如 '60%'、'420rpx'） */
  w?: string
  /** 高度 */
  h?: string
  /** 正方形尺寸（同时设置宽高，圆/头像用） */
  size?: string
  /** 覆盖默认圆角：sm/md/lg/xl/pill，circle 传 'circle' 时强制 50% */
  radius?: 'sm' | 'md' | 'lg' | 'xl' | 'pill' | 'circle'
}>(), {
  type: 'line',
  w: '',
  h: '',
  size: '',
  radius: undefined,
})

const shapeStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.w) style.width = props.w
  if (props.h) style.height = props.h
  if (props.size) {
    style.width = props.size
    style.height = props.size
  }
  if (props.radius === 'circle') style.borderRadius = '50%'
  else if (props.radius) style.borderRadius = `var(--dk-radius-${props.radius}, 12rpx)`
  return style
})
</script>

<style lang="scss" scoped>
.dk-sk {
  flex-shrink: 0;
}
.dk-sk-line {
  width: 100%;
  height: 28rpx;
  border-radius: var(--dk-radius-sm, 12rpx);
}
.dk-sk-rect {
  width: 100%;
  height: 160rpx;
  border-radius: var(--dk-radius-lg, 24rpx);
}
.dk-sk-circle {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
}
</style>
