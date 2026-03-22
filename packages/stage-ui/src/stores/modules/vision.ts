import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useProvidersStore } from '../providers'

export const useVisionStore = defineStore('vision', () => {
  const providersStore = useProvidersStore()

  // State
  const activeProvider = useLocalStorageManualReset<string>('settings/vision/active-provider', '')
  const activeModel = useLocalStorageManualReset<string>('settings/vision/active-model', '')
  const contextWindow = useLocalStorageManualReset<number>('settings/vision/context-window', 1) // Number of images to include in context
  const promptShim = useLocalStorageManualReset<string>(
    'settings/vision/prompt-shim',
    'You are currently acting as a vision-capable stand-in for the main character. Keep your responses natural, in-character, and avoid any meta-commentary about "analyzing" or "describing" the image for the user. Just react to what you see as the character would.',
  )

  // Computed properties
  const supportsModelListing = computed(() => {
    return providersStore.getProviderMetadata(activeProvider.value)?.capabilities.listModels !== undefined
  })

  const providerModels = computed(() => {
    return providersStore.getModelsForProvider(activeProvider.value)
  })

  const isLoadingActiveProviderModels = computed(() => {
    return providersStore.isLoadingModels[activeProvider.value] || false
  })

  const activeProviderModelError = computed(() => {
    return providersStore.modelLoadError[activeProvider.value] || null
  })

  function resetModelSelection() {
    activeModel.reset()
  }

  async function loadModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  async function getModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      return providersStore.getModelsForProvider(provider)
    }

    return []
  }

  const configured = computed(() => {
    return !!activeProvider.value && !!activeModel.value
  })

  function resetState() {
    activeProvider.reset()
    resetModelSelection()
    contextWindow.reset()
  }

  return {
    // State
    configured,
    activeProvider,
    activeModel,
    contextWindow,
    promptShim,

    // Computed
    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,

    // Actions
    resetModelSelection,
    loadModelsForProvider,
    getModelsForProvider,
    resetState,
  }
})
