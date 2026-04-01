import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { isWithinSchedule, visionCaptureScreen } from '@proj-airi/stage-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useIntervalFn } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useChatOrchestratorStore } from '../chat'
import { useProvidersStore } from '../providers'
import { useAiriCardStore } from './airi-card'

export const useVisionStore = defineStore('vision', () => {
  const providersStore = useProvidersStore()
  const chatOrchestrator = useChatOrchestratorStore()

  // State
  const activeProvider = useLocalStorageManualReset<string>('settings/vision/active-provider', '')
  const activeModel = useLocalStorageManualReset<string>('settings/vision/active-model', '')
  const contextWindow = useLocalStorageManualReset<number>('settings/vision/context-window', 1) // Number of images to include in context
  const promptShim = useLocalStorageManualReset<string>(
    'settings/vision/prompt-shim',
    'You are currently acting as a vision-capable stand-in for the main character. Keep your responses natural, in-character, and avoid any meta-commentary about "analyzing" or "describing" the image for the user. Just react to what you see as the character would.',
  )

  // Witness (Proactive Ambient Vision)
  const isWitnessEnabled = useLocalStorageManualReset<boolean>('settings/vision/witness-enabled', false)
  const witnessIntervalMinutes = useLocalStorageManualReset<number>('settings/vision/witness-interval', 5)
  const witnessPrompt = useLocalStorageManualReset<string>(
    'settings/vision/witness-prompt',
    'Carefully observe the user\'s screen and describe any interesting or relevant details you see, focusing on things that might spark a conversation or help you understand the user\'s current context better. Stay in character.',
  )
  const respectSchedule = useLocalStorageManualReset<boolean>('settings/vision/respect-schedule', true)
  const status = ref<'idle' | 'capturing'>('idle')
  const lastWitnessTime = ref<number>(0)
  const lastWitnessAnalysis = ref<string>('')
  const lastHeartbeatExec = useLocalStorageManualReset<number>('settings/vision/last-heartbeat', 0)

  const airiCardStore = useAiriCardStore()
  const { activeCard } = storeToRefs(airiCardStore)

  const captureInvoke = useElectronEventaInvoke(visionCaptureScreen)

  // Heartbeat Logic
  const heartbeat = async (options?: { force?: boolean }) => {
    console.log('[Vision Store] Heartbeat checking...', { isWitnessEnabled: isWitnessEnabled.value, force: !!options?.force })
    if (!isWitnessEnabled.value && !options?.force)
      return

    // Throttle duplicate executions across multiple independent Electron renderer windows.
    // Each window runs its own `useIntervalFn`, meaning they can easily drift out of sync.
    const now = Date.now()

    if (!options?.force) {
      // Background interval: enforce the full interval duration minus a small 10s drift buffer
      const intervalMs = witnessIntervalMinutes.value * 60 * 1000
      if (now - lastHeartbeatExec.value < (intervalMs - 10000)) {
        console.log(`[Vision Store] Background heartbeat skipped. Next allowed in ${intervalMs - (now - lastHeartbeatExec.value)}ms due to cross-window sync.`)
        return
      }
    }
    else {
      // Manual trigger: enforce a small 15-second debounce to prevent spam clicks and IPC echo
      if (now - lastHeartbeatExec.value < 15000) {
        console.log(`[Vision Store] Forced heartbeat throttled (15s cooldown).`)
        return
      }
    }

    // Lock the execution time so other windows respect this cycle
    lastHeartbeatExec.value = now

    // Schedule check (only if respectSchedule is enabled)
    const config = activeCard.value?.extensions?.airi?.heartbeats
    if (!options?.force && respectSchedule.value && config?.schedule?.start && config.schedule.end) {
      const inWindow = isWithinSchedule(config.schedule.start, config.schedule.end)
      if (!inWindow) {
        console.log(`[Vision Store] Heartbeat skipped: Outside schedule window (${config.schedule.start} - ${config.schedule.end})`)
        return
      }
      console.log(`[Vision Store] Heartbeat inside schedule window (${config.schedule.start} - ${config.schedule.end})`)
    }

    console.log('[Vision Store] Heartbeat pulse starting...')
    status.value = 'capturing'

    try {
      console.log('[Vision Store] Invoking OS screen capture via Eventa...')
      const result = await captureInvoke({ width: 1280, height: 720 })

      if (result?.dataUrl) {
        console.log('[Vision Store] Screen capture successful!', {
          dataUrlLength: result.dataUrl.length,
          timestamp: result.timestamp,
        })
        lastWitnessTime.value = result.timestamp

        // Send to Gemini via Chat Orchestrator
        console.log('[Vision Store] Sending screenshot to Chat Orchestrator for commentary...')
        const base64 = result.dataUrl.split(',')[1]

        await chatOrchestrator.ingest(witnessPrompt.value, {
          attachments: [
            {
              type: 'image',
              data: base64,
              mimeType: 'image/png',
            },
          ],
        })
      }
      else {
        console.warn('[Vision Store] Screen capture failed: No data received.')
      }
    }
    catch (err) {
      console.error('[Vision Store] Screen capture error:', err)
    }
    finally {
      status.value = 'idle'
      console.log('[Vision Store] Heartbeat pulse complete.')
    }
  }

  const { pause, resume } = useIntervalFn(heartbeat, computed(() => witnessIntervalMinutes.value * 60 * 1000), { immediate: false })

  watch(isWitnessEnabled, (enabled) => {
    console.log('[Vision Store] Witness enabled watcher fired:', enabled)
    if (enabled) {
      resume()
      console.log('[Vision Store] Interval resumed. Triggering immediate pulse (forced).')
      heartbeat({ force: true })
    }
    else {
      pause()
      console.log('[Vision Store] Interval paused.')
    }
  }, { immediate: true })

  function toggleWitness() {
    console.log('[Vision Store] toggleWitness() called. Current:', isWitnessEnabled.value)
    isWitnessEnabled.value = !isWitnessEnabled.value
    console.log('[Vision Store] toggleWitness() new state:', isWitnessEnabled.value)
  }

  function cycleFrequency() {
    const intervals = [1, 5, 10, 30]
    const currentIndex = intervals.indexOf(witnessIntervalMinutes.value)
    const nextIndex = (currentIndex + 1) % intervals.length
    witnessIntervalMinutes.value = intervals[nextIndex]
    console.log('[Vision Store] Cycle frequency:', witnessIntervalMinutes.value)
  }

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

    // Witness
    isWitnessEnabled,
    witnessIntervalMinutes,
    witnessPrompt,
    respectSchedule,
    lastWitnessTime,
    lastWitnessAnalysis,
    status,

    // Computed
    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,

    // Actions
    resetModelSelection,
    loadModelsForProvider,
    getModelsForProvider,
    toggleWitness,
    cycleFrequency,
    heartbeat,
    resetState,
  }
})
