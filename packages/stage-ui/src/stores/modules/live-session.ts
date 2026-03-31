import type { ChatAssistantMessage, ChatStreamEventContext, StreamingAssistantMessage } from '../../types/chat'

import { useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'

import { useLlmmarkerParser } from '../../composables/llm-marker-parser'
import { createStreamingCategorizer } from '../../composables/response-categoriser'
import { useChatOrchestratorStore } from '../chat'
import { useChatContextStore } from '../chat/context-store'
import { useChatSessionStore } from '../chat/session-store'
import { useProvidersStore } from '../providers'
import { useAiriCardStore } from './airi-card'
import { useVisionStore } from './vision'

const MODEL = 'models/gemini-3.1-flash-live-preview'
const LIVE_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'

export const useLiveSessionStore = defineStore('live-session', () => {
  const providersStore = useProvidersStore()
  const chatSession = useChatSessionStore()
  const chatOrchestrator = useChatOrchestratorStore()
  const chatContext = useChatContextStore()
  const airiCard = useAiriCardStore()

  const isActive = ref(false)
  const isConnecting = ref(false)
  const messages = ref<Array<{ role: 'user' | 'assistant', text: string }>>([])
  const lastTranscript = ref('')
  const voiceTokens = useLocalStorage('settings/gemini/voice-tokens', 0)
  const inferenceTokens = useLocalStorage('settings/gemini/inference-tokens', 0)
  const totalTokens = computed(() => voiceTokens.value + inferenceTokens.value)
  const tokenDetails = ref<any[]>([])
  const voiceName = ref<'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede' | 'Ursa'>('Puck')
  const isGroundingEnabled = ref(false)
  const error = ref<string | null>(null)

  const socket = shallowRef<WebSocket | null>(null)

  // Streaming State for hooking into the Chat Orchestrator's TTS
  let currentStreamingMessage: StreamingAssistantMessage | null = null
  let currentStreamContext: ChatStreamEventContext | null = null
  let currentCategoriser: ReturnType<typeof createStreamingCategorizer> | null = null
  let currentMarkerParser: ReturnType<typeof useLlmmarkerParser> | null = null
  let streamPosition = 0

  function getApiKey(): string {
    const creds = providersStore.getProviderConfig('google-generative-ai')
    const key = typeof creds?.apiKey === 'string' ? creds.apiKey.trim() : ''
    return key
  }

  function start() {
    if (socket.value || isConnecting.value)
      return

    const apiKey = getApiKey()
    if (!apiKey) {
      error.value = 'No API key found for "Google Gemini" provider. Please configure it under Settings → Providers.'
      console.error('[LiveSession]', error.value)
      return
    }

    error.value = null
    console.log('[LiveSession] Starting Gemini Live session...')
    isConnecting.value = true

    const endpoint = `${LIVE_WS_BASE}?key=${apiKey}`
    const ws = new WebSocket(endpoint)
    socket.value = ws

    ws.onopen = () => {
      console.log('[LiveSession] WebSocket connected. Sending setup...')

      const setupMessage = {
        setup: {
          model: MODEL,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceName.value,
                },
              },
            },
          },
          tools: isGroundingEnabled.value
            ? [
                { google_search_retrieval: {} },
              ]
            : [],
          systemInstruction: {
            parts: [{
              text: airiCard.systemPrompt || 'You are an AI assistant.',
            }],
          },
        },
      }

      ws.send(JSON.stringify(setupMessage))
    }

    ws.onmessage = async (event) => {
      const data = typeof event.data === 'string' ? event.data : await (event.data as Blob).text()
      try {
        const response = JSON.parse(data)

        if (response.setupComplete) {
          console.log('[LiveSession] Setup complete!')
          isActive.value = true
          isConnecting.value = false
        }

        if (response.serverContent) {
          const content = response.serverContent

          // Detect new turn start
          if ((content.modelTurn || content.outputTranscription) && !currentStreamingMessage) {
            const id = nanoid()
            currentStreamingMessage = reactive({
              role: 'assistant',
              content: '',
              slices: [],
              tool_results: [],
              createdAt: Date.now(),
              id,
            }) as StreamingAssistantMessage

            // Fake a context snapshot so standard chat hooks don't break
            currentStreamContext = {
              message: currentStreamingMessage,
              input: { type: 'input:text', data: { text: '' } },
              contexts: chatContext.getContextsSnapshot(),
              composedMessage: [],
            }

            currentCategoriser = createStreamingCategorizer('google-generative-ai')
            streamPosition = 0

            // NOTICE: The marker parser strips <|ACT:...|> special tokens BEFORE
            // the categorizer sees the text. This mirrors the real chat.ts pipeline:
            // raw text → useLlmmarkerParser → categorizer → TTS hooks.
            // Without this layer, ACT/DELAY markers bleed into speech output.
            currentMarkerParser = useLlmmarkerParser({
              onLiteral: async (literalText) => {
                if (!currentStreamingMessage || !currentCategoriser || !currentStreamContext)
                  return

                currentCategoriser.consume(literalText)
                const speechOnly = currentCategoriser.filterToSpeech(literalText, streamPosition)
                streamPosition += literalText.length

                // Update the in-memory streaming message content
                if (speechOnly) {
                  currentStreamingMessage!.content = (currentStreamingMessage!.content as string) + speechOnly
                  const lastSlice = (currentStreamingMessage as any).slices.at(-1)
                  if (lastSlice?.type === 'text') {
                    lastSlice.text += speechOnly
                  }
                  else {
                    ;(currentStreamingMessage as any).slices.push({ type: 'text', text: speechOnly })
                  }
                }

                // Send token out to Chat Orchestrator (triggers TTS per-word)
                if (speechOnly.trim() || speechOnly.includes(' ')) {
                  await chatOrchestrator.emitTokenLiteralHooks(speechOnly, currentStreamContext!)
                }
              },
              onSpecial: async (special) => {
                // ACT/DELAY markers are handled here — emit as special tokens
                // so the stage orchestrator can process expressions/animations
                if (currentStreamContext) {
                  await chatOrchestrator.emitTokenSpecialHooks(special, currentStreamContext)
                }
              },
            })

            // Trigger TTS pipeline prep/reset
            await chatOrchestrator.emitBeforeMessageComposedHooks('', currentStreamContext)
          }

          // Handle transcription text as a streaming delta
          if (content.outputTranscription?.text) {
            const textDelta = content.outputTranscription.text
            lastTranscript.value = textDelta

            // Feed raw delta through the marker parser — it will call onLiteral/onSpecial
            // which drives the categorizer and TTS hooks above.
            if (currentMarkerParser) {
              await currentMarkerParser.consume(textDelta)
            }
          }

          if (content.turnComplete) {
            if (currentStreamingMessage && currentStreamContext) {
              // Flush any buffered tail from the marker parser before finalizing
              if (currentMarkerParser) {
                await currentMarkerParser.end()
              }

              const fullText = (currentStreamingMessage.content as string) || ''
              // Finish the turn
              messages.value.push({ role: 'assistant', text: fullText })

              chatSession.inscribeTurn({
                id: currentStreamingMessage.id,
                role: 'assistant',
                content: fullText,
                slices: currentStreamingMessage.slices as any,
                tool_results: currentStreamingMessage.tool_results as any,
                createdAt: currentStreamingMessage.createdAt,
              } as ChatAssistantMessage)

              await chatOrchestrator.emitStreamEndHooks(currentStreamContext)
              await chatOrchestrator.emitAssistantResponseEndHooks(fullText, currentStreamContext)

              currentStreamingMessage = null
              currentStreamContext = null
              currentCategoriser = null
              currentMarkerParser = null
              streamPosition = 0
            }
          }
        }

        if (response.usageMetadata) {
          voiceTokens.value = response.usageMetadata.totalTokenCount ?? 0
          tokenDetails.value = response.usageMetadata.responseTokensDetails ?? []
          console.debug(
            `[LiveSession] usageMetadata: voiceTokens=${voiceTokens.value}, inferenceTokens=${inferenceTokens.value}, totalTokens=${totalTokens.value}`,
            tokenDetails.value,
          )
        }

        if (response.error) {
          console.error('[LiveSession] Server Error:', response.error)
          error.value = response.error.message ?? JSON.stringify(response.error)
        }
      }
      catch (err) {
        console.error('[LiveSession] Parse Error:', err)
      }
    }

    ws.onclose = (event) => {
      console.log(`[LiveSession] WebSocket closed [${event.code}]: ${event.reason}`)
      reset()
    }

    ws.onerror = (err) => {
      console.error('[LiveSession] WebSocket Error:', err)
      error.value = 'WebSocket connection failed.'
      isConnecting.value = false
    }
  }

  function stop() {
    console.log('[LiveSession] Stopping session...')
    socket.value?.close()
    reset()
  }

  function sendText(text: string) {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN)
      return

    const message = {
      realtimeInput: { text },
    }

    socket.value.send(JSON.stringify(message))
    messages.value.push({ role: 'user', text })

    // Mirror the user's message into the shared chat session so WhisperDock
    // and the chat UI stay in sync during live mode.
    chatSession.inscribeTurn({
      id: nanoid(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
      slices: [],
      tool_results: [],
    } as any)
  }

  function toggle() {
    console.log('[LiveSession] Toggle requested. Current state:', { isActive: isActive.value, isConnecting: isConnecting.value })
    if (isActive.value || isConnecting.value) {
      stop()
    }
    else {
      start()
    }
  }

  function cycleVoice() {
    const voices: Array<typeof voiceName.value> = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Ursa']
    const currentIndex = voices.indexOf(voiceName.value)
    const nextIndex = (currentIndex + 1) % voices.length
    voiceName.value = voices[nextIndex]
    console.log('[LiveSession] Cycle voice:', voiceName.value)

    // If active, we'd need to restart to apply voice change (Gemini Live setup is immutable per session)
    if (isActive.value) {
      console.log('[LiveSession] Session active, restarting to apply voice change...')
      stop()
      setTimeout(start, 500)
    }
  }

  function recordInferenceUsage(tokens: number) {
    if (tokens > 0) {
      inferenceTokens.value += tokens
      console.log(`[LiveSession] Inference usage recorded: +${tokens}. New total inference: ${inferenceTokens.value}`)
    }
  }

  const estimatedCost = computed(() => {
    // Very rough estimate based on $0.15 per 1M tokens (Flash baseline)
    return (totalTokens.value / 1_000_000) * 0.15
  })

  function reset() {
    isActive.value = false
    isConnecting.value = false
    socket.value = null
    currentStreamingMessage = null
    currentStreamContext = null
    currentCategoriser = null
    currentMarkerParser = null
    streamPosition = 0
  }

  const visionStore = useVisionStore()
  const powerState = computed(() => {
    if (chatOrchestrator.sending || visionStore.status === 'capturing')
      return 'busy'
    if (isConnecting.value)
      return 'connecting'
    if (isActive.value)
      return 'active'
    if (visionStore.isWitnessEnabled)
      return 'ambient'
    return 'off'
  })

  return {
    isActive,
    isConnecting,
    messages,
    lastTranscript,
    totalTokens,
    tokenDetails,
    voiceName,
    isGroundingEnabled,
    estimatedCost,
    error,
    powerState,
    start,
    stop,
    toggle,
    cycleVoice,
    sendText,
    recordInferenceUsage,
    reset,
  }
})
