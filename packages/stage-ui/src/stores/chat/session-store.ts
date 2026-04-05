import type { ChatHistoryItem, ChatStreamEvent } from '../../types/chat'
import type { ChatSessionMeta, ChatSessionRecord, ChatSessionsExport, ChatSessionsIndex } from '../../types/chat-session'

import { useBroadcastChannel } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { client } from '../../composables/api'
import { useLocalFirstRequest } from '../../composables/use-local-first'
import { chatSessionsRepo } from '../../database/repos/chat-sessions.repo'
import { useAuthStore } from '../auth'
import { useShortTermMemoryStore } from '../memory-short-term'
import { useAiriCardStore } from '../modules/airi-card'
import { useSettingsGeneral } from '../settings'
import { CHAT_STREAM_CHANNEL_NAME } from './constants'
import { mergeLoadedSessionMessages } from './session-message-merge'

export const useChatSessionStore = defineStore('chat-session', () => {
  const { userId, isAuthenticated } = storeToRefs(useAuthStore())
  const { activeCardId, systemPrompt } = storeToRefs(useAiriCardStore())
  const { remoteSyncEnabled } = storeToRefs(useSettingsGeneral())
  const shortTermMemory = useShortTermMemoryStore()

  // NOTICE: This BroadcastChannel reuses the same channel as context-bridge to notify
  // other windows (e.g. chatbox) that session data changed and they should reload from DB.
  const { post: broadcastStreamEvent, data: incomingSessionUpdate } = useBroadcastChannel<ChatStreamEvent, ChatStreamEvent>({ name: CHAT_STREAM_CHANNEL_NAME })

  const activeSessionId = ref<string>('')
  const sessionMessages = ref<Record<string, ChatHistoryItem[]>>({})
  const sessionMetas = ref<Record<string, ChatSessionMeta>>({})
  const sessionGenerations = ref<Record<string, number>>({})
  const index = ref<ChatSessionsIndex | null>(null)

  const ready = ref(false)
  const isReady = computed(() => ready.value)
  const initializing = ref(false)
  let initializePromise: Promise<void> | null = null

  let persistQueue = Promise.resolve()
  let syncQueue = Promise.resolve()
  const loadedSessions = new Set<string>()
  const loadingSessions = new Map<string, Promise<void>>()

  // I know this nu uh, better than loading all language on rehypeShiki
  const codeBlockSystemPrompt = '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```\n'
  const mathSyntaxSystemPrompt = '- For any math equation, use LaTeX format, eg: $ x^3 $, always escape dollar sign outside math equation\n'
  const shortTermMemoryBlockLimit = 3

  function getCurrentUserId() {
    return userId.value || 'local'
  }

  function getCurrentCharacterId() {
    return activeCardId.value || 'default'
  }

  function enqueuePersist(task: () => Promise<void>) {
    persistQueue = persistQueue.then(task, task)
    return persistQueue
  }

  function enqueueSync(task: () => Promise<void>) {
    syncQueue = syncQueue.then(task, task)
    return syncQueue
  }

  function snapshotMessages(messages: ChatHistoryItem[]) {
    return JSON.parse(JSON.stringify(messages)) as ChatHistoryItem[]
  }

  function extractMessageContent(message: ChatHistoryItem) {
    if (typeof message.content === 'string')
      return message.content
    if (Array.isArray(message.content)) {
      return message.content.map((part) => {
        if (typeof part === 'string')
          return part
        if (part && typeof part === 'object' && 'text' in part)
          return String(part.text ?? '')
        return ''
      }).join('')
    }
    return ''
  }

  function ensureSessionMessageIds(sessionId: string) {
    const current = sessionMessages.value[sessionId] ?? []
    let changed = false
    const next = current.map((message) => {
      if (message.id)
        return message
      changed = true
      return {
        ...message,
        id: nanoid(),
      }
    })

    if (changed)
      sessionMessages.value[sessionId] = next

    return next
  }

  function buildSyncMessages(messages: ChatHistoryItem[]) {
    return messages.map(message => ({
      id: message.id ?? nanoid(),
      role: message.role,
      content: extractMessageContent(message),
      createdAt: message.createdAt,
    }))
  }

  async function syncSessionToRemote(sessionId: string) {
    let cachedRecord: ChatSessionRecord | null | undefined
    const request = useLocalFirstRequest({
      local: async () => {
        cachedRecord = await chatSessionsRepo.getSession(sessionId)
        return cachedRecord
      },
      remote: async () => {
        if (!cachedRecord)
          cachedRecord = await chatSessionsRepo.getSession(sessionId)
        if (!cachedRecord)
          return cachedRecord

        const members: Array<
          | { type: 'user', userId: string }
          | { type: 'character', characterId: string }
        > = [
          { type: 'user', userId: userId.value },
        ]

        if (cachedRecord.meta.characterId && cachedRecord.meta.characterId !== 'default') {
          members.push({
            type: 'character',
            characterId: cachedRecord.meta.characterId,
          })
        }

        const normalizedMessages = cachedRecord.messages.map(message => message.id ? message : { ...message, id: nanoid() })
        if (normalizedMessages.some((message, index) => cachedRecord?.messages[index]?.id !== message.id)) {
          cachedRecord = {
            ...cachedRecord,
            messages: normalizedMessages,
          }
          await chatSessionsRepo.saveSession(sessionId, cachedRecord)
        }

        const res = await client.api.chats.sync.$post({
          json: {
            chat: {
              id: cachedRecord.meta.sessionId,
              type: 'group',
              title: cachedRecord.meta.title,
              createdAt: cachedRecord.meta.createdAt,
              updatedAt: cachedRecord.meta.updatedAt,
            },
            members,
            messages: buildSyncMessages(cachedRecord.messages),
          },
        })

        if (!res.ok)
          throw new Error('Failed to sync chat session')
        return cachedRecord
      },
      allowRemote: () => remoteSyncEnabled.value && isAuthenticated.value,
      lazy: true,
    })

    await request.execute()
  }

  function scheduleSync(sessionId: string) {
    if (!remoteSyncEnabled.value)
      return

    void enqueueSync(async () => {
      try {
        await syncSessionToRemote(sessionId)
      }
      catch (error) {
        console.warn('Failed to sync chat session', error)
      }
    })
  }

  function buildShortTermMemoryContext(characterId: string) {
    const blocks = shortTermMemory.getCharacterBlocks(characterId).slice(0, shortTermMemoryBlockLimit)
    if (blocks.length === 0)
      return ''

    return [
      '[Short-Term Memory]',
      'The following daily continuity blocks were distilled from recent chat history for this active character.',
      'Use them as hidden continuity context for the current session.',
      ...blocks.map(block => `Date: ${block.date}\n${block.summary}`),
    ].join('\n\n')
  }

  function generateInitialMessageFromPrompt(prompt: string, characterId = getCurrentCharacterId()) {
    const shortTermContext = buildShortTermMemoryContext(characterId)
    const content = [
      codeBlockSystemPrompt + mathSyntaxSystemPrompt + prompt,
      shortTermContext,
    ].filter(Boolean).join('\n\n')

    return {
      role: 'system',
      content,
      id: nanoid(),
      createdAt: Date.now(),
    } satisfies ChatHistoryItem
  }

  function generateInitialMessage() {
    return generateInitialMessageFromPrompt(systemPrompt.value, getCurrentCharacterId())
  }

  function ensureGeneration(sessionId: string) {
    if (sessionGenerations.value[sessionId] === undefined)
      sessionGenerations.value[sessionId] = 0
  }

  async function loadIndexForUser(currentUserId: string) {
    const stored = await chatSessionsRepo.getIndex(currentUserId)
    index.value = stored ?? {
      userId: currentUserId,
      characters: {},
    }
  }

  function getCharacterIndex(characterId: string) {
    if (!index.value)
      return null
    return index.value.characters[characterId] ?? null
  }

  async function persistIndex() {
    if (!index.value)
      return
    const snapshot = JSON.parse(JSON.stringify(index.value)) as ChatSessionsIndex
    await enqueuePersist(() => chatSessionsRepo.saveIndex(snapshot))
  }

  async function persistSession(sessionId: string) {
    const meta = sessionMetas.value[sessionId]
    if (!meta)
      return
    const messages = snapshotMessages(ensureSessionMessageIds(sessionId))
    const now = Date.now()
    const updatedMeta = {
      ...meta,
      updatedAt: now,
    }

    sessionMetas.value[sessionId] = updatedMeta
    const characterIndex = index.value?.characters[meta.characterId]
    if (characterIndex)
      characterIndex.sessions[sessionId] = updatedMeta

    const record: ChatSessionRecord = {
      meta: updatedMeta,
      messages,
    }

    await enqueuePersist(() => chatSessionsRepo.saveSession(sessionId, record))
    await persistIndex()
    scheduleSync(sessionId)
  }

  function persistSessionMessages(sessionId: string) {
    void persistSession(sessionId)
  }

  function setSessionMessages(sessionId: string, next: ChatHistoryItem[]) {
    const prev = sessionMessages.value[sessionId] ?? []
    sessionMessages.value[sessionId] = next
    void persistSession(sessionId)

    // NOTICE: Broadcast any NEW messages so other windows can apply them immediately.
    // This covers the primary STT ingestion path (chat.ts performSend) which uses
    // setSessionMessages rather than inscribeTurn.
    const prevIds = new Set(prev.map(m => m.id).filter(Boolean))
    for (const msg of next) {
      if (msg.id && !prevIds.has(msg.id)) {
        broadcastStreamEvent({ type: 'session-updated', sessionId, message: JSON.parse(JSON.stringify(msg)) })
      }
    }
  }

  function inscribeTurn(message: ChatHistoryItem, sessionId = activeSessionId.value) {
    if (!sessionId)
      return
    const current = sessionMessages.value[sessionId] ?? []
    sessionMessages.value[sessionId] = [...current, message]
    void persistSession(sessionId)
    // NOTICE: Broadcast the actual message payload so other windows can apply it directly
    // without waiting for the DB write to complete (avoids race condition).
    broadcastStreamEvent({ type: 'session-updated', sessionId, message: JSON.parse(JSON.stringify(message)) })
  }

  async function loadSession(sessionId: string, force = false) {
    if (!force && loadedSessions.has(sessionId))
      return
    if (loadingSessions.has(sessionId)) {
      await loadingSessions.get(sessionId)
      return
    }

    const loadPromise = (async () => {
      const stored = await chatSessionsRepo.getSession(sessionId)
      if (stored) {
        const currentMessages = sessionMessages.value[sessionId] ?? []
        const mergedMessages = mergeLoadedSessionMessages(stored.messages, currentMessages)

        sessionMetas.value[sessionId] = stored.meta
        sessionMessages.value[sessionId] = mergedMessages
        ensureGeneration(sessionId)

        if (mergedMessages !== stored.messages)
          await persistSession(sessionId)
      }
      loadedSessions.add(sessionId)
    })()

    loadingSessions.set(sessionId, loadPromise)
    await loadPromise
    loadingSessions.delete(sessionId)
  }

  async function createSession(characterId: string, options?: { setActive?: boolean, messages?: ChatHistoryItem[], title?: string }) {
    const currentUserId = getCurrentUserId()
    const sessionId = nanoid()
    const now = Date.now()
    const meta: ChatSessionMeta = {
      sessionId,
      userId: currentUserId,
      characterId,
      title: options?.title,
      createdAt: now,
      updatedAt: now,
    }

    const initialMessages = options?.messages?.length ? options.messages : [generateInitialMessage()]

    sessionMetas.value[sessionId] = meta
    sessionMessages.value[sessionId] = initialMessages
    ensureGeneration(sessionId)

    if (!index.value)
      index.value = { userId: currentUserId, characters: {} }

    const characterIndex = index.value.characters[characterId] ?? {
      activeSessionId: sessionId,
      sessions: {},
    }
    characterIndex.sessions[sessionId] = meta
    if (options?.setActive !== false)
      characterIndex.activeSessionId = sessionId
    index.value.characters[characterId] = characterIndex

    const record: ChatSessionRecord = { meta, messages: initialMessages }
    await enqueuePersist(() => chatSessionsRepo.saveSession(sessionId, record))
    await persistIndex()
    scheduleSync(sessionId)

    if (options?.setActive !== false)
      activeSessionId.value = sessionId

    return sessionId
  }

  async function ensureActiveSessionForCharacter() {
    const currentUserId = getCurrentUserId()
    const characterId = getCurrentCharacterId()

    console.info('[ChatSession] ensureActiveSessionForCharacter:start', {
      currentUserId,
      characterId,
      activeSessionId: activeSessionId.value,
    })

    if (!index.value || index.value.userId !== currentUserId)
      await loadIndexForUser(currentUserId)

    const characterIndex = getCharacterIndex(characterId)
    if (!characterIndex) {
      console.info('[ChatSession] no character index, creating session', { characterId })
      await createSession(characterId)
      return
    }

    if (!characterIndex.activeSessionId) {
      console.info('[ChatSession] character has no active session, creating session', { characterId })
      await createSession(characterId)
      return
    }

    activeSessionId.value = characterIndex.activeSessionId
    await loadSession(characterIndex.activeSessionId)
    ensureSession(characterIndex.activeSessionId)

    // NOTICE: Ensure prompt is up to date immediately after card-switch context is resolved.
    refreshActiveSystemMessage({
      sessionId: characterIndex.activeSessionId,
      characterId,
      prompt: systemPrompt.value,
    })

    console.info('[ChatSession] ensureActiveSessionForCharacter:resolved', {
      characterId,
      activeSessionId: activeSessionId.value,
      messageCount: sessionMessages.value[activeSessionId.value]?.length ?? 0,
    })
  }

  async function initialize() {
    if (ready.value)
      return
    if (initializePromise)
      return initializePromise
    initializing.value = true
    initializePromise = (async () => {
      await shortTermMemory.load()
      await ensureActiveSessionForCharacter()
      ready.value = true
    })()

    try {
      await initializePromise
    }
    finally {
      initializePromise = null
      initializing.value = false
    }
  }

  function ensureSession(sessionId: string) {
    ensureGeneration(sessionId)
    if (!sessionMessages.value[sessionId] || sessionMessages.value[sessionId].length === 0) {
      sessionMessages.value[sessionId] = [generateInitialMessage()]
      void persistSession(sessionId)
    }
  }

  const messages = computed<ChatHistoryItem[]>({
    get: () => {
      if (!activeSessionId.value)
        return []
      return sessionMessages.value[activeSessionId.value] ?? []
    },
    set: (value) => {
      if (!activeSessionId.value)
        return
      sessionMessages.value[activeSessionId.value] = value
      void persistSession(activeSessionId.value)
    },
  })

  function setActiveSession(sessionId: string) {
    console.info('[ChatSession] setActiveSession', {
      from: activeSessionId.value,
      to: sessionId,
      characterId: getCurrentCharacterId(),
    })
    activeSessionId.value = sessionId
    ensureSession(sessionId)

    const characterId = getCurrentCharacterId()
    const characterIndex = index.value?.characters[characterId]
    if (characterIndex) {
      characterIndex.activeSessionId = sessionId
      void persistIndex()
    }

    if (ready.value)
      void loadSession(sessionId)
  }

  function cleanupMessages(sessionId = activeSessionId.value) {
    ensureGeneration(sessionId)
    sessionGenerations.value[sessionId] += 1
    setSessionMessages(sessionId, [generateInitialMessage()])
  }

  /**
   * Refreshes the root system message in a session to reflect
   * current (or provided) character settings without resetting the chat.
   */
  function refreshActiveSystemMessage(options?: { sessionId?: string, characterId?: string, prompt?: string }) {
    const sessionId = options?.sessionId ?? activeSessionId.value
    if (!sessionId || !ready.value)
      return

    const meta = sessionMetas.value[sessionId]
    if (!meta)
      return

    // NOTICE: Strict integrity check to prevent cross-session prompt pollution.
    // If we're updating by reactive systemPrompt change, we must ensure the
    // session actually belongs to the active card.
    const targetCharacterId = options?.characterId ?? activeCardId.value
    if (meta.characterId !== targetCharacterId) {
      console.warn('[ChatSession] Skipping prompt refresh: session characterId mismatch', {
        sessionId,
        sessionCharacterId: meta.characterId,
        targetCharacterId,
      })
      return
    }

    const currentMessages = sessionMessages.value[sessionId]
    if (!currentMessages || currentMessages.length === 0)
      return

    // Logic: The first message is always the root system prompt
    const firstMessage = currentMessages[0]
    if (firstMessage.role !== 'system')
      return

    const nextSystemMessage = options?.prompt
      ? generateInitialMessageFromPrompt(options.prompt, targetCharacterId)
      : generateInitialMessage()

    if (firstMessage.content === nextSystemMessage.content)
      return

    console.info('[ChatSession] Refreshing system message from character settings', {
      sessionId,
      characterId: targetCharacterId,
    })
    const nextMessages = [nextSystemMessage, ...currentMessages.slice(1)]
    setSessionMessages(sessionId, nextMessages)
  }

  function getAllSessions() {
    return JSON.parse(JSON.stringify(sessionMessages.value)) as Record<string, ChatHistoryItem[]>
  }

  async function resetAllSessions() {
    const currentUserId = getCurrentUserId()
    const characterId = getCurrentCharacterId()
    const sessionIds = new Set<string>()

    if (index.value?.userId === currentUserId) {
      for (const character of Object.values(index.value.characters)) {
        for (const sessionId of Object.keys(character.sessions))
          sessionIds.add(sessionId)
      }
    }

    for (const sessionId of sessionIds)
      await enqueuePersist(() => chatSessionsRepo.deleteSession(sessionId))

    sessionMessages.value = {}
    sessionMetas.value = {}
    sessionGenerations.value = {}
    loadedSessions.clear()
    loadingSessions.clear()

    index.value = {
      userId: currentUserId,
      characters: {},
    }

    await createSession(characterId)
  }

  function getSessionMessages(sessionId: string) {
    if (ready.value)
      void loadSession(sessionId)
    return sessionMessages.value[sessionId] ?? []
  }

  function getSessionGeneration(sessionId: string) {
    ensureGeneration(sessionId)
    return sessionGenerations.value[sessionId] ?? 0
  }

  function bumpSessionGeneration(sessionId: string) {
    ensureGeneration(sessionId)
    sessionGenerations.value[sessionId] += 1
    return sessionGenerations.value[sessionId]
  }

  function getSessionGenerationValue(sessionId?: string) {
    const target = sessionId ?? activeSessionId.value
    return getSessionGeneration(target)
  }

  async function forkSession(options: { fromSessionId: string, atIndex?: number, reason?: string, hidden?: boolean }) {
    const characterId = getCurrentCharacterId()
    const parentMessages = getSessionMessages(options.fromSessionId)
    const forkIndex = options.atIndex ?? parentMessages.length
    const nextMessages = parentMessages.slice(0, forkIndex)
    return await createSession(characterId, { setActive: false, messages: nextMessages })
  }

  function deleteMessage(messageId: string, sessionId = activeSessionId.value) {
    if (!sessionId)
      return
    const current = sessionMessages.value[sessionId] ?? []
    const next = current.filter(msg => msg.id !== messageId)
    if (next.length !== current.length) {
      sessionMessages.value[sessionId] = next
      void persistSession(sessionId)
    }
  }

  async function exportSessions(): Promise<ChatSessionsExport> {
    if (!ready.value)
      await initialize()

    if (!index.value) {
      return {
        format: 'chat-sessions-index:v1',
        index: { userId: getCurrentUserId(), characters: {} },
        sessions: {},
      }
    }

    const sessions: Record<string, ChatSessionRecord> = {}
    for (const character of Object.values(index.value.characters)) {
      for (const sessionId of Object.keys(character.sessions)) {
        const stored = await chatSessionsRepo.getSession(sessionId)
        if (stored) {
          sessions[sessionId] = stored
          continue
        }
        const meta = sessionMetas.value[sessionId]
        const messages = sessionMessages.value[sessionId]
        if (meta && messages)
          sessions[sessionId] = { meta, messages }
      }
    }

    return {
      format: 'chat-sessions-index:v1',
      index: index.value,
      sessions,
    }
  }

  async function importSessions(payload: ChatSessionsExport) {
    if (payload.format !== 'chat-sessions-index:v1')
      return

    index.value = payload.index
    sessionMessages.value = {}
    sessionMetas.value = {}
    sessionGenerations.value = {}
    loadedSessions.clear()
    loadingSessions.clear()

    await enqueuePersist(() => chatSessionsRepo.saveIndex(payload.index))

    for (const [sessionId, record] of Object.entries(payload.sessions)) {
      sessionMetas.value[sessionId] = record.meta
      sessionMessages.value[sessionId] = record.messages
      ensureGeneration(sessionId)
      await enqueuePersist(() => chatSessionsRepo.saveSession(sessionId, record))
    }

    await ensureActiveSessionForCharacter()
  }

  watch([userId, activeCardId], ([nextUserId, nextCardId], [prevUserId, prevCardId]) => {
    if (!ready.value)
      return
    console.info('[ChatSession] watcher:userId+activeCardId', {
      prevUserId,
      nextUserId,
      prevCardId,
      nextCardId,
      activeSessionId: activeSessionId.value,
    })
    void ensureActiveSessionForCharacter()
  })

  // NOTICE: Synchronize character settings (systemPrompt) with the active session
  // by hot-swapping the root system message content.
  watch(systemPrompt, () => {
    if (!ready.value)
      return
    refreshActiveSystemMessage()
  })

  watch(activeSessionId, async (nextId) => {
    if (!nextId || !ready.value)
      return
    await loadSession(nextId)
    ensureSession(nextId)
  })

  // NOTICE: Cross-window sync receiver. When another window (e.g. main stage)
  // inscribes a turn (STT input, proactive message), it broadcasts a session-updated
  // event with the message payload. We apply it directly to the local store to avoid
  // race conditions with async DB persistence.
  watch(incomingSessionUpdate, (event) => {
    if (!event || event.type !== 'session-updated')
      return
    if (!ready.value)
      return
    const { sessionId, message } = event
    console.info('[ChatSession] Cross-window session-updated, applying message directly', { sessionId, role: message.role })
    // Apply directly to store — no DB roundtrip needed
    const current = sessionMessages.value[sessionId] ?? []
    // Deduplicate by message id if present
    if (message.id && current.some(m => m.id === message.id))
      return
    sessionMessages.value[sessionId] = [...current, message]
  })

  return {
    ready,
    isReady,
    initialize,

    activeSessionId,
    messages,

    setActiveSession,
    cleanupMessages,
    getAllSessions,
    resetAllSessions,

    ensureSession,
    setSessionMessages,
    persistSessionMessages,
    getSessionMessages,
    sessionMessages,
    sessionMetas,
    getSessionGeneration,
    bumpSessionGeneration,
    getSessionGenerationValue,

    deleteMessage,
    forkSession,
    inscribeTurn,
    exportSessions,
    importSessions,
    refreshActiveSystemMessage,
  }
})
