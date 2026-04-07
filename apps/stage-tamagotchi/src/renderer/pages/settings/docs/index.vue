<route lang="yaml">
meta:
  layout: docs
</route>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { onMounted } from 'vue'

const router = useRouter()

onMounted(() => {
  router.replace('/settings/docs/overview/')
})
</script>

<template>
  <div flex="~ items-center justify-center" h-64>
    <div i-svg-spinners:90-ring-with-bg text-3xl text="$text-secondary-color" />
  </div>
</template>
