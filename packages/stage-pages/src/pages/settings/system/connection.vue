<script setup lang="ts">
import ConnectionSettings from './ConnectionSettings.vue'
</script>

<template>
  <ConnectionSettings />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.connection.title
  subtitleKey: settings.pages.system.title
  descriptionKey: settings.pages.connection.description
  icon: i-solar:wi-fi-router-bold-duotone
  stageTransition:
    name: slide
</route>
