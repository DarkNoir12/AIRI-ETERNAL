import fs from 'fs'

const path = 'packages/stage-layouts/src/components/Layouts/MobileInteractiveArea.vue'
let content = fs.readFileSync(path, 'utf8')

const target = `    reader.readAsDataURL(file)
  }
}

function removeAttachment(index: number) {`

const replacement = `    reader.readAsDataURL(file)
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

function removeAttachment(index: number) {`

content = content.replace(target, replacement)
content = content.replace(target.replace(/\r\n/g, '\n'), replacement)
fs.writeFileSync(path, content)
