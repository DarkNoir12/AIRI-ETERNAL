import fs from 'fs'

function patchFile(path, target, replacement) {
  let content = fs.readFileSync(path, 'utf8')
  content = content.replace(target, replacement)
  content = content.replace(target.replace(/\r\n/g, '\n'), replacement)
  fs.writeFileSync(path, content)
}

// MobileInteractiveArea.vue script part
patchFile('packages/stage-layouts/src/components/Layouts/MobileInteractiveArea.vue',
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

// ChatArea.vue script part
patchFile('packages/stage-layouts/src/components/Widgets/ChatArea.vue',
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

console.log('Patch complete')
