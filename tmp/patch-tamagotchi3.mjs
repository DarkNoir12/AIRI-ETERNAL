import fs from 'fs'

function patchFile(path, target, replacement) {
  let content = fs.readFileSync(path, 'utf8')
  content = content.replace(target, replacement)
  content = content.replace(target.replace(/\r\n/g, '\n'), replacement)
  content = content.replace(target.replace(/\n/g, '\r\n'), replacement)
  fs.writeFileSync(path, content)
}

const p = 'apps/stage-tamagotchi/src/renderer/components/InteractiveArea.vue'

patchFile(p, 
  `import { computed, onMounted, ref, watch } from 'vue'`,
  `import { computed, onMounted, ref, watch, useTemplateRef } from 'vue'`)

patchFile(p,
`function removeAttachment(index: number) {`,
`const isDragging = ref(false)
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

function removeAttachment(index: number) {`)

patchFile(p,
`<template>
  <div h-full w-full flex="~ col gap-1">
    <div w-full flex-1 overflow-hidden>`,
`<template>
  <div 
    h-full w-full flex="~ col gap-1"
    :class="[isDragging ? 'ring-2 ring-primary-500 rounded-lg overflow-hidden' : '']"
    @dragenter.prevent="isDragging = true"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="stopDrag"
    @drop.prevent="handleDrop"
  >
    <input ref="fileInput" type="file" accept="image/*" class="hidden" multiple @change="handleFileSelect">
    <div w-full flex-1 overflow-hidden>`)

patchFile(p,
`    <div class="flex items-center justify-end gap-2 py-1">
      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="red-500 dark:red-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        @click="() => cleanupMessages()"
      >
        <div class="i-solar:trash-bin-2-bold-duotone" />
      </button>
    </div>`,
`    <div class="flex items-center justify-end gap-2 py-1">
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
        <div class="i-solar:gallery-bold-duotone" />
      </button>

      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="red-500 dark:red-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        @click="() => cleanupMessages()"
      >
        <div class="i-solar:trash-bin-2-bold-duotone" />
      </button>
    </div>`)

console.log('Tamagotchi patch complete!')
