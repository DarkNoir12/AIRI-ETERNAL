<script setup lang="ts">
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { estimateTokens, formatTokenCount } from '@proj-airi/stage-shared'
import {
  CharacterContextDialog,
  ChatHistory,
  ChatMemoryPopover,
  MarkdownRenderer,
} from '@proj-airi/stage-ui/components'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatMaintenanceStore } from '@proj-airi/stage-ui/stores/chat/maintenance'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useShortTermMemoryStore } from '@proj-airi/stage-ui/stores/memory-short-term'
import { useTextJournalStore } from '@proj-airi/stage-ui/stores/memory-text-journal'
import { buildSystemPrompt, useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProactivityStore } from '@proj-airi/stage-ui/stores/proactivity'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsChat } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { builtinTools } from '../stores/tools/builtin'

const router = useRouter()
const messageInput = ref('')
const attachments = ref<{ type: 'image', data: string, mimeType: string, url: string }[]>([])

const chatOrchestrator = useChatOrchestratorStore()
const chatSession = useChatSessionStore()
const chatStream = useChatStreamStore()
const textJournalStore = useTextJournalStore()
const backgroundStore = useBackgroundStore()
const airiCardStore = useAiriCardStore()
const proactivityStore = useProactivityStore()

const { activeCard } = storeToRefs(airiCardStore)
const shortTermMemory = useShortTermMemoryStore()

const { cleanupMessages } = useChatMaintenanceStore()
const { ingest, onAfterMessageComposed } = chatOrchestrator
const { messages } = storeToRefs(chatSession)
const { streamingMessage } = storeToRefs(chatStream)
const { sending } = storeToRefs(chatOrchestrator)
const { activeCardId } = storeToRefs(airiCardStore)
const { t } = useI18n()
const providersStore = useProvidersStore()
const { activeModel, activeProvider } = storeToRefs(useConsciousnessStore())
const settingsChat = useSettingsChat()
const isComposing = ref(false)
const CHAT_WINDOW_TITLE = 'AIRI - Chat Window'

// --- Journal Preview Data ---
const latestTextEntries = computed(() => {
  if (!activeCardId.value)
    return []

  const manualEntries = textJournalStore.entries
    .filter(e => e.characterId === activeCardId.value)
    .map(e => ({
      id: e.id,
      type: 'manual' as const,
      timestamp: e.createdAt,
      title: e.title,
      content: e.content,
    }))

  const autoEntries = shortTermMemory.getCharacterBlocks(activeCardId.value)
    .map((b) => {
      // Robust stripping of markdown code fences (``` or ~~~) with optional language tag
      const fenceMatch = b.summary.trim().match(/^(?:`{3,}|~{3,})[\w-]*\n?([\s\S]*?)\n?(?:`{3,}|~{3,})$/)
      const content = fenceMatch ? fenceMatch[1].trim() : b.summary.trim()

      return ({
        id: b.id,
        type: 'auto' as const,
        timestamp: b.updatedAt || b.createdAt,
        title: `My thoughts after ${b.messageCount} messages together~`,
        content,
      })
    })

  return [...manualEntries, ...autoEntries]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 2)
})

const latestImageEntries = computed(() => {
  if (!activeCardId.value)
    return []
  return backgroundStore.journalEntries.slice(0, 3)
})

// --- Inline Preview Modal ---
const previewModal = ref<{
  type: 'text' | 'image'
  title: string
  content: string // text content or image URL
} | null>(null)

function openTextPreview(entry: { title: string, content: string }) {
  previewModal.value = { type: 'text', title: entry.title, content: entry.content }
}

function openImagePreview(entry: { title: string, url: string | null }) {
  if (!entry.url)
    return
  previewModal.value = { type: 'image', title: entry.title, content: entry.url }
}

function closePreview() {
  previewModal.value = null
}

// --- Date Formatting ---
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-CA') // YYYY-MM-DD
}

function formatLocalDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const trashConfirmOpen = ref(false)
const showContext = ref(false)

const characterName = computed(() => activeCard.value?.name || 'AIRI')
const effectiveSystemPrompt = computed(() => buildSystemPrompt(activeCard.value))

function handleTrashClick() {
  const today = formatLocalDayKey(new Date())
  const isTodayCached = activeCardId.value && shortTermMemory.getCharacterBlocks(activeCardId.value).some(b => b.date === today)
  if (!isTodayCached && messages.value.length > 0) {
    trashConfirmOpen.value = true
    return
  }
  cleanupMessages()
}

async function handleSaveAndClear() {
  trashConfirmOpen.value = false
  if (activeCardId.value) {
    try {
      await shortTermMemory.rebuildToday(activeCardId.value)
    }
    catch (err) {
      console.error('[InteractiveArea] Failed to cache today before clear:', err)
    }
  }
  cleanupMessages()
}

function handleClearAnyway() {
  trashConfirmOpen.value = false
  cleanupMessages()
}

// --- Deep Links ---
function navigateToImageJournal() {
  if (!activeCardId.value)
    return
  router.push(`/settings/airi-card?cardId=${activeCardId.value}&tab=gallery`)
}

function updateWindowTitle() {
  const nextTitle = messageInput.value.trim()
    ? `${CHAT_WINDOW_TITLE} - User Typing...`
    : CHAT_WINDOW_TITLE

  if (document.title !== nextTitle)
    document.title = nextTitle
}

async function handleSend() {
  if (isComposing.value) {
    return
  }

  if (!messageInput.value.trim() && !attachments.value.length) {
    return
  }

  let textToSend = messageInput.value
  if (activeCard.value?.extensions?.airi?.groundingEnabled) {
    const sensorData = proactivityStore.sensorPayload
    if (sensorData) {
      textToSend = `[Grounding Context]\n${sensorData}\n\n---\nUser Says:\n${textToSend}`
    }
  }

  const attachmentsToSend = attachments.value.map(att => ({ ...att }))

  // optimistic clear
  messageInput.value = ''
  attachments.value = []

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)
    await ingest(textToSend, {
      model: activeModel.value,
      chatProvider: await providersStore.getProviderInstance<ChatProvider>(activeProvider.value),
      providerConfig,
      attachments: attachmentsToSend,
      tools: builtinTools,
    })

    attachmentsToSend.forEach(att => URL.revokeObjectURL(att.url))
  }
  catch (error) {
    // restore on failure
    messageInput.value = textToSend
    attachments.value = attachmentsToSend.map(att => ({
      ...att,
      url: URL.createObjectURL(new Blob([Uint8Array.from(atob(att.data), c => c.charCodeAt(0))], { type: att.mimeType })),
    }))
  }
}

async function handleFilePaste(files: File[]) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64Data = (e.target?.result as string)?.split(',')[1]
        if (base64Data) {
          attachments.value.push({
            type: 'image' as const,
            data: base64Data,
            mimeType: file.type,
            url: URL.createObjectURL(file),
          })
        }
      }
      reader.readAsDataURL(file)
    }
  }
}

const isDragging = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) {
    handleFilePaste(Array.from(target.files))
  }
  target.value = ''
}

function stopDrag() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files?.length) {
    handleFilePaste(Array.from(e.dataTransfer.files))
  }
}

function removeAttachment(index: number) {
  const attachment = attachments.value[index]
  if (attachment) {
    URL.revokeObjectURL(attachment.url)
    attachments.value.splice(index, 1)
  }
}

onAfterMessageComposed(async () => {
  messageInput.value = ''
  attachments.value.forEach(att => URL.revokeObjectURL(att.url))
  attachments.value = []
})

const historyMessages = computed(() => messages.value as unknown as ChatHistoryItem[])

// --- Token Counter ---
const sessionTokenCount = computed(() => {
  let total = 0
  for (const message of historyMessages.value) {
    if (typeof message.content === 'string') {
      total += estimateTokens(message.content)
    }
    else if (Array.isArray(message.content)) {
      const textOnly = message.content
        .map((part) => {
          if (typeof part === 'string')
            return part
          if (part && typeof part === 'object' && 'text' in part && !('image_url' in part))
            return String(part.text ?? '')
          return ''
        })
        .join('')
      total += estimateTokens(textOnly)
    }
  }
  return total
})

const formattedTokenCount = computed(() => formatTokenCount(sessionTokenCount.value))

const contextWidth = computed(() => activeCard.value?.extensions?.airi?.generation?.known?.contextWidth)
const contextPercentage = computed(() => {
  if (!contextWidth.value)
    return 0
  return (sessionTokenCount.value / contextWidth.value) * 100
})

onMounted(() => {
  updateWindowTitle()
  textJournalStore.load()
  shortTermMemory.load()
})

watch(messageInput, () => {
  updateWindowTitle()
})
</script>

<template>
  <div
    h-full w-full flex="~ col gap-1"
    :class="[isDragging ? 'ring-2 ring-primary-500 rounded-lg overflow-hidden' : '']"
    @dragenter.prevent="isDragging = true"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="stopDrag"
    @drop.prevent="handleDrop"
    @keydown.escape="closePreview"
  >
    <input ref="fileInput" type="file" accept="image/*" class="hidden" multiple @change="handleFileSelect">
    <div w-full flex-1 overflow-hidden>
      <ChatHistory
        :messages="historyMessages"
        :sending="sending"
        :streaming-message="streamingMessage"
      />
    </div>

    <!-- Journal Preview Chips -->
    <div v-if="latestTextEntries.length > 0 || latestImageEntries.length > 0" class="flex gap-2 overflow-x-auto px-2 py-1 scrollbar-none">
      <!-- Text Journal Chips -->
      <div
        v-for="entry in latestTextEntries"
        :key="entry.id"
        :class="[
          'min-w-32 max-w-44 flex flex-col cursor-pointer',
          'border border-primary-200/30 rounded-lg bg-primary-50/50 p-2 text-xs',
          'transition-all hover:bg-primary-100/50',
          'dark:border-primary-800/30 dark:bg-primary-900/30 dark:hover:bg-primary-800/50',
        ]"
        @click="openTextPreview(entry)"
      >
        <div :class="['flex items-center gap-1', 'text-primary-500 text-[10px] font-bold uppercase tracking-tighter']">
          <div :class="entry.type === 'auto' ? 'i-solar:magic-stick-3-bold-duotone' : 'i-solar:notebook-bold-duotone'" />
          <span>{{ formatDate(entry.timestamp) }}</span>
        </div>
        <div :class="['line-clamp-2', 'text-primary-900/70 dark:text-primary-100/70']">
          {{ entry.title }}
        </div>
      </div>

      <!-- Image Journal Chips -->
      <div
        v-for="entry in latestImageEntries"
        :key="entry.id"
        :class="[
          'relative h-14 w-14 shrink-0 cursor-pointer of-hidden rounded-lg',
          'border border-primary-200/30 transition-all hover:border-primary-500',
          'dark:border-primary-800/30 dark:hover:border-primary-400',
        ]"
        @click="openImagePreview(entry)"
      >
        <img :src="entry.url || ''" class="h-full w-full object-cover">
        <div :class="['absolute inset-0 flex items-end p-1', 'bg-gradient-to-t from-black/60 to-transparent']">
          <span class="truncate text-[8px] text-white font-medium">{{ entry.title }}</span>
        </div>
      </div>
    </div>

    <div v-if="attachments.length > 0" class="flex flex-wrap gap-2 border-t border-primary-100 p-2">
      <div v-for="(attachment, index) in attachments" :key="index" class="relative">
        <img :src="attachment.url" class="h-20 w-20 rounded-md object-cover">
        <button class="absolute right-1 top-1 h-5 w-5 flex items-center justify-center rounded-full bg-red-500 text-xs text-white" @click="removeAttachment(index)">
          &times;
        </button>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 py-1">
      <div
        v-if="contextWidth"
        class="flex cursor-help items-center gap-1.5 px-2 py-1"
        :title="`Context: ${formattedTokenCount} / ${formatTokenCount(contextWidth)} (${contextPercentage.toFixed(1)}%)`"
      >
        <div class="i-solar:graph-bold-duotone text-[10px] text-neutral-400 dark:text-neutral-500" />
        <span class="text-[10px] text-neutral-400 font-bold leading-none tracking-tight uppercase dark:text-neutral-500">{{ formattedTokenCount }}</span>
        <div class="h-1.5 w-12 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            class="h-full transition-all duration-300"
            :class="[
              contextPercentage > 85 ? 'bg-red-500' : contextPercentage > 60 ? 'bg-amber-500' : 'bg-emerald-500',
            ]"
            :style="{ width: `${Math.min(contextPercentage, 100)}%` }"
          />
        </div>
      </div>
      <div
        v-else
        class="flex cursor-help items-center gap-1.5 px-2 py-1 text-[10px] font-bold tracking-tight uppercase"
        :class="[
          sessionTokenCount > 100000 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400 dark:text-neutral-500',
        ]"
        title="Est. of tokens used for this chat"
      >
        <div class="i-solar:graph-bold-duotone text-xs" />
        <span>{{ formattedTokenCount }}</span>
      </div>

      <!-- Grounding Toggle -->
      <button
        :class="[
          'max-h-[10lh] min-h-[1lh]',
          'flex items-center justify-center rounded-md p-2 outline-none',
          'transition-colors transition-transform active:scale-95',
          activeCard?.extensions?.airi?.groundingEnabled
            ? 'bg-amber-100 text-lg text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
            : 'bg-neutral-100 text-lg text-neutral-500 hover:text-primary-500 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:text-primary-400',
        ]"
        :title="activeCard?.extensions?.airi?.groundingEnabled ? 'Grounding Active — sensor data attached to messages' : 'Attach sensor data with each message (Visit Proactivity tab to preview)'"
        @click="airiCardStore.toggleGrounding(activeCardId)"
      >
        <div :class="[activeCard?.extensions?.airi?.groundingEnabled ? 'i-solar:cpu-bolt-bold-duotone' : 'i-solar:cpu-bold-duotone']" />
      </button>

      <!-- Memory & Context -->
      <ChatMemoryPopover
        show-cache-status
        :title="`Memory & Context for ${characterName}`"
        @view-context="showContext = true"
      />

      <!-- Image Journal Deep Link -->
      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="primary-500 dark:primary-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        title="Image Journal"
        @click="navigateToImageJournal"
      >
        <div class="i-solar:gallery-bold-duotone" />
      </button>

      <!-- Attach Image -->
      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="primary-500 dark:primary-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        title="Attach Image"
        @click="fileInput?.click()"
      >
        <div class="i-solar:camera-add-bold-duotone" />
      </button>

      <!-- Clear Messages (with safety hook) -->
      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="red-500 dark:red-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        title="Clear Messages"
        @click="handleTrashClick"
      >
        <div class="i-solar:trash-bin-2-bold-duotone" />
      </button>

      <!-- Send (Dual Use) -->
      <div
        class="flex items-center gap-0.5 overflow-hidden rounded-lg shadow-sm transition-colors"
        bg="primary-500 hover:primary-600"
        max-h="[10lh]"
      >
        <button
          class="h-9 flex items-center justify-center px-3 outline-none transition-transform active:scale-95"
          text="white"
          title="Send Message"
          @click="handleSend"
        >
          <div class="i-solar:plain-2-bold-duotone mr-1.5 text-lg" />
          <span class="text-xs font-bold leading-none tracking-tighter uppercase">Send</span>
        </button>

        <PopoverRoot>
          <PopoverTrigger as-child>
            <button
              class="h-9 w-6 flex items-center justify-center border-l border-white/20 outline-none hover:bg-white/10"
              text="white"
              title="Change Send Key Mode"
            >
              <div class="i-solar:alt-arrow-down-linear text-xs" />
            </button>
          </PopoverTrigger>
          <PopoverPortal>
            <PopoverContent
              class="z-100 flex flex-col gap-1 border border-neutral-200 rounded-xl bg-white/95 p-1.5 shadow-2xl backdrop-blur-md dark:border-neutral-700 dark:bg-neutral-900/95"
              side="top"
              align="end"
              :side-offset="12"
            >
              <div class="px-2 py-1 text-[10px] text-neutral-400 font-bold tracking-wider uppercase">
                Send Key Mode
              </div>
              <button
                v-for="mode in (['enter', 'ctrl-enter', 'double-enter'] as const)"
                :key="mode"
                :class="[
                  'px-3 py-2 text-xs font-semibold rounded-lg transition-all text-left flex items-center justify-between gap-4',
                  settingsChat.sendMode === mode
                    ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-300'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
                ]"
                @click="settingsChat.sendMode = mode"
              >
                <span>{{ mode === 'enter' ? 'Enter' : mode === 'ctrl-enter' ? 'Ctrl + Enter' : 'Double Enter' }}</span>
                <div v-if="settingsChat.sendMode === mode" class="i-solar:check-circle-bold text-sm" />
              </button>
            </PopoverContent>
          </PopoverPortal>
        </PopoverRoot>
      </div>
    </div>
    <BasicTextarea
      v-model="messageInput"
      :send-mode="settingsChat.sendMode"
      :placeholder="t('stage.message')"
      class="ph-no-capture"
      text="primary-600 dark:primary-100  placeholder:primary-500 dark:placeholder:primary-200"
      border="solid 2 primary-200/20 dark:primary-400/20"
      bg="primary-100/50 dark:primary-900/70"
      max-h="[10lh]" min-h="[1lh]"
      w-full shrink-0 resize-none overflow-y-scroll rounded-xl p-2 font-medium outline-none
      transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
      @submit="handleSend"
      @compositionstart="isComposing = true"
      @compositionend="isComposing = false"
      @attach="handleFilePaste"
    />

    <!-- Inline Preview Modal -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="previewModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          @click.self="closePreview"
        >
          <div
            :class="[
              'relative mx-4 max-h-[80vh] max-w-md w-full overflow-hidden rounded-2xl',
              'bg-white shadow-2xl dark:bg-neutral-900',
              'animate-scale-in',
            ]"
          >
            <!-- Header -->
            <div :class="['flex items-center justify-between border-b border-neutral-200/50 px-4 py-3', 'dark:border-neutral-700/50']">
              <div :class="['flex items-center gap-2 text-sm font-bold', 'text-neutral-800 dark:text-neutral-100']">
                <div :class="previewModal.type === 'text' ? 'i-solar:notebook-bold-duotone' : 'i-solar:gallery-bold-duotone'" />
                <span class="truncate">{{ previewModal.title }}</span>
              </div>
              <button
                :class="['rounded-full p-1 text-neutral-400 transition-colors', 'hover:bg-neutral-100 hover:text-neutral-600', 'dark:hover:bg-neutral-800 dark:hover:text-neutral-200']"
                @click="closePreview"
              >
                <div i-solar:close-circle-bold-duotone class="text-lg" />
              </button>
            </div>

            <!-- Content -->
            <div v-if="previewModal.type === 'text'" class="max-h-[60vh] overflow-y-auto px-4 py-3">
              <MarkdownRenderer
                :content="previewModal.content"
                class="max-w-none prose prose-sm dark:prose-invert"
              />
            </div>
            <div v-else class="flex items-center justify-center p-2">
              <img :src="previewModal.content" class="max-h-[60vh] w-auto rounded-lg object-contain">
            </div>
          </div>
        </div>
      </Transition>

      <!-- Trash Safety Confirmation Dialog -->
      <Transition name="modal-fade">
        <div
          v-if="trashConfirmOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          @click.self="trashConfirmOpen = false"
        >
          <div
            :class="[
              'relative mx-4 max-w-sm w-full overflow-hidden rounded-2xl',
              'bg-white shadow-2xl dark:bg-neutral-900',
              'animate-scale-in',
            ]"
          >
            <div class="px-5 pb-3 pt-5">
              <div :class="['flex items-center gap-2 text-base font-bold', 'text-neutral-800 dark:text-neutral-100']">
                <div class="i-solar:danger-triangle-bold-duotone text-amber-500" />
                Unsaved Memories
              </div>
              <p :class="['mt-2 text-sm leading-relaxed', 'text-neutral-600 dark:text-neutral-400']">
                You haven't saved today's memories yet. Your character may lose context from this session.
              </p>
            </div>

            <div :class="['flex gap-2 border-t px-5 py-3', 'border-neutral-200/50 dark:border-neutral-700/50']">
              <button
                :class="[
                  'flex-1 rounded-lg px-3 py-2 text-xs font-semibold',
                  'bg-primary-500 text-white transition-colors',
                  'hover:bg-primary-600',
                ]"
                :disabled="shortTermMemory.rebuilding"
                @click="handleSaveAndClear"
              >
                {{ shortTermMemory.rebuilding ? 'Saving...' : 'Save & Clear' }}
              </button>
              <button
                :class="[
                  'flex-1 rounded-lg px-3 py-2 text-xs font-semibold',
                  'bg-red-100 text-red-600 transition-colors',
                  'hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-800/30',
                ]"
                @click="handleClearAnyway"
              >
                Clear Anyway
              </button>
              <button
                :class="[
                  'flex-1 rounded-lg px-3 py-2 text-xs font-semibold',
                  'bg-neutral-100 text-neutral-600 transition-colors',
                  'hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700',
                ]"
                @click="trashConfirmOpen = false"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <!-- Context Dialog -->
    <CharacterContextDialog
      v-model="showContext"
      :character-name="characterName"
      :system-prompt="effectiveSystemPrompt"
    />
  </div>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.animate-scale-in {
  animation: scale-in 0.2s ease-out;
}

@keyframes scale-in {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
