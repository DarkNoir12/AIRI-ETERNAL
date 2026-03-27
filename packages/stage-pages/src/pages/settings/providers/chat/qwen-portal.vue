<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  ProviderValidationAlerts,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import {
  generatePkce,
  pollQwenDeviceToken,
  requestQwenDeviceCode,
} from '@proj-airi/stage-ui/libs/providers/providers/qwen-portal/oauth'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

const providerId = 'qwen-portal'
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

const {
  t,
  router,
  providerMetadata,
  isValidating,
  isValid,
  validationMessage,
  handleResetSettings,
  forceValid,
  hasManualValidators,
  isManualTesting,
  manualTestPassed,
  manualTestMessage,
  runManualTest,
} = useProviderValidation(providerId)

// Define computed properties for credentials
const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || 'https://portal.qwen.ai/v1/',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].baseUrl = value
  },
})

// OAuth State
const authStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
const userCode = ref('')
const verificationUrl = ref('')
const expiresAt = ref(0)

async function startAuthorization() {
  try {
    authStatus.value = 'pending'
    const { verifier, challenge } = await generatePkce()
    const device = await requestQwenDeviceCode(challenge)

    userCode.value = device.user_code
    verificationUrl.value = device.verification_uri_complete || device.verification_uri
    expiresAt.value = Date.now() + device.expires_in * 1000

    // For Electron/Desktop, try to open the URL automatically
    if (window.navigator.userAgent.toLowerCase().includes('electron') || (window as any).ipcRenderer) {
      window.open(verificationUrl.value, '_blank')
    }

    // Start polling
    const start = Date.now()
    const timeoutMs = device.expires_in * 1000
    let pollIntervalMs = device.interval ? device.interval * 1000 : 2000

    while (Date.now() - start < timeoutMs && authStatus.value === 'pending') {
      const result = await pollQwenDeviceToken(device.device_code, verifier)

      if (result.status === 'success') {
        authStatus.value = 'success'
        if (!providers.value[providerId])
          providers.value[providerId] = {}

        providers.value[providerId].apiKey = result.token.access_token
        providers.value[providerId].refreshToken = result.token.refresh_token
        providers.value[providerId].expiresAt = result.token.expires_at

        toast.success(t('settings.pages.providers.provider.qwen-portal.oauth.status.success'))
        return
      }

      if (result.status === 'error') {
        authStatus.value = 'error'
        toast.error(result.message)
        return
      }

      if (result.status === 'pending' && result.slowDown) {
        pollIntervalMs = Math.min(pollIntervalMs * 1.5, 10000)
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    if (authStatus.value === 'pending') {
      authStatus.value = 'error'
      toast.error(t('settings.pages.providers.provider.qwen-portal.oauth.status.timeout'))
    }
  }
  catch (error) {
    authStatus.value = 'error'
    const message = error instanceof Error ? error.message : String(error)
    toast.error(message)
  }
}

onMounted(() => {
  providersStore.initializeProvider(providerId)
  if (!baseUrl.value) {
    baseUrl.value = providerMetadata.value?.defaultOptions?.().baseUrl || 'https://portal.qwen.ai/v1/'
  }
})

async function refetch() {
  // Trigger generic validation if needed
}

watch([baseUrl], refetch, { immediate: true, deep: true })
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName || 'Qwen Portal'"
    :provider-icon-color="providerMetadata?.iconColor || '#6058F8'"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <!-- Base URL -->
      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
        :on-reset="handleResetSettings"
      >
        <ProviderBaseUrlInput
          v-model="baseUrl"
          placeholder="https://portal.qwen.ai/v1/"
        />
      </ProviderBasicSettings>

      <!-- OAuth Section -->
      <section bg="neutral-100/50 dark:neutral-800/50" flex="~ col gap-4" rounded-xl p-4>
        <div flex="~ items-center gap-3">
          <div i-solar:login-bold-duotone text="2xl primary-500" />
          <h3 text-xl font-semibold>
            {{ t('settings.pages.providers.provider.qwen-portal.oauth.title') }}
          </h3>
        </div>

        <p text="neutral-600 dark:neutral-400">
          {{ t('settings.pages.providers.provider.qwen-portal.oauth.description') }}
        </p>

        <div v-if="authStatus === 'idle'" flex justify-center>
          <Button
            size="lg"
            variant="primary"
            class="min-w-40"
            @click="startAuthorization"
          >
            {{ t('settings.pages.providers.provider.qwen-portal.oauth.start') }}
          </Button>
        </div>

        <div v-else-if="authStatus === 'pending'" flex="~ col gap-4" items-center py-4>
          <div i-solar:refresh-bold-duotone animate-spin text="4xl neutral-400" />

          <div flex="~ col gap-2" items-center>
            <span text="xs neutral-500 uppercase tracking-wider font-bold">
              {{ t('settings.pages.providers.provider.qwen-portal.oauth.user_code') }}
            </span>
            <div
              bg="white dark:neutral-900"
              border="2 primary-500/30"
              class="tracking-[0.2em]"
              rounded-lg px-6 py-3 text-3xl text-primary-500 font-bold font-mono
            >
              {{ userCode }}
            </div>
          </div>

          <p text-center text-sm text="neutral-500">
            {{ t('settings.pages.providers.provider.qwen-portal.oauth.instruction') }}
          </p>

          <Button
            variant="secondary-muted"
            as="a"
            :href="verificationUrl"
            target="_blank"
            class="flex items-center gap-2"
          >
            <div i-solar:arrow-right-up-bold-duotone />
            {{ t('settings.pages.providers.provider.qwen-portal.oauth.open_browser') }}
          </Button>

          <span animate-pulse text="sm primary-500/80">
            {{ t('settings.pages.providers.provider.qwen-portal.oauth.status.pending') }}
          </span>
        </div>

        <div v-else-if="authStatus === 'success'" flex="~ col items-center gap-2" py-4 text-green-500>
          <div i-solar:check-circle-bold-duotone text-5xl />
          <span font-semibold>{{ t('settings.pages.providers.provider.qwen-portal.oauth.status.success') }}</span>
          <Button variant="ghost" size="sm" @click="authStatus = 'idle'">
            {{ t('settings.dialogs.onboarding.retry') }}
          </Button>
        </div>

        <div v-else-if="authStatus === 'error'" flex="~ col items-center gap-2" py-4 text-red-500>
          <div i-solar:danger-bold-duotone text-5xl />
          <span font-semibold>{{ t('settings.pages.providers.provider.qwen-portal.oauth.status.error') }}</span>
          <Button variant="primary" size="sm" @click="startAuthorization">
            {{ t('settings.dialogs.onboarding.retry') }}
          </Button>
        </div>
      </section>

      <!-- Validation Status -->
      <ProviderValidationAlerts
        :is-valid="isValid"
        :is-validating="isValidating"
        :validation-message="validationMessage"
        :has-manual-validators="hasManualValidators"
        :is-manual-testing="isManualTesting"
        :manual-test-passed="manualTestPassed"
        :manual-test-message="manualTestMessage"
        :on-run-test="runManualTest"
        :on-force-valid="forceValid"
        :on-go-to-model-selection="() => router.push('/settings/modules/consciousness')"
      />
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
