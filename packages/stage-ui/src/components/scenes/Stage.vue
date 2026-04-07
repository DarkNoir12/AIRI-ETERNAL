<script setup lang="ts">
import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'
import type { Live2DLipSync, Live2DLipSyncOptions } from '@proj-airi/model-driver-lipsync'
import type { Profile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import type { TextSegment, TextToken } from '@proj-airi/pipelines-audio'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions } from 'unspeech'

import type { EmotionPayload } from '../../constants/emotions'

import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getImportUrlBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'
import { useElectronWindowResizeStateEvent } from '@proj-airi/electron-vueuse'
import { createLive2DLipSync } from '@proj-airi/model-driver-lipsync'
import { wlipsyncProfile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import { createPlaybackManager, createPushStream, createSpeechPipeline } from '@proj-airi/pipelines-audio'
import { Live2DScene, useLive2d } from '@proj-airi/stage-ui-live2d'
import { ThreeScene, useCustomVrmAnimationsStore, useModelStore } from '@proj-airi/stage-ui-three'
import { animations } from '@proj-airi/stage-ui-three/assets/vrm'
import { createQueue } from '@proj-airi/stream-kit'
import { useBroadcastChannel } from '@vueuse/core'
// import { createTransformers } from '@xsai-transformers/embed'
// import embedWorkerURL from '@xsai-transformers/embed/worker?worker&url'
// import { embed } from '@xsai/embed'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { parseActEmotion, useSpecialTokenQueue } from '../../composables/queues'
import { categorizeResponse } from '../../composables/response-categoriser'
import { llmInferenceEndToken } from '../../constants'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '../../constants/emotions'
import { useAudioContext, useSpeakingStore } from '../../stores/audio'
import { useBackgroundStore } from '../../stores/background'
import { useChatOrchestratorStore } from '../../stores/chat'
import { useModsServerChannelStore } from '../../stores/mods/api/channel-server'
import { useAiriCardStore } from '../../stores/modules'
import { useConsciousnessStore } from '../../stores/modules/consciousness'
import { useSpeechStore } from '../../stores/modules/speech'
import { useProvidersStore } from '../../stores/providers'
import { useSettings } from '../../stores/settings'
import { useSpeechRuntimeStore } from '../../stores/speech-runtime'
import { useVHackStore } from '../../stores/vhack'

withDefaults(defineProps<{
  paused?: boolean
  focusAt: { x: number, y: number }
  xOffset?: number | string
  yOffset?: number | string
  scale?: number
}>(), { paused: false, scale: 1 })

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const db = ref<DuckDBWasmDrizzleDatabase>()
// const transformersProvider = createTransformers({ embedWorkerURL })

const vrmViewerRef = ref<InstanceType<typeof ThreeScene>>()
const live2dSceneRef = ref<InstanceType<typeof Live2DScene>>()

const settingsStore = useSettings()
const vhackStore = useVHackStore()
const {
  stageModelRenderer,
  stageViewControlsEnabled,
  live2dDisableFocus,
  stageModelSelectedUrl,
  stageModelSelectedFile,
  stageModelSelected,
  themeColorsHue,
  themeColorsHueDynamic,
  live2dIdleAnimationEnabled,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
} = storeToRefs(settingsStore)
const { mouthOpenSize } = storeToRefs(useSpeakingStore())
const { audioContext } = useAudioContext()
const currentAudioSource = ref<AudioBufferSourceNode>()

const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatOrchestratorStore()
const chatHookCleanups: Array<() => void> = []
// WORKAROUND: clear previous handlers on unmount to avoid duplicate calls when this component remounts.
//             We keep per-hook disposers instead of wiping the global chat hooks to play nicely with
//             cross-window broadcast wiring.

const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()
const live2dStore = useLive2d()
const vrmStore = useModelStore()
const customVrmAnimationsStore = useCustomVrmAnimationsStore()
const viewUpdateCleanups: Array<() => void> = []

// Caption + Presentation broadcast channels
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
// NOTICE: do NOT add 'caption-speaker' or user speech to captions. This is intentionally AI-only.
const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })

// NOTICE: Secondary broadcast channel to listen for turn-resets (user messages)
// This is a hardware-level fix because the 'airi-caption-overlay' empty string reset was failing.
const { data: sessionUpdate } = useBroadcastChannel<any, any>({ name: 'airi-chat-stream' })

const assistantCaption = ref('')

type PresentEvent
  = | { type: 'assistant-reset' }
    | { type: 'assistant-append', text: string }
const { post: postPresent } = useBroadcastChannel<PresentEvent, PresentEvent>({ name: 'airi-chat-present' })

viewUpdateCleanups.push(live2dStore.onShouldUpdateView((reason) => {
  // Live2D models already handle their own reload path inside the scene package.
  // We just sync the reason to the stage-model store for UI observability.
  if (reason)
    settingsStore.lastReloadReason = reason
}))

viewUpdateCleanups.push(vrmStore.onShouldUpdateView((reason) => {
  // VRM reloads are driven by modelSrc changes after updateStageModel().
  void settingsStore.updateStageModel(reason || 'vrm store update')
}))

const audioAnalyser = ref<AnalyserNode>()
const nowSpeaking = ref(false)
const lipSyncStarted = ref(false)
const lipSyncLoopId = ref<number>()
const live2dLipSync = ref<Live2DLipSync>()
const live2dLipSyncOptions: Live2DLipSyncOptions = { mouthUpdateIntervalMs: 50, mouthLerpWindowMs: 50 }

const { activeCard } = storeToRefs(useAiriCardStore())
const speechStore = useSpeechStore()
const { ssmlEnabled, activeSpeechProvider, activeSpeechModel, activeSpeechVoice, pitch } = storeToRefs(speechStore)
const { activeProvider: activeChatProvider } = storeToRefs(consciousnessStore)
const activeCardId = computed(() => activeCard.value?.name ?? 'default')
const speechRuntimeStore = useSpeechRuntimeStore()
const backgroundStore = useBackgroundStore()

const { activeBackgroundUrl } = storeToRefs(backgroundStore)
const resizeStateEventName = useElectronWindowResizeStateEvent()
const isWindowResizing = ref(false)
const reducedRenderScale = computed(() => {
  const nextScale = Math.min(vrmStore.renderScale, 0.75)
  return Math.max(0.5, nextScale)
})
function handleResizeStateChange(event: Event) {
  const customEvent = event as CustomEvent<{ active?: boolean }>
  isWindowResizing.value = !!customEvent.detail?.active
}

const { currentMotion } = storeToRefs(live2dStore)

const temporaryVrma = ref<string | null>(null)
let temporaryVrmaTimeout: ReturnType<typeof setTimeout> | null = null

// Scheduler logic for seamless idle transitions
let schedulerTimer: ReturnType<typeof setTimeout> | null = null
let watchdogTimer: ReturnType<typeof setTimeout> | null = null

function clearAnimationTimers() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer)
    schedulerTimer = null
  }
  if (watchdogTimer) {
    clearTimeout(watchdogTimer)
    watchdogTimer = null
  }
}

function handleAnimationPlayStatus(status: { duration: number, url: string }) {
  clearAnimationTimers()

  // Schedule next animation 0.8s before this one ends (cross-fade window)
  const delay = Math.max(0, (status.duration - 0.8) * 1000)
  schedulerTimer = setTimeout(() => {
    handleAnimationFinished()
  }, delay)

  // Safety watchdog: force a cycle if we get stuck for > 20s
  watchdogTimer = setTimeout(() => {
    console.warn('[Stage] Animation watchdog triggered (20s stall detected)')
    handleAnimationFinished()
  }, 20000)
}

const vrmActiveAnimation = computed(() => {
  const cardIdleAnimations = activeCard.value?.extensions?.airi?.acting?.idleAnimations || []
  let baseKey = vrmStore.vrmIdleAnimation

  // Tier 1: Character (if exactly 1 selected, we stick to it)
  if (cardIdleAnimations.length === 1) {
    baseKey = cardIdleAnimations[0]
  }
  // Tier 2: Global Fallback / Subsection clamping
  else if (cardIdleAnimations.length > 1 && !cardIdleAnimations.includes(baseKey)) {
    const validKeys = cardIdleAnimations.filter(k => customVrmAnimationsStore.animationKeys.includes(k))
    if (validKeys.length > 0) {
      baseKey = validKeys[0]
      // Only sync if we are globally cycling
      if (vrmStore.vrmIdleCycleEnabled) {
        vrmStore.vrmIdleAnimation = baseKey
      }
    }
  }

  const vrmaKey = temporaryVrma.value || baseKey
  return customVrmAnimationsStore.resolveAnimationUrl(vrmaKey)
})

const vrmEffectiveIdleCycleEnabled = computed(() => {
  const cardIdleAnimations = activeCard.value?.extensions?.airi?.acting?.idleAnimations || []
  if (cardIdleAnimations.length > 1)
    return true
  if (cardIdleAnimations.length === 1)
    return false
  return vrmStore.vrmIdleCycleEnabled
})

const emotionsQueue = createQueue<EmotionPayload>({
  handlers: [
    async (ctx) => {
      if (stageModelRenderer.value === 'vrm') {
        const emotionName = ctx.data.name
        const isVrma = emotionName in animations

        // NOTICE: Debug logging to trace expression dispatch
        console.log('[Stage/Emotion] Dispatching:', { emotionName, intensity: ctx.data.intensity, isVrma, renderer: stageModelRenderer.value })

        if (isVrma) {
          temporaryVrma.value = emotionName
        }

        const value = (EMOTION_VRMExpressionName_value as any)[emotionName] ?? emotionName

        if (!value)
          return

        if (vrmViewerRef.value) {
          // Only trigger expression if it's a known mapping or a valid raw expression.
          // This prevents warnings and interference for motion-only tokens.
          const isExpression = emotionName in EMOTION_VRMExpressionName_value || vrmViewerRef.value.listExpressions().includes(value)

          console.log('[Stage/Emotion] Expression check:', { emotionName, value, isExpression, availableExpressions: vrmViewerRef.value.listExpressions() })

          if (isExpression) {
            vrmViewerRef.value.setExpression(value, ctx.data.intensity, 2000)
          }
          else {
            console.warn('[Stage/Emotion] Skipping — not a known expression:', { emotionName, value })
          }
        }
        else {
          console.warn('[Stage] vrmViewerRef is NULL')
        }
      }
      else if (stageModelRenderer.value === 'live2d') {
        const emotionName = ctx.data.name
        const intensity = ctx.data.intensity
        // eslint-disable-next-line no-console
        console.log('[Stage] Live2D emotion processing:', { name: emotionName, intensity })

        // Delegate to store (handles mappings, name-matched fallbacks, and robust resets)
        const triggered = live2dStore.triggerEmotion(emotionName, intensity)
        if (!triggered) {
          // Final fallback: try motion mapping
          const motionGroup = (EMOTION_EmotionMotionName_value as any)[emotionName]
          if (motionGroup) {
            currentMotion.value = { group: motionGroup }
          }
          else {
            console.warn('[Stage] No Live2D explicit mapping, name match, or motion found for:', emotionName)
          }
        }
      }
    },
  ],
})

const specialTokenQueue = useSpecialTokenQueue(emotionsQueue)
specialTokenQueue.onHandlerEvent('emotion', (emotion) => {
  // eslint-disable-next-line no-console
  console.log('[Stage] Emotion token detected:', emotion)
})
specialTokenQueue.onHandlerEvent('delay', (delay) => {
  // eslint-disable-next-line no-console
  console.log('[Stage] Delay token detected:', delay)
})

// Play special token: delay or emotion
function playSpecialToken(special: string) {
  // eslint-disable-next-line no-console
  console.log('[Stage] Enqueueing special token:', special)
  specialTokenQueue.enqueue(special)
}

const modsServer = useModsServerChannelStore()

function processMarkers(content: string) {
  const markers = content.match(/<\|(?:ACT|DELAY)[^\r\n]*?(?:\|>|>)/gi)
  if (markers) {
    // eslint-disable-next-line no-console
    console.debug('[Stage] Markers detected:', markers)
    for (const marker of markers) {
      playSpecialToken(marker)
    }
  }
}

modsServer.onEvent('output:gen-ai:chat:message', (event) => {
  // eslint-disable-next-line no-console
  console.debug('[Stage] Received external message:', event.data)
  if (typeof event.data?.message?.content === 'string') {
    processMarkers(event.data.message.content)
  }
})

modsServer.onEvent('input:text', (event) => {
  // eslint-disable-next-line no-console
  console.debug('[Stage] Received external input:', event.data)
  if (event.data?.text) {
    processMarkers(event.data.text)
  }
})

const lipSyncNode = ref<AudioNode>()

if (typeof window !== 'undefined') {
  (window as any).testEmotion = (emotion: string) => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG] Manually triggering emotion:', emotion)
    processMarkers(`<|ACT:{"emotion":"${emotion}"}|>`)
  }

  (window as any).listExpressions = () => {
    const expressions = vrmViewerRef.value?.listExpressions?.()
    // eslint-disable-next-line no-console
    console.log('[DEBUG] Available Expressions:', expressions)
    return expressions
  }

  (window as any).setRawExpression = (name: string, value: number) => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG] Setting raw expression (3s reset):', name, value)
    vrmViewerRef.value?.setExpression(name, value, 3000)
  }

  (window as any).setPersistentExpression = (name: string, value: number) => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG] Setting persistent expression (NO reset):', name, value)
    vrmViewerRef.value?.setExpression(name, value)
  }

  (window as any).stopAnimations = () => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG] Stopping all animations')
    vrmViewerRef.value?.stopAnimations()
  }
}

async function playFunction(item: Parameters<Parameters<typeof createPlaybackManager<AudioBuffer>>[0]['play']>[0], signal: AbortSignal): Promise<void> {
  if (!audioContext || !item.audio)
    return

  // Ensure audio context is resumed (browsers suspend it by default until user interaction)
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume()
    }
    catch {
      return
    }
  }

  const source = audioContext.createBufferSource()
  currentAudioSource.value = source
  source.buffer = item.audio

  // Ensure connections are robust
  source.connect(audioContext.destination)
  if (audioAnalyser.value)
    source.connect(audioAnalyser.value)

  // Explicitly ensure lip-sync setup is called if not already started
  if (!lipSyncStarted.value) {
    await setupLipSync()
  }

  if (lipSyncNode.value)
    source.connect(lipSyncNode.value)

  return new Promise<void>((resolve) => {
    let settled = false
    const resolveOnce = () => {
      if (settled)
        return
      settled = true
      resolve()
    }

    const stopPlayback = () => {
      try {
        source.stop()
        source.disconnect()
      }
      catch {}
      if (currentAudioSource.value === source)
        currentAudioSource.value = undefined
      resolveOnce()
    }

    if (signal.aborted) {
      stopPlayback()
      return
    }

    signal.addEventListener('abort', stopPlayback, { once: true })
    source.onended = () => {
      signal.removeEventListener('abort', stopPlayback)
      stopPlayback()
    }

    try {
      source.start(0)
    }
    catch {
      stopPlayback()
    }
  })
}

const playbackManager = createPlaybackManager<AudioBuffer>({
  play: playFunction,
  maxVoices: 1,
  maxVoicesPerOwner: 1,
  overflowPolicy: 'queue',
  ownerOverflowPolicy: 'steal-oldest',
})

// Streaming sentence-boundary TTS segmenter
// Emits text immediately when sentence boundaries are detected (. ! ? ... \n\n —)
// Falls back to word-boundary split if buffer exceeds 150 chars without a boundary
// Never splits mid-word. Sanitizes rigorously before emitting.
function createSentenceSegmenter(tokens: ReadableStream<TextToken>, meta: { streamId: string, intentId: string }) {
  const { stream, write, close } = createPushStream<TextSegment>()
  let buffer = ''
  let sequence = 0
  let specialToken: string | null = null
  let inCodeFence = false

  // Simple sentence boundary: . ! ? followed by whitespace or end of text
  // Also matches ellipsis (...), double newline (\n\n), em dash (—)
  const SENTENCE_BOUNDARY = /[.!?]\s+|\.{3}|\n\n|—+/g

  void (async () => {
    const reader = tokens.getReader()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done)
          break
        if (!value)
          continue

        if (value.type === 'special') {
          specialToken = value.value ?? null
          continue
        }

        const tokenText = value.value ?? ''
        if (!tokenText)
          continue
        buffer += tokenText

        // Track code fence state by counting ``` occurrences
        const backtickCount = (buffer.match(/```/g) || []).length

        if (inCodeFence) {
          // We're inside a code fence — wait for it to close
          if (backtickCount % 2 === 0) {
            // Fence just closed — clear everything up to and including the closing ```
            inCodeFence = false
            const lastFenceIndex = buffer.lastIndexOf('```')
            buffer = buffer.slice(lastFenceIndex + 3)
          }
          else {
            // Still inside fence — skip processing, keep accumulating
            continue
          }
        }
        else {
          // Not in a code fence — check if one just opened
          if (backtickCount % 2 !== 0) {
            // A code fence just opened — process text before it, then skip the rest
            inCodeFence = true
            const firstFenceIndex = buffer.indexOf('```')
            if (firstFenceIndex > 0) {
              // There's text before the fence — process it
              const beforeFence = buffer.slice(0, firstFenceIndex)
              processAndEmit(beforeFence)
            }
            // Keep the fence marker + code content in buffer for when it closes
            buffer = buffer.slice(firstFenceIndex)
            continue
          }
        }

        // Normal processing — check for sentence boundaries
        processAndEmit(buffer)
      }

      // Flush any remaining buffered text (only if not in code fence)
      if (!inCodeFence && buffer.trim()) {
        emitCleanSentence(buffer.trim())
      }
    }
    finally {
      reader.releaseLock()
      close()
    }
  })()

  function processAndEmit(text: string) {
    SENTENCE_BOUNDARY.lastIndex = 0
    const match = SENTENCE_BOUNDARY.exec(text)
    if (match) {
      const sentenceEnd = match.index + match[0].length
      const sentence = text.slice(0, sentenceEnd)
      emitCleanSentence(sentence)
      buffer = text.slice(sentenceEnd)
    }

    // Safety valve: if buffer exceeds 150 chars without a boundary,
    // split at the last word boundary (space) to prevent mid-word splits
    if (buffer.length > 150) {
      const lastSpace = buffer.lastIndexOf(' ', 150)
      if (lastSpace > 20) {
        const forced = buffer.slice(0, lastSpace)
        emitCleanSentence(forced)
        buffer = buffer.slice(lastSpace + 1)
      }
    }
  }

  function emitCleanSentence(text: string) {
    // Rigorous sanitization — only allow speech-safe characters
    const clean = text
      // Remove all bracket-enclosed content: [sigh], [ACT:...], [laugh], etc.
      .replace(/\[[\s\S]*?\]/g, '')
      // Remove fenced code blocks (complete)
      .replace(/```[\s\S]*?```/g, '')
      // Remove partial/unclosed code fence (from ``` to end)
      .replace(/```[\s\S]*$/g, '')
      // Remove code fence metadata: linenums="...", title="...", hl_lines="..."
      .replace(/\b(linenums|hl_lines|title)\s*=\s*"[^"]*"/gi, '')
      // Remove escaped HTML tags: \\<br\\>, \\<\\/p\\>, etc.
      .replace(/\\*<[^>]*>\\*/g, '')
      // Remove XML/HTML tags (non-escaped)
      .replace(/<[^>]*>/g, '')
      // Remove markdown: *italic*, _italic_, **bold**, ~~strikethrough~~
      .replace(/\*\*?([^*]+)\*\*?/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      // Remove inline code
      .replace(/`[^`]*`/g, '')
      // Remove numbered list markers at start (1. 2. 3. etc.)
      .replace(/^\s*\d+\.\s*/gm, '')
      // Remove bullet list markers
      .replace(/^\s*[-*]\s*/gm, '')
      // Remove blockquote markers
      .replace(/^\s*>\s*/gm, '')
      // Convert all whitespace to spaces
      .replace(/[\n\r\t]+/g, ' ')
      // Collapse multiple spaces
      .replace(/ {2,}/g, ' ')
      // Remove control characters
      .replace(/[\x00-\x08\v\f\x0E-\x1F\x7F]/g, '')
      // Remove Unicode replacement characters
      .replace(/\uFFFD/g, '')
      // Remove mojibake
      .replace(/´┐¢/g, '')
      .trim()

    // Skip empty or too-short text
    if (!clean || clean.length < 2)
      return

    sequence++
    write({
      text: clean,
      special: specialToken ?? null,
      streamId: meta.streamId,
      intentId: meta.intentId,
      segmentId: `seg-${sequence}`,
      reason: 'flush',
      createdAt: Date.now(),
    })
    specialToken = null
  }

  return stream
}

const speechPipeline = createSpeechPipeline<AudioBuffer>({
  segmenter: createSentenceSegmenter,
  tts: async (request, signal) => {
    if (signal.aborted)
      return null

    if (activeSpeechProvider.value === 'speech-noop')
      return null

    if (!activeSpeechProvider.value)
      return null

    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
    if (!provider) {
      console.error('Failed to initialize speech provider')
      return null
    }

    if (!request.text && !request.special)
      return null

    const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)

    // For OpenAI Compatible providers, always use provider config for model and voice
    // since these are manually configured in provider settings
    let model = activeSpeechModel.value
    let voice = activeSpeechVoice.value

    if (activeSpeechProvider.value === 'openai-compatible-audio-speech') {
      // Prioritize global selections, then provider settings, then defaults
      model = model || providerConfig?.model as string || 'tts-1'

      if (!voice) {
        if (providerConfig?.voice) {
          voice = {
            id: providerConfig.voice as string,
            name: providerConfig.voice as string,
            description: providerConfig.voice as string,
            previewURL: '',
            languages: [{ code: 'en', title: 'English' }],
            provider: activeSpeechProvider.value,
            gender: 'neutral',
          }
        }
        else {
          voice = {
            id: 'alloy',
            name: 'alloy',
            description: 'alloy',
            previewURL: '',
            languages: [{ code: 'en', title: 'English' }],
            provider: activeSpeechProvider.value,
            gender: 'neutral',
          }
        }
      }

      console.info('[Speech Pipeline] Resolved OpenAI Compatible Stats', { model, voice: voice?.id })
    }

    if (activeSpeechProvider.value === 'chatterbox') {
      model = model || providerConfig?.model as string || 'chatterbox-turbo'

      if (!voice) {
        if (providerConfig?.voice) {
          voice = {
            id: providerConfig.voice as string,
            name: providerConfig.voice as string,
            description: providerConfig.voice as string,
            previewURL: '',
            languages: [{ code: 'en', title: 'English' }],
            provider: activeSpeechProvider.value,
            gender: 'neutral',
          }
        }
      }

      console.info('[Speech Pipeline] Resolved Chatterbox Stats', { model, voice: voice?.id })
    }

    if (activeSpeechProvider.value === 'omnivoice') {
      model = model || providerConfig?.model as string || 'omnivoice'

      if (!voice) {
        if (providerConfig?.voice) {
          voice = {
            id: providerConfig.voice as string,
            name: providerConfig.voice as string,
            description: providerConfig.voice as string,
            previewURL: '',
            languages: [{ code: 'en', title: 'English' }],
            provider: activeSpeechProvider.value,
            gender: 'neutral',
          }
        }
        else {
          voice = {
            id: 'default',
            name: 'Default Voice',
            description: 'OmniVoice default voice',
            previewURL: '',
            languages: [{ code: 'en', title: 'English' }],
            provider: activeSpeechProvider.value,
            gender: 'neutral',
          }
        }
      }

      console.info('[Speech Pipeline] Resolved OmniVoice Stats', { model, voice: voice?.id })
    }

    if (!model || !voice)
      return null

    const transformedText = speechStore.transformTextForSpeech(request.text, activeSpeechProvider.value)

    if (!transformedText.trim() && !request.special)
      return null

    const input = ssmlEnabled.value && speechStore.supportsSSML
      ? speechStore.generateSSML(transformedText, voice, { ...providerConfig, pitch: pitch.value })
      : transformedText

    // Guard against empty or whitespace-only input after sanitization
    if (!input || !input.trim()) {
      console.log('[TTS Debug] Skipping empty/whitespace-only input')
      return null
    }

    try {
      const speechOptions: Record<string, unknown> = {
        ...provider.speech(model, providerConfig),
        input,
        voice: voice.id,
      }

      if (activeSpeechProvider.value === 'chatterbox') {
        speechOptions.responseFormat = 'wav'
      }

      const res = await generateSpeech(speechOptions as Parameters<typeof generateSpeech>[0])

      if (signal.aborted || !res || res.byteLength === 0)
        return null

      const audioBuffer = await audioContext.decodeAudioData(res)
      return audioBuffer
    }
    catch {
      return null
    }
  },
  playback: playbackManager,
})

// NOTICE: the speech runtime host must follow the Stage lifecycle. If a previous Stage instance
// keeps the host registration after unmount, chat text can continue rendering while TTS writes
// into a stale pipeline owned by the dead component.
void speechRuntimeStore.registerHost(speechPipeline)

speechPipeline.on('onSpecial', (segment) => {
  if (segment.special)
    playSpecialToken(segment.special)
})

playbackManager.onEnd(({ item }) => {
  if (item.special)
    playSpecialToken(item.special)

  nowSpeaking.value = false
  mouthOpenSize.value = 0
})

playbackManager.onStart(({ item }) => {
  nowSpeaking.value = true
  // NOTICE: postCaption and postPresent may throw errors if the BroadcastChannel is closed
  // (e.g., when navigating away from the page). We wrap these in try-catch to prevent
  // breaking playback when the channel is unavailable.
  assistantCaption.value += ` ${item.text}`
  try {
    postCaption({ type: 'caption-assistant', text: assistantCaption.value })
  }
  catch {
    // BroadcastChannel may be closed - don't break playback
  }
  try {
    postPresent({ type: 'assistant-append', text: item.text })
  }
  catch {
    // BroadcastChannel may be closed - don't break playback
  }
})

function startLipSyncLoop() {
  if (lipSyncLoopId.value)
    return

  const tick = () => {
    if (!nowSpeaking.value || !live2dLipSync.value) {
      mouthOpenSize.value = 0
    }
    else {
      mouthOpenSize.value = live2dLipSync.value.getMouthOpen()
    }
    lipSyncLoopId.value = requestAnimationFrame(tick)
  }

  lipSyncLoopId.value = requestAnimationFrame(tick)
}

async function setupLipSync() {
  if (lipSyncStarted.value)
    return

  try {
    const lipSync = await createLive2DLipSync(audioContext, wlipsyncProfile as Profile, live2dLipSyncOptions)
    live2dLipSync.value = lipSync
    lipSyncNode.value = lipSync.node
    await audioContext.resume()
    startLipSyncLoop()
    lipSyncStarted.value = true
  }
  catch (error) {
    lipSyncStarted.value = false
    console.error('Failed to setup Live2D lip sync', error)
  }
}

function setupAnalyser() {
  if (!audioAnalyser.value) {
    audioAnalyser.value = audioContext.createAnalyser()
  }
}

let currentChatIntent: ReturnType<typeof speechRuntimeStore.openIntent> | null = null
const currentChatIntentReceivedLiteral = ref(false)

function ensureSpeechIntent() {
  if (currentChatIntent)
    return currentChatIntent

  console.log('[Stage] Opening speech intent', { ownerId: activeCardId.value })
  currentChatIntent = speechRuntimeStore.openIntent({
    ownerId: activeCardId.value,
    priority: 'normal',
    behavior: 'interrupt',
  })
  console.log('[Stage] Speech intent opened', { intentId: currentChatIntent.intentId, streamId: currentChatIntent.streamId })

  return currentChatIntent
}

// Hardware-level turn reset: clear everything when a new user message enters the session
// This is the absolute truth for turn boundaries and prevents 'blob' accumulation.
chatHookCleanups.push(watch(sessionUpdate, (event) => {
  if (event?.type === 'session-updated' && event.message?.role === 'user') {
    console.log('[Stage] New user turn detected (via session-updated), resetting caption accumulator.')
    assistantCaption.value = ''
    try {
      postCaption({ type: 'caption-assistant', text: '' })
    }
    catch {}
  }
}))

chatHookCleanups.push(onBeforeMessageComposed(async () => {
  // NOTICE: chat and proactivity share the same speech lane. Stopping playback alone is not
  // enough if a previous turn left an active or queued intent inside the speech pipeline.
  // Reset the entire host pipeline on each new assistant turn so later chat TTS cannot inherit
  // stale proactivity/chat intent state.
  speechPipeline.stopAll('new-message')

  setupAnalyser()
  await setupLipSync()
  // Reset assistant caption for a new message
  assistantCaption.value = ''
  try {
    postCaption({ type: 'caption-assistant', text: '' })
  }
  catch (error) {
    // BroadcastChannel may be closed if user navigated away - don't break flow
    console.warn('[Stage] Failed to post caption reset (channel may be closed)', { error })
  }
  try {
    postPresent({ type: 'assistant-reset' })
  }
  catch (error) {
    // BroadcastChannel may be closed if user navigated away - don't break flow
    console.warn('[Stage] Failed to post present reset (channel may be closed)', { error })
  }

  if (currentChatIntent) {
    console.log('[Stage] Cancelling existing speech intent for new message', { intentId: currentChatIntent.intentId })
    currentChatIntent.cancel('new-message')
    currentChatIntent = null
  }

  currentChatIntentReceivedLiteral.value = false
  ensureSpeechIntent()
}))

chatHookCleanups.push(onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  const intent = ensureSpeechIntent()
  if (!intent)
    return
  currentChatIntentReceivedLiteral.value = true
  console.log('[TTS Debug] onTokenLiteral received:', JSON.stringify(literal))
  console.log('[Stage] onTokenLiteral -> forwarding to speech', {
    intentId: intent.intentId,
    length: literal.length,
    preview: literal.slice(0, 120),
  })
  intent.writeLiteral(literal)
}))

chatHookCleanups.push(onTokenSpecial(async (special) => {
  // NOTICE: Dispatch emotion IMMEDIATELY so facial expressions sync with TTS.
  // Previously the ACT token went through the entire speech pipeline queue first,
  // causing expressions to lag behind the voice by 300-500ms.
  const actParsed = parseActEmotion(special)
  if (actParsed.ok) {
    for (const emotion of actParsed.emotions) {
      emotionsQueue.enqueue(emotion)
    }
  }

  // Also forward to speech pipeline for any provider-side speech tags
  const intent = ensureSpeechIntent()
  if (!intent)
    return
  console.log('[TTS Debug] onTokenSpecial received:', JSON.stringify(special))
  console.log('[Stage] onTokenSpecial -> forwarding', { intentId: intent.intentId, special })
  intent.writeSpecial(special)
}))

chatHookCleanups.push(onStreamEnd(async () => {
  specialTokenQueue.enqueue(llmInferenceEndToken)
  const intent = ensureSpeechIntent()
  if (intent)
    console.log('[Stage] onStreamEnd -> flush intent', { intentId: intent.intentId })
  intent?.writeFlush()
}))

chatHookCleanups.push(onAssistantResponseEnd(async (message) => {
  if (!currentChatIntentReceivedLiteral.value) {
    const fallbackSpeech = categorizeResponse(message, activeChatProvider.value).speech.trim()
    if (fallbackSpeech) {
      const intent = ensureSpeechIntent()
      console.log('[Stage] onAssistantResponseEnd -> fallback speech literal', {
        intentId: intent.intentId,
        length: fallbackSpeech.length,
      })
      intent.writeLiteral(fallbackSpeech)
      intent.writeFlush()
    }
  }

  if (currentChatIntent)
    console.log('[Stage] onAssistantResponseEnd -> ending intent', { intentId: currentChatIntent.intentId })
  currentChatIntent?.end()
  currentChatIntent = null
  currentChatIntentReceivedLiteral.value = false

  // Restore VRM expressions and animations to user-configured defaults after speech ends
  if (stageModelRenderer.value === 'vrm') {
    vrmViewerRef.value?.restoreDefaultExpressions()

    // Reset to idle animation when the entire turn ends
    if (temporaryVrmaTimeout) {
      clearTimeout(temporaryVrmaTimeout)
      temporaryVrmaTimeout = null
    }
    temporaryVrma.value = null
  }
  // const res = await embed({
  //   ...transformersProvider.embed('Xenova/nomic-embed-text-v1'),
  //   input: message,
  // })

  // await db.value?.execute(`INSERT INTO memory_test (vec) VALUES (${JSON.stringify(res.embedding)});`)
}))

function handleAnimationFinished() {
  if (stageModelRenderer.value !== 'vrm')
    return

  // Clear timers to prevent race conditions
  clearAnimationTimers()

  // Resume idle from ACT performance
  if (temporaryVrma.value) {
    temporaryVrma.value = null
  }

  // Cycle logic (Tier 1: Card Subset | Tier 2: Global)
  const cardIdleAnimations = activeCard.value?.extensions?.airi?.acting?.idleAnimations || []
  const hasCardSubset = cardIdleAnimations.length > 0
  if (vrmEffectiveIdleCycleEnabled.value) {
    const keys = hasCardSubset ? cardIdleAnimations : customVrmAnimationsStore.animationKeys

    // Fall back to the original full subset if none of the customized ones are currently valid
    const validKeys = keys.filter(k => customVrmAnimationsStore.animationKeys.includes(k))
    const finalKeys = validKeys.length > 0 ? validKeys : customVrmAnimationsStore.animationKeys

    const currentKey = vrmStore.vrmIdleAnimation
    const otherKeys = finalKeys.filter(key => key !== currentKey)

    // Selection
    if (finalKeys.length === 1) {
      vrmStore.vrmIdleAnimation = finalKeys[0]
    }
    else {
      const selection = otherKeys.length > 0 ? otherKeys : finalKeys
      const randomKey = selection[Math.floor(Math.random() * selection.length)]
      if (randomKey && vrmStore.vrmIdleAnimation !== randomKey) {
        vrmStore.vrmIdleAnimation = randomKey
      }
      else if (randomKey === vrmStore.vrmIdleAnimation && otherKeys.length > 0) {
        // Fallback safety if random picked the same one somehow
        vrmStore.vrmIdleAnimation = otherKeys[0]
      }
    }
  }
}

onUnmounted(() => {
  lipSyncStarted.value = false
  clearAnimationTimers()
})

// Resume audio context on first user interaction (browser requirement)
let audioContextResumed = false
function resumeAudioContextOnInteraction() {
  if (audioContextResumed || !audioContext)
    return
  audioContextResumed = true
  audioContext.resume().catch(() => {
    // Ignore errors - audio context will be resumed when needed
  })
}

// Add event listeners for user interaction
if (typeof window !== 'undefined') {
  const events = ['click', 'touchstart', 'keydown']
  events.forEach((event) => {
    window.addEventListener(event, resumeAudioContextOnInteraction, { once: true, passive: true })
  })
  window.addEventListener(resizeStateEventName, handleResizeStateChange as EventListener)
}

onMounted(async () => {
  db.value = drizzle({ connection: { bundles: getImportUrlBundles() } })
  await db.value.execute(`CREATE TABLE memory_test (vec FLOAT[768]);`)
})

function canvasElement() {
  if (stageModelRenderer.value === 'live2d')
    return live2dSceneRef.value?.canvasElement()

  else if (stageModelRenderer.value === 'vrm')
    return vrmViewerRef.value?.canvasElement()
}

function readRenderTargetRegionAtClientPoint(clientX: number, clientY: number, radius: number) {
  if (stageModelRenderer.value !== 'vrm')
    return null

  return vrmViewerRef.value?.readRenderTargetRegionAtClientPoint?.(clientX, clientY, radius) ?? null
}

async function captureFrame() {
  const charBlob = await (stageModelRenderer.value === 'live2d'
    ? live2dSceneRef.value?.captureFrame()
    : vrmViewerRef.value?.captureFrame())

  if (!activeBackgroundUrl.value || !charBlob)
    return charBlob

  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return charBlob

    // Load background image
    const bgImg = new Image()
    bgImg.crossOrigin = 'anonymous'
    bgImg.src = activeBackgroundUrl.value
    await new Promise((resolve, reject) => {
      bgImg.onload = resolve
      bgImg.onerror = reject
    })

    // Load character frame
    const charImg = await createImageBitmap(charBlob)

    // Match canvas size to the captured frame (respects DPI/Render Scale)
    canvas.width = charImg.width
    canvas.height = charImg.height

    // Draw background with "cover" logic
    const scale = Math.max(canvas.width / bgImg.width, canvas.height / bgImg.height)
    const w = bgImg.width * scale
    const h = bgImg.height * scale
    const x = (canvas.width - w) / 2
    const y = (canvas.height - h) / 2

    ctx.drawImage(bgImg, x, y, w, h)

    // Draw character on top
    ctx.drawImage(charImg, 0, 0)

    return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  }
  catch (error) {
    console.error('[Stage] Failed to composite photo with background:', error)
    return charBlob // Fallback to character-only
  }
}

onUnmounted(() => {
  if (lipSyncLoopId.value) {
    cancelAnimationFrame(lipSyncLoopId.value)
    lipSyncLoopId.value = undefined
  }

  chatHookCleanups.forEach(dispose => dispose?.())
  viewUpdateCleanups.forEach(dispose => dispose?.())
  void speechRuntimeStore.unregisterHost(speechPipeline)
  if (typeof window !== 'undefined') {
    window.removeEventListener(resizeStateEventName, handleResizeStateChange as EventListener)
  }
})

defineExpose({
  canvasElement,
  captureFrame,
  readRenderTargetRegionAtClientPoint,
})
</script>

<template>
  <div :class="['relative h-full w-full']">
    <!-- Scene Background Layer -->
    <div
      v-if="activeBackgroundUrl"
      :class="[
        'absolute left-0 top-0 z-0 h-full w-full',
        'transition-opacity duration-500',
      ]"
      :style="{
        backgroundImage: `url(${activeBackgroundUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }"
    />

    <div :class="['relative h-full w-full']">
      <Live2DScene
        v-if="stageModelRenderer === 'live2d'"
        ref="live2dSceneRef"
        v-model:state="componentState"
        :class="['min-w-50% <lg:full min-h-100 sm:100', 'h-full w-full flex-1']"
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :model-file="stageModelSelectedFile"
        :focus-at="focusAt"
        :mouth-open-size="mouthOpenSize"
        :paused="paused"
        :x-offset="xOffset"
        :y-offset="yOffset"
        :scale="scale"
        :disable-focus-at="live2dDisableFocus"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
        :live2d-max-fps="live2dMaxFps"
      />
      <ThreeScene
        v-if="stageModelRenderer === 'vrm'"
        ref="vrmViewerRef"
        v-model:state="componentState"
        :model-src="stageModelSelectedUrl"
        :model-identity="stageModelSelected"
        :idle-animation="vrmActiveAnimation"
        :idle-cycle-enabled="vrmEffectiveIdleCycleEnabled"
        :render-scale-override="isWindowResizing ? reducedRenderScale : undefined"
        :class="['min-w-50% <lg:full min-h-100 sm:100', 'h-full w-full flex-1']"
        :paused="paused"
        :show-axes="stageViewControlsEnabled"
        :current-audio-source="currentAudioSource"
        @error="console.error"
        @binary-loaded="vhackStore.setSourceArrayBuffer"
        @finished="handleAnimationFinished"
        @play-status="handleAnimationPlayStatus"
      />
    </div>
  </div>
</template>
