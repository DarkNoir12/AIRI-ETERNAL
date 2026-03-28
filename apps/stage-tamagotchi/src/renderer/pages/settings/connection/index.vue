<script setup lang="ts">
import ConnectionSettings from '@proj-airi/stage-pages/pages/settings/system/ConnectionSettings.vue'

import { FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useServerChannelSettingsStore } from '../../../stores/settings/server-channel'

const serverChannelSettingsStore = useServerChannelSettingsStore()
const { websocketTlsConfig, hostname, authToken } = storeToRefs(serverChannelSettingsStore)
const { t } = useI18n()

const websocketTlsEnabled = computed({
  get: () => websocketTlsConfig.value != null,
  set: (value: boolean) => {
    serverChannelSettingsStore.websocketTlsConfig = value ? {} : null
  },
})
</script>

<template>
  <ConnectionSettings>
    <template #platform-specific>
      <FieldCheckbox
        v-model="websocketTlsEnabled"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + (5 * 10)"
        :delay="5 * 50"
        :label="t('settings.websocket-secure-enabled.title')"
        :description="t('settings.websocket-secure-enabled.description')"
      />

      <FieldInput
        v-model="hostname"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + (6 * 10)"
        :delay="6 * 50"
        :label="t('settings.server-hostname.title')"
        :description="t('settings.server-hostname.description')"
      />

      <FieldInput
        v-model="authToken"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + (7 * 10)"
        :delay="7 * 50"
        :label="t('settings.server-auth-token.title')"
        :description="t('settings.server-auth-token.description')"
        type="password"
      />
    </template>
  </ConnectionSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.connection.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.connection.description
  icon: i-solar:wi-fi-router-bold-duotone
  settingsEntry: true
  order: 8
  stageTransition:
    name: slide
</route>
