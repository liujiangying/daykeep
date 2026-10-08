<template>
  <image
    class="dk-img"
    :class="{ 'is-loaded': loaded }"
    :src="src"
    :mode="mode"
    lazy-load
    @load="loaded = true"
    @error="loaded = true"
    @tap="emit('tap')"
  />
</template>

<script setup lang="ts">
/**
 * 渐入图片：懒加载 + onload 后淡入，避免封面/头像突兀闪现。
 * 用法与原生 image 一致（默认宽高铺满父容器、aspectFill），父容器需给定尺寸。
 */
import { ref } from 'vue'

withDefaults(defineProps<{
  src?: string
  mode?: string
}>(), {
  src: '',
  mode: 'aspectFill',
})

const emit = defineEmits<{ (e: 'tap'): void }>()
const loaded = ref(false)
</script>

<style scoped>
.dk-img {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity var(--dk-motion-base, 240ms) ease-out;
}
.dk-img.is-loaded {
  opacity: 1;
}
</style>
