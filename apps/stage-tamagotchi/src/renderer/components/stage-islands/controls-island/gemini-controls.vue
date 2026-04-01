<script setup lang="ts">
import { useLiveSessionStore } from '@proj-airi/stage-ui/stores/modules/live-session'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
const liveSessionStore = useLiveSessionStore()
const visionStore = useVisionStore()
const settingsStore = useSettings()

const { estimatedCost, isActive: isLiveActive, isGroundingEnabled } = storeToRefs(liveSessionStore)
const { isWitnessEnabled, status: visionStatus } = storeToRefs(visionStore)
const { controlsIslandIconSize } = storeToRefs(settingsStore)

// Grouped classes for icon / border / padding and combined style class
const adjustStyleClasses = computed(() => {
  let isLarge: boolean

  // Determine size based on setting
  switch (controlsIslandIconSize.value) {
    case 'large':
      isLarge = true
      break
    case 'small':
      isLarge = false
      break
    default:
      isLarge = true
      break
  }

  const icon = isLarge ? 'size-5' : 'size-3.5'
  const border = isLarge ? 'border-2' : 'border-0'
  const padding = isLarge ? 'p-2' : 'p-1'
  return { icon, border, padding, button: `${border} ${padding}` }
})

const formattedCost = computed(() => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
  }).format(estimatedCost?.value ?? 0)
})

// === Functional Handlers ===
function handleLiveToggle() {
  const wasActive = isLiveActive.value

  // Toggle both for a unified "Live API" experience
  liveSessionStore.toggle()

  // Also sync vision witness to the live state for a true "On/Off" experience
  if (!wasActive && !isWitnessEnabled.value) {
    visionStore.toggleWitness()
  }
  else if (wasActive && isWitnessEnabled.value) {
    visionStore.toggleWitness()
  }
}
function handleCaptureNow() {
  visionStore.heartbeat({ force: true })
  emit('close')
}
</script>

<template>
  <div
    class="min-w-max w-auto flex flex-col gap-1 border-1 border-neutral-200 rounded-2xl bg-neutral-100/80 p-2 shadow-2xl backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/80"
  >
    <!-- 3x3 Modular Grid -->
    <div class="grid grid-cols-3 gap-2">
      <!-- Row 1: Live API (Unified) -->
      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" @click="handleLiveToggle">
          <div
            :class="[
              'transition-colors duration-200',
              isLiveActive ? 'i-ph:broadcast-bold animate-pulse' : 'i-ph:broadcast-light',
              adjustStyleClasses.icon,
              isLiveActive ? 'text-amber-500' : 'text-neutral-400',
            ]"
          />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.vision-witness') }}: {{ isLiveActive ? 'ON' : 'OFF' }}
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" @click="handleCaptureNow">
          <div
            :class="[
              visionStatus === 'capturing' ? 'i-solar:camera-bold-duotone animate-pulse' : 'i-solar:camera-outline',
              adjustStyleClasses.icon,
              visionStatus === 'capturing' ? 'text-purple-500' : 'text-neutral-400',
            ]"
          />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.capture-now') }}
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" @click="visionStore.cycleFrequency()">
          <div i-ph:heartbeat :class="adjustStyleClasses.icon" text="red-400" />
          <div absolute bottom-1 right-1 text="[8px]" font-black leading-none opacity-80>
            {{ visionStore.witnessIntervalMinutes }}m
          </div>
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.pulse-rate') }} ({{ visionStore.witnessIntervalMinutes }}m)
        </template>
      </ControlButtonTooltip>

      <!-- Row 2: Voice Cluster (DISABLED - pending voice feature implementation) -->
      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" class="cursor-not-allowed opacity-30">
          <div i-solar:microphone-outline :class="adjustStyleClasses.icon" text="sky-400" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.live-voice') }} (Planned)
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" class="cursor-not-allowed opacity-30">
          <div i-solar:soundwave-outline :class="adjustStyleClasses.icon" text="green-400" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.output-mode') }} (Planned)
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" @click="isGroundingEnabled = !isGroundingEnabled">
          <div
            :class="[
              isGroundingEnabled ? 'i-solar:globus-bold text-emerald-400' : 'i-solar:globus-outline text-neutral-400',
              adjustStyleClasses.icon,
            ]"
          />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.grounding') }}: {{ isGroundingEnabled ? 'ON' : 'OFF' }}
        </template>
      </ControlButtonTooltip>

      <!-- Row 3: System Cluster (DISABLED) -->
      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" class="cursor-not-allowed opacity-30">
          <div i-solar:clock-circle-outline :class="adjustStyleClasses.icon" text="orange-400" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.respect-schedule') }} (Planned)
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" class="cursor-not-allowed opacity-30">
          <div i-solar:user-speak-outline :class="adjustStyleClasses.icon" text="emerald-400" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.cycle-voice') }} (Planned)
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip side="right">
        <ControlButton :button-style="adjustStyleClasses.button" class="cursor-not-allowed opacity-30">
          <div i-solar:settings-minimalistic-outline :class="adjustStyleClasses.icon" text="neutral-400" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.open-settings') }} (Planned)
        </template>
      </ControlButtonTooltip>
    </div>

    <!-- Usage Strip (ENABLED) -->
    <div
      class="mt-1 flex items-center justify-between border-t border-neutral-200 border-solid px-1 pt-2 dark:border-neutral-800"
    >
      <span class="text-[8px] text-neutral-500 font-bold tracking-wider uppercase opacity-60">
        {{ t('tamagotchi.stage.controls-island.est-cost') }}
      </span>
      <span class="text-[10px] text-neutral-600 font-mono dark:text-neutral-400">
        {{ formattedCost }}
      </span>
    </div>
  </div>
</template>
