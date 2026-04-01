import type { Tool } from '@xsai/shared-chat'

import type { ChatAssistantMessage, ChatStreamEventContext, StreamingAssistantMessage } from '../../types/chat'

import { useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import { toast } from 'vue-sonner'

import { useLlmmarkerParser } from '../../composables/llm-marker-parser'
import { createStreamingCategorizer } from '../../composables/response-categoriser'
import { mcp } from '../../tools'
import { useChatOrchestratorStore } from '../chat'
import { useChatContextStore } from '../chat/context-store'
import { useChatSessionStore } from '../chat/session-store'
import { useProactivityStore } from '../proactivity'
import { useProvidersStore } from '../providers'
import { useAiriCardStore } from './airi-card'
import { useVisionStore } from './vision'

const MODEL = 'models/gemini-3.1-flash-live-preview'
const LIVE_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'

// Maximum tool calls allowed per turn chain before aborting to prevent recursive loops
const MAX_TOOL_CALLS_PER_TURN = 5

/**
 * Maps an AIRI tool (xsai Tool interface) to a Gemini functionDeclaration.
 * The xsai Tool already stores parameters as JSON Schema (produced by @xsai/tool from Zod),
 * so this is a direct structural mapping with no conversion needed.
 */
export function mapAiriToolToGemini(tool: Tool): Record<string, unknown> {
  // Purify the JSON Schema for Gemini's strict Bidi API requirements.
  // Standard xsai/zod schemas often include keywords Gemini rejects ($schema, additionalProperties).
  const params = tool.function.parameters ? JSON.parse(JSON.stringify(tool.function.parameters)) : { type: 'object', properties: {} }

  // Recursively clean the schema
  const cleanSchema = (obj: any) => {
    if (!obj || typeof obj !== 'object')
      return
    delete obj.$schema
    delete obj.additionalProperties
    if (obj.properties) {
      Object.values(obj.properties).forEach(cleanSchema)
    }
    if (obj.items) {
      cleanSchema(obj.items)
    }
  }

  cleanSchema(params)

  // Gemini requires the top-level parameters to be an object with type: 'object'
  if (params.type !== 'object') {
    params.type = 'object'
  }
  if (!params.properties) {
    params.properties = {}
  }

  return {
    name: tool.function.name,
    description: tool.function.description || '',
    parameters: params,
  }
}

export const useLiveSessionStore = defineStore('live-session', () => {
  const providersStore = useProvidersStore()
  const chatSession = useChatSessionStore()
  const chatOrchestrator = useChatOrchestratorStore()
  const chatContext = useChatContextStore()
  const proactivityStore = useProactivityStore()
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
  const isGroundingEnabled = useLocalStorage('settings/gemini/grounding', false)
  const error = ref<string | null>(null)

  const socket = shallowRef<WebSocket | null>(null)

  /**
   * Executes a single tool call from the Gemini Bidi stream.
   * Handles rate limiting, tool registry lookup, execution, and WebSocket response.
   * Called from BOTH wire format paths:
   *   1. Inline functionCall inside serverContent.modelTurn.parts[]
   *   2. Top-level response.toolCall.functionCalls[]
   */
  async function executeToolCall(
    ws: WebSocket,
    call: { name: string, args?: Record<string, unknown>, id?: string },
  ) {
    const { name, args, id: callId } = call
    console.log(`[LiveSession] 🛠️ Tool call received: ${name}`, args)

    if (toolCallCounter >= MAX_TOOL_CALLS_PER_TURN) {
      console.warn(`[LiveSession] ⚠️ Rate limit reached (${MAX_TOOL_CALLS_PER_TURN} calls). Skipping tool: ${name}`)
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          toolResponse: {
            functionResponses: [{
              id: callId,
              name,
              response: { error: `Tool call limit reached (${MAX_TOOL_CALLS_PER_TURN} per turn). Please respond to the user.` },
            }],
          },
        }))
      }
      return
    }

    toolCallCounter++

    try {
      // Resolve tools from the store's registry
      const allTools = await proactivityStore.resolveRegisteredTools()
      console.log(`[LiveSession] 🔍 Searching registry for "${name}" among ${allTools.length} tools...`)

      const matchedTool = (allTools as Tool[]).find(t => t.function.name === name)

      if (!matchedTool) {
        console.warn(`[LiveSession] ❌ Tool not found in registry: ${name}`)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            toolResponse: {
              functionResponses: [{
                id: callId,
                name,
                response: { error: `Tool "${name}" not found in registry.` },
              }],
            },
          }))
        }
        return
      }

      // Add 'executing' slice to the chat UI and trigger toast
      console.log(`[LiveSession] 🚀 Executing "${name}"...`)
      toast.info(`Executing tool: ${name}...`)

      if (currentStreamingMessage) {
        if (!currentStreamingMessage.slices)
          currentStreamingMessage.slices = []
        // TypeScript complains slice needs to be cast as any because types don't exactly align locally,
        // but ChatSlicesToolCall matches what we need for presentation layer here.
        ;(currentStreamingMessage.slices as any[]).push({
          type: 'tool-call',
          state: 'executing',
          toolCall: {
            toolName: name,
            args: JSON.stringify(args || {}),
            toolCallId: callId,
            toolCallType: 'function',
          },
        })
      }

      const result = await matchedTool.execute(
        args || {},
        {
          toolCallId: callId || nanoid(),
          messages: chatSession.messages as any,
          abortSignal: undefined as any,
        },
      )

      console.log(`[LiveSession] ✅ Tool "${name}" result:`, result)
      toast.success(`Tool ${name} completed.`)

      // Send the tool response back through the WebSocket
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          toolResponse: {
            functionResponses: [{
              id: callId,
              name,
              response: typeof result === 'string' ? { output: result } : result,
            }],
          },
        }))
      }

      // Inscribe tool result into the streaming message for history and update the slice state
      if (currentStreamingMessage) {
        const resultString = typeof result === 'string' ? result : JSON.stringify(result)

        if (!currentStreamingMessage.tool_results)
          currentStreamingMessage.tool_results = []
        ;(currentStreamingMessage.tool_results as any[]).push({
          toolCallId: callId,
          toolName: name,
          result: resultString,
        })

        // Find the slice we just pushed and mark it 'done'
        const executingSlice = (currentStreamingMessage.slices as any[]).find(
          s => s.type === 'tool-call' && s.toolCall?.toolCallId === callId,
        )
        if (executingSlice) {
          executingSlice.state = 'done'
          executingSlice.result = resultString
        }
      }
    }
    catch (err) {
      console.error(`[LiveSession] ❌ Tool "${name}" execution failed:`, err)

      if (currentStreamingMessage) {
        const executingSlice = (currentStreamingMessage.slices as any[]).find(
          s => s.type === 'tool-call' && s.toolCall?.toolCallId === callId,
        )
        if (executingSlice) {
          executingSlice.state = 'error'
          executingSlice.result = err instanceof Error ? err.message : String(err)
        }
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          toolResponse: {
            functionResponses: [{
              id: callId,
              name,
              response: { error: err instanceof Error ? err.message : String(err) },
            }],
          },
        }))
      }
    }
  }

  // Streaming State for hooking into the Chat Orchestrator's TTS
  let currentStreamingMessage: StreamingAssistantMessage | null = null
  let currentStreamContext: ChatStreamEventContext | null = null
  let currentCategoriser: ReturnType<typeof createStreamingCategorizer> | null = null
  let currentMarkerParser: ReturnType<typeof useLlmmarkerParser> | null = null
  let streamPosition = 0

  // Rate limiter: counts tool-call invocations within the current turn chain.
  // Resets on every new user utterance (voice or text).
  let toolCallCounter = 0

  // Cached resolved tools for the active session (resolved on connect, used for execution)
  let resolvedToolRegistry: Tool[] = []

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

    ws.onopen = async () => {
      console.log('[LiveSession] WebSocket connected. Resolving tools and sending setup...')

      // Resolve the full AIRI toolchain: proactive tools + MCP tools
      const proactiveTools = await proactivityStore.resolveRegisteredTools() as Tool[]
      const mcpTools = await mcp() as Tool[]
      resolvedToolRegistry = [...proactiveTools, ...mcpTools]

      // Build the Gemini tools array
      const geminiTools: Record<string, unknown>[] = []

      // Always inject proactive + MCP tools as functionDeclarations
      if (resolvedToolRegistry.length > 0) {
        geminiTools.push({
          functionDeclarations: resolvedToolRegistry.map(mapAiriToolToGemini),
        })
        console.log('[LiveSession] Injecting tools:', resolvedToolRegistry.map(t => t.function.name))
      }

      // Only inject google_search when the grounding toggle is enabled (cost-aware)
      if (isGroundingEnabled.value) {
        geminiTools.push({ google_search: {} })
        console.log('[LiveSession] Google Search grounding ENABLED')
      }

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
          tools: geminiTools.length > 0 ? geminiTools : undefined,
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

          // NOTICE: In the raw WebSocket format (not the Google SDK), tool calls can arrive
          // as `functionCall` parts INSIDE `serverContent.modelTurn.parts[]`.
          // This is the format verified in our POC (03-function-calling.ts, line 82).
          // The model may first emit text parts, then follow with a functionCall part
          // in the same modelTurn — we must scan for both.
          if (content.modelTurn?.parts) {
            for (const part of content.modelTurn.parts) {
              // Check both camelCase and snake_case variants (API inconsistency)
              const funcCall = part.functionCall || part.function_call
              if (funcCall && ws) {
                await executeToolCall(ws, {
                  name: funcCall.name,
                  args: funcCall.args,
                  id: funcCall.id,
                })
              }
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

          // Capture grounding metadata from google_search for future UI citation rendering
          if (content.groundingMetadata) {
            console.log('[LiveSession] Grounding metadata received:', JSON.stringify(content.groundingMetadata, null, 2))

            // Extract chunks/sources if available
            const chunks = content.groundingMetadata.groundingChunks || []
            const searchQueries = content.groundingMetadata.searchEntryPoints?.map((sep: any) => sep.renderedContent).filter(Boolean) || []

            if (currentStreamingMessage) {
              if (!currentStreamingMessage.grounding) {
                currentStreamingMessage.grounding = {
                  queries: [],
                  chunks: [],
                }
              }

              // De-duplicate and add queries
              searchQueries.forEach((q: string) => {
                if (!currentStreamingMessage!.grounding!.queries.includes(q))
                  currentStreamingMessage!.grounding!.queries.push(q)
              })

              // Add chunks (sources)
              chunks.forEach((chunk: any) => {
                if (chunk.web) {
                  currentStreamingMessage!.grounding!.chunks.push({
                    title: chunk.web.title,
                    uri: chunk.web.uri,
                  })
                }
              })
            }
          }
        }

        // Handle tool calls from the model (top-level toolCall in the Bidi stream)
        // NOTICE: This is the format the Google GenAI SDK normalizes to.
        // Different from the inline format above — we handle BOTH paths.
        if (response.toolCall) {
          const { functionCalls } = response.toolCall
          if (functionCalls && Array.isArray(functionCalls) && ws) {
            for (const call of functionCalls) {
              await executeToolCall(ws, {
                name: call.name,
                args: call.args,
                id: call.id,
              })
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
      console.warn(`[LiveSession] WebSocket CLOSED! Code: ${event.code}, Reason: ${event.reason || 'None provided'}`)

      // Surface 1011 or Internal Error specifically
      if (event.code === 1011 || (event.reason && event.reason.includes('Internal error'))) {
        toast.error(`Gemini Live API Error: Internal error encountered. Check your API key.`)
      }
      else if (event.code !== 1000) {
        toast.error(`Gemini Live Disconnected (Code ${event.code})`)
      }

      reset()
    }

    ws.onerror = (event) => {
      console.error(`[LiveSession] WebSocket ENCOUNTERED AN ERROR!`, event)
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
    console.log(`[LiveSession] sendText() called. socket.readyState:`, socket.value?.readyState)
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.error(`[LiveSession] Cannot sendText. Socket is invalid or not OPEN.`)
      return
    }

    const message = {
      realtimeInput: { text },
    }

    console.log(`[LiveSession] Sending payload:`, JSON.stringify(message))
    try {
      socket.value.send(JSON.stringify(message))
      console.log(`[LiveSession] Payload sent successfully via WebSocket.`)
    }
    catch (err) {
      console.error(`[LiveSession] FAILED to send WebSocket payload!`, err)
    }

    messages.value.push({ role: 'user', text })

    // Reset tool-call rate limit counter on every new user utterance
    toolCallCounter = 0

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
    toolCallCounter = 0
    resolvedToolRegistry = []
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
