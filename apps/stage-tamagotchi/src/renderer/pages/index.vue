<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/providers/utils'

import workletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { electron } from '@proj-airi/electron-eventa'
import {
  useElectronEventaInvoke,
  useElectronMouseAroundWindowBorder,
  useElectronMouseInElement,
  useElectronMouseInWindow,
  useElectronRelativeMouse,
} from '@proj-airi/electron-vueuse'
import { useThreeSceneIsTransparentAtPoint } from '@proj-airi/stage-ui-three'
import { StickerStack, WhisperDock } from '@proj-airi/stage-ui/components'
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useAudioRecorder } from '@proj-airi/stage-ui/composables/audio/audio-recorder'
import { useCanvasPixelIsTransparentAtPoint } from '@proj-airi/stage-ui/composables/canvas-alpha'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useLive2d } from '@proj-airi/stage-ui/stores/live2d'
import { useLLM } from '@proj-airi/stage-ui/stores/llm'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useBroadcastChannel } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, provide, ref, toRef, watch } from 'vue'
import { toast } from 'vue-sonner'

import ControlsIsland from '../components/stage-islands/controls-island/index.vue'
import ResourceStatusIsland from '../components/stage-islands/resource-status-island/index.vue'

import {
  electronGetMainWindowConfig,
  widgetsAdd,
} from '../../shared/eventa'
import { useControlsIslandStore } from '../stores/controls-island'
import { builtinTools } from '../stores/tools/builtin'
import { useWindowStore } from '../stores/window'

const controlsIslandRef = ref<InstanceType<typeof ControlsIsland>>()
const whisperDockRef = ref<InstanceType<typeof WhisperDock>>()
const widgetStageRef = ref<InstanceType<typeof WidgetStage>>()
const tools = ref<any[]>([])
const stageCanvas = toRef(() => widgetStageRef.value?.canvasElement())
const controlsIslandRoot = computed(() => controlsIslandRef.value?.rootElement)
const geminiIslandRoot = computed(() => controlsIslandRef.value?.geminiRootElement)
const geminiPanelRoot = computed(() => controlsIslandRef.value?.geminiPanelElement)
const componentStateStage = ref<'pending' | 'loading' | 'mounted'>('pending')

const isLoading = ref(true)

const isIgnoringMouseEvents = ref(false)
const shouldFadeOnCursorWithin = ref(false)

const { isOutside: isOutsideWindow } = useElectronMouseInWindow()
const { isOutside: isOutsideMain } = useElectronMouseInElement(controlsIslandRoot)
const { isOutside: isOutsideGemini } = useElectronMouseInElement(geminiIslandRoot)
const { isOutside: isOutsideGeminiPanel } = useElectronMouseInElement(geminiPanelRoot)
const isOutside = computed(() => isOutsideMain.value && isOutsideGemini.value && isOutsideGeminiPanel.value)
const isOutsideForInstant = isOutside
const { x: relativeMouseX, y: relativeMouseY } = useElectronRelativeMouse()
// NOTICE: In real-world use cases of Fade on Hover feature, the cursor may move around the edge of the
// model rapidly, causing flickering effects when checking pixel transparency strictly.
// Here we use render-target pixel sampling to keep detection aligned with the actual render output.
const isTransparentByPixels = useCanvasPixelIsTransparentAtPoint(
  stageCanvas,
  relativeMouseX,
  relativeMouseY,
  { regionRadius: 25 },
)
const isTransparentByThree = useThreeSceneIsTransparentAtPoint(
  widgetStageRef,
  relativeMouseX,
  relativeMouseY,
  { regionRadius: 25 },
)

const { stageModelRenderer } = storeToRefs(useSettings())

const llmStore = useLLM()
const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()
const { activeProvider: activeChatProvider, activeModel: activeChatModel } = storeToRefs(consciousnessStore)

watch([activeChatProvider, activeChatModel], async () => {
  if (activeChatProvider.value && activeChatModel.value) {
    console.log('[Main Page] Discovering tools compatibility for:', activeChatModel.value)
    const provider = await providersStore.getProviderInstance<ChatProvider>(activeChatProvider.value)
    if (provider) {
      await llmStore.discoverToolsCompatibility(activeChatModel.value, provider, [])
    }
  }
}, { immediate: true })
const isTransparent = computed(() => {
  if (stageModelRenderer.value === 'vrm')
    return isTransparentByThree.value

  if (stageModelRenderer.value === 'live2d')
    return isTransparentByPixels.value

  return true
})

const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 30 })
const isAroundWindowBorderForInstant = isAroundWindowBorder

const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

const { scale, positionInPercentageString } = storeToRefs(useLive2d())
const { lastReloadReason } = storeToRefs(useSettings())
const { live2dLookAtX, live2dLookAtY } = storeToRefs(useWindowStore())
const { fadeOnHoverEnabled } = storeToRefs(useControlsIslandStore())

watch(componentStateStage, () => isLoading.value = componentStateStage.value !== 'mounted', { immediate: true })

const { pause, resume } = watch(isTransparent, (transparent) => {
  shouldFadeOnCursorWithin.value = fadeOnHoverEnabled.value && !transparent
}, { immediate: true })

const isLocked = ref(false)
provide('isLocked', isLocked)

const isFlashing = ref(false)
const isCountingDown = ref(false)
const backgroundStore = useBackgroundStore()

async function handleTakePhoto() {
  const t = toast.info('Image taken will be saved to image journal', {
    duration: 5000,
  })

  // Start Countdown
  isCountingDown.value = true

  try {
    // 3-2-1 Countdown
    for (let i = 3; i > 0; i--) {
      toast.info(`Taking photo in ${i}...`, { id: t })
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Capture Toast feedback
    toast.info('📸 Capturing...', { id: t })

    // Flash
    isFlashing.value = true

    // Wait a bit for the flash to start
    await new Promise(resolve => setTimeout(resolve, 50))

    // Capture Blob
    const blob = await widgetStageRef.value?.captureFrame()
    if (!blob)
      throw new Error('Failed to capture stage image')

    const dateStr = new Date().toLocaleString()
    const title = `Selfie - ${dateStr}`

    await backgroundStore.addBackground('selfie', blob, title)

    toast.success('Photo saved to journal!', { id: t })
  }
  catch (err) {
    console.error('[Photo Mode] Capture failed:', err)
    toast.error('Failed to capture photo', { id: t })
  }
  finally {
    isCountingDown.value = false
    // Delay flash end slightly for visual feedback
    setTimeout(() => {
      isFlashing.value = false
    }, 300)
  }
}

const getMainWindowConfig = useElectronEventaInvoke(electronGetMainWindowConfig)

onMounted(async () => {
  const config = await getMainWindowConfig() as any
  if (config) {
    isLocked.value = !!config.locked
  }

  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('eventa:event:electron:windows:main:config-changed', (_event, config: any) => {
      if (config) {
        isLocked.value = !!config.locked
      }
    })
  }
})

const hearingDialogOpen = computed(() => controlsIslandRef.value?.hearingDialogOpen ?? false)
const whisperDockOpen = computed(() => whisperDockRef.value?.isOpen ?? false)

const addWidget = useElectronEventaInvoke(widgetsAdd)

async function handleSpawnStandalone(stickerId: string) {
  // We use 128x128 as a safe default for stickers to allow rotation "crook"
  const width = 128
  const height = 128
  const x = Math.floor(Math.random() * (window.screen.availWidth - width))
  const y = Math.floor(Math.random() * (window.screen.availHeight - height))

  await addWidget({
    componentName: 'sticker',
    componentProps: { stickerId },
    size: 's',
    ttlMs: 60000,
    bounds: { x, y, width, height },
  })
}

watch([isOutsideForInstant, isAroundWindowBorderForInstant, isOutsideWindow, isTransparent, hearingDialogOpen, whisperDockOpen, fadeOnHoverEnabled], () => {
  if (hearingDialogOpen.value || whisperDockOpen.value) {
    // Hearing dialog or whisper dock is open; keep window interactive
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
    return
  }

  const insideControls = !isOutsideForInstant.value
  const nearBorder = isAroundWindowBorderForInstant.value

  if (insideControls || nearBorder) {
    // Inside interactive controls or near resize border: do NOT ignore events
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
  }
  else {
    const fadeEnabled = fadeOnHoverEnabled.value
    // Otherwise allow click-through while we fade UI based on transparency (when enabled)
    isIgnoringMouseEvents.value = fadeEnabled
    shouldFadeOnCursorWithin.value = fadeEnabled && !isOutsideWindow.value && !isTransparent.value
    setIgnoreMouseEvents([fadeEnabled, { forward: true }])
    if (fadeEnabled)
      resume()
    else
      pause()
  }
})

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { stream, enabled, selectedAudioInputLabel } = storeToRefs(settingsAudioDeviceStore)
const { askPermission, startStream } = settingsAudioDeviceStore
const { startRecord, stopRecord, onStopRecord, dispose: disposeRecorder } = useAudioRecorder(stream)
const hearingPipeline = useHearingSpeechInputPipeline()
const {
  transcribeForRecording,
  transcribeForMediaStream,
  stopStreamingTranscription,
} = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const chatStore = useChatOrchestratorStore()
const hearingStore = useHearingStore()
const { hearingDetectionMode } = storeToRefs(hearingStore)
const isStartingAudio = ref(false)

const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)

const {
  init: initVAD,
  start: startVAD,
  stop: stopVAD,
  dispose: disposeVAD,
  loaded: vadLoaded,
} = useVAD(workletUrl, {
  threshold: ref(0.6),
  onSpeechStart: () => {
    if (hearingDetectionMode.value === 'vad')
      void handleSpeechStart()
  },
  onSpeechEnd: () => {
    if (hearingDetectionMode.value === 'vad')
      void handleSpeechEnd()
  },
})

let stopOnStopRecord: (() => void) | undefined

// Caption overlay broadcast channel
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })

async function handleSpeechStart() {
  console.info('[Main Page] Speech Start detected')
  if (shouldUseStreamInput.value) {
    // For streaming providers, ChatArea component handles transcription manually via transcription pipeline.
    // The main page should not start automatic transcription to avoid duplicate sessions when ChatArea is active.
    return
  }

  startRecord()
}

async function handleSpeechEnd() {
  console.info('[Main Page] Speech End detected')
  if (shouldUseStreamInput.value) {
    // Keep streaming session alive; idle timer in pipeline will handle teardown.
    return
  }

  stopRecord()
}

async function startAudioInteraction() {
  if (isStartingAudio.value) {
    console.warn('[Main Page] Audio interaction startup already in progress, skipping duplicate call')
    return
  }

  isStartingAudio.value = true
  try {
    console.info('[Main Page] Starting audio interaction with device:', selectedAudioInputLabel.value)

    if (stream.value) {
      if (hearingDetectionMode.value === 'vad' && !shouldUseStreamInput.value) {
        // Only use separate VAD if not in streaming mode (streaming providers handle their own VAD/segmentation)
        console.info('[Main Page] Initializing separate VAD for non-streaming mode')
        await initVAD()
        await startVAD(stream.value)
      }
      else if (hearingDetectionMode.value === 'vad') {
        console.info('[Main Page] Skipping separate VAD in streaming mode (provider handles segmentation)')
      }
      else {
        // Manual mode: start recording immediately if not streaming
        if (!shouldUseStreamInput.value) {
          console.info('[Main Page] Manual mode enabled, starting recording immediately')
          startRecord()
        }
      }
    }

    if (shouldUseStreamInput.value) {
      console.info('[Main Page] Starting streaming transcription...', {
        supportsStreamInput: supportsStreamInput.value,
        hasStream: !!stream.value,
      })

      if (!stream.value) {
        console.warn('[Main Page] Stream not available despite shouldUseStreamInput being true')
        return
      }

      // Use sentence deltas for live captions and speech end for final text.
      await transcribeForMediaStream(stream.value, {
        onSentenceEnd: (delta) => {
          console.info('[Main Page] Received transcription delta:', delta)
          if (!delta || !delta.trim()) {
            return
          }

          postCaption({ type: 'caption-speaker', text: delta })
        },
        onSpeechEnd: (text) => {
          console.info('[Main Page] Speech ended, final text:', text)
          if (!text || !text.trim()) {
            return
          }

          postCaption({ type: 'caption-speaker', text })

          void (async () => {
            try {
              const provider = await providersStore.getProviderInstance(activeChatProvider.value)
              if (!provider || !activeChatModel.value) {
                console.warn('[Main Page] No provider or model available, skipping chat send')
                return
              }

              toast.info(`🎤 You said: ${text}`, { id: 'transcription-feedback' })
              console.info('[Main Page] Sending transcription to chat:', text)
              console.log('[Main Page] Ingesting with tools:', {
                model: activeChatModel.value,
                hasTools: !!builtinTools,
              })

              const { autoSendEnabled } = storeToRefs(hearingStore)
              await chatStore.ingest(text, {
                model: activeChatModel.value,
                chatProvider: provider as ChatProvider,
                tools: builtinTools,
                skipAssistant: !autoSendEnabled.value,
              })
            }
            catch (err) {
              console.error('[Main Page] Failed to send chat from voice:', err)
            }
          })()
        },
      })

      console.info('[Main Page] Streaming transcription started successfully')
    }
    else {
      console.warn('[Main Page] Not starting streaming transcription:', {
        shouldUseStreamInput: shouldUseStreamInput.value,
        hasStream: !!stream.value,
        supportsStreamInput: supportsStreamInput.value,
      })
    }

    if (stopOnStopRecord)
      stopOnStopRecord()

    // Hook once
    stopOnStopRecord = onStopRecord(async (recording) => {
      console.info('[Main Page] Voice recording stopped, size:', recording?.size, 'bytes')
      if (!recording || recording.size === 0) {
        console.warn('[Main Page] Recording is empty, skipping transcription')
        return
      }

      if (shouldUseStreamInput.value)
        return

      const text = await transcribeForRecording(recording)
      if (!text || !text.trim()) {
        toast.error('STT: No speech detected', { id: 'transcription-feedback' })
        return
      }

      toast.info(`🎤 You said: ${text}`, { id: 'transcription-feedback' })

      // Update caption overlay speaker text via BroadcastChannel
      postCaption({ type: 'caption-speaker', text })

      if (hearingDialogOpen.value) {
        console.info('[Main Page] (Manual) Hearing dialog is open, skipping duplicate ingestion in favor of ChatArea.')
        return
      }

      try {
        const provider = await providersStore.getProviderInstance(activeChatProvider.value)
        if (!provider || !activeChatModel.value)
          return

        console.log('[Main Page] Ingesting (Manual) with tools:', {
          model: activeChatModel.value,
          hasTools: !!builtinTools,
        })

        const { autoSendEnabled } = storeToRefs(hearingStore)
        await chatStore.ingest(text, {
          model: activeChatModel.value,
          chatProvider: provider as ChatProvider,
          tools: builtinTools,
          skipAssistant: !autoSendEnabled.value,
        })
      }
      catch (err) {
        console.error('Failed to send chat from voice:', err)
      }
    })
  }
  catch (e) {
    console.error('Audio interaction init failed:', e)
  }
  finally {
    isStartingAudio.value = false
  }
}

async function stopAudioInteraction() {
  try {
    // Await the final recording chunk to ensure full transcription
    await stopRecord()

    stopOnStopRecord?.()
    stopOnStopRecord = undefined

    // Gracefully stop transcription without abrupt abort
    await stopStreamingTranscription(false)

    // Stop VAD processing loop without disposing the model
    stopVAD()
  }
  catch (e) {
    console.warn('[Main Page] Error during audio interaction stop:', e)
  }
}

watch(enabled, async (val) => {
  /*
  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.send('mic-state-changed', val, selectedAudioInputLabel.value)
  }
  */

  console.info('[Main Page] Audio enabled changed:', val, 'stream available:', !!stream.value)
  if (val) {
    await askPermission()
    // Force a fresh stream acquisition on every enable
    await startStream()
    await startAudioInteraction()
  }
  else {
    await stopAudioInteraction()
  }
}, { immediate: true })

watch(stream, async (newStream) => {
  if (enabled.value && newStream) {
    console.info('[Main Page] Stream changed while enabled, restarting audio interaction')
    await stopAudioInteraction()
    await startAudioInteraction()
  }
})

onMounted(async () => {
  tools.value = await builtinTools()
  // Initialize VAD model immediately to avoid startup lag
  initVAD().catch((err) => {
    console.error('[Main Page] VAD initialization failed:', err)
  })

  if (window.electron?.ipcRenderer) {
    window.electron.ipcRenderer.on('toggle-mic-from-shortcut', () => {
      const oldState = settingsAudioDeviceStore.enabled
      console.info(`[Renderer] Received 'toggle-mic-from-shortcut' event. Current mic enabled: ${oldState}`)
      settingsAudioDeviceStore.enabled = !settingsAudioDeviceStore.enabled
      console.info(`[Renderer] Mic state flipped to: ${settingsAudioDeviceStore.enabled}`)
    })
  }
})

watch(hearingDetectionMode, async (val) => {
  if (enabled.value) {
    console.info('[Main Page] Detection Mode changed to:', val, 'restarting audio interaction')
    await stopAudioInteraction()
    await startAudioInteraction()
  }
})

onUnmounted(async () => {
  await stopAudioInteraction()
  disposeVAD()
  await disposeRecorder()
})

watch([stream, () => vadLoaded.value], async ([s, loaded]) => {
  if (enabled.value && loaded && s) {
    try {
      await startVAD(s)
    }
    catch (e) {
      console.error('Failed to start VAD with stream:', e)
    }
  }
})

// Assistant caption is broadcast from Stage.vue via the same channel
</script>

<template>
  <!-- Camera Flash Overlay -->
  <div v-show="isFlashing" class="animate-camera-flash pointer-events-none fixed inset-0 z-9999" />

  <div
    max-h="[100vh]"
    max-w="[100vw]"
    flex="~ col"
    relative z-2 h-full overflow-hidden rounded-xl
    transition="opacity duration-500 ease-in-out"
  >
    <div
      :class="[
        'relative h-full w-full items-end gap-2',
        'transition-opacity duration-250 ease-in-out',
        isLoading ? 'opacity-0 pointer-events-none' : 'opacity-100',
      ]"
    >
      <div
        :class="[
          shouldFadeOnCursorWithin ? 'op-0' : 'op-100',
          'absolute',
          'top-0 left-0 w-full h-full',
          'overflow-hidden',
          'rounded-2xl',
          'transition-opacity duration-250 ease-in-out',
        ]"
      >
        <ResourceStatusIsland />
        <WidgetStage
          ref="widgetStageRef"
          v-model:state="componentStateStage"
          h-full w-full
          flex-1
          :focus-at="{ x: live2dLookAtX, y: live2dLookAtY }"
          :scale="scale"
          :x-offset="positionInPercentageString.x"
          :y-offset="positionInPercentageString.y"
          mb="<md:18"
        />
        <ControlsIsland
          ref="controlsIslandRef"
          :is-locked="isLocked"
          @take-photo="handleTakePhoto"
        />
        <WhisperDock
          ref="whisperDockRef"
          :tools="tools"
          @spawn-standalone="handleSpawnStandalone"
        />
        <StickerStack />
      </div>
    </div>
    <div v-if="isLoading" class="pointer-events-none absolute left-0 top-0 z-100 h-full w-full">
      <div class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden">
        <div
          :class="[
            'absolute h-24 w-full overflow-hidden rounded-xl',
            'flex items-center justify-center',
            'bg-white/80 dark:bg-neutral-950/80',
            'backdrop-blur-md',
          ]"
        >
          <div
            :class="[
              'drag-region',
              'absolute left-0 top-0',
              'h-full w-full flex items-center justify-center',
              'text-1.5rem text-primary-600 dark:text-primary-400 font-normal',
              'select-none',
              'animate-flash animate-duration-5s animate-count-infinite',
            ]"
          >
            <div class="flex flex-col items-center gap-1">
              <div>Loading...</div>
              <div v-if="lastReloadReason" class="text-1rem font-normal opacity-50">
                Triggered by: {{ lastReloadReason }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <Transition
    enter-active-class="transition-opacity duration-250"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="false"
      class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden drag-region"
    >
      <div
        class="absolute h-32 w-full flex items-center justify-center overflow-hidden rounded-xl"
        bg="white/80 dark:neutral-950/80" backdrop-blur="md"
      >
        <div class="wall absolute top-0 h-8" />
        <div class="absolute left-0 top-0 h-full w-full flex animate-flash animate-duration-5s animate-count-infinite select-none items-center justify-center text-1.5rem text-primary-400 font-normal drag-region">
          DRAG HERE TO MOVE
        </div>
        <div class="wall absolute bottom-0 h-8 drag-region" />
      </div>
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
    <div v-if="isAroundWindowBorderForInstant && !isLoading" class="pointer-events-none absolute left-0 top-0 z-999 h-full w-full">
      <div
        :class="[
          'b-primary/50',
          'h-full w-full animate-flash animate-duration-3s animate-count-infinite b-4 rounded-2xl',
        ]"
      />
    </div>
  </Transition>

  <!-- Viewfinder Overlay -->
  <Transition
    enter-active-class="transition-all duration-500 ease-out"
    enter-from-class="opacity-0 scale-105"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition-all duration-300 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div
      v-if="isCountingDown"
      class="pointer-events-none fixed inset-0 z-50 flex items-start justify-center"
    >
      <div
        class="relative mt-24 w-85% border-4 border-primary-500/50 rounded-2xl border-dashed"
        :style="{ aspectRatio: '16 / 9' }"
      >
        <!-- Viewfinder Corners -->
        <div class="absolute h-8 w-8 border-l-6 border-t-6 border-primary-500 rounded-tl-lg -left-2 -top-2" />
        <div class="absolute h-8 w-8 border-r-6 border-t-6 border-primary-500 rounded-tr-lg -right-2 -top-2" />
        <div class="absolute h-8 w-8 border-b-6 border-l-6 border-primary-500 rounded-bl-lg -bottom-2 -left-2" />
        <div class="absolute h-8 w-8 border-b-6 border-r-6 border-primary-500 rounded-br-lg -bottom-2 -right-2" />

        <!-- Label -->
        <div class="absolute left-1/2 flex items-center gap-2 rounded-full bg-primary-500 px-4 py-1 text-xs text-white font-black tracking-widest uppercase shadow-lg -top-10 -translate-x-1/2">
          <div i-solar:camera-bold text-sm />
          AIRI Card Viewfinder (15% Offset)
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
@keyframes wall-move {
  0% {
    transform: translateX(calc(var(--wall-width) * -2));
  }
  100% {
    transform: translateX(calc(var(--wall-width) * 1));
  }
}

.wall {
  --at-apply: text-primary-300;

  --wall-width: 8px;
  animation: wall-move 1s linear infinite;
  background-image: repeating-linear-gradient(
    45deg,
    currentColor,
    currentColor var(--wall-width),
    #ff00 var(--wall-width),
    #ff00 calc(var(--wall-width) * 2)
  );
  width: calc(100% + 4 * var(--wall-width));
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
