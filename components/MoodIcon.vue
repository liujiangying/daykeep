<template>
  <image v-if="asset" class="mood-icon" :class="size" :src="asset" mode="aspectFit" />
  <text v-else-if="glyph" class="mood-icon mood-emoji" :class="size">{{ glyph }}</text>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { moodAssetForValue, moodIconForValue } from '@/shared/mood'

const props = withDefaults(defineProps<{
  mood?: string
  size?: 'badge' | 'week' | 'picker'
  empty?: string
}>(), {
  mood: '',
  size: 'badge',
  empty: '',
})

const asset = computed(() => moodAssetForValue(props.mood))
const glyph = computed(() => moodIconForValue(props.mood) || props.empty)
</script>

<style scoped>
.mood-icon {
  display: block;
  flex-shrink: 0;
}
.mood-icon.badge {
  width: 20rpx;
  height: 20rpx;
}
.mood-icon.week {
  width: 28rpx;
  height: 28rpx;
}
.mood-icon.picker {
  width: 40rpx;
  height: 40rpx;
}
.mood-emoji {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  color: inherit;
}
.mood-emoji.badge { font-size: 16rpx; }
.mood-emoji.week { font-size: 22rpx; }
.mood-emoji.picker { font-size: 32rpx; }
</style>
