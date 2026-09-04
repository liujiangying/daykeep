<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { redirectLegacyRoute } from '@/utils/legacyRoute'

onLoad((query) => redirectLegacyRoute('/subpackages/notes/edit', query))
</script>

<template><view /></template>
