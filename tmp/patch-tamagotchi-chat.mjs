import fs from 'fs'

const path = 'apps/stage-tamagotchi/src/renderer/components/InteractiveArea.vue'
let content = fs.readFileSync(path, 'utf8')

// 1. Script injection
const scriptTarget = `function removeAttachment(index: number) {`
const scriptReplacement = `const isDragging = ref(false)
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

function removeAttachment(index: number) {`

content = content.replace(scriptTarget, scriptReplacement)

// 2. Template wrapper injection
const templateTarget = `<template>
  <div h-full w-full flex="~ col gap-1">
    <div w-full flex-1 overflow-hidden>`
const templateReplacement = `<template>
  <div 
    h-full w-full flex="~ col gap-1"
    :class="[isDragging ? 'ring-2 ring-primary-500' : '']"
    @dragenter.prevent="isDragging = true"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="stopDrag"
    @drop.prevent="handleDrop"
  >
    <input ref="fileInput" type="file" accept="image/*" class="hidden" multiple @change="handleFileSelect">
    <div w-full flex-1 overflow-hidden>`

content = content.replace(templateTarget, templateReplacement)
// Handle potential CRLF
content = content.replace(templateTarget.replace(/\r\n/g, '\n'), templateReplacement)

// 3. Button injection
const buttonTarget = `    <div class="flex items-center justify-end gap-2 py-1">
      <button`
const buttonReplacement = `    <div class="flex items-center justify-end gap-2 py-1">
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
      <button`
      
content = content.replace(buttonTarget, buttonReplacement)
content = content.replace(buttonTarget.replace(/\r\n/g, '\n'), buttonReplacement)

fs.writeFileSync(path, content)
console.log('Patched tamagotchi InteractiveArea.vue successfully.')
