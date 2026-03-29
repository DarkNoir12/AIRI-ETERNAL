<script setup lang="ts">
import type { DisplayModel } from '../../../../stores/display-models'

import { Live2DScene, useLive2d } from '@proj-airi/stage-ui-live2d'
import { ThreeScene } from '@proj-airi/stage-ui-three'
import { Button, Callout } from '@proj-airi/ui'
import { useLocalStorage, useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import Live2D from './live2d.vue'
import VRM from './vrm.vue'

import { useAiriCardStore } from '../../../../stores/modules'
import { useSettings } from '../../../../stores/settings'
import { useVHackStore } from '../../../../stores/vhack'
import { ModelSelectorDialog } from '../../dialogs/model-selector'

const props = defineProps<{
  palette: string[]
  settingsClass?: string | string[]

  live2dSceneClass?: string | string[]
  vrmSceneClass?: string | string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const modelSelectorOpen = ref(false)
const positionCursor = useMouse()
const settingsStore = useSettings()
const vhackStore = useVHackStore()
const { scale: live2dScale } = storeToRefs(useLive2d())
const {
  live2dDisableFocus,
  stageModelSelectedUrl,
  stageModelSelectedFile,
  stageModelSelected,
  stageModelSelectedDisplayModel,
  stageModelRenderer,
  themeColorsHue,
  themeColorsHueDynamic,
  live2dIdleAnimationEnabled,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
} = storeToRefs(settingsStore)

const airiCardStore = useAiriCardStore()
const { activeCard, activeCardId } = storeToRefs(airiCardStore)
const { updateCard } = airiCardStore

const activeCardName = computed(() => activeCard.value?.name || 'Active Character')

const currentSelectedDisplayModel = computed<DisplayModel | undefined>(() => stageModelSelectedDisplayModel.value)

const modelSupportCalloutDismissed = useLocalStorage('airi-model-support-callout-dismissed', false)

const live2dRef = ref<InstanceType<typeof Live2D>>()
const threeSceneRef = ref<InstanceType<typeof ThreeScene>>()

defineExpose({
  captureFrame: async () => {
    if (stageModelRenderer.value === 'live2d') {
      return (live2dRef.value as any)?.captureFrame()
    }
    else if (stageModelRenderer.value === 'vrm') {
      return threeSceneRef.value?.captureFrame()
    }
    return null
  },
})

async function handleModelPick(selectedModel: DisplayModel | undefined) {
  stageModelSelected.value = selectedModel?.id ?? ''
  await settingsStore.updateStageModel()
}

async function handleApplyToActiveCharacter() {
  if (!activeCardId.value || !activeCard.value)
    return

  const updatedAiriExtension = {
    ...activeCard.value.extensions.airi,
    modules: {
      ...activeCard.value.extensions.airi.modules,
      displayModelId: stageModelSelected.value,
    },
  }

  updateCard(activeCardId.value, {
    extensions: {
      ...activeCard.value.extensions,
      airi: updatedAiriExtension,
    },
  })
}
</script>

<template>
  <div
    flex="~ col gap-2" z-10 overflow-y-scroll p-2 :class="[
      ...(props.settingsClass
        ? (typeof props.settingsClass === 'string' ? [props.settingsClass] : props.settingsClass)
        : []),
    ]"
  >
    <div v-if="!modelSupportCalloutDismissed" class="relative">
      <Callout label="We support both 2D and 3D models">
        <p>
          Click <strong>Select Model</strong> to import different formats of
          models into catalog, currently, <code>.zip</code> (Live2D) and <code>.vrm</code> (VRM) are supported.
        </p>
        <p>
          Neuro-sama uses 2D model driven by Live2D Inc. developed framework.
          While Grok Ani (first female character announced in Grok Companion)
          uses 3D model that is driven by VRM / MMD open formats.
        </p>
      </Callout>
      <div
        class="absolute right-2 top-2 cursor-pointer text-neutral-500 transition hover:text-neutral-700"
        i-solar:eye-closed-bold-duotone
        @click="modelSupportCalloutDismissed = true"
      />
    </div>
    <div :class="['flex w-full gap-2']">
      <ModelSelectorDialog v-model:show="modelSelectorOpen" :selected-model="currentSelectedDisplayModel" @pick="handleModelPick">
        <Button variant="secondary" class="flex-1">
          Select Model
        </Button>
      </ModelSelectorDialog>
      <Button
        variant="secondary"
        class="flex-1"
        :disabled="!activeCardId"
        @click="handleApplyToActiveCharacter"
      >
        Apply to: {{ activeCardName }}
      </Button>
    </div>

    <Live2D
      v-if="stageModelRenderer === 'live2d'"
      ref="live2dRef"
      :palette="palette"
      @extract-colors-from-model="$emit('extractColorsFromModel')"
    />
    <VRM
      v-if="stageModelRenderer === 'vrm'"
      ref="vrmRef"
      :palette="palette"
      @extract-colors-from-model="$emit('extractColorsFromModel')"
    />
  </div>
  <!-- Live2D component for 2D stage view -->
  <template v-if="stageModelRenderer === 'live2d'">
    <div :class="[...(props.live2dSceneClass ? (typeof props.live2dSceneClass === 'string' ? [props.live2dSceneClass] : props.live2dSceneClass) : [])]">
      <Live2DScene
        :focus-at="{ x: positionCursor.x.value, y: positionCursor.y.value }"
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :model-file="stageModelSelectedFile"
        :disable-focus-at="live2dDisableFocus"
        :scale="live2dScale"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
        :live2d-max-fps="live2dMaxFps"
      />
    </div>
  </template>
  <!-- VRM component for 3D stage view -->
  <template v-if="stageModelRenderer === 'vrm'">
    <div :class="[...(props.vrmSceneClass ? (typeof props.vrmSceneClass === 'string' ? [props.vrmSceneClass] : props.vrmSceneClass) : [])]">
      <ThreeScene
        ref="threeSceneRef"
        :model-src="stageModelSelectedUrl"
        :model-identity="stageModelSelected"
        @binary-loaded="vhackStore.setSourceArrayBuffer"
      />
    </div>
  </template>
</template>
