<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  Alert,
  SpeechPlaygroundOpenAICompatible,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

const defaultVoiceSettings = {
  speed: 1.0,
}

const providerId = 'omnivoice'
const defaultModel = 'omnivoice'

// Initialize settings from provider config or defaults
const speed = ref<number>(
  (providers.value[providerId] as any)?.speed ?? defaultVoiceSettings.speed,
)
const seed = ref<number>(
  (providers.value[providerId] as any)?.seed ?? 42,
)
const numStep = ref<number>(
  (providers.value[providerId] as any)?.numStep ?? 32,
)
const referenceAudio = ref<string>(
  (providers.value[providerId] as any)?.referenceAudio ?? '',
)

const model = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

const voice = computed({
  get: () => providers.value[providerId]?.voice || 'default',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].voice = value
  },
})

const baseUrl = computed(() => String(providers.value[providerId]?.baseUrl || 'http://127.0.0.1:8082'))
const apiKeyConfigured = computed(() => !!baseUrl.value.trim())

// Sync local refs with provider config changes
watch(
  () => providers.value[providerId],
  (newConfig) => {
    if (newConfig) {
      const config = newConfig as any
      if (typeof config.speed === 'number' && Math.abs(speed.value - config.speed) > 0.001)
        speed.value = config.speed
      if (typeof config.seed === 'number' && seed.value !== config.seed)
        seed.value = config.seed
      if (typeof config.numStep === 'number' && numStep.value !== config.numStep)
        numStep.value = config.numStep
      if (typeof config.referenceAudio === 'string' && referenceAudio.value !== config.referenceAudio)
        referenceAudio.value = config.referenceAudio

      if (!config.model && model.value !== defaultModel)
        model.value = defaultModel
      if (!config.voice && voice.value !== 'default')
        voice.value = 'default'
    }
    else {
      speed.value = defaultVoiceSettings.speed
      seed.value = 42
      numStep.value = 32
      referenceAudio.value = ''
      model.value = defaultModel
      voice.value = 'default'
    }
  },
  { deep: true, immediate: true },
)

// Persist settings changes to provider config
watch(speed, () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId].speed = speed.value
})

watch(seed, () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId].seed = seed.value
})

watch(numStep, () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId].numStep = numStep.value
})

watch(referenceAudio, () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId].referenceAudio = referenceAudio.value
})

watch(model, () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId].model = model.value
})

watch(voice, () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId].voice = voice.value
})

// Initialize provider config on mount
onMounted(async () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  if (!providers.value[providerId].model)
    providers.value[providerId].model = defaultModel
  if (!providers.value[providerId].voice)
    providers.value[providerId].voice = 'default'
  if (!providers.value[providerId].baseUrl)
    providers.value[providerId].baseUrl = 'http://127.0.0.1:8082'

  await providersStore.fetchModelsForProvider(providerId)
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const providerConfig = providersStore.getProviderConfig(providerId)
  const modelToUse = modelId || model.value || defaultModel

  return await speechStore.speech(
    provider,
    modelToUse,
    input,
    voiceId || String(voice.value),
    {
      ...providerConfig,
      ...defaultVoiceSettings,
      speed: speed.value,
    },
  )
}

const {
  isValidating,
  isValid,
  validationMessage,
  forceValid,
} = useProviderValidation(providerId)
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
    placeholder="Optional"
  >
    <template #basic-settings>
      <FieldInput
        v-model="baseUrl"
        label="Base URL"
        description="OmniVoice server URL (without /v1/ suffix)"
        placeholder="http://127.0.0.1:8082"
      />
    </template>

    <template #voice-settings>
      <FieldInput
        v-model="model"
        label="Model"
        description="OmniVoice model id used for speech synthesis."
        placeholder="omnivoice"
      />
      <FieldRange
        v-model="speed"
        :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
        :min="0.5"
        :max="2.0"
        :step="0.01"
      />
      <FieldRange
        v-model="seed"
        label="Seed"
        description="Random seed for reproducible voice generation."
        :min="0"
        :max="9999"
        :step="1"
      />
      <FieldRange
        v-model="numStep"
        label="Num Steps"
        description="Number of diffusion steps. Higher values improve quality but increase latency."
        :min="1"
        :max="100"
        :step="1"
      />
      <FieldInput
        v-model="referenceAudio"
        label="Reference Audio Path"
        description="Path to a WAV file for voice cloning (e.g., C:\AI_WORKSPACE\chatterbox\reference_audio\Jen_Frankie_spoiled.wav). Leave empty to use default voice."
        placeholder="Path to reference audio WAV file"
      />
    </template>

    <template #playground>
      <SpeechPlaygroundOpenAICompatible
        v-model:model-value="model"
        v-model:voice="voice as any"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="Hello! This is a test of the OmniVoice Speech."
      />
    </template>

    <template #advanced-settings>
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
        <template #title>
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
              @click="forceValid"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
        </template>
        <template v-if="validationMessage" #content>
          <div class="whitespace-pre-wrap break-all">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
      <Alert v-if="isValid && isValidating === 0" type="success">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationSuccess') }}
        </template>
      </Alert>
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
