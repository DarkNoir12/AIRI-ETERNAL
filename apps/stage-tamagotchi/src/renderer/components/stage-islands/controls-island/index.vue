<script setup lang="ts">
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useCustomVrmAnimationsStore, useModelStore } from '@proj-airi/stage-ui-three'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'
import ControlsIslandFadeOnHover from './controls-island-fade-on-hover.vue'
import ControlsIslandHearingConfig from './controls-island-hearing-config.vue'
import IndicatorMicVolume from './indicator-mic-volume.vue'

import {
  electronOpenChat,
  electronOpenSettings,
  electronStartDraggingWindow,
  electronWindowHide,
  electronWindowSetAlwaysOnTop,
} from '../../../../shared/eventa'

const emit = defineEmits<{
  (e: 'take-photo'): void
}>()
const { isDark, toggleDark } = useTheme()
const { t } = useI18n()

const settingsAudioDeviceStore = useSettingsAudioDevice()
const settingsStore = useSettings()
const modelStore = useModelStore()
const cardStore = useAiriCardStore()
const customVrmAnimationsStore = useCustomVrmAnimationsStore()
const context = useElectronEventaContext()
const { enabled } = storeToRefs(settingsAudioDeviceStore)
const { alwaysOnTop, controlsIslandIconSize, stageModelRenderer } = storeToRefs(settingsStore)
const { activeCard, activeCardId } = storeToRefs(cardStore)
const { favoriteExpression, activeExpressions, vrmIdleAnimation } = storeToRefs(modelStore)

// Watch for profile changes to provide feedback
const lastCardId = ref(activeCardId.value)
watch(activeCard, (card) => {
  if (card && activeCardId.value !== lastCardId.value) {
    lastCardId.value = activeCardId.value
    toast.info(`You selected AIRI Card: ${card.name}`, { id: 'transcription-feedback' })
  }
})
const openSettings = useElectronEventaInvoke(electronOpenSettings)
const openChat = useElectronEventaInvoke(electronOpenChat)
const isLinux = ref(false)
const hideWindow = useElectronEventaInvoke(electronWindowHide)
const setAlwaysOnTop = useElectronEventaInvoke(electronWindowSetAlwaysOnTop)

const expanded = ref(false)
const islandRef = ref<HTMLElement>()

// === Sub-menu state ===
const view = ref<'main' | 'emotions' | 'wardrobe' | 'profiles'>('main')

// Expose whether hearing dialog is open so parent can disable click-through
const hearingDialogOpen = ref(false)
defineExpose({ hearingDialogOpen, rootElement: islandRef })

watch(expanded, (isExp) => {
  if (!isExp) {
    view.value = 'main' // Reset sub-menu when collapsing
  }
})

// Apply alwaysOnTop on mount and when it changes
watch(alwaysOnTop, (val) => {
  setAlwaysOnTop(val)
}, { immediate: true })

function toggleAlwaysOnTop() {
  alwaysOnTop.value = !alwaysOnTop.value
  expanded.value = false
}

function handleOpenSettings() {
  expanded.value = false
  return openSettings({})
}

function handleOpenChat() {
  expanded.value = false
  return openChat()
}

function handleViewGallery() {
  if (activeCardId.value) {
    openSettings({ route: `/settings/airi-card?cardId=${activeCardId.value}&tab=gallery` })
    expanded.value = false
  }
}

function handleManageProfiles() {
  openSettings({ route: '/settings/airi-card' })
  expanded.value = false
}

function handleTakePhoto() {
  emit('take-photo')
  expanded.value = false
}

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
    case 'auto':
    default:
      // Fixed to large for better visibility in the new layout,
      // can be changed to windowHeight based check if absolutely needed.
      isLarge = true
      break
  }

  const icon = isLarge ? 'size-5' : 'size-3'
  const border = isLarge ? 'border-2' : 'border-0'
  const padding = isLarge ? 'p-2' : 'p-0.5'
  return { icon, border, padding, button: `${border} ${padding}` }
})

/**
 * This is a know issue (or expected behavior maybe) to Electron.
 * We don't use this approach on Linux because it's not working.
 *
 * See `apps/stage-tamagotchi/src/main/windows/main/index.ts` for handler definition
 */
const startDraggingWindowInvoke = useElectronEventaInvoke(electronStartDraggingWindow, context.value)
function startDraggingWindow() {
  if (!isLinux.value) {
    startDraggingWindowInvoke()
  }
}

async function refreshWindow() {
  expanded.value = false
  // Use store-level applyCardState with force=true to reload model without full page refresh
  if (activeCard.value) {
    await cardStore.activateCard(activeCardId.value, true)
  }
  else {
    window.location.reload()
  }
}

// === Emotions ===
const ACT_EMOTIONS = [
  { key: 'happy', emoji: '😊' },
  { key: 'sad', emoji: '😢' },
  { key: 'angry', emoji: '😠' },
  { key: 'surprised', emoji: '😲' },
  { key: 'neutral', emoji: '😐' },
  { key: 'think', emoji: '🤔' },
  { key: 'cool', emoji: '😎' },
] as const

function triggerEmotion(emotion: string) {
  if (typeof (window as any).testEmotion === 'function') {
    ;(window as any).testEmotion(emotion)
    toast.info(`Triggered ${emotion} expression`, { id: 'transcription-feedback' })
  }
}

function triggerRandomEmotion() {
  const random = ACT_EMOTIONS[Math.floor(Math.random() * ACT_EMOTIONS.length)]
  triggerEmotion(random.key)
}

// === Favorite (Superseded by Wardrobe) ===
// const hasFavorite = computed(() => !!favoriteExpression.value)
const currentIdleAnimationLabel = computed(() => customVrmAnimationsStore.animationLabelByKey[vrmIdleAnimation.value] ?? vrmIdleAnimation.value)
// const isFavoriteActive = computed(() => {
//   if (!favoriteExpression.value)
//     return false
//   return (activeExpressions.value[favoriteExpression.value] || 0) > 0
// })
//
// function toggleFavorite() {
//   if (!favoriteExpression.value)
//     return
//   expanded.value = false
//   const name = favoriteExpression.value
//   const current = activeExpressions.value[name] || 0
//   const next = current > 0 ? 0 : 1
//   activeExpressions.value = { ...activeExpressions.value, [name]: next }
// }

function cycleAnimation() {
  const cardIdleAnimations = activeCard.value?.extensions?.airi?.acting?.idleAnimations || []
  const allKeys = customVrmAnimationsStore.animationKeys
  const hasCardSubset = cardIdleAnimations.length > 0

  // Tier 1: Character owns a fixed idle (size 1)
  if (cardIdleAnimations.length === 1) {
    // Treat as manual cycler: Move the character's choice to the NEXT global animation
    const currentKey = cardIdleAnimations[0]
    const currentIndex = allKeys.indexOf(currentKey)
    const nextIndex = (currentIndex + 1) % allKeys.length
    const nextAnimation = allKeys[nextIndex]

    if (activeCard.value?.extensions?.airi?.acting) {
      activeCard.value.extensions.airi.acting.idleAnimations = [nextAnimation]
      // No need to set vrmIdleAnimation manually, Stage.vue computed will handle it
    }
    toast.info(`Character Fixed: ${customVrmAnimationsStore.animationLabelByKey[nextAnimation] || nextAnimation}`, { id: 'animation-cycle' })
    return
  }

  // Tier 2: Random cycling or global fallback
  const keys = hasCardSubset ? cardIdleAnimations.filter(k => allKeys.includes(k)) : allKeys
  const finalKeys = keys.length > 0 ? keys : allKeys

  const currentKey = vrmIdleAnimation.value
  const currentIndex = finalKeys.indexOf(currentKey)
  const nextIndex = (currentIndex + 1) % finalKeys.length
  const nextAnimation = finalKeys[nextIndex]

  vrmIdleAnimation.value = nextAnimation
  toast.info(`Cycling: ${customVrmAnimationsStore.animationLabelByKey[nextAnimation] || nextAnimation}`, { id: 'animation-cycle' })
}

// === Wardrobe ===
const wardrobeFilter = ref<'all' | 'base' | 'overlay'>('all')
const wardrobeItems = computed(() => {
  const outfits = activeCard.value?.extensions?.airi?.outfits || []
  return outfits.filter(item => wardrobeFilter.value === 'all' || item.type === wardrobeFilter.value)
})

function isOutfitActive(outfitId: string) {
  const outfit = activeCard.value?.extensions?.airi?.outfits?.find(o => o.id === outfitId)
  if (!outfit)
    return false
  return Object.entries(outfit.expressions).every(([name, weight]) => {
    return Math.abs((activeExpressions.value[name] || 0) - weight) < 0.05
  })
}

function triggerWardrobeItem(id: string) {
  cardStore.applyOutfit(id)
}
</script>

<template>
  <div ref="islandRef" fixed bottom-2 right-2 z-100 select-none>
    <div flex flex-col items-end gap-1>
      <!-- iOS Style Drawer Panel -->
      <Transition
        enter-active-class="transition-all duration-500 cubic-bezier(0.32, 0.72, 0, 1)"
        leave-active-class="transition-all duration-400 cubic-bezier(0.32, 0.72, 0, 1)"
        enter-from-class="opacity-0 translate-y-8 scale-90 blur-sm"
        leave-to-class="opacity-0 translate-y-8 scale-90 blur-sm"
      >
        <div v-if="expanded" border="1 neutral-200 dark:neutral-800" mb-2 flex flex-col gap-1 rounded-2xl p-2 backdrop-blur-xl :class="['bg-neutral-100/80 shadow-2xl shadow-black/20 dark:bg-neutral-900/80']">
          <!-- Main View -->
          <Transition
            enter-active-class="transition-all duration-300 cubic-bezier(0.32, 0.72, 0, 1)"
            leave-active-class="transition-all duration-200 cubic-bezier(0.32, 0.72, 0, 1)"
            enter-from-class="opacity-0 scale-95"
            leave-to-class="opacity-0 scale-95"
            mode="out-in"
          >
            <div v-if="view === 'main'" key="main" grid grid-cols-3 gap-2>
              <!-- Row 1: Communication -->
              <ControlButtonTooltip disable-hoverable-content>
                <ControlButton :button-style="adjustStyleClasses.button" @click="view = 'profiles'">
                  <div i-solar:users-group-rounded-outline :class="adjustStyleClasses.icon" text="sky-600 dark:sky-400" />
                </ControlButton>
                <template #tooltip>
                  {{ t('tamagotchi.stage.controls-island.switch-profile') }}
                </template>
              </ControlButtonTooltip>

              <ControlButtonTooltip disable-hoverable-content>
                <ControlButton :button-style="adjustStyleClasses.button" @click="handleOpenChat">
                  <div i-solar:chat-line-line-duotone :class="adjustStyleClasses.icon" text="sky-600 dark:sky-400" />
                </ControlButton>
                <template #tooltip>
                  {{ t('tamagotchi.stage.controls-island.open-chat') }}
                </template>
              </ControlButtonTooltip>

              <ControlButtonTooltip>
                <ControlsIslandHearingConfig v-model:show="hearingDialogOpen">
                  <div class="relative">
                    <ControlButton :button-style="adjustStyleClasses.button">
                      <Transition name="fade" mode="out-in">
                        <IndicatorMicVolume v-if="enabled" :class="adjustStyleClasses.icon" />
                        <div v-else i-ph:microphone-slash :class="adjustStyleClasses.icon" text="sky-600 dark:sky-400" />
                      </Transition>
                    </ControlButton>
                  </div>
                </ControlsIslandHearingConfig>
                <template #tooltip>
                  {{ t('tamagotchi.stage.controls-island.open-hearing-controls') }}
                </template>
              </ControlButtonTooltip>

              <!-- Row 2: Persona & Performance -->
              <ControlButtonTooltip>
                <ControlButton
                  :button-style="[
                    adjustStyleClasses.button,
                    stageModelRenderer === 'live2d' ? 'opacity-30 cursor-not-allowed filter-grayscale' : '',
                  ]"
                  :disabled="stageModelRenderer === 'live2d'"
                  @click="cycleAnimation"
                >
                  <div i-solar:running-2-linear :class="adjustStyleClasses.icon" text="amber-500" />
                </ControlButton>
                <template #tooltip>
                  <template v-if="stageModelRenderer === 'live2d'">
                    Not Supported (Live2D)
                  </template>
                  <template v-else>
                    {{ t('tamagotchi.stage.controls-island.cycle-animation') }}: {{ currentIdleAnimationLabel }}
                  </template>
                </template>
              </ControlButtonTooltip>

              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="view = 'emotions'">
                  <div i-solar:mask-happly-outline :class="adjustStyleClasses.icon" text="amber-500" />
                </ControlButton>
                <template #tooltip>
                  Emotions
                </template>
              </ControlButtonTooltip>

              <ControlButtonTooltip>
                <ControlButton
                  :button-style="adjustStyleClasses.button"
                  @click="view = 'wardrobe'"
                >
                  <div
                    :class="[
                      adjustStyleClasses.icon,
                      'text-amber-500',
                      'i-solar:t-shirt-outline',
                    ]"
                  />
                </ControlButton>
                <template #tooltip>
                  Wardrobe & Outfits
                </template>
              </ControlButtonTooltip>

              <!-- Row 3: System & Utility -->
              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="handleOpenSettings">
                  <div i-solar:settings-minimalistic-outline :class="adjustStyleClasses.icon" text="purple-600 dark:purple-400" />
                </ControlButton>
                <template #tooltip>
                  {{ t('tamagotchi.stage.controls-island.open-settings') }}
                </template>
              </ControlButtonTooltip>

              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="refreshWindow">
                  <div i-solar:refresh-linear :class="adjustStyleClasses.icon" text="purple-600 dark:purple-400" />
                </ControlButton>
                <template #tooltip>
                  {{ t('tamagotchi.stage.controls-island.refresh') }}
                </template>
              </ControlButtonTooltip>

              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="toggleDark(); expanded = false">
                  <Transition name="fade" mode="out-in">
                    <div v-if="isDark" i-solar:moon-outline :class="adjustStyleClasses.icon" text="purple-600 dark:purple-400" />
                    <div v-else i-solar:sun-2-outline :class="adjustStyleClasses.icon" text="purple-600 dark:purple-400" />
                  </Transition>
                </ControlButton>
                <template #tooltip>
                  {{ isDark ? t('tamagotchi.stage.controls-island.switch-to-light-mode') : t('tamagotchi.stage.controls-island.switch-to-dark-mode') }}
                </template>
              </ControlButtonTooltip>

              <!-- Row 4: Window/Stage Management -->
              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="toggleAlwaysOnTop()">
                  <div v-if="alwaysOnTop" i-solar:pin-bold :class="adjustStyleClasses.icon" text="neutral-600 dark:text-neutral-300 shadow-xl" />
                  <div v-else i-solar:pin-linear :class="adjustStyleClasses.icon" text="neutral-600 dark:neutral-400 opacity-50" />
                </ControlButton>
                <template #tooltip>
                  {{ alwaysOnTop ? t('tamagotchi.stage.controls-island.unpin-from-top') : t('tamagotchi.stage.controls-island.pin-on-top') }}
                </template>
              </ControlButtonTooltip>

              <ControlsIslandFadeOnHover
                :icon-class="adjustStyleClasses.icon"
                :button-style="adjustStyleClasses.button"
                @click="expanded = false"
              />

              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" hover:bg-red-500 hover:text-white @click="hideWindow(); expanded = false">
                  <div i-solar:close-circle-outline :class="adjustStyleClasses.icon" />
                </ControlButton>
                <template #tooltip>
                  {{ t('tamagotchi.stage.controls-island.hide') }}
                </template>
              </ControlButtonTooltip>
            </div>

            <!-- Emotions Sub-menu -->
            <div v-else-if="view === 'emotions'" key="emotions" grid grid-cols-3 gap-2>
              <ControlButtonTooltip v-for="emotion in ACT_EMOTIONS" :key="emotion.key">
                <ControlButton :button-style="adjustStyleClasses.button" @click="triggerEmotion(emotion.key)">
                  <div :class="[adjustStyleClasses.icon, 'flex items-center justify-center text-base leading-none text-amber-500']">
                    {{ emotion.emoji }}
                  </div>
                </ControlButton>
                <template #tooltip>
                  {{ emotion.key }}
                </template>
              </ControlButtonTooltip>

              <!-- Random -->
              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="triggerRandomEmotion">
                  <div i-solar:shuffle-linear :class="adjustStyleClasses.icon" text="amber-500" />
                </ControlButton>
                <template #tooltip>
                  Random Emotion
                </template>
              </ControlButtonTooltip>

              <!-- Back -->
              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="view = 'main'">
                  <div i-solar:arrow-left-outline :class="adjustStyleClasses.icon" text="amber-500" />
                </ControlButton>
                <template #tooltip>
                  Back
                </template>
              </ControlButtonTooltip>
            </div>

            <!-- Wardrobe Sub-menu -->
            <div v-else-if="view === 'wardrobe'" key="wardrobe" flex flex-col gap-2>
              <!-- 3x3 Grid (Scrollbox) -->
              <div class="scrollbar-hide max-h-[144px] overflow-y-auto">
                <div grid grid-cols-3 gap-2 pb-1>
                  <ControlButtonTooltip v-for="item in wardrobeItems" :key="item.id">
                    <ControlButton
                      :button-style="adjustStyleClasses.button"
                      :class="[
                        isOutfitActive(item.id)
                          ? item.type === 'base'
                            ? 'bg-amber-500/30 border-amber-400'
                            : 'ring-2 ring-sky-400/60 border-sky-400'
                          : '',
                      ]"
                      @click="triggerWardrobeItem(item.id)"
                    >
                      <div
                        :class="[
                          adjustStyleClasses.icon,
                          item.type === 'base' ? 'text-amber-500' : 'text-sky-400',
                          item.icon,
                        ]"
                      />
                    </ControlButton>
                    <template #tooltip>
                      {{ item.name }}
                    </template>
                  </ControlButtonTooltip>

                  <!-- Empty State -->
                  <div
                    v-if="wardrobeItems.length === 0"
                    class="col-span-3 flex flex-col items-center justify-center py-4 text-center opacity-40"
                  >
                    <div i-solar:pajamas-outline class="size-8" />
                    <span class="mt-1 text-[10px]">No outfits found</span>
                  </div>
                </div>
              </div>

              <!-- Fixed Utility Row -->
              <div grid grid-cols-3 gap-2 border-t border-neutral-200 border-solid pt-2 dark:border-neutral-800>
                <ControlButtonTooltip>
                  <ControlButton
                    :button-style="adjustStyleClasses.button"
                    :class="wardrobeFilter === 'base' ? 'bg-amber-500/20' : ''"
                    @click="wardrobeFilter = wardrobeFilter === 'base' ? 'all' : 'base'"
                  >
                    <div i-solar:t-shirt-bold-duotone :class="adjustStyleClasses.icon" text="amber-500" />
                  </ControlButton>
                  <template #tooltip>
                    Filter: Outfits (Base)
                  </template>
                </ControlButtonTooltip>

                <ControlButtonTooltip>
                  <ControlButton
                    :button-style="adjustStyleClasses.button"
                    :class="wardrobeFilter === 'overlay' ? 'bg-sky-500/20' : ''"
                    @click="wardrobeFilter = wardrobeFilter === 'overlay' ? 'all' : 'overlay'"
                  >
                    <div i-solar:magic-stick-3-bold-duotone :class="adjustStyleClasses.icon" text="sky-400" />
                  </ControlButton>
                  <template #tooltip>
                    Filter: Accessories (Overlay)
                  </template>
                </ControlButtonTooltip>

                <ControlButtonTooltip>
                  <ControlButton :button-style="adjustStyleClasses.button" @click="view = 'main'; wardrobeFilter = 'all'">
                    <div i-solar:arrow-left-outline :class="adjustStyleClasses.icon" text="neutral-500" />
                  </ControlButton>
                  <template #tooltip>
                    Back
                  </template>
                </ControlButtonTooltip>
              </div>
            </div>

            <!-- Profiles Sub-menu -->
            <div v-else-if="view === 'profiles'" key="profiles" flex flex-col gap-2>
              <!-- Profile List (Scrollbox) -->
              <div class="scrollbar-hide max-h-[144px] overflow-y-auto">
                <div flex flex-col gap-1 pb-1>
                  <button
                    v-for="[id, card] in cardStore.cards"
                    :key="id"
                    class="cursor-pointer border-2 rounded-xl border-solid px-3 py-1.5 text-left text-xs backdrop-blur-md transition-all duration-300 transition-ease-out"
                    :class="[
                      id === activeCardId
                        ? 'bg-sky-500/20 border-sky-400/50 text-sky-600 dark:text-sky-300'
                        : 'bg-neutral-50/80 dark:bg-neutral-800/70 border-neutral-200/60 dark:border-neutral-800/10 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50',
                    ]"
                    @click="cardStore.activateCard(id)"
                  >
                    <div flex items-center gap-2>
                      <div v-if="id === activeCardId" i-solar:check-circle-bold class="size-3" />
                      <span truncate>{{ card.name }}</span>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Fixed Utility Row -->
              <div grid grid-cols-4 gap-2 border-t border-neutral-200 border-solid pt-2 dark:border-neutral-800>
                <ControlButtonTooltip>
                  <ControlButton
                    :button-style="adjustStyleClasses.button"
                    @click="handleTakePhoto"
                  >
                    <div i-solar:camera-outline :class="adjustStyleClasses.icon" text="amber-500" />
                  </ControlButton>
                  <template #tooltip>
                    Photo Mode
                  </template>
                </ControlButtonTooltip>

                <ControlButtonTooltip>
                  <ControlButton
                    :button-style="adjustStyleClasses.button"
                    @click="handleViewGallery"
                  >
                    <div i-solar:gallery-linear :class="adjustStyleClasses.icon" text="sky-600 dark:sky-400" />
                  </ControlButton>
                  <template #tooltip>
                    View Gallery
                  </template>
                </ControlButtonTooltip>

                <ControlButtonTooltip>
                  <ControlButton
                    :button-style="adjustStyleClasses.button"
                    @click="handleManageProfiles"
                  >
                    <div i-solar:settings-outline :class="adjustStyleClasses.icon" text="purple-600 dark:purple-400" />
                  </ControlButton>
                  <template #tooltip>
                    Manage Profiles
                  </template>
                </ControlButtonTooltip>

                <ControlButtonTooltip>
                  <ControlButton :button-style="adjustStyleClasses.button" @click="view = 'main'">
                    <div i-solar:arrow-left-outline :class="adjustStyleClasses.icon" text="neutral-500" />
                  </ControlButton>
                  <template #tooltip>
                    Back
                  </template>
                </ControlButtonTooltip>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>

      <!-- Main Controls -->
      <div flex flex-col gap-1>
        <ControlButtonTooltip side="left">
          <ControlButton :button-style="adjustStyleClasses.button" @click="expanded = !expanded">
            <div
              :class="[adjustStyleClasses.icon, expanded ? 'rotate-180' : 'rotate-0']"
              i-solar:alt-arrow-up-line-duotone scale-110 transition-all duration-300
              text="neutral-600 dark:neutral-400"
            />
          </ControlButton>
          <template #tooltip>
            {{ expanded ? t('tamagotchi.stage.controls-island.collapse') : t('tamagotchi.stage.controls-island.expand') }}
          </template>
        </ControlButtonTooltip>

        <ControlButtonTooltip side="left">
          <ControlButton
            :button-style="adjustStyleClasses.button"
            cursor-move
            @mousedown="startDraggingWindow()"
          >
            <div
              i-ph:arrows-out-cardinal
              :class="[
                adjustStyleClasses.icon,
                useHearingStore().isTranscribing ? 'text-red-500 animate-pulse' : 'text-neutral-800 dark:text-neutral-300',
              ]"
            />
          </ControlButton>
          <template #tooltip>
            {{ useHearingStore().isTranscribing ? 'STT Processing...' : t('tamagotchi.stage.controls-island.drag-to-move-window') }}
          </template>
        </ControlButtonTooltip>
      </div>
    </div>
  </div>
</template>
