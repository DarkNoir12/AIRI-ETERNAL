<script setup lang="ts">
import { FieldInput } from '@proj-airi/ui'
import { Select } from '@proj-airi/ui/components/form'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { computed } from 'vue'
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

const REPLICATE_MODELS = [
  {
    id: 'prunaai/p-image',
    label: 'p-image',
    cost: '$1 / 200 imgs',
    prompt: 'A high-quality anime-style illustration with professional shading, vibrant colors, hand-drawn aesthetic, highly detailed,',
    preset: {
      aspect_ratio: '16:9',
    },
  },
  {
    id: 'prunaai/z-image-turbo',
    label: 'z-turbo',
    cost: '$1 / 200 imgs',
    prompt: 'A highly detailed anime illustration, crisp lines, vibrant color palette, professional digital art style, nicely shaded,',
    preset: {
      width: 1024,
      height: 768,
      output_format: 'jpg',
      guidance_scale: 0,
      output_quality: 80,
      num_inference_steps: 8,
    },
  },
  {
    id: 'black-forest-labs/flux-schnell',
    label: 'flux-schnell',
    cost: '$1 / 333 imgs',
    prompt: 'A stunning, high-definition anime scene, professional cel-shading, vibrant atmosphere, hand-drawn quality,',
    preset: {
      go_fast: true,
      num_outputs: 1,
      aspect_ratio: '1:1',
      output_format: 'webp',
      output_quality: 80,
    },
  },
  {
    id: 'prunaai/z-image-turbo-lora:197b2db2015aa366d2bc61a941758adf4c31ac66b18573f5c66dc388ab081ca2',
    label: 'z-turbo-lora',
    cost: '$1 / 217 imgs',
    prompt: 'A beautifully rendered anime illustration in a classic hand-drawn style, rich textures, vibrant colors, masterpiece quality,',
    preset: {
      width: 1024,
      height: 1024,
      lora_scales: [1],
      lora_weights: ['https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors'],
      output_format: 'jpg',
      guidance_scale: 0,
      output_quality: 80,
      num_inference_steps: 8,
    },
  },
  {
    id: 'aisha-ai-official/wai-nsfw-illustrious-v11:c1d5b02687df6081c7953c74bcc527858702e8c153c9382012ccc3906752d3ec',
    label: 'wai-ilx',
    cost: '$1 / 151 imgs',
    prompt: 'high quality, masterpiece, hirez, absurdres, anime style, highly detailed, vibrant colors, aesthetic,',
    preset: {
      vae: 'default',
      seed: -1,
      model: 'WAI-NSFW-illustrious-SDXL-v11',
      steps: 30,
      width: 1024,
      height: 1024,
      cfg_scale: 7,
      clip_skip: 2,
      pag_scale: 3,
      scheduler: 'Euler a',
      batch_size: 1,
      negative_prompt: 'nsfw, naked',
      guidance_rescale: 0.5,
      prepend_preprompt: true,
    },
  },
  {
    id: 'aisha-ai-official/anillustrious-v4:80441e2c32a55f2fcf9b77fa0a74c6c86ad7deac51eed722b9faedb253265cb4',
    label: 'anillustrious',
    cost: '$1 / 188 imgs',
    prompt: 'high quality, masterpiece, hirez, absurdres, anime style, detailed background, atmospheric, beautifully shaded,',
    preset: {
      vae: 'default',
      seed: -1,
      model: 'Anillustrious-v4',
      steps: 30,
      width: 1024,
      height: 1024,
      refiner: false,
      upscale: 'Original',
      cfg_scale: 7,
      clip_skip: 2,
      pag_scale: 0,
      scheduler: 'Euler a beta',
      adetailer_face: false,
      adetailer_hand: false,
      refiner_prompt: '',
      negative_prompt: 'nsfw, naked',
      adetailer_person: false,
      guidance_rescale: 1,
      refiner_strength: 0.8,
      prepend_preprompt: true,
      prompt_conjunction: true,
      adetailer_face_prompt: '',
      adetailer_hand_prompt: '',
      adetailer_person_prompt: '',
      negative_prompt_conjunction: false,
      adetailer_face_negative_prompt: '',
      adetailer_hand_negative_prompt: '',
      adetailer_person_negative_prompt: '',
    },
  },
]

function handleModelSelect(model: any) {
  selectedArtistryModel.value = model.id
  selectedArtistryPromptPrefix.value = model.prompt || ''
  selectedArtistryConfigStr.value = JSON.stringify(model.preset, null, 2)
}

function handleComfyWorkflowSelect(wf: any) {
  selectedArtistryModel.value = wf.id
  selectedArtistryConfigStr.value = JSON.stringify({ template: wf.id }, null, 2)
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
          v-for="model in REPLICATE_MODELS"
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
            <span class="mt-1 text-[10px] opacity-60">{{ Object.values(wf.exposedFields).reduce((n: number, arr: any) => n + arr.length, 0) }} exposed fields</span>
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
