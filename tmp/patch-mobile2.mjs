import fs from 'fs'

function patchFile(path, target, replacement) {
  let content = fs.readFileSync(path, 'utf8')
  content = content.replace(target, replacement)
  content = content.replace(target.replace(/\r\n/g, '\n'), replacement)
  fs.writeFileSync(path, content)
}

const p = 'packages/stage-layouts/src/components/Layouts/MobileInteractiveArea.vue'

// 1. Script block
patchFile(p,
`    reader.readAsDataURL(file)
  }
}

function removeAttachment(index: number) {`,
`    reader.readAsDataURL(file)
  }
}

const isDragging = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) {
    onAttachFiles(Array.from(target.files))
  }
  target.value = ''
}

function stopDrag() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files?.length) {
    onAttachFiles(Array.from(e.dataTransfer.files))
  }
}

function removeAttachment(index: number) {`)

// 2. Wrap div
patchFile(p,
`<div bg="white dark:neutral-800" max-h-100dvh max-w-100dvw w-full flex flex-col gap-1 overflow-auto px-3 pt-2 :style="{ paddingBottom: \`\${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 12)}px\` }">`,
`<div 
        bg="white dark:neutral-800" max-h-100dvh max-w-100dvw w-full flex flex-col gap-1 overflow-auto px-3 pt-2 
        :style="{ paddingBottom: \`\${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 12)}px\` }"
        :class="[isDragging ? 'ring-2 ring-primary-500 rounded-t-2xl' : '']"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="stopDrag"
        @drop.prevent="handleDrop"
      >
        <input ref="fileInput" type="file" accept="image/*" class="hidden" multiple @change="handleFileSelect">`)

// 3. Button
patchFile(p,
`          <button
            border="2 solid neutral-100/60 dark:neutral-800/30"
            bg="neutral-50/70 dark:neutral-800/70"
            w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
            title="Cleanup Messages"
            @click="cleanupMessages()"
          >
            <div class="i-solar:trash-bin-2-bold-duotone" />
          </button>`,
`          <button
            border="2 solid neutral-100/60 dark:neutral-800/30"
            bg="neutral-50/70 dark:neutral-800/70"
            w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
            title="Attach Image"
            @click="fileInput?.click()"
          >
            <div class="i-solar:gallery-bold-duotone" />
          </button>
          <button
            border="2 solid neutral-100/60 dark:neutral-800/30"
            bg="neutral-50/70 dark:neutral-800/70"
            w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
            title="Cleanup Messages"
            @click="cleanupMessages()"
          >
            <div class="i-solar:trash-bin-2-bold-duotone" />
          </button>`)

console.log('Patch complete for mobile')
