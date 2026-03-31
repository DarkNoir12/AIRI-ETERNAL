<script setup lang="ts">
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'

import MarkdownRenderer from '../../markdown/markdown-renderer.vue'

interface Props {
  characterName?: string
  systemPrompt: string
}

const props = defineProps<Props>()
const showDialog = defineModel<boolean>({ default: false })
</script>

<template>
  <DialogRoot :open="showDialog" @update:open="val => showDialog = val">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-[9999] max-h-[90dvh] max-w-2xl w-[92dvw] flex flex-col transform overflow-hidden border border-neutral-200 rounded-2xl bg-white p-6 shadow-xl outline-none backdrop-blur-md -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:border-neutral-800 dark:bg-neutral-900">
        <div class="mb-4 flex items-center justify-between">
          <DialogTitle class="text-xl text-neutral-800 font-semibold dark:text-neutral-100">
            {{ characterName || 'Character' }} Context
          </DialogTitle>
          <button
            class="rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
            @click="showDialog = false"
          >
            <div class="i-solar:close-circle-bold-duotone text-2xl" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto pr-2 scrollbar-none">
          <div class="mb-4 border border-primary-200 rounded-xl bg-primary-50/30 p-4 dark:border-primary-900/30 dark:bg-primary-950/20">
            <p class="text-sm text-primary-700 leading-relaxed dark:text-primary-300">
              This is your character's context you control this in the settings, if you want to change the way it behaves you change the corresponding field.
            </p>
          </div>

          <div class="min-h-[100px] border border-neutral-200 rounded-xl border-dashed bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
            <MarkdownRenderer
              v-if="systemPrompt"
              :content="systemPrompt"
              class="text-sm text-neutral-700 leading-6 dark:text-neutral-300"
            />
            <div v-else class="h-32 flex items-center justify-center text-sm text-neutral-400 font-mono italic">
              &lt; No System Prompt Defined &gt;
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
/* Ensure the markdown content doesn't break the layout */
:deep(.markdown-content) {
  overflow-wrap: break-word;
}
</style>
