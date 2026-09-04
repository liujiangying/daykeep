<template>
  <view class="switch-row" :class="{ soft }">
    <text>{{ label }}</text>
    <switch :checked="modelValue" :color="color" @change="onChange" />
  </view>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  modelValue: boolean
  color?: string
  soft?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

function onChange(ev: any) {
  emit('update:modelValue', !!ev.detail.value)
}
</script>

<style scoped>
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--dk-line);
  font-size: 28rpx;
  color: var(--dk-ink);
}
.switch-row.soft {
  margin-top: 24rpx;
  border-bottom: none;
  border-top: 1rpx solid var(--dk-line);
}
</style>
