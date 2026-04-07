import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, CompletionToolCall, Message, Tool } from '@xsai/shared-chat'

import { useLocalStorage } from '@vueuse/core'
import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { streamText } from '@xsai/stream-text'
import { defineStore } from 'pinia'
import { toRaw } from 'vue'

import { mcp } from '../tools'

export type StreamEvent
  = | { type: 'text-delta', text: string }
    | { type: 'reasoning-delta', text: string }
    | ({ type: 'finish' } & any)
    | ({ type: 'tool-call' } & CompletionToolCall)
    | { type: 'tool-result', toolCallId: string, result?: string | CommonContentPart[] }
    | { type: 'usage', usage: any }
    | { type: 'error', error: any }

export interface StreamOptions {
  headers?: Record<string, string>
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>
  toolsCompatibility?: Record<string, boolean>
  systemMessageCompatibility?: Record<string, boolean>
  supportsTools?: boolean
  supportsSystemMessages?: boolean // when false, system messages are merged into first user message
  waitForTools?: boolean // when true,won't resolve on finishReason=='tool_calls';
  tools?: Tool[] | (() => Promise<Tool[] | undefined>)
  abortSignal?: AbortSignal
  temperature?: number
  top_p?: number
  max_tokens?: number
  contextWidth?: number
  vision?: boolean
  requestOverrides?: Record<string, unknown>
}

function sanitizeRequestOverrides(overrides?: Record<string, unknown>) {
  if (!overrides)
    return {}

  const reservedKeys = new Set([
    'messages',
    'headers',
    'tools',
    'onEvent',
    'abortSignal',
    'maxSteps',
  ])

  return Object.fromEntries(
    Object.entries(overrides).filter(([key]) => !reservedKeys.has(key)),
  )
}

// TODO: proper format for other error messages.
export function sanitizeMessages(messages: unknown[], options?: { vision?: boolean, supportsSystemMessages?: boolean }): Message[] {
  // Use JSON snapshotting to completely remove Vue reactivity and ensure cloninability.
  // This is necessary because @xsai libraries use structuredClone internally.
  const rawMessages = JSON.parse(JSON.stringify(toRaw(messages))) as any[]

  const processed = rawMessages.map((m: any) => {
    if (m && m.role === 'error') {
      return {
        role: 'user',
        content: `User encountered error: ${String(m.content ?? '')}`,
      } as Message
    }

    if (m && Array.isArray(m.content)) {
      const contentParts = m.content as { type?: string, text?: string }[]

      // If vision is explicitly disabled, strip all image_url parts
      if (options?.vision === false && contentParts.some(p => p?.type === 'image_url')) {
        const newContent = contentParts
          .map(p => p?.type === 'image_url' ? '[Image]' : (p?.text ?? ''))
          .filter(Boolean)
          .join(' ')

        return {
          ...m,
          content: newContent,
        } as Message
      }

      // NOTICE: This block is critical for backward compatibility with LLM providers (e.g., DeepSeek)
      // that expect message content to be a string, not an array of content parts.
      // Failure to flatten array content (when no image_url is present) can lead to
      // deserialization errors like "invalid type: sequence, expected a string".
      if (!contentParts.some(p => p?.type === 'image_url')) {
        return { ...m, content: contentParts.map(p => p?.text ?? '').join('') } as Message
      }
    }
    return m as Message
  })

  // NOTICE: Some models (e.g., gemma-3-12b-it via Google AI Studio) do not support
  // system/developer messages. When supportsSystemMessages is false, merge all system
  // messages into the first user message as a prefixed instruction block.
  if (options?.supportsSystemMessages === false) {
    const systemMessages = processed.filter((m: any) => m?.role === 'system')
    const nonSystemMessages = processed.filter((m: any) => m?.role !== 'system')

    if (systemMessages.length > 0 && nonSystemMessages.length > 0) {
      const systemContent = systemMessages.map((m: any) => String(m.content ?? '')).join('\n---\n')
      const firstUserIdx = nonSystemMessages.findIndex((m: any) => m?.role === 'user')
      if (firstUserIdx >= 0) {
        const firstUser = nonSystemMessages[firstUserIdx]
        firstUser.content = `[System Instructions]\n${systemContent}\n---\n[End System Instructions]\n\n${firstUser.content ?? ''}`
        // Return system messages removed, with first user message augmented
        return processed.filter((m: any) => m?.role !== 'system').map((m: any) => {
          if (m === firstUser)
            return { ...m } as Message
          return m as Message
        })
      }
    }
  }

  return processed
}

function systemMessageCompatibilityOk(model: string, chatProvider: ChatProvider, _: Message[], options?: StreamOptions): boolean {
  if (options?.supportsSystemMessages !== undefined)
    return options.supportsSystemMessages
  const key = `${chatProvider.chat(model).baseURL}-${model}`
  return options?.systemMessageCompatibility?.[key] !== false
}

function streamOptionsToolsCompatibilityOk(model: string, chatProvider: ChatProvider, _: Message[], options?: StreamOptions): boolean {
  if (options?.supportsTools)
    return true
  const key = `${chatProvider.chat(model).baseURL}-${model}`
  return options?.toolsCompatibility?.[key] !== false
}

// Runtime auto-degrade: patterns that indicate the model/provider does not support tool calling.
const TOOLS_RELATED_ERROR_PATTERNS: RegExp[] = [
  /does not support tools/i, // Ollama
  /no endpoints found that support tool use/i, // OpenRouter
  /invalid schema for function/i, // OpenAI-compatible / Groq
  /invalid.?function.?parameters/i, // OpenAI-compatible
  /functions are not supported/i, // Azure AI Foundry
  /unrecognized request argument.+tools/i, // Azure AI Foundry
  /tool use with function calling is unsupported/i, // Google Generative AI
  /tool_use_failed/i, // Groq
  /does not support function.?calling/i, // Anthropic
  /tools?\s+(is|are)\s+not\s+supported/i, // Cloudflare Workers AI
]

// NOTICE: Patterns that indicate the model/provider does not support system/developer messages.
// When detected, system messages are merged into the first user message on retry.
const SYSTEM_MESSAGE_ERROR_PATTERNS: RegExp[] = [
  /developer instruction is not enabled/i, // Google AI Studio (gemma-3-12b-it)
  /system.*prompt.*not.*supported/i, // Generic
  /system.*role.*not.*supported/i, // Some older providers
  /invalid.*role.*system/i, // Strict validators
]

export function isToolRelatedError(err: unknown): boolean {
  const msg = String(err)
  return TOOLS_RELATED_ERROR_PATTERNS.some(p => p.test(msg))
}

export function isSystemMessageRelatedError(err: unknown): boolean {
  const msg = String(err)
  return SYSTEM_MESSAGE_ERROR_PATTERNS.some(p => p.test(msg))
}

async function streamFrom(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
  const headers = options?.headers
  const chatConfig = chatProvider.chat(model)
  const baseUrl = chatConfig.baseURL || ''

  const supportsSystemMessages = systemMessageCompatibilityOk(model, chatProvider, messages, options)
  const sanitized = sanitizeMessages(messages as unknown[], { vision: options?.vision, supportsSystemMessages })
  const requestOverrides = sanitizeRequestOverrides(options?.requestOverrides)
  const resolveTools = async () => {
    const tools = typeof options?.tools === 'function'
      ? await options.tools()
      : options?.tools
    return tools ?? []
  }

  const supportedTools = streamOptionsToolsCompatibilityOk(model, chatProvider, messages, options)
  const tools = supportedTools
    ? [
        ...await mcp(),
        ...await resolveTools(),
      ]
    : undefined

  if (tools && tools.length > 0) {
    console.log('Calling LLM with tools', tools.map((t: any) => t.function?.name || t.name))
  }
  else {
    console.log('Calling LLM with NO tools available')
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false
    const resolveOnce = () => {
      if (settled)
        return
      settled = true
      resolve()
    }
    const rejectOnce = (err: unknown) => {
      if (settled)
        return
      settled = true
      reject(err)
    }

    const onEvent = async (event: unknown) => {
      try {
        await options?.onStreamEvent?.(event as StreamEvent)
        if (event && (event as StreamEvent).type === 'finish') {
          const finishReason = (event as any).finishReason
          if (finishReason !== 'tool_calls' || !options?.waitForTools)
            resolveOnce()
        }
        else if (event && (event as StreamEvent).type === 'error') {
          const error = (event as any).error ?? new Error('Stream error')
          rejectOnce(error)
        }
      }
      catch (err) {
        rejectOnce(err)
      }
    }

    try {
      const result = streamText({
        ...chatConfig,
        ...requestOverrides,
        maxSteps: 10,
        messages: sanitized,
        headers,
        temperature: options?.temperature,
        top_p: options?.top_p,
        max_tokens: options?.max_tokens,
        ...(options?.contextWidth && String(baseUrl).includes('localhost:11434') ? { num_ctx: options.contextWidth } : {}),
        // TODO: we need Automatic tools discovery
        tools,
        onEvent,
        abortSignal: options?.abortSignal,
      })

      // We MUST catch all promises returned by streamText to ensure the main promise settles
      // and to prevent "Uncaught (in promise)" errors if the initial handshake fails (e.g. 429).
      void result.messages.catch((err) => {
        rejectOnce(err)
        console.error('Stream messages error:', err)
      })
      void result.steps.catch(err => console.error('Stream steps error:', err))
      void result.usage.catch(err => console.error('Stream usage error:', err))
      void result.totalUsage.then((usage) => {
        if (usage) {
          onEvent({ type: 'usage', usage })
        }
      }).catch(err => console.error('Stream totalUsage error:', err))
    }
    catch (err) {
      rejectOnce(err)
    }
  })
}

async function generateFrom(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
  const headers = options?.headers
  const chatConfig = chatProvider.chat(model)
  const baseUrl = chatConfig.baseURL || ''
  const supportsSystemMessages = systemMessageCompatibilityOk(model, chatProvider, messages, options)
  const sanitized = sanitizeMessages(messages as unknown[], { vision: options?.vision, supportsSystemMessages })
  const requestOverrides = sanitizeRequestOverrides(options?.requestOverrides)

  const resolveTools = async () => {
    const tools = typeof options?.tools === 'function'
      ? await options.tools()
      : options?.tools
    return tools ?? []
  }

  const supportedTools = streamOptionsToolsCompatibilityOk(model, chatProvider, messages, options)
  const tools = supportedTools
    ? [
        ...await mcp(),
        ...await resolveTools(),
      ]
    : undefined

  if (tools && tools.length > 0) {
    console.log('Calling LLM with tools', tools.map((t: any) => t.function?.name || t.name))
  }
  else {
    console.log('Calling LLM with NO tools available')
  }

  return await generateText({
    ...chatConfig,
    ...requestOverrides,
    maxSteps: 10,
    messages: sanitized,
    headers,
    temperature: options?.temperature,
    top_p: options?.top_p,
    max_tokens: options?.max_tokens,
    ...(options?.contextWidth && String(baseUrl).includes('localhost:11434') ? { num_ctx: options.contextWidth } : {}),
    tools,
  })
}

export async function attemptForToolsCompatibilityDiscovery(model: string, chatProvider: ChatProvider, _: Message[], options?: Omit<StreamOptions, 'supportsTools'>): Promise<boolean> {
  async function attempt(enable: boolean) {
    let toolsError = false
    try {
      await streamFrom(model, chatProvider, [{ role: 'user', content: 'Hello, world!' }], {
        ...options,
        supportsTools: enable,
        vision: false,
        onStreamEvent: (event) => {
          if (event.type === 'error') {
            const errStr = String(event.error)
            if (errStr.includes('does not support tools') || errStr.includes('No endpoints found that support tool use.')) {
              toolsError = true
            }
          }
        },
      })
      return !toolsError
    }
    catch (err) {
      if (toolsError)
        return false
      throw err
    }
  }

  function promiseAllWithInterval<T>(promises: (() => Promise<T>)[], interval: number): Promise<{ result?: T, error?: any }[]> {
    return new Promise((resolve) => {
      const results: { result?: T, error?: any }[] = []
      let completed = 0

      promises.forEach((promiseFn, index) => {
        setTimeout(() => {
          promiseFn()
            .then((result) => {
              results[index] = { result }
            })
            .catch((err) => {
              results[index] = { error: err }
            })
            .finally(() => {
              completed++
              if (completed === promises.length) {
                resolve(results)
              }
            })
        }, index * interval)
      })
    })
  }

  const attempts = [
    () => attempt(true),
    () => attempt(false),
  ]

  const attemptsResults = await promiseAllWithInterval<boolean | undefined>(attempts, 1000)
  if (attemptsResults.some(res => res.error)) {
    const err = new Error(`Error during tools compatibility discovery for model: ${model}. Errors: ${attemptsResults.map(res => res.error).filter(Boolean).join(', ')}`)
    err.cause = attemptsResults.map(res => res.error).filter(Boolean)
    throw err
  }

  return attemptsResults[0].result === true && attemptsResults[1].result === true
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = useLocalStorage<Record<string, boolean>>('settings/llm/tools-compatibility-v3', {})
  const systemMessageCompatibility = useLocalStorage<Record<string, boolean>>('settings/llm/system-message-compatibility-v1', {})

  async function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    const key = `${chatProvider.chat(model).baseURL}-${model}`
    try {
      await streamFrom(model, chatProvider, messages, { ...options, toolsCompatibility: toolsCompatibility.value, systemMessageCompatibility: systemMessageCompatibility.value })
    }
    catch (err) {
      if (isToolRelatedError(err)) {
        console.warn(`[llm] Auto-disabling tools for "${key}" due to tool-related error`)
        toolsCompatibility.value[key] = false
      }
      if (isSystemMessageRelatedError(err)) {
        console.warn(`[llm] Auto-disabling system messages for "${key}" due to system message error — retrying without system role`)
        systemMessageCompatibility.value[key] = false
        // Retry with system messages merged into user messages
        return streamFrom(model, chatProvider, messages, { ...options, toolsCompatibility: toolsCompatibility.value, systemMessageCompatibility: systemMessageCompatibility.value, supportsSystemMessages: false })
      }
      throw err
    }
  }

  function generate(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    return generateFrom(model, chatProvider, messages, { ...options, toolsCompatibility: toolsCompatibility.value, systemMessageCompatibility: systemMessageCompatibility.value })
  }

  async function discoverToolsCompatibility(model: string, chatProvider: ChatProvider, _: Message[], options?: Omit<StreamOptions, 'supportsTools'>) {
    // Cached, no need to discover again
    const key = `${chatProvider.chat(model).baseURL}-${model}`
    if (key in toolsCompatibility.value) {
      return
    }

    const res = await attemptForToolsCompatibilityDiscovery(model, chatProvider, _, { ...options, toolsCompatibility: toolsCompatibility.value })
    toolsCompatibility.value[key] = res
  }

  async function models(apiUrl: string, apiKey: string) {
    if (apiUrl === '') {
      return []
    }

    try {
      return await listModels({
        baseURL: (apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`) as `${string}/`,
        apiKey,
      })
    }
    catch (err) {
      if (String(err).includes(`Failed to construct 'URL': Invalid URL`)) {
        return []
      }

      throw err
    }
  }

  return {
    models,
    stream,
    generate,
    discoverToolsCompatibility,
  }
})
