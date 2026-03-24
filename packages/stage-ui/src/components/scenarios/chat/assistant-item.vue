<script setup lang="ts">
import type { ChatAssistantMessage, ChatSlices, ChatSlicesText } from '../../../types/chat'

import { computed } from 'vue'

import ChatResponsePart from './response-part.vue'
import ChatToolCallBlock from './tool-call-block.vue'

import { useChatSessionStore } from '../../../stores/chat/session-store'
import { MarkdownRenderer } from '../../markdown'

const props = withDefaults(defineProps<{
  message: ChatAssistantMessage & { id?: string }
  label: string
  showPlaceholder?: boolean
  variant?: 'desktop' | 'mobile'
}>(), {
  showPlaceholder: false,
  variant: 'desktop',
})

const chatSession = useChatSessionStore()

interface DisplaySegment {
  type: 'text' | 'act'
  content: string
}

const ACT_MARKER_RE = /<\|[\w-]+:[\s\S]*?(?:\|>|>)/g

function parseAssistantDisplayText(text: string): DisplaySegment[] {
  const segments: DisplaySegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(ACT_MARKER_RE)) {
    const start = match.index ?? 0
    const raw = match[0]

    if (start > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, start),
      })
    }

    segments.push({
      type: 'act',
      content: raw,
    })

    lastIndex = start + raw.length
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    })
  }

  return segments
}

function sanitizeAssistantTextForDisplay(text: string) {
  return parseAssistantDisplayText(text)
    .filter(segment => segment.type === 'text')
    .map(segment => segment.content)
    .join('')
    .replace(/^\s*\n/, '')
}

const resolvedSlices = computed<ChatSlices[]>(() => {
  if (props.message.slices?.length) {
    return props.message.slices.reduce<ChatSlices[]>((acc, slice) => {
      if (slice.type !== 'text')
        return [...acc, slice]

      const cleaned = sanitizeAssistantTextForDisplay(slice.text)
      if (!cleaned.trim())
        return acc

      return [...acc, { ...slice, text: cleaned } satisfies ChatSlicesText]
    }, [])
  }

  if (typeof props.message.content === 'string' && props.message.content.trim()) {
    const cleaned = sanitizeAssistantTextForDisplay(props.message.content)
    if (cleaned.trim())
      return [{ type: 'text', text: cleaned } satisfies ChatSlicesText]
  }

  if (Array.isArray(props.message.content)) {
    const textPart = props.message.content.find(part => 'type' in part && part.type === 'text') as { text?: string } | undefined
    if (textPart?.text) {
      const cleaned = sanitizeAssistantTextForDisplay(textPart.text)
      if (cleaned.trim())
        return [{ type: 'text', text: cleaned } satisfies ChatSlicesText]
    }
  }

  return []
})

function getMoodArchetype(text: string): string | null {
  if (!text || typeof text !== 'string')
    return null

  // Pattern to find both ACT tags and Bracket tokens [mood]
  const matches = Array.from(text.matchAll(/<\|ACT:([\s\S]*?)\|>|\[([\w-]+)\]/gi))

  for (const match of matches) {
    let name = ''
    if (match[1]) { // ACT tag fallback
      const nameMatch = match[1].match(/"name":\s*"([^"]+)"/i)
      if (nameMatch)
        name = nameMatch[1].toLowerCase()
    }
    else if (match[2]) { // Bracket token [mood] - Priority!
      name = match[2].toLowerCase()
    }

    if (!name)
      continue

    let result = null
    // Map keywords to our 7 core visual archetypes
    if (/happy|joy|laugh|grin|chuckle|smile|beam|cheer/.test(name))
      result = 'happy'
    else if (/sad|cry|sorrow|pout|sniff|sigh|whimper|mourn/.test(name))
      result = 'sad'
    else if (/angry|mad|annoy|frustrate|growl|hiss|glare|stomp/.test(name))
      result = 'angry'
    else if (/surprise|shock|wonder|gasp|eep|awe|blink/.test(name))
      result = 'surprised'
    else if (/think|ponder|curious|hmm|mmm|doubt|question/.test(name))
      result = 'thinking'
    else if (/blush|shy|embarrassed|rose|bashful|stutter|awkward/.test(name))
      result = 'flustered'
    else if (/relax|whisper|sleepy|soft|calm|peace|yawn|purr/.test(name))
      result = 'relaxed'

    if (result)
      return result
  }

  return null
}

const mood = computed(() => {
  if (props.message.slices?.length) {
    for (const slice of props.message.slices) {
      if (slice.type === 'text') {
        const m = getMoodArchetype(slice.text)
        if (m)
          return m
      }
    }
  }

  if (typeof props.message.content === 'string') {
    return getMoodArchetype(props.message.content)
  }

  if (Array.isArray(props.message.content)) {
    const textPart = props.message.content.find(part => 'type' in part && part.type === 'text') as { text?: string } | undefined
    if (textPart?.text)
      return getMoodArchetype(textPart.text)
  }

  return null
})

const MOOD_ARCHETYPE_COLORS: Record<string, { border: string, bg: string, glow: string }> = {
  happy: { border: '#10b98180', bg: '#10b98115', glow: '#10b98130' }, // emerald
  sad: { border: '#3b82f680', bg: '#3b82f615', glow: '#3b82f630' }, // blue
  angry: { border: '#f43f5e80', bg: '#f43f5e15', glow: '#f43f5e30' }, // rose
  surprised: { border: '#a855f790', bg: '#a855f720', glow: '#a855f740' }, // vibrant purple
  thinking: { border: '#f59e0b80', bg: '#f59e0b10', glow: '#f59e0b20' }, // amber
  flustered: { border: '#f472b680', bg: '#f472b615', glow: '#f472b630' }, // pink
  relaxed: { border: '#14b8a680', bg: '#14b8a615', glow: '#14b8a630' }, // teal
}

const moodClasses = computed(() => {
  if (!mood.value)
    return ''
  return `mood-${mood.value}`
})

const showLoader = computed(() => props.showPlaceholder && resolvedSlices.value.length === 0)
const containerClass = computed(() => props.variant === 'mobile' ? 'mr-0' : 'mr-12')
const boxClasses = computed(() => [
  props.variant === 'mobile' ? 'px-2 py-2 text-sm bg-primary-50/90 dark:bg-primary-950/90' : 'px-3 py-3 bg-primary-50/80 dark:bg-primary-950/80',
  moodClasses.value,
])

const boxStyle = computed(() => {
  if (!mood.value || !MOOD_ARCHETYPE_COLORS[mood.value])
    return { border: '1px solid transparent' }
  const colors = MOOD_ARCHETYPE_COLORS[mood.value]
  return {
    borderColor: colors.border,
    borderWidth: '2px', // Increase for visibility
    borderStyle: 'solid',
    backgroundColor: colors.bg, // Tint the background directly!
    boxShadow: `0 0 15px ${colors.glow}`, // Add outer glow
  }
})

function deleteSelf() {
  if (props.message.id)
    chatSession.deleteMessage(props.message.id)
}
</script>

<template>
  <div flex :class="containerClass" class="ph-no-capture group">
    <div
      flex="~ col" shadow="sm primary-200/50 dark:none"
      h="unset <sm:fit"
      relative min-w-20 rounded-xl
      transition="all duration-300"
      :class="boxClasses"
      :style="boxStyle"
    >
      <div>
        <span text-sm text="black/60 dark:white/65" font-normal class="inline <sm:hidden">{{ label }}</span>
      </div>
      <div v-if="resolvedSlices.length > 0" class="break-words" text="primary-700 dark:primary-100">
        <template v-for="(slice, sliceIndex) in resolvedSlices" :key="sliceIndex">
          <ChatToolCallBlock
            v-if="slice.type === 'tool-call'"
            :tool-name="(slice.toolCall as any).function?.name || (slice.toolCall as any).toolName"
            :args="(slice.toolCall as any).function?.arguments || (slice.toolCall as any).args"
            :state="slice.state"
            :result="slice.result"
            class="mb-2"
          />
          <template v-else-if="slice.type === 'tool-call-result'" />
          <template v-else-if="slice.type === 'text'">
            <MarkdownRenderer :content="slice.text" />
          </template>
        </template>
      </div>
      <div v-else-if="showLoader" i-eos-icons:three-dots-loading />

      <ChatResponsePart
        v-if="message.categorization"
        :message="message"
        :variant="variant"
      />

      <button
        v-if="message.id"
        class="absolute z-10 p-1 text-black/30 opacity-0 transition-opacity -right-1 -top-1 dark:text-white/30 group-hover:opacity-100 hover:text-red-500!"
        @click="deleteSelf"
      >
        <div i-ph:trash-duotone />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Scoped styles kept here for transitions and complex selectors only */
.rounded-xl {
  transition: all 0.3s ease;
}
</style>
