<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { useElectronEventaContext, useElectronMouseAroundWindowBorder, useElectronMouseInWindow } from '@proj-airi/electron-vueuse'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { refDebounced, useBroadcastChannel } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'

import { captionGetIsFollowingWindow, captionIsFollowingWindowChanged } from '../../shared/eventa'

const attached = ref(true)
const settingsStore = useSettings()
const speakerText = ref('') // NOTICE: do NOT add 'caption-speaker' or user speech to captions. This is intentionally AI-only.
const assistantText = ref('')
const { isOutside: isOutsideWindow } = useElectronMouseInWindow()
const isOutsideWindowFor250Ms = refDebounced(isOutsideWindow, 250)
const shouldFadeOnCursorWithin = computed(() => !isOutsideWindowFor250Ms.value)
const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 30 })
const isAroundWindowBorderFor250Ms = refDebounced(isAroundWindowBorder, 250)

// Broadcast channel for captions
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
const { data } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })

// NOTICE: Secondary broadcast channel to listen for turn-resets (user messages)
// This is a hardware-level fix because the 'airi-caption-overlay' empty string reset was failing.
const { data: sessionUpdate } = useBroadcastChannel<any, any>({ name: 'airi-chat-stream' })

const context = useElectronEventaContext()
const getAttached = defineInvoke(context.value, captionGetIsFollowingWindow)

onMounted(async () => {
  try {
    const isAttached = await getAttached()
    attached.value = Boolean(isAttached)
  }
  catch {}

  try {
    context.value.on(captionIsFollowingWindowChanged, (event) => {
      attached.value = Boolean(event?.body)
    })
  }
  catch {}

  try {
    // Hardware-level turn reset: clear everything when a new user message enters the session
    watch(sessionUpdate, (event) => {
      if (event?.type === 'session-updated' && event.message?.role === 'user') {
        console.log('[Caption] New user turn detected (via session-updated), resetting panel.')
        speakerText.value = ''
        assistantText.value = ''
      }
    })

    // Synchronize spatial follow with dashboard toggle
    watch(() => settingsStore.captionFollowStage, (shouldFollow) => {
      console.log('[Caption] Follow status changed:', shouldFollow)
      attached.value = shouldFollow
    }, { immediate: true })

    // Listen for Layout Mode transitions
    watch(() => settingsStore.captionLayoutMode, (mode) => {
      console.log('[Caption] Layout mode changed:', mode)
      // Future: Implement multi-turn historical view
    }, { immediate: true })

    // Listen for Home Snap triggers
    watch(() => settingsStore.captionResetTrigger, () => {
      console.log('[Caption] Reset Position triggered.')
      // Recovery logic: re-attach if it was detached and lost
      if (!settingsStore.captionFollowStage) {
        settingsStore.captionFollowStage = true
      }
    })

    // Update texts from broadcast channel
    watch(data, (event) => {
      console.log('[Caption] Received event (overlay):', event)
      if (!event)
        return

      if (event.type === 'caption-speaker') {
        speakerText.value = event.text
      }
      else if (event.type === 'caption-assistant') {
        // Fallback reset for when assistant sends a reset signal
        if (event.text === '') {
          speakerText.value = ''
          assistantText.value = ''
        }
        else {
          assistantText.value = event.text
        }
      }
    }, { immediate: true })
  }
  catch {}
})

const containerStyle = computed(() => ({
  backgroundColor: `rgba(0, 0, 0, ${settingsStore.captionOpacity / 100})`,
  transform: `scale(${settingsStore.captionFontSize / 100})`,
  transformOrigin: settingsStore.captionDocking === 'top' ? 'top center' : 'bottom center',
}))
</script>

<template>
  <div
    :class="[
      'pointer-events-none relative h-full w-full flex justify-center overflow-hidden',
      settingsStore.captionDocking === 'top' ? 'items-start' : 'items-end',
    ]"
  >
    <div
      :class="[
        (!settingsStore.showCaptions || shouldFadeOnCursorWithin) ? 'op-0' : 'op-100',
        'pointer-events-auto relative select-none rounded-xl px-3 py-2',
        'backdrop-blur-sm',
        'transition-all duration-300 ease-in-out',
      ]"
      :style="containerStyle"
    >
      <div class="max-w-[80vw] flex flex-col gap-1">
        <div
          v-if="speakerText"
          class="rounded-md px-2 py-1 text-[1.1rem] text-neutral-50 font-medium text-shadow-lg text-shadow-color-neutral-900/60"
        >
          {{ speakerText }}
        </div>
        <div
          v-if="assistantText"
          class="rounded-md px-2 py-1 text-[1.25rem] text-primary-50 font-semibold text-stroke-4 text-stroke-primary-300/50 text-shadow-lg text-shadow-color-primary-700/50"
          :style="{ paintOrder: 'stroke fill' }"
        >
          {{ assistantText }}
        </div>
      </div>
    </div>

    <!-- Drag Handle: only visible when detached and hovering the window area -->
    <Transition
      enter-active-class="transition-opacity duration-250 ease-in-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-250 ease-in-out"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="!attached && shouldFadeOnCursorWithin"
        class="[-webkit-app-region:drag] pointer-events-auto absolute left-1/2 top-4 h-[14px] w-[36px] border border-[rgba(125,125,125,0.35)] rounded-[10px] bg-[rgba(125,125,125,0.75)] backdrop-blur-[6px] -translate-x-1/2"
        title="Drag to move"
      >
        <div class="absolute left-1/2 top-1/2 h-[3px] w-4 rounded-full bg-[rgba(255,255,255,0.85)] -translate-x-1/2 -translate-y-1/2" />
      </div>
    </Transition>

    <Transition
      enter-active-class="transition-opacity duration-250 ease-in-out"
      enter-from-class="opacity-50"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-250 ease-in-out"
      leave-from-class="opacity-100"
      leave-to-class="opacity-50"
    >
      <div v-if="isAroundWindowBorderFor250Ms" class="pointer-events-none absolute left-0 top-0 z-999 h-full w-full">
        <div
          :class="[
            'b-primary/50',
            'h-full w-full animate-flash animate-duration-3s animate-count-infinite b-4 rounded-2xl',
          ]"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
