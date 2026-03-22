<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ProfileSwitcherPopover } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores'

import { electronOpenSettings } from '../../../../shared/eventa'

const openSettings = useElectronEventaInvoke(electronOpenSettings)
const cardStore = useAiriCardStore()

function handleManage() {
  openSettings({ route: '/settings/airi-card' })
}

function handleImageJournal() {
  if (!cardStore.activeCardId)
    return
  openSettings({ route: `/settings/airi-card?cardId=${cardStore.activeCardId}&tab=gallery` })
}
</script>

<template>
  <ProfileSwitcherPopover
    placement="up"
    @manage="handleManage"
    @image-journal="handleImageJournal"
  >
    <template #default="{ open, toggle, activeCard }">
      <slot :open="open" :toggle="toggle" :active-card="activeCard" />
    </template>
  </ProfileSwitcherPopover>
</template>
