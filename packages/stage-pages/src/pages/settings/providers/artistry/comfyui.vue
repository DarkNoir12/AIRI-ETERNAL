<script setup lang="ts">
import type { ComfyUIWorkflowTemplate } from '@proj-airi/stage-ui/stores/modules/artistry'

import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

const artistryStore = useArtistryStore()

const {
  comfyuiServerUrl,
  comfyuiSavedWorkflows,
  comfyuiActiveWorkflow,
} = storeToRefs(artistryStore)

// --- Connection test ---
const connectionStatus = ref<'idle' | 'testing' | 'connected' | 'failed'>('idle')
const connectionInfo = ref('')

async function testConnection() {
  connectionStatus.value = 'testing'
  connectionInfo.value = ''
  try {
    const url = comfyuiServerUrl.value.replace(/\/+$/, '')
    const resp = await fetch(`${url}/system_stats`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()
    const gpus = data.devices?.map((d: any) => d.name).join(', ') || 'Unknown GPU'
    const vram = data.devices?.[0]?.vram_total
    const vramStr = vram ? `${(vram / 1024 / 1024 / 1024).toFixed(1)} GB` : ''
    connectionInfo.value = `Connected — ${gpus}${vramStr ? ` (${vramStr} VRAM)` : ''}`
    connectionStatus.value = 'connected'
  }
  catch (e: any) {
    connectionInfo.value = `Failed: ${e.message}`
    connectionStatus.value = 'failed'
  }
}

// --- Workflow Manager ---
const showUploadSection = ref(false)
const uploadError = ref('')
const parsedWorkflow = ref<{ nodes: Array<{ id: string, title: string, type: string, inputs: Record<string, any> }> } | null>(null)
const pendingWorkflowName = ref('')
const pendingWorkflowRaw = ref<Record<string, any> | null>(null)
const selectedFields = ref<Record<string, Set<string>>>({})

function handleFileUpload(event: Event) {
  uploadError.value = ''
  parsedWorkflow.value = null
  pendingWorkflowRaw.value = null
  selectedFields.value = {}

  const input = event.target as HTMLInputElement
  const file = input?.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target?.result as string)
      pendingWorkflowRaw.value = json
      pendingWorkflowName.value = file.name.replace(/\.json$/, '')

      // Parse nodes from API format (flat object of nodeId -> node)
      const nodes: Array<{ id: string, title: string, type: string, inputs: Record<string, any> }> = []
      for (const [nodeId, node] of Object.entries(json as Record<string, any>)) {
        const title = node._meta?.title || node.class_type || `Node ${nodeId}`
        const type = node.class_type || 'Unknown'
        const inputs: Record<string, any> = {}
        for (const [key, val] of Object.entries(node.inputs || {})) {
          // Skip link arrays (connections to other nodes)
          if (!Array.isArray(val)) {
            inputs[key] = val
          }
        }
        if (Object.keys(inputs).length > 0) {
          nodes.push({ id: nodeId, title, type, inputs })
          selectedFields.value[title] = new Set()
        }
      }

      parsedWorkflow.value = { nodes }
    }
    catch (err: any) {
      uploadError.value = `Invalid JSON: ${err.message}`
    }
  }
  reader.readAsText(file)
}

function toggleField(nodeTitle: string, fieldName: string) {
  const set = selectedFields.value[nodeTitle]
  if (!set) return
  if (set.has(fieldName)) {
    set.delete(fieldName)
  }
  else {
    set.add(fieldName)
  }
}

function isFieldSelected(nodeTitle: string, fieldName: string): boolean {
  return selectedFields.value[nodeTitle]?.has(fieldName) ?? false
}

const totalExposed = computed(() => {
  let count = 0
  for (const set of Object.values(selectedFields.value)) {
    count += set.size
  }
  return count
})

function saveWorkflow() {
  if (!pendingWorkflowRaw.value || !pendingWorkflowName.value.trim()) return

  const exposedFields: Record<string, string[]> = {}
  for (const [title, fields] of Object.entries(selectedFields.value)) {
    const arr = Array.from(fields)
    if (arr.length > 0) {
      exposedFields[title] = arr
    }
  }

  const id = pendingWorkflowName.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const template: ComfyUIWorkflowTemplate = {
    id,
    name: pendingWorkflowName.value.trim(),
    workflow: pendingWorkflowRaw.value,
    exposedFields,
  }

  const existing = comfyuiSavedWorkflows.value.findIndex(w => w.id === id)
  if (existing >= 0) {
    comfyuiSavedWorkflows.value[existing] = template
  }
  else {
    comfyuiSavedWorkflows.value = [...comfyuiSavedWorkflows.value, template]
  }

  // Auto-set as active if it's the first one
  if (!comfyuiActiveWorkflow.value) {
    comfyuiActiveWorkflow.value = id
  }

  // Reset upload state
  showUploadSection.value = false
  parsedWorkflow.value = null
  pendingWorkflowRaw.value = null
  selectedFields.value = {}
  pendingWorkflowName.value = ''
}

function removeWorkflow(id: string) {
  comfyuiSavedWorkflows.value = comfyuiSavedWorkflows.value.filter(w => w.id !== id)
  if (comfyuiActiveWorkflow.value === id) {
    comfyuiActiveWorkflow.value = comfyuiSavedWorkflows.value[0]?.id || ''
  }
}

function formatValue(val: any): string {
  if (typeof val === 'string') return val.length > 40 ? `"${val.slice(0, 37)}..."` : `"${val}"`
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return String(val)
  return JSON.stringify(val)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Header -->
    <div class="bg-indigo-500/8 dark:bg-indigo-500/12 rounded-xl p-5">
      <div class="flex items-center gap-3 mb-3">
        <div class="i-solar:gallery-bold-duotone text-3xl text-indigo-500" />
        <div>
          <h2 class="text-xl font-semibold text-neutral-800 dark:text-neutral-100">
            ComfyUI Native API
          </h2>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            Connect to your local ComfyUI and bring your own workflows.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <div class="rounded-lg bg-white/60 dark:bg-neutral-800/60 p-3">
          <div class="text-xs font-medium text-neutral-400 dark:text-neutral-500 mb-1">
            What You Need
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            ComfyUI running locally or on your network.
          </div>
        </div>
        <div class="rounded-lg bg-white/60 dark:bg-neutral-800/60 p-3">
          <div class="text-xs font-medium text-neutral-400 dark:text-neutral-500 mb-1">
            How To Export
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            Enable Dev Mode → "Save (API Format)".
          </div>
        </div>
        <div class="rounded-lg bg-white/60 dark:bg-neutral-800/60 p-3">
          <div class="text-xs font-medium text-neutral-400 dark:text-neutral-500 mb-1">
            Scope Boundary
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            Model downloads & node installs are your job.
          </div>
        </div>
      </div>
    </div>

    <!-- Connection -->
    <div class="flex flex-col gap-4">
      <h3 class="text-lg font-medium text-neutral-700 dark:text-neutral-300">
        Connection
      </h3>
      <div class="flex gap-3 items-end">
        <div class="flex-1">
          <FieldInput
            v-model="comfyuiServerUrl"
            label="Server URL"
            description="The address where ComfyUI is running"
            placeholder="http://localhost:8188"
          />
        </div>
        <button
          class="mb-0.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-200"
          :class="{
            'bg-indigo-500 text-white hover:bg-indigo-600': connectionStatus !== 'testing',
            'bg-neutral-300 text-neutral-500 cursor-wait': connectionStatus === 'testing',
          }"
          :disabled="connectionStatus === 'testing'"
          @click="testConnection"
        >
          {{ connectionStatus === 'testing' ? 'Testing...' : '🔌 Test' }}
        </button>
      </div>
      <div
        v-if="connectionInfo"
        class="text-sm rounded-lg px-3 py-2"
        :class="{
          'bg-green-500/10 text-green-600 dark:text-green-400': connectionStatus === 'connected',
          'bg-red-500/10 text-red-600 dark:text-red-400': connectionStatus === 'failed',
        }"
      >
        {{ connectionInfo }}
      </div>
    </div>

    <!-- Saved Workflows -->
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-medium text-neutral-700 dark:text-neutral-300">
          Workflow Templates
        </h3>
        <button
          class="rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500/20 transition-colors"
          @click="showUploadSection = !showUploadSection"
        >
          {{ showUploadSection ? '✕ Cancel' : '+ Upload Workflow' }}
        </button>
      </div>

      <!-- Workflow List -->
      <div v-if="comfyuiSavedWorkflows.length === 0 && !showUploadSection" class="text-sm text-neutral-400 dark:text-neutral-500 italic">
        No workflows uploaded yet. Click "Upload Workflow" to import a workflow_api.json from ComfyUI.
      </div>

      <div v-for="wf in comfyuiSavedWorkflows" :key="wf.id" class="flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
        <input
          type="radio"
          :checked="comfyuiActiveWorkflow === wf.id"
          name="active-workflow"
          class="accent-indigo-500"
          @change="comfyuiActiveWorkflow = wf.id"
        >
        <div class="flex-1">
          <div class="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            {{ wf.name }}
          </div>
          <div class="text-xs text-neutral-400 dark:text-neutral-500">
            {{ Object.keys(wf.workflow).length }} nodes · {{ Object.values(wf.exposedFields).reduce((n, arr) => n + arr.length, 0) }} exposed fields
          </div>
        </div>
        <button
          class="text-red-400 hover:text-red-500 text-xs transition-colors"
          @click="removeWorkflow(wf.id)"
        >
          Remove
        </button>
      </div>

      <!-- Upload Section -->
      <div v-if="showUploadSection" class="rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 p-5 flex flex-col gap-4">
        <div class="flex flex-col items-center gap-2">
          <div class="text-3xl text-indigo-400">
            📋
          </div>
          <div class="text-sm text-neutral-600 dark:text-neutral-400">
            Drop or select a <code class="bg-neutral-100 dark:bg-neutral-800 rounded px-1">workflow_api.json</code> file
          </div>
          <input
            type="file"
            accept=".json"
            class="text-sm"
            @change="handleFileUpload"
          >
        </div>

        <div v-if="uploadError" class="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">
          {{ uploadError }}
        </div>

        <!-- Field Picker -->
        <div v-if="parsedWorkflow" class="flex flex-col gap-3">
          <FieldInput
            v-model="pendingWorkflowName"
            label="Workflow Name"
            description="Give this workflow a recognizable name"
            placeholder="e.g. Anime Text2Img"
          />

          <div class="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Select fields to expose to the AI agent:
          </div>

          <div class="max-h-80 overflow-y-auto flex flex-col gap-2">
            <div
              v-for="node in parsedWorkflow.nodes"
              :key="node.id"
              class="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3"
            >
              <div class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                {{ node.title }}
                <span class="text-xs text-neutral-400 ml-1">({{ node.type }})</span>
              </div>
              <div class="flex flex-col gap-1 pl-3">
                <label
                  v-for="(val, field) in node.inputs"
                  :key="String(field)"
                  class="flex items-center gap-2 text-xs cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded px-1 py-0.5"
                >
                  <input
                    type="checkbox"
                    class="accent-indigo-500"
                    :checked="isFieldSelected(node.title, String(field))"
                    @change="toggleField(node.title, String(field))"
                  >
                  <span class="font-mono text-neutral-600 dark:text-neutral-400">{{ field }}</span>
                  <span class="text-neutral-400 dark:text-neutral-500 truncate">= {{ formatValue(val) }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between mt-2">
            <span class="text-xs text-neutral-400">{{ totalExposed }} field(s) exposed</span>
            <button
              class="rounded-lg bg-indigo-500 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="!pendingWorkflowName.trim() || totalExposed === 0"
              @click="saveWorkflow"
            >
              Save Workflow
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.provider.comfyui.settings.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
