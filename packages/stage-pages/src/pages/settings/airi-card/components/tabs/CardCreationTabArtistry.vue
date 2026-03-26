<script setup lang="ts">
import { REPLICATE_PRESETS } from '@proj-airi/stage-shared'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { FieldInput } from '@proj-airi/ui'
import { Select } from '@proj-airi/ui/components/form'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  artistryProviderOptions: { value: string, label: string }[]
  defaultArtistryProviderPlaceholder: string
}>()
const selectedArtistryProvider = defineModel<string>('selectedArtistryProvider', { required: true })
const selectedArtistryModel = defineModel<string>('selectedArtistryModel', { required: true })
const selectedArtistryPromptPrefix = defineModel<string>('selectedArtistryPromptPrefix', { required: true })
const selectedArtistryWidgetInstruction = defineModel<string>('selectedArtistryWidgetInstruction', { required: true })
const selectedArtistryConfigStr = defineModel<string>('selectedArtistryConfigStr', { required: true })

const { t } = useI18n()

const artistryStore = useArtistryStore()
const comfyuiWorkflows = computed(() => artistryStore.comfyuiSavedWorkflows || [])

function handleModelSelect(model: any) {
  selectedArtistryModel.value = model.id
  selectedArtistryPromptPrefix.value = model.prompt || ''
  selectedArtistryConfigStr.value = JSON.stringify(model.preset, null, 2)
}

function handleComfyWorkflowSelect(wf: any) {
  selectedArtistryModel.value = wf.id
  selectedArtistryConfigStr.value = JSON.stringify({ template: wf.id }, null, 2)
  pendingInstructionWf.value = wf
}

const pendingInstructionWf = ref<any>(null)

function generateAgentInstructions(wf: any) {
  let fieldsStr = ''
  for (const [node, fields] of Object.entries(wf.exposedFields as Record<string, string[]>)) {
    fieldsStr += `- **${node}**: ${fields.join(', ')}\n`
  }

  const exampleKey = Object.keys(wf.exposedFields)[0] || 'NodeTitle'
  const exampleField = (wf.exposedFields[exampleKey] as string[])?.[0] || 'field'

  return `## Instruction: Widget Spawning (ComfyUI)
You have the ability to generate images using a custom ComfyUI workflow: **${wf.name}**.

### How to Use
**Step 1: Spawn a canvas (do this once)**
- Component name: \`artistry\`
- Give it a unique ID (e.g. \`art-01\`)

**Step 2: Generate an image**
Update the widget with \`status: "generating"\`, a \`prompt\`, and optional field overrides in the root of \`componentProps\`.

**Exposed Fields you can override:**
${fieldsStr}

**Example Update:**
\`\`\`json
{
  "status": "generating",
  "prompt": "your description",
  "template": "${wf.id}",
  "${exampleKey}": {
    "${exampleField}": "value"
  }
}
\`\`\`
`
}

function applyRecommendedInstructions() {
  if (!pendingInstructionWf.value)
    return
  selectedArtistryWidgetInstruction.value = generateAgentInstructions(pendingInstructionWf.value)
  pendingInstructionWf.value = null
}

function getExposedFieldsCount(wf: any) {
  if (!wf.exposedFields)
    return 0
  return Object.values(wf.exposedFields).reduce((n: number, arr: any) => n + (arr?.length || 0), 0)
}

function openReplicateModel() {
  if (!selectedArtistryModel.value)
    return
  window.open(`https://replicate.com/${selectedArtistryModel.value}`, '_blank')
}
</script>

<template>
  <div class="tab-content ml-auto mr-auto w-95%">
    <p class="mb-3">
      Configure how AIRI generates images and visual content.
    </p>

    <div :class="['grid', 'grid-cols-1', 'gap-4', 'ml-auto', 'mr-auto', 'w-90%']">
      <div :class="['flex', 'flex-col', 'gap-2']">
        <label :class="['flex', 'flex-row', 'items-center', 'gap-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          <div i-lucide:image />
          Artistry Provider
        </label>
        <Select
          v-model="selectedArtistryProvider"
          :options="artistryProviderOptions"
          :placeholder="defaultArtistryProviderPlaceholder"
          class="w-full"
        />
      </div>

      <div v-if="selectedArtistryProvider === 'replicate'" class="grid grid-cols-3 mb-2 gap-3">
        <button
          v-for="model in REPLICATE_PRESETS"
          :key="model.id"
          type="button"
          :class="[
            'flex flex-col items-center justify-center rounded-xl border p-3 transition-all',
            selectedArtistryModel === model.id
              ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400'
              : 'border-neutral-200 bg-white hover:border-primary-300 dark:border-neutral-700 dark:bg-neutral-800',
          ]"
          @click="handleModelSelect(model)"
        >
          <span class="text-xs font-bold">{{ model.label }}</span>
          <span class="mt-1 text-[10px] opacity-60">{{ model.cost }}</span>
        </button>
      </div>

      <div
        v-if="selectedArtistryProvider === 'comfyui'"
        class="mb-2 flex flex-col gap-3"
      >
        <div
          v-if="comfyuiWorkflows.length === 0"
          :class="['flex flex-row items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-600 dark:text-amber-400']"
        >
          <div i-solar:info-circle-bold-duotone class="shrink-0 text-lg" />
          <p>
            No ComfyUI workflows configured. Go to Settings → Providers → ComfyUI to upload a workflow template.
          </p>
        </div>
        <div v-else class="grid grid-cols-2 gap-3">
          <button
            v-for="wf in comfyuiWorkflows"
            :key="wf.id"
            type="button"
            :class="[
              'flex flex-col items-center justify-center rounded-xl border p-3 transition-all',
              selectedArtistryModel === wf.id
                ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400'
                : 'border-neutral-200 bg-white hover:border-primary-300 dark:border-neutral-700 dark:bg-neutral-800',
            ]"
            @click="handleComfyWorkflowSelect(wf)"
          >
            <span class="text-xs font-bold">{{ wf.name }}</span>
            <span class="mt-1 text-[10px] opacity-60">{{ getExposedFieldsCount(wf) }} exposed fields</span>
          </button>
        </div>
      </div>

      <div class="mt-4 flex flex-col gap-5">
        <div class="relative">
          <FieldInput
            v-model="selectedArtistryModel"
            label="Artistry Model (Optional Override)"
            description="Model identifier if needed by provider"
            placeholder="e.g. black-forest-labs/flux-schnell"
          />
          <button
            v-if="selectedArtistryProvider === 'replicate' && selectedArtistryModel"
            type="button"
            :class="[
              'absolute right-3 top-9 rounded-md p-1 transition-colors',
              'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            ]"
            title="Open on Replicate"
            @click="openReplicateModel"
          >
            <div i-solar:link-round-bold-duotone class="text-xl" />
          </button>
        </div>

        <div
          v-if="pendingInstructionWf"
          class="flex flex-col gap-3 border border-indigo-500/20 rounded-xl bg-indigo-500/5 p-4"
        >
          <div class="flex items-center gap-2 text-sm text-indigo-600 font-bold dark:text-indigo-400">
            <div i-solar:magic-stick-bold-duotone />
            ComfyUI Instruction Sync
          </div>
          <p class="text-xs text-neutral-600 dark:text-neutral-400">
            A specialized prompt is ready for your <strong>{{ pendingInstructionWf.name }}</strong> workflow. Applying this will overwrite current widget instructions so the AI knows how to use this specific template.
          </p>
          <div class="flex items-center gap-2">
            <button
              class="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs text-white font-medium transition-colors hover:bg-indigo-600"
              @click="applyRecommendedInstructions"
            >
              Apply Recommended Prompt
            </button>
            <button
              class="rounded-lg bg-neutral-200 px-3 py-1.5 text-xs text-neutral-600 font-medium transition-colors dark:bg-neutral-800 hover:bg-neutral-300 dark:text-neutral-400 dark:hover:bg-neutral-700"
              @click="pendingInstructionWf = null"
            >
              Keep Existing
            </button>
          </div>
        </div>

        <FieldInput
          v-model="selectedArtistryPromptPrefix"
          label="Artistry Prompt Default Prefix"
          description="Pre-pended to every prompt sent to the image generator."
          placeholder="e.g. Masterpiece, high quality, 1girl, anime,"
        />
        <FieldInput
          v-model="selectedArtistryWidgetInstruction"
          :label="t('settings.pages.modules.artistry.widget-instructions.label')"
          :description="t('settings.pages.modules.artistry.widget-instructions.description')"
          :single-line="false"
          :rows="12"
        />
        <FieldInput
          v-model="selectedArtistryConfigStr"
          label="Artistry Provider Options (JSON)"
          :single-line="false"
        />
      </div>
    </div>
  </div>
</template>
