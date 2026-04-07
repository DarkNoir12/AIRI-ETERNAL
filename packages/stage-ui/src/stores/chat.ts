import type { WebSocketEventInputs } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, Message, ToolMessage } from '@xsai/shared-chat'

import type { ChatAssistantMessage, ChatSlices, ChatStreamEventContext } from '../types/chat'
import type { StreamEvent, StreamOptions } from './llm'

import { healMozibake } from '@proj-airi/stage-shared'
import { createQueue } from '@proj-airi/stream-kit'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { reactive, ref, toRaw } from 'vue'

import { useAnalytics } from '../composables'
import { createLlmJsonInterceptor } from '../composables/llm-json-interceptor'
import { useLlmmarkerParser } from '../composables/llm-marker-parser'
import { categorizeResponse, createStreamingCategorizer } from '../composables/response-categoriser'
import { createDatetimeContext, createExpressionsContext, createScenesContext, createStickersContext } from './chat/context-providers'
import { useChatContextStore } from './chat/context-store'
import { createChatHooks } from './chat/hooks'
import { useChatSessionStore } from './chat/session-store'
import { useChatStreamStore } from './chat/stream-store'
import { useLLM } from './llm'
import { useAiriCardStore } from './modules/airi-card'
import { useConsciousnessStore } from './modules/consciousness'
import { useLiveSessionStore } from './modules/live-session'
import { useVisionStore } from './modules/vision'
import { useProactivityStore } from './proactivity'
import { useProvidersStore } from './providers'
import { useSettingsChat } from './settings/chat'

export interface SendOptions {
  model?: string
  chatProvider?: string | ChatProvider
  providerConfig?: Record<string, unknown>
  attachments?: { type: 'image', data: string, mimeType: string }[]
  tools?: StreamOptions['tools']
  input?: WebSocketEventInputs
  /**
   * If true, the orchestrator will only ingest the user message into the session
   * and skip triggering the assistant's response.
   */
  skipAssistant?: boolean
}

interface ForkOptions {
  fromSessionId?: string
  atIndex?: number
  reason?: string
  hidden?: boolean
}

interface QueuedSend {
  sendingMessage: string
  options: SendOptions
  generation: number
  sessionId: string
  cancelled?: boolean
  deferred: {
    resolve: () => void
    reject: (error: unknown) => void
  }
}

// NOTICE: gated to DEV builds to avoid console spam during streaming in production.
const chatLog = import.meta.env.DEV ? console.log.bind(console, '[ChatDebug]') : () => {}

// NOTICE: The hooks event bus is intentionally a module-level singleton, NOT created
// inside the defineStore setup function. During Vite HMR, Pinia re-runs the store's
// setup function which would create a new hooks instance. Long-lived components like
// Stage.vue that subscribed to the old hooks would be stranded on a defunct event bus,
// causing LLM responses to stop reaching the TTS pipeline ("chat text visible, no audio").
// Keeping hooks at module scope ensures listeners survive store re-instantiation.
const hooks = createChatHooks()

export const useChatOrchestratorStore = defineStore('chat-orchestrator', () => {
  const llmStore = useLLM()
  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()
  const visionStore = useVisionStore()
  const airiCardStore = useAiriCardStore()
  const settingsChat = useSettingsChat()
  const { activeProvider, activeModel } = storeToRefs(consciousnessStore)
  const { activeCard } = storeToRefs(airiCardStore)
  const { trackFirstMessage } = useAnalytics()

  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatContext = useChatContextStore()
  const { activeSessionId } = storeToRefs(chatSession)
  const { streamingMessage } = storeToRefs(chatStream)

  const sending = ref(false)
  const pendingQueuedSends = ref<QueuedSend[]>([])

  const sendQueue = createQueue<QueuedSend>({
    handlers: [
      async ({ data }) => {
        const { sendingMessage, options, generation, deferred, sessionId, cancelled } = data

        if (cancelled)
          return

        if (chatSession.getSessionGeneration(sessionId) !== generation) {
          deferred.reject(new Error('Chat session was reset before send could start'))
          return
        }

        try {
          await performSend(sendingMessage, options, generation, sessionId)
          deferred.resolve()
        }
        catch (error) {
          deferred.reject(error)
        }
      },
    ],
  })

  sendQueue.on('enqueue', (queuedSend) => {
    pendingQueuedSends.value = [...pendingQueuedSends.value, queuedSend]
  })

  sendQueue.on('dequeue', (queuedSend) => {
    pendingQueuedSends.value = pendingQueuedSends.value.filter(item => item !== queuedSend)
  })

  async function performSend(
    sendingMessage: string,
    options: SendOptions,
    generation: number,
    sessionId: string,
  ) {
    chatLog('performSend starting with message:', sendingMessage)

    if (!sendingMessage && !options.attachments?.length)
      return

    chatSession.ensureSession(sessionId)

    // Inject current datetime context before composing the message
    chatContext.ingestContextMessage(createDatetimeContext())
    chatContext.ingestContextMessage(createStickersContext())
    chatContext.ingestContextMessage(createScenesContext())
    chatContext.ingestContextMessage(createExpressionsContext())

    const sendingCreatedAt = Date.now()
    const streamingMessageContext: ChatStreamEventContext = {
      message: { role: 'user', content: sendingMessage, createdAt: sendingCreatedAt, id: nanoid() },
      contexts: chatContext.getContextsSnapshot(),
      composedMessage: [],
      input: options.input,
    }

    const isStaleGeneration = () => chatSession.getSessionGeneration(sessionId) !== generation
    const shouldAbort = () => isStaleGeneration()
    if (shouldAbort())
      return

    const isForegroundSession = () => sessionId === activeSessionId.value

    const buildingMessage: ChatAssistantMessage = reactive({
      role: 'assistant',
      content: '',
      slices: [],
      tool_results: [],
      createdAt: Date.now(),
      id: nanoid(),
    })

    const updateUI = () => {
      if (isForegroundSession()) {
        streamingMessage.value = JSON.parse(JSON.stringify(buildingMessage))
      }
    }

    updateUI()
    trackFirstMessage()

    const proactivityStore = useProactivityStore()
    proactivityStore.incrementMetric('chat')
    let streamIdleTimeout: ReturnType<typeof setTimeout> | undefined

    try {
      sending.value = true
      let effectiveModel = options.model || activeModel.value
      let effectiveProvider: any = typeof options.chatProvider === 'string'
        ? await providersStore.getProviderInstance(options.chatProvider)
        : (options.chatProvider || await providersStore.getProviderInstance(activeProvider.value))
      let effectiveProviderId = activeProvider.value
      let effectiveConfig = options.providerConfig
      let effectiveTools = options.tools

      const isVlmTurn = !!(options.attachments && options.attachments.some(a => a.type === 'image') && visionStore.activeProvider && visionStore.activeModel)
      let promptShimText = ''
      if (isVlmTurn) {
        chatLog('Vision handover activated. Replacing main LLM with Vision VLM.', {
          provider: visionStore.activeProvider,
          model: visionStore.activeModel,
        })
        effectiveModel = visionStore.activeModel
        effectiveProviderId = visionStore.activeProvider
        effectiveProvider = await providersStore.getProviderInstance(visionStore.activeProvider)
        effectiveConfig = providersStore.getProviderConfig(visionStore.activeProvider)
        promptShimText = visionStore.promptShim || ''
        effectiveTools = undefined // Vision models often do not support tools, and we only need them for direct reply
      }

      const userText = promptShimText
        ? `${promptShimText}\n\n${sendingMessage}`
        : sendingMessage

      const inferenceContentParts: CommonContentPart[] = [{ type: 'text', text: userText }]
      const historicalContentParts: CommonContentPart[] = [{ type: 'text', text: sendingMessage }]

      if (options.attachments) {
        for (const attachment of options.attachments) {
          if (attachment.type === 'image') {
            const imagePart = {
              type: 'image_url' as const,
              image_url: {
                url: `data:${attachment.mimeType};base64,${attachment.data}`,
              },
            }
            inferenceContentParts.push(imagePart)
            historicalContentParts.push(imagePart)
          }
        }
      }

      const inferenceContent = inferenceContentParts.length > 1 ? inferenceContentParts : userText
      const historicalContent = historicalContentParts.length > 1 ? historicalContentParts : sendingMessage
      if (!streamingMessageContext.input) {
        streamingMessageContext.input = {
          type: 'input:text',
          data: {
            text: sendingMessage,
          },
        }
      }

      if (shouldAbort())
        return

      const userMessageId = nanoid()
      const historicalUserMessage = { role: 'user' as const, content: historicalContent, createdAt: sendingCreatedAt, id: userMessageId }
      const inferenceUserMessage = { role: 'user' as const, content: inferenceContent, createdAt: sendingCreatedAt, id: userMessageId }

      const sessionMessagesForSend = chatSession.getSessionMessages(sessionId)
      const nextMessages = [...sessionMessagesForSend, historicalUserMessage]
      chatSession.setSessionMessages(sessionId, nextMessages)

      if (options.skipAssistant) {
        chatLog('skipAssistant is true, ending ingest.')
        return
      }

      let inferenceMessages = [...sessionMessagesForSend, inferenceUserMessage]

      // For VLM turns, trim history to save context/tokens.
      // Rule: System Message + last 6 conversation messages + current user input.
      if (isVlmTurn) {
        const systemMessage = inferenceMessages.find(m => m.role === 'system')
        const historyWithoutSystem = inferenceMessages.filter(m => m.role !== 'system' && m !== inferenceUserMessage)
        const trimmedHistory = historyWithoutSystem.slice(-6)

        inferenceMessages = systemMessage
          ? [systemMessage, ...trimmedHistory, inferenceUserMessage]
          : [...trimmedHistory, inferenceUserMessage]

        chatLog(`[ChatDebug] VLM turn detected. Trimmed history from ${sessionMessagesForSend.length + 1} to ${inferenceMessages.length} messages.`)
      }

      const categorizer = createStreamingCategorizer(effectiveProviderId)
      let streamPosition = 0

      const literalInterceptor = createLlmJsonInterceptor({
        onText: async (text) => {
          if (shouldAbort())
            return

          categorizer.consume(text)

          const speechOnly = categorizer.filterToSpeech(text, streamPosition)
          streamPosition += text.length

          const current = categorizer.getCurrent()
          if (current) {
            ;(buildingMessage as any).categorization = {
              speech: current.speech,
              reasoning: current.reasoning,
            }
          }

          if (speechOnly.trim()) {
            buildingMessage.content += speechOnly

            await hooks.emitTokenLiteralHooks(speechOnly, streamingMessageContext)

            const lastSlice = (buildingMessage as any).slices.at(-1)
            if (lastSlice?.type === 'text') {
              lastSlice.text += speechOnly
            }
            else {
              ;(buildingMessage as any).slices.push({
                type: 'text',
                text: speechOnly,
              })
            }
          }
          updateUI()
        },
        onJson: async (json) => {
          if (shouldAbort())
            return

          await hooks.emitWidgetHooks(json, streamingMessageContext)
        },
      })

      async function tryBridgeMarker(marker: string): Promise<boolean> {
        chatLog('tryBridgeMarker evaluating:', marker)
        // Supports: <|tool:args|>, [call_tool:tool, args], and hybrid <|tool:args</tool_call>
        const match = marker.match(/^<\|([\w-]+):([^|]*?)(?:\|>|<\/tool_call>|$)/)
          || marker.match(/^\[call_tool:([\w-]+),\s*([^\]]*?)(?:\]|<\/tool_call>|$)/)
          || marker.match(/<tool_call>([\w-]+)\((.*?)\)<\/tool_call>/s)
          || marker.match(/<tool_call>(\{.*?\})<\/tool_call>/s)

        if (!match)
          return false
        let toolName: string
        let argsRaw: string

        // check if it's the JSON flavor: <tool_call>{"name": "...", "arguments": "..."}</tool_call>
        const potentialJson = match[1] || ''
        if (potentialJson.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(potentialJson)
            toolName = parsed.name
            argsRaw = typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments)
          }
          catch (e) {
            console.error('[ChatDebug] Failed to parse JSON tool call tag:', e)
            return false
          }
        }
        else {
          toolName = match[1]
          argsRaw = match[2] || ''
        }
        const resolvedTools = typeof options.tools === 'function' ? await options.tools() : options.tools
        const tool = resolvedTools?.find(t => (t.function?.name || (t as any).name) === toolName)

        if (!tool)
          return false

        chatLog(`Bridging marker to tool call: ${toolName}`)
        try {
          const args: Record<string, any> = {}
          const kvRegex = /(?:^|[, \n\t]+)\s*([\w-]+)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|(\d+(?:\.\d+)?)|(true|false)|(\{.*\}|\[.*\]))/g
          let kvMatch

          while ((kvMatch = kvRegex.exec(argsRaw)) !== null) {
            const [, key, valDouble, valSingle, valNum, valBool, valComplex] = kvMatch
            if (valDouble !== undefined) {
              args[key] = valDouble
            }
            else if (valSingle !== undefined) {
              args[key] = valSingle
            }
            else if (valNum !== undefined) {
              args[key] = Number.parseFloat(valNum)
            }
            else if (valBool !== undefined) {
              args[key] = valBool === 'true'
            }
            else if (valComplex !== undefined) {
              try {
                args[key] = JSON.parse(valComplex.replace(/'/g, '"'))
              }
              catch {
                args[key] = valComplex
              }
            }
          }

          if (Object.keys(args).length === 0) {
            try {
              const cleaned = argsRaw.trim().replace(/^\{/, '').replace(/\}$/, '').replace(/(\w+):/g, '"$1":').replace(/'/g, '"')
              Object.assign(args, JSON.parse(`{${cleaned}}`))
            }
            catch {}
          }

          if (Object.keys(args).length > 0) {
            toolCallQueue.enqueue({
              type: 'tool-call',
              toolCall: {
                id: `bridge-${nanoid()}`,
                function: {
                  name: toolName,
                  arguments: JSON.stringify(args),
                },
              } as any,
              bridged: true,
            })
            return true
          }
        }
        catch (err) {
          console.error('[ChatDebug] Failed to bridge marker:', err)
        }
        return false
      }

      const parser = useLlmmarkerParser({
        onLiteral: async (text) => {
          chatLog('onLiteral:', text)
          if (shouldAbort())
            return

          // Catch hallucinated markers
          const literalMarkerMatch = text.match(/\[call_tool:[\w-]+,[^\]]+\]/)
            || text.match(/<\|([\w-]+):[^|]+\|>/)
            || text.match(/\[ACT:[\s\S]*?\]/)
            || text.match(/<tool_call>.*?<\/tool_call>/s)
            || text.match(/<\|[\w-]+:.*?<\/tool_call>/s)

          if (literalMarkerMatch) {
            const marker = literalMarkerMatch[0]
            if (await tryBridgeMarker(marker)) {
              text = text.replace(marker, '')
            }
          }

          if (text.trim()) {
            await literalInterceptor.consume(text)
          }
        },
        onSpecial: async (special) => {
          chatLog('onSpecial:', special)
          if (shouldAbort())
            return

          if (await tryBridgeMarker(special))
            return

          await hooks.emitTokenSpecialHooks(special, streamingMessageContext)
        },
        onEnd: async (fullText) => {
          chatLog('parser.onEnd triggered with fullText length:', fullText.length)
          if (isStaleGeneration())
            return

          const finalCategorization = categorizeResponse(fullText, activeProvider.value)

          ;(buildingMessage as any).categorization = {
            speech: finalCategorization.speech,
            reasoning: ((buildingMessage as any).categorization?.reasoning ?? '') + (finalCategorization.reasoning ? `\n\n${finalCategorization.reasoning}` : ''),
          }

          if (buildingMessage.content !== finalCategorization.speech) {
            buildingMessage.content = finalCategorization.speech
          }

          updateUI()
        },
        minLiteralEmitLength: 24,
      })

      const toolCallQueue = createQueue<ChatSlices>({
        handlers: [
          async (ctx) => {
            if (shouldAbort())
              return

            if (ctx.data.type === 'tool-call') {
              ;(buildingMessage.slices as any).push({
                ...ctx.data,
                state: 'executing',
              })
              updateUI()

              // Manuel execution for bridged tool calls
              if ((ctx.data as any).bridged) {
                const toolCall = (ctx.data as any).toolCall
                const resolvedTools = typeof options.tools === 'function' ? await options.tools() : options.tools
                const tool = resolvedTools?.find(t => (t.function?.name || (t as any).name) === toolCall.function.name)

                if (tool && (tool as any).execute) {
                  chatLog(`Manually executing bridged tool: ${toolCall.function.name}`)
                  try {
                    const result = await (tool as any).execute(JSON.parse(toolCall.function.arguments))
                    toolCallQueue.enqueue({
                      type: 'tool-call-result',
                      id: toolCall.id,
                      result: (typeof result === 'string' ? result : JSON.stringify(result)) as any,
                    })
                  }
                  catch (err) {
                    console.error(`[ChatDebug] Bridged tool execution failed: ${toolCall.function.name}`, err)
                    toolCallQueue.enqueue({
                      type: 'tool-call-result',
                      id: toolCall.id,
                      result: `Execution failed: ${err instanceof Error ? err.message : String(err)}`,
                    })
                  }
                }
                else {
                  console.warn(`[ChatDebug] Tool not found or not executable: ${toolCall.function.name}`)
                  toolCallQueue.enqueue({
                    type: 'tool-call-result',
                    id: toolCall.id,
                    result: `Error: Tool "${toolCall.function.name}" not found or not executable.`,
                  })
                }
              }

              return
            }

            if (ctx.data.type === 'tool-call-result') {
              const resultData = ctx.data as any
              buildingMessage.tool_results.push(resultData)

              const slice = buildingMessage.slices.find((s: any) => {
                if (s.type !== 'tool-call')
                  return false
                const tc = s.toolCall as any
                return tc.id === resultData.id || tc.toolCallId === resultData.id
              })
              if (slice && slice.type === 'tool-call') {
                slice.state = ctx.data.result?.toString().toLowerCase().includes('failed') ? 'error' : 'done'
                slice.result = ctx.data.result
              }

              updateUI()
            }
          },
        ],
      })

      let newMessages = inferenceMessages.map((msg: any) => {
        const { context: _context, id: _id, createdAt: _createdAt, ...withoutContext } = msg
        const rawMessage = toRaw(withoutContext)

        if (rawMessage.role === 'assistant') {
          const { slices: _slices, tool_results: _toolResults, categorization: _categorization, ...rest } = rawMessage as ChatAssistantMessage
          return toRaw(rest)
        }

        return rawMessage
      })

      const contextsSnapshot = chatContext.getContextsSnapshot()
      const groundingEnabled = activeCard.value?.extensions?.airi?.groundingEnabled
      const sensorPayload = groundingEnabled ? proactivityStore.sensorPayload : ''

      if (Object.keys(contextsSnapshot).length > 0 || sensorPayload) {
        const system = newMessages.slice(0, 1)
        const afterSystem = newMessages.slice(1, newMessages.length)

        let contextContent = ''
        if (Object.keys(contextsSnapshot).length > 0) {
          contextContent += 'These are the contextual information retrieved or on-demand updated from other modules:\n'
            + `${Object.entries(contextsSnapshot).map(([key, value]) => `Module ${key}: ${JSON.stringify(value)}`).join('\n')}\n`
        }

        if (sensorPayload) {
          contextContent += `${contextContent ? '\n---\n' : ''
          }[ENVIRONMENTAL AWARENESS]\n`
          + `The following telemetry describes your current environmental context. `
          + `Use it to stay grounded in the user's reality and inform your response. `
          + `You may reference specific values (like time or active applications) if relevant `
          + `to the conversation, but avoid a dry, technical recitation of the data.\n`
          + `---\n`
          + `${sensorPayload}\n`
        }

        newMessages = [
          ...system,
          {
            role: 'system',
            content: contextContent.trim(),
          },
          ...afterSystem,
        ]
      }

      streamingMessageContext.composedMessage = newMessages as Message[]

      await hooks.emitAfterMessageComposedHooks(sendingMessage, streamingMessageContext)
      await hooks.emitBeforeSendHooks(sendingMessage, streamingMessageContext)

      let fullText = ''
      const headers = (effectiveConfig?.headers || {}) as Record<string, string>
      const generationConfig = activeCard.value?.extensions?.airi?.generation
      const generationKnown = generationConfig?.enabled ? generationConfig.known : undefined
      const abortController = new AbortController()

      const clearStreamIdleTimeout = () => {
        if (streamIdleTimeout)
          clearTimeout(streamIdleTimeout)
      }

      const resetStreamIdleTimeout = () => {
        clearStreamIdleTimeout()
        streamIdleTimeout = setTimeout(() => {
          abortController.abort(new Error('Stream idle timeout exceeded'))
        }, settingsChat.streamIdleTimeoutMs)
      }

      if (shouldAbort())
        return

      resetStreamIdleTimeout()

      const providerModels = providersStore.getModelsForProvider(effectiveProviderId)
      const currentModel = providerModels.find(m => m.id === effectiveModel)
      const isVisionSupported = isVlmTurn || (currentModel?.capabilities?.includes('vision') || false)

      console.log(`[ChatDebug] Model: ${effectiveModel}, Provider: ${effectiveProviderId}, Vision Supported: ${isVisionSupported}`)

      await llmStore.stream(effectiveModel, effectiveProvider, newMessages as Message[], {
        headers,
        tools: effectiveTools,
        temperature: generationKnown?.temperature,
        top_p: generationKnown?.topP,
        max_tokens: generationKnown?.maxTokens,
        contextWidth: generationKnown?.contextWidth,
        vision: isVisionSupported,
        requestOverrides: generationConfig?.enabled ? generationConfig.advanced : undefined,
        abortSignal: abortController.signal,
        waitForTools: true,
        onStreamEvent: async (event: StreamEvent) => {
          resetStreamIdleTimeout()
          switch (event.type) {
            case 'tool-call':
              toolCallQueue.enqueue({
                type: 'tool-call',
                toolCall: event,
              })
              break
            case 'tool-result':
              toolCallQueue.enqueue({
                type: 'tool-call-result',
                id: event.toolCallId,
                result: event.result,
              })
              break
            case 'text-delta': {
              const healedText = healMozibake(event.text)
              console.log('[ChatDebug] text-delta:', healedText)
              fullText += healedText
              ;(window as any).electron.ipcRenderer.send('llm-raw-output', {
                type: 'delta',
                text: healedText,
                sessionId,
              })
              await parser.consume(healedText)
              break
            }
            case 'reasoning-delta': {
              const healedText = healMozibake(event.text)
              if (!(buildingMessage as any).categorization) {
                ;(buildingMessage as any).categorization = { speech: '', reasoning: '' }
              }
              ;(buildingMessage as any).categorization.reasoning += healedText
              updateUI()
              break
            }
            case 'finish':
              console.log('[ChatDebug] Stream finished. Reason:', (event as any).finishReason, 'fullText length:', fullText.length)
              ;(window as any).electron.ipcRenderer.send('llm-raw-output', {
                type: 'full',
                text: fullText,
                sessionId,
              })
              break
            case 'usage':
              console.log('[ChatDebug] usage report:', event.usage)
              const liveSession = useLiveSessionStore()
              liveSession.recordInferenceUsage(event.usage.total_tokens || event.usage.totalTokenCount || event.usage.totalUsage || 0)
              break
            case 'error':
              throw event.error ?? new Error('Stream error')
          }
        },
      })

      clearStreamIdleTimeout()
      await parser.end()

      // Final attempt to bridge any unclosed markers in the full accumulated text
      if (fullText.includes('<|') || fullText.includes('[call_tool:') || fullText.includes('<tool_call>')) {
        const hybridMatch = fullText.match(/<\|([\w-]+):.*$/s)
          || fullText.match(/\[call_tool:([\w-]+),.*$/s)
          || fullText.match(/<tool_call>.*$/s)

        if (hybridMatch) {
          chatLog('Attempting recovery of unclosed tool call at stream end')
          await tryBridgeMarker(hybridMatch[0])
        }
      }

      if (!isStaleGeneration() && buildingMessage.slices.length > 0) {
        const currentMessages = chatSession.getSessionMessages(sessionId)
        chatSession.setSessionMessages(sessionId, [...currentMessages, toRaw(buildingMessage)])
      }

      // Finalize hooks and analytics
      await hooks.emitStreamEndHooks(streamingMessageContext)
      await hooks.emitAssistantResponseEndHooks(fullText, streamingMessageContext)
      await hooks.emitAfterSendHooks(sendingMessage, streamingMessageContext)
      await hooks.emitAssistantMessageHooks({ ...buildingMessage }, fullText, streamingMessageContext)
      await hooks.emitChatTurnCompleteHooks({
        output: { ...buildingMessage },
        outputText: fullText,
        toolCalls: sessionMessagesForSend.filter(msg => msg.role === 'tool') as ToolMessage[],
      }, streamingMessageContext)

      if (isForegroundSession()) {
        streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
      }
    }
    catch (error: any) {
      console.error('Error sending message:', { sessionId, generation, error })

      let errorMessage = 'An unknown error occurred.'
      if (error && typeof error === 'object') {
        errorMessage = error.message || 'An object error occurred.'

        // Handle XSAIError or similar with response/data info
        try {
          const detail = error.response || error.data || error.body
          if (detail) {
            errorMessage += `\n\n**Response**: ${JSON.stringify(detail, null, 2)}`
          }
        }
        catch {}
      }
      else {
        errorMessage = String(error)
      }

      // Display in UI
      buildingMessage.content += `${buildingMessage.content ? '\n\n' : ''}⚠️ **Chat Error**\n${errorMessage}`
      updateUI()

      // Persist to session history if not stale
      if (!isStaleGeneration()) {
        const currentMessages = chatSession.getSessionMessages(sessionId)
        chatSession.setSessionMessages(sessionId, [...currentMessages, { ...toRaw(buildingMessage) }])
      }

      throw error
    }
    finally {
      if (streamIdleTimeout)
        clearTimeout(streamIdleTimeout)
      sending.value = false
    }
  }

  async function ingest(
    sendingMessage: string,
    options: SendOptions = {},
    targetSessionId?: string,
  ) {
    const sessionId = targetSessionId || activeSessionId.value
    chatLog('Ingesting message:', { sendingMessage, sessionId, sending: sending.value })
    const generation = chatSession.getSessionGeneration(sessionId)

    return new Promise<void>((resolve, reject) => {
      sendQueue.enqueue({
        sendingMessage,
        options,
        generation,
        sessionId,
        deferred: { resolve, reject },
      })
    })
  }

  async function ingestOnFork(
    sendingMessage: string,
    options: SendOptions,
    forkOptions?: ForkOptions,
  ) {
    const baseSessionId = forkOptions?.fromSessionId ?? activeSessionId.value
    if (!forkOptions)
      return ingest(sendingMessage, options, baseSessionId)

    const forkSessionId = await chatSession.forkSession({
      fromSessionId: baseSessionId,
      atIndex: forkOptions.atIndex,
      reason: forkOptions.reason,
      hidden: forkOptions.hidden,
    })
    return ingest(sendingMessage, options, forkSessionId || baseSessionId)
  }

  function cancelPendingSends(sessionId?: string) {
    for (const queued of pendingQueuedSends.value) {
      if (sessionId && queued.sessionId !== sessionId)
        continue

      queued.cancelled = true
      queued.deferred.reject(new Error('Chat session was reset before send could start'))
    }

    pendingQueuedSends.value = sessionId
      ? pendingQueuedSends.value.filter(item => item.sessionId !== sessionId)
      : []
  }

  return {
    sending,
    streamingMessage,

    ingest,
    ingestOnFork,
    cancelPendingSends,

    clearHooks: hooks.clearHooks,

    emitBeforeMessageComposedHooks: hooks.emitBeforeMessageComposedHooks,
    emitAfterMessageComposedHooks: hooks.emitAfterMessageComposedHooks,
    emitBeforeSendHooks: hooks.emitBeforeSendHooks,
    emitAfterSendHooks: hooks.emitAfterSendHooks,
    emitTokenLiteralHooks: hooks.emitTokenLiteralHooks,
    emitTokenSpecialHooks: hooks.emitTokenSpecialHooks,
    emitStreamEndHooks: hooks.emitStreamEndHooks,
    emitAssistantResponseEndHooks: hooks.emitAssistantResponseEndHooks,
    emitAssistantMessageHooks: hooks.emitAssistantMessageHooks,
    emitChatTurnCompleteHooks: hooks.emitChatTurnCompleteHooks,

    onBeforeMessageComposed: hooks.onBeforeMessageComposed,
    onAfterMessageComposed: hooks.onAfterMessageComposed,
    onBeforeSend: hooks.onBeforeSend,
    onAfterSend: hooks.onAfterSend,
    onTokenLiteral: hooks.onTokenLiteral,
    onTokenSpecial: hooks.onTokenSpecial,
    onStreamEnd: hooks.onStreamEnd,
    onAssistantResponseEnd: hooks.onAssistantResponseEnd,
    onAssistantMessage: hooks.onAssistantMessage,
    onChatTurnComplete: hooks.onChatTurnComplete,
    onWidget: hooks.onWidget,
  }
})
