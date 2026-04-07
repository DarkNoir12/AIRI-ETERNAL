import type { TextSegment, TextToken } from '@proj-airi/pipelines-audio'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions } from 'unspeech'

import { createPlaybackManager, createPushStream, createSpeechPipeline } from '@proj-airi/pipelines-audio'
import { useAudioContext, useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSpeechRuntimeStore } from '@proj-airi/stage-ui/stores/speech-runtime'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref } from 'vue'

function sanitizeForTts(text: string): string {
  return text
    .replace(/\[[\s\S]*?\]/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/```[\s\S]*$/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\*\*?([^*]+)\*\*?/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`[^`]*`/g, '')
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/[\x00-\x08\v\f\x0E-\x1F\x7F]/g, '')
    .replace(/\uFFFD/g, '')
    .trim()
}

function createSentenceSegmenter(tokens: ReadableStream<TextToken>, meta: { streamId: string, intentId: string }): ReadableStream<TextSegment> {
  const { stream, write, close } = createPushStream<TextSegment>()
  let buffer = ''
  let sequence = 0
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
        if (value.type === 'special')
          continue
        buffer += value.value ?? ''
        SENTENCE_BOUNDARY.lastIndex = 0
        const match = SENTENCE_BOUNDARY.exec(buffer)
        if (match) {
          const sentenceEnd = match.index + match[0].length
          const sentence = buffer.slice(0, sentenceEnd).replace(/\[[\s\S]*?\]/g, '').replace(/<[^>]*>/g, '').replace(/[\n\r\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
          if (sentence.length >= 2) {
            sequence++
            write({ text: sentence, special: null, streamId: meta.streamId, intentId: meta.intentId, segmentId: `seg-${sequence}`, reason: 'flush', createdAt: Date.now() })
          }
          buffer = buffer.slice(sentenceEnd)
        }
        if (buffer.length > 150) {
          const lastSpace = buffer.lastIndexOf(' ', 150)
          if (lastSpace > 20) {
            const forced = buffer.slice(0, lastSpace).trim()
            if (forced.length >= 2) {
              sequence++
              write({ text: forced, special: null, streamId: meta.streamId, intentId: meta.intentId, segmentId: `seg-${sequence}`, reason: 'limit', createdAt: Date.now() })
            }
            buffer = buffer.slice(lastSpace + 1)
          }
        }
      }
      if (buffer.trim()) {
        const clean = buffer.trim().replace(/\[[\s\S]*?\]/g, '').replace(/<[^>]*>/g, '').trim()
        if (clean.length >= 2) {
          sequence++
          write({ text: clean, special: null, streamId: meta.streamId, intentId: meta.intentId, segmentId: `seg-${sequence}`, reason: 'flush', createdAt: Date.now() })
        }
      }
    }
    finally {
      reader.releaseLock()
      close()
    }
  })()

  return stream
}

export function useChatSpeechBridge() {
  const { audioContext } = useAudioContext()
  const { mouthOpenSize } = storeToRefs(useSpeakingStore())
  const providersStore = useProvidersStore()
  const speechStore = useSpeechStore()
  const speechRuntimeStore = useSpeechRuntimeStore()
  const { ssmlEnabled, activeSpeechProvider, activeSpeechModel, activeSpeechVoice, pitch } = storeToRefs(speechStore)
  const { onBeforeMessageComposed, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatOrchestratorStore()

  const currentAudioSource = ref<AudioBufferSourceNode>()
  const nowSpeaking = ref(false)
  let currentChatIntent: ReturnType<typeof speechRuntimeStore.openIntent> | null = null
  const chatHookCleanups: Array<() => void> = []

  async function playFunction(item: Parameters<Parameters<typeof createPlaybackManager<AudioBuffer>>[0]['play']>[0], signal: AbortSignal): Promise<void> {
    if (!audioContext || !item.audio)
      return
    if (audioContext.state === 'suspended') {
      try { await audioContext.resume() }
      catch { return }
    }
    const source = audioContext.createBufferSource()
    currentAudioSource.value = source
    source.buffer = item.audio
    source.connect(audioContext.destination)

    return new Promise<void>((resolve) => {
      let settled = false
      const resolveOnce = () => {
        if (settled)
          return; settled = true; resolve()
      }
      const stopPlayback = () => {
        try { source.stop(); source.disconnect() }
        catch {} if (currentAudioSource.value === source)
          currentAudioSource.value = undefined; resolveOnce()
      }
      if (signal.aborted) { stopPlayback(); return }
      signal.addEventListener('abort', stopPlayback, { once: true })
      source.onended = () => { signal.removeEventListener('abort', stopPlayback); stopPlayback() }
      try { source.start(0) }
      catch { stopPlayback() }
    })
  }

  const playbackManager = createPlaybackManager<AudioBuffer>({
    play: playFunction,
    maxVoices: 1,
    maxVoicesPerOwner: 1,
    overflowPolicy: 'queue',
    ownerOverflowPolicy: 'steal-oldest',
  })

  const speechPipeline = createSpeechPipeline<AudioBuffer>({
    segmenter: createSentenceSegmenter,
    tts: async (request, signal) => {
      if (signal.aborted)
        return null
      if (activeSpeechProvider.value === 'speech-noop' || !activeSpeechProvider.value)
        return null

      const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
      if (!provider)
        return null
      if (!request.text && !request.special)
        return null

      const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)
      let model = activeSpeechModel.value
      let voice = activeSpeechVoice.value

      if (activeSpeechProvider.value === 'openai-compatible-audio-speech') {
        model = model || providerConfig?.model as string || 'tts-1'
        if (!voice && providerConfig?.voice) {
          voice = { id: providerConfig.voice as string, name: providerConfig.voice as string, description: providerConfig.voice as string, previewURL: '', languages: [{ code: 'en', title: 'English' }], provider: activeSpeechProvider.value, gender: 'neutral' }
        }
      }

      if (activeSpeechProvider.value === 'chatterbox') {
        model = model || providerConfig?.model as string || 'chatterbox-turbo'
        if (!voice && providerConfig?.voice) {
          voice = { id: providerConfig.voice as string, name: providerConfig.voice as string, description: providerConfig.voice as string, previewURL: '', languages: [{ code: 'en', title: 'English' }], provider: activeSpeechProvider.value, gender: 'neutral' }
        }
      }

      if (activeSpeechProvider.value === 'omnivoice') {
        model = model || providerConfig?.model as string || 'omnivoice'
        if (!voice) {
          if (providerConfig?.voice) {
            voice = { id: providerConfig.voice as string, name: providerConfig.voice as string, description: providerConfig.voice as string, previewURL: '', languages: [{ code: 'en', title: 'English' }], provider: activeSpeechProvider.value, gender: 'neutral' }
          }
          else {
            voice = { id: 'default', name: 'Default Voice', description: 'OmniVoice default voice', previewURL: '', languages: [{ code: 'en', title: 'English' }], provider: activeSpeechProvider.value, gender: 'neutral' }
          }
        }
      }

      if (!model || !voice)
        return null

      const input = ssmlEnabled.value && speechStore.supportsSSML
        ? speechStore.generateSSML(request.text, voice, { ...providerConfig, pitch: pitch.value })
        : sanitizeForTts(request.text)

      if (!input || !input.trim())
        return null

      try {
        const speechOptions: Record<string, unknown> = {
          ...provider.speech(model, providerConfig),
          input,
          voice: voice.id,
        }
        if (activeSpeechProvider.value === 'chatterbox')
          speechOptions.responseFormat = 'wav'
        const res = await generateSpeech(speechOptions as Parameters<typeof generateSpeech>[0])
        if (signal.aborted || !res || res.byteLength === 0)
          return null
        return await audioContext.decodeAudioData(res)
      }
      catch {
        return null
      }
    },
    playback: playbackManager,
  })

  void speechRuntimeStore.registerHost(speechPipeline)

  playbackManager.onEnd(() => { nowSpeaking.value = false; mouthOpenSize.value = 0 })
  playbackManager.onStart(() => { nowSpeaking.value = true })

  function ensureSpeechIntent() {
    if (currentChatIntent)
      return currentChatIntent
    currentChatIntent = speechRuntimeStore.openIntent({ ownerId: 'chat-window', priority: 'normal', behavior: 'interrupt' })
    return currentChatIntent
  }

  chatHookCleanups.push(onBeforeMessageComposed(async () => {
    speechPipeline.stopAll('new-message')
    if (currentChatIntent) { currentChatIntent.cancel('new-message'); currentChatIntent = null }
    ensureSpeechIntent()
  }))

  chatHookCleanups.push(onTokenLiteral(async (literal) => {
    const intent = ensureSpeechIntent()
    if (!intent)
      return
    intent.writeLiteral(literal)
  }))

  chatHookCleanups.push(onTokenSpecial(async (special) => {
    const intent = ensureSpeechIntent()
    if (!intent)
      return
    intent.writeSpecial(special)
  }))

  chatHookCleanups.push(onStreamEnd(async () => {
    const intent = ensureSpeechIntent()
    intent?.writeFlush()
  }))

  chatHookCleanups.push(onAssistantResponseEnd(async () => {
    currentChatIntent?.end()
    currentChatIntent = null
  }))

  onMounted(() => {
    const resumeAudio = () => { audioContext?.resume().catch(() => {}) }
    window.addEventListener('click', resumeAudio, { once: true })
  })

  onUnmounted(() => {
    chatHookCleanups.forEach(d => d?.())
    void speechRuntimeStore.unregisterHost(speechPipeline)
  })
}
