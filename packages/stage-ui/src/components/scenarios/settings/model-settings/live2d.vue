<script setup lang="ts">
import { defaultModelParameters, useLive2d } from '@proj-airi/stage-ui-live2d'
import { OPFSCacheV2 } from '@proj-airi/stage-ui-live2d/utils/opfs-loader'
import { Button, Checkbox, FieldRange, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Live2DCustomization from './live2d-customization.vue'

import { useSettings } from '../../../../stores/settings'
import { Section } from '../../../layouts'
import { ColorPalette } from '../../../widgets'

defineProps<{
  palette: string[]
}>()
defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { t } = useI18n()

const settings = useSettings()
const {
  live2dDisableFocus,
  live2dIdleAnimationEnabled,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
} = storeToRefs(settings)

const live2d = useLive2d()
const {
  scale,
  position,
  modelParameters,
  currentMotion,
} = storeToRefs(live2d)

const selectedRuntimeMotion = ref<string>('')
const selectedRuntimeMotionName = ref<string>('')
const runtimeMotions = ref<Array<{ name: string, fullPath: string, displayPath: string, group: string, index: number }>>([])
const showMotionSelector = ref(false)
const fpsOptions = computed(() => [
  { value: 0, label: t('settings.live2d.fps.options.unlimited') },
  { value: 60, label: '60' },
  { value: 30, label: '30' },
])

const customizationTabs = computed(() => [
  { value: 'expressions', label: 'Expressions', icon: 'i-solar:face-scan-circle-bold-duotone' },
  { value: 'animations', label: 'Motions', icon: 'i-solar:play-bold-duotone' },
  { value: 'headFace', label: 'Face', icon: 'i-solar:user-bold-duotone' },
])
const activeCustomizationTab = ref('expressions')

const sceneTabs = computed(() => [
  { value: 'placement', label: 'Placement', icon: 'i-solar:minimalistic-magnifer-zoom-in-bold-duotone' },
])
const activeSceneTab = ref('placement')

// Get available runtime motions from the model
onMounted(() => {
  // Listen for available motions updates
  watch(() => live2d.availableMotions, (motions) => {
    // Show all motions with their full paths
    runtimeMotions.value = motions.map(m => ({
      name: m.fileName.split('/').pop() || m.fileName,
      fullPath: m.fileName, // Full path like "hiyori_free_zh/runtime/motions/idle.motion3.json"
      displayPath: m.fileName, // Show full path for clarity
      group: m.motionName,
      index: m.motionIndex,
    }))

    console.info('Available motions:', runtimeMotions.value)
  }, { immediate: true })

  // Restore selected motion
  const savedPath = localStorage.getItem('selected-runtime-motion')
  const savedName = localStorage.getItem('selected-runtime-motion-name')
  if (savedPath) {
    selectedRuntimeMotion.value = savedPath
  }
  if (savedName) {
    selectedRuntimeMotionName.value = savedName
  }

  // Add click outside handler
  document.addEventListener('click', handleClickOutside)
})

// Function to reset all parameters to default values
function resetToDefaultParameters() {
  modelParameters.value = { ...defaultModelParameters }
}

const clearingCache = ref(false)

async function clearModelCache() {
  clearingCache.value = true
  try {
    await OPFSCacheV2.clearAll()
  }
  finally {
    clearingCache.value = false
  }
}

// Runtime motion selection handlers
function handleMotionSelect(motion: any) {
  selectedRuntimeMotion.value = motion.displayPath // Store full path
  selectedRuntimeMotionName.value = motion.name // Store just the filename for display
  localStorage.setItem('selected-runtime-motion', motion.displayPath)
  localStorage.setItem('selected-runtime-motion-name', motion.name)
  localStorage.setItem('selected-runtime-motion-group', motion.group)
  localStorage.setItem('selected-runtime-motion-index', motion.index.toString())

  // Enable idle animation
  live2dIdleAnimationEnabled.value = true

  // Set the current motion to the selected runtime motion
  currentMotion.value = { group: motion.group, index: motion.index }

  showMotionSelector.value = false

  console.info('✅ Selected runtime motion:', motion.name)
  console.info('Full path:', motion.displayPath)
  console.info('Group:', motion.group, 'Index:', motion.index)
}

function toggleMotionSelector() {
  showMotionSelector.value = !showMotionSelector.value
}

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('[data-motion-selector]')) {
    showMotionSelector.value = false
  }
}

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// async function patchMotionMap(source: File, motionMap: Record<string, string>): Promise<File> {
//   if (!Object.keys(motionMap).length)
//     return source

//   const jsZip = new JSZip()
//   const zip = await jsZip.loadAsync(source)
//   const fileName = Object.keys(zip.files).find(key => key.endsWith('model3.json'))
//   if (!fileName) {
//     throw new Error('model3.json not found')
//   }

//   const model3Json = await zip.file(fileName)!.async('string')
//   const model3JsonObject = JSON.parse(model3Json)

//   const motions: Record<string, { File: string }[]> = {}
//   Object.entries(motionMap).forEach(([key, value]) => {
//     if (motions[value]) {
//       motions[value].push({ File: key })
//       return
//     }
//     motions[value] = [{ File: key }]
//   })

//   model3JsonObject.FileReferences.Motions = motions

//   zip.file(fileName, JSON.stringify(model3JsonObject, null, 2))
//   const zipBlob = await zip.generateAsync({ type: 'blob' })

//   return new File([zipBlob], source.name, {
//     type: source.type,
//     lastModified: source.lastModified,
//   })
// }

// async function saveMotionMap() {
//   const fileFromIndexedDB = await localforage.getItem<File>('live2dModel')
//   if (!fileFromIndexedDB) {
//     return
//   }

//   const patchedFile = await patchMotionMap(fileFromIndexedDB, motionMap.value)
//   modelFile.value = patchedFile
// }
</script>

<template>
  <!-- 1. Character Customizations -->
  <Section
    title="Character Customizations"
    icon="i-solar:user-bold-duotone"
    :class="['rounded-xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
    size="sm"
    :expand="true"
  >
    <SelectTab v-model="activeCustomizationTab" :options="customizationTabs" size="sm" compact class="mb-4" />

    <!-- Expressions Tab -->
    <div v-if="activeCustomizationTab === 'expressions'">
      <Live2DCustomization />
    </div>

    <!-- Animations Tab -->
    <div v-else-if="activeCustomizationTab === 'animations'">
      <div :class="['flex', 'items-center', 'justify-between']">
        <span :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-400']">Idle Animation</span>
        <div data-motion-selector :class="['relative', 'flex', 'flex-col', 'items-end', 'gap-1']">
          <button
            :title="selectedRuntimeMotion"
            :class="['flex', 'items-center', 'gap-2', 'border', 'rounded', 'bg-neutral-100', 'px-4', 'py-2', 'text-sm', 'text-neutral-700', 'font-medium', 'transition-colors', 'dark:border-neutral-700', 'dark:bg-neutral-800', 'hover:bg-neutral-200', 'dark:text-neutral-300', 'dark:hover:bg-neutral-700']"
            @click="toggleMotionSelector"
          >
            <span :class="['max-w-32', 'truncate']">{{ selectedRuntimeMotionName || 'Select Motion' }}</span>
            <div
              :class="[showMotionSelector ? 'i-solar:alt-arrow-up-line-duotone' : 'i-solar:alt-arrow-down-line-duotone', 'text-xs', 'transition-transform']"
            />
          </button>

          <!-- Dropdown menu -->
          <div
            v-if="showMotionSelector"
            :class="['bg-white', 'dark:bg-neutral-800', 'border', 'border-neutral-200', 'dark:border-neutral-700', 'absolute', 'right-0', 'top-10', 'z-50', 'max-h-80', 'min-w-64', 'overflow-y-auto', 'rounded-lg', 'shadow-lg']"
          >
            <div v-if="runtimeMotions.length === 0" :class="['p-4', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
              No motions available
            </div>
            <button
              v-for="motion in runtimeMotions"
              :key="motion.fullPath"
              :class="[
                'w-full', 'px-4', 'py-2.5', 'text-left', 'transition-colors', 'hover:bg-neutral-100', 'dark:hover:bg-neutral-700',
                {
                  'bg-neutral-100 dark:bg-neutral-700': selectedRuntimeMotion === motion.displayPath,
                },
              ]"
              @click="handleMotionSelect(motion)"
            >
              <div :class="['text-sm', 'text-neutral-900', 'font-medium', 'dark:text-neutral-100']">
                {{ motion.name }}
              </div>
              <div :class="['truncate', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ motion.displayPath }}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Head & Face Tab -->
    <div v-else-if="activeCustomizationTab === 'headFace'" :class="['space-y-4']">
      <div :class="['flex', 'items-center', 'justify-between']">
        <span :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-400']">Auto Blink</span>
        <Checkbox v-model="live2dAutoBlinkEnabled" />
      </div>

      <div :class="['flex', 'items-center', 'justify-between']">
        <span :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-400']">Force Auto Blink (fallback)</span>
        <Checkbox v-model="live2dForceAutoBlinkEnabled" />
      </div>

      <div :class="['flex', 'items-center', 'justify-between']">
        <span :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-400']">Shadow</span>
        <Checkbox v-model="live2dShadowEnabled" />
      </div>

      <div :class="['mb-2', 'mt-4', 'text-xs', 'text-neutral-500', 'font-semibold', 'dark:text-neutral-400', 'uppercase', 'tracking-wider', 'opacity-50']">
        Head Rotation
      </div>
      <FieldRange v-model="modelParameters.angleX" as="div" :min="-30" :max="30" :step="0.1" label="Angle X">
        <template #label>
          <div :class="['flex', 'items-center']">
            <div>Angle X</div>
            <button :class="['px-2', 'text-xs', 'outline-none']" title="Reset value to default" @click="() => modelParameters.angleX = 0">
              <div :class="['i-solar:forward-linear', 'transform-scale-x--100', 'text-neutral-500', 'dark:text-neutral-400']" />
            </button>
          </div>
        </template>
      </FieldRange>
      <FieldRange v-model="modelParameters.angleY" as="div" :min="-30" :max="30" :step="0.1" label="Angle Y">
        <template #label>
          <div :class="['flex', 'items-center']">
            <div>Angle Y</div>
            <button :class="['px-2', 'text-xs', 'outline-none']" title="Reset value to default" @click="() => modelParameters.angleY = 0">
              <div :class="['i-solar:forward-linear', 'transform-scale-x--100', 'text-neutral-500', 'dark:text-neutral-400']" />
            </button>
          </div>
        </template>
      </FieldRange>
      <FieldRange v-model="modelParameters.angleZ" as="div" :min="-30" :max="30" :step="0.1" label="Angle Z">
        <template #label>
          <div :class="['flex', 'items-center']">
            <div>Angle Z</div>
            <button :class="['px-2', 'text-xs', 'outline-none']" title="Reset value to default" @click="() => modelParameters.angleZ = 0">
              <div :class="['i-solar:forward-linear', 'transform-scale-x--100', 'text-neutral-500', 'dark:text-neutral-400']" />
            </button>
          </div>
        </template>
      </FieldRange>

      <div :class="['mb-2', 'mt-4', 'text-xs', 'text-neutral-500', 'font-semibold', 'dark:text-neutral-400', 'uppercase', 'tracking-wider', 'opacity-50']">
        Facial Features
      </div>
      <FieldRange v-model="modelParameters.leftEyeOpen" as="div" :min="0" :max="1" :step="0.01" label="Left Eye Open/Close">
        <template #label>
          <div :class="['flex', 'items-center']">
            <div>Left Eye Open/Close</div>
            <button :class="['px-2', 'text-xs', 'outline-none']" title="Reset value to default" @click="() => modelParameters.leftEyeOpen = 1">
              <div :class="['i-solar:forward-linear', 'transform-scale-x--100', 'text-neutral-500', 'dark:text-neutral-400']" />
            </button>
          </div>
        </template>
      </FieldRange>
      <FieldRange v-model="modelParameters.rightEyeOpen" as="div" :min="0" :max="1" :step="0.01" label="Right Eye Open/Close">
        <template #label>
          <div :class="['flex', 'items-center']">
            <div>Right Eye Open/Close</div>
            <button :class="['px-2', 'text-xs', 'outline-none']" title="Reset value to default" @click="() => modelParameters.rightEyeOpen = 1">
              <div :class="['i-solar:forward-linear', 'transform-scale-x--100', 'text-neutral-500', 'dark:text-neutral-400']" />
            </button>
          </div>
        </template>
      </FieldRange>
      <FieldRange v-model="modelParameters.mouthOpen" as="div" :min="0" :max="1" :step="0.01" label="Mouth Open/Close">
        <template #label>
          <div :class="['flex', 'items-center']">
            <div>Mouth Open/Close</div>
            <button :class="['px-2', 'text-xs', 'outline-none']" title="Reset value to default" @click="() => modelParameters.mouthOpen = 0">
              <div :class="['i-solar:forward-linear', 'transform-scale-x--100', 'text-neutral-500', 'dark:text-neutral-400']" />
            </button>
          </div>
        </template>
      </FieldRange>
      <FieldRange v-model="modelParameters.cheek" as="div" :min="0" :max="1" :step="0.01" label="Cheek">
        <template #label>
          <div :class="['flex', 'items-center']">
            <div>Cheek</div>
            <button :class="['px-2', 'text-xs', 'outline-none']" title="Reset value to default" @click="() => modelParameters.cheek = 0">
              <div :class="['i-solar:forward-linear', 'transform-scale-x--100', 'text-neutral-500', 'dark:text-neutral-400']" />
            </button>
          </div>
        </template>
      </FieldRange>
    </div>
  </Section>

  <!-- 2. Scene -->
  <Section
    title="Scene"
    icon="i-solar:clapperboard-edit-bold-duotone"
    :class="['rounded-xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
    size="sm"
    :expand="true"
  >
    <SelectTab v-model="activeSceneTab" :options="sceneTabs" size="sm" class="mb-4" />

    <div v-if="activeSceneTab === 'placement'" :class="['space-y-4']">
      <FieldRange v-model="scale" as="div" :min="0.1" :max="3" :step="0.01" :label="t('settings.live2d.scale-and-position.scale')">
        <template #label>
          <div :class="['flex', 'items-center']">
            <div>{{ t('settings.live2d.scale-and-position.scale') }}</div>
            <button :class="['px-2', 'text-xs', 'outline-none']" title="Reset value to default" @click="() => scale = 1">
              <div :class="['i-solar:forward-linear', 'transform-scale-x--100', 'text-neutral-500', 'dark:text-neutral-400']" />
            </button>
          </div>
        </template>
      </FieldRange>
      <FieldRange v-model="position.x" as="div" :min="-100" :max="100" :step="1" :label="t('settings.live2d.scale-and-position.x')">
        <template #label>
          <div :class="['flex', 'items-center']">
            <div>{{ t('settings.live2d.scale-and-position.x') }}</div>
            <button :class="['px-2', 'text-xs', 'outline-none']" title="Reset value to default" @click="() => position.x = 0">
              <div :class="['i-solar:forward-linear', 'transform-scale-x--100', 'text-neutral-500', 'dark:text-neutral-400']" />
            </button>
          </div>
        </template>
      </FieldRange>
      <FieldRange v-model="position.y" as="div" :min="-100" :max="100" :step="1" :label="t('settings.live2d.scale-and-position.y')">
        <template #label>
          <div :class="['flex', 'items-center']">
            <div>{{ t('settings.live2d.scale-and-position.y') }}</div>
            <button :class="['px-2', 'text-xs', 'outline-none']" title="Reset value to default" @click="() => position.y = 0">
              <div :class="['i-solar:forward-linear', 'transform-scale-x--100', 'text-neutral-500', 'dark:text-neutral-400']" />
            </button>
          </div>
        </template>
      </FieldRange>
    </div>
  </Section>

  <!-- 3. Advanced -->
  <Section
    title="Advanced"
    icon="i-solar:settings-bold-duotone"
    :class="['rounded-xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
    size="sm"
    :expand="false"
  >
    <div :class="['space-y-6']">
      <!-- Mouse Tracking -->
      <div :class="['flex', 'items-center', 'justify-between']">
        <span :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-400']">Mouse Tracking</span>
        <Checkbox v-model="live2dDisableFocus" />
      </div>

      <!-- FPS -->
      <div :class="['flex', 'items-center', 'justify-between']">
        <div :class="['flex', 'flex-col', 'gap-1']">
          <span :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-400']">{{ t('settings.live2d.fps.title') }}</span>
          <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">{{ t('settings.live2d.fps.description') }}</span>
        </div>
        <SelectTab v-model="live2dMaxFps" :options="fpsOptions" size="sm" :class="['w-48', 'shrink-0']" />
      </div>

      <!-- Extract Colors -->
      <div :class="['flex', 'flex-col', 'gap-2']">
        <span :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-400']">Theme Extraction</span>
        <ColorPalette :colors="palette.map(hex => ({ hex, name: hex }))" :class="['mx-auto', 'mb-2']" />
        <Button variant="secondary" @click="$emit('extractColorsFromModel')">
          {{ t('settings.live2d.theme-color-from-model.button-extract.title') }}
        </Button>
      </div>

      <!-- Technical Utils -->
      <div :class="['flex', 'flex-col', 'gap-2']">
        <button
          :class="['w-full', 'border', 'rounded', 'bg-neutral-100', 'px-4', 'py-2', 'text-sm', 'text-neutral-700', 'font-medium', 'transition-colors', 'dark:border-neutral-700', 'dark:bg-neutral-800', 'hover:bg-neutral-200', 'dark:text-neutral-300', 'dark:hover:bg-neutral-700']"
          @click="resetToDefaultParameters"
        >
          Reset To Default Parameters
        </button>

        <button
          :class="['w-full', 'border', 'rounded', 'bg-neutral-100', 'px-4', 'py-2', 'text-sm', 'text-neutral-700', 'font-medium', 'transition-colors', 'dark:border-neutral-700', 'dark:bg-neutral-800', 'hover:bg-neutral-200', 'dark:text-neutral-300', 'dark:hover:bg-neutral-700']"
          :disabled="clearingCache"
          @click="clearModelCache"
        >
          {{ clearingCache ? 'Clearing...' : 'Clear Model Cache' }}
        </button>
      </div>
    </div>
  </Section>
</template>
