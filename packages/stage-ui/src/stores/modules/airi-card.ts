import type { Card, ccv3 } from '@proj-airi/ccc'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useLive2d } from '@proj-airi/stage-ui-live2d'
import { useModelStore } from '@proj-airi/stage-ui-three'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { safeParse } from 'valibot'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SystemPromptV2 from '../../constants/prompts/system-v2'

import { DEFAULT_ARTISTRY_WIDGET_INSTRUCTION } from '../../constants/prompts/artistry-instruction'
import { DEFAULT_ACTING_MODEL_EXPRESSION_PROMPT, DEFAULT_ACTING_SPEECH_EXPRESSION_PROMPT, DEFAULT_ACTING_SPEECH_MANNERISM_PROMPT, DEFAULT_HEARTBEATS_PROMPT } from '../../constants/prompts/character-defaults'
import { AiriCardSchema } from '../../types/card.schema'
import { useBackgroundStore } from '../background'
import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'
import { useSettingsStageModel } from '../settings/stage-model'
import { useConsciousnessStore } from './consciousness'
import { useSpeechStore } from './speech'

export interface HeartbeatConfig {
  enabled: boolean
  intervalMinutes: number
  prompt: string
  injectIntoPrompt: boolean
  useAsLocalGate: boolean
  contextOptions?: {
    windowHistory: boolean
    systemLoad: boolean
    usageMetrics: boolean
  }
  schedule: {
    start: string // e.g., '09:00'
    end: string // e.g., '23:00'
  }
}

export interface ActingConfig {
  modelExpressionPrompt: string
  speechExpressionPrompt: string
  speechMannerismPrompt: string
  idleAnimations?: string[]

}

export interface AiriOutfit {
  id: string
  name: string
  icon: string
  type: 'base' | 'overlay'
  expressions: Record<string, number>
}

export interface CharacterGenerationConfig {
  enabled: boolean
  provider?: string
  model?: string
  known?: {
    maxTokens?: number
    temperature?: number
    topP?: number
    contextWidth?: number
  }
  advanced?: Record<string, any>
  importedPresetMeta?: {
    source?: 'sillytavern' | 'manual' | 'unknown'
    originalKeys?: string[]
    importedAt?: string
  }
}

export interface AiriExtension {
  modules: {
    consciousness: {
      provider: string // Example: "openai"
      model: string // Example: "gpt-4o"
      moduleConfigs?: Record<string, any>
    }

    speech: {
      provider: string // Example: "elevenlabs"
      model: string // Example: "eleven_multilingual_v2"
      voice_id: string // Example: "alloy"

      pitch?: number
      rate?: number
      ssml?: boolean
      language?: string
    }

    vrm?: {
      source?: 'file' | 'url'
      file?: string // Example: "vrm/model.vrm"
      url?: string // Example: "https://example.com/vrm/model.vrm"
    }

    live2d?: {
      source?: 'file' | 'url'
      file?: string // Example: "live2d/model.json"
      url?: string // Example: "https://example.com/live2d/model.json"
      activeExpressions?: Record<string, number>
      modelParameters?: Record<string, number>
    }

    // ID from display-models store (e.g. 'preset-live2d-1', 'display-model-<nanoid>')
    displayModelId?: string
    // ID from unified background store
    activeBackgroundId?: string | null
    // Legacy key from older local card revisions. Read-only for migration.
    selectedModelId?: string
  }

  artistry?: {
    provider?: string
    model?: string
    promptPrefix?: string
    widgetInstruction?: string
    options?: Record<string, any>
  }

  generation?: CharacterGenerationConfig

  acting?: ActingConfig

  outfits?: AiriOutfit[]

  agents: {
    [key: string]: { // example: minecraft
      prompt: string
      enabled?: boolean
    }
  }

  heartbeats?: HeartbeatConfig
  groundingEnabled?: boolean
  proactivity_metrics?: {
    ttsCount: number
    sttCount: number
    chatCount: number
    totalTurns: number
  }
}

export interface AiriCard extends Card {
  extensions: {
    airi: AiriExtension
  } & Card['extensions']
}

export const useAiriCardStore = defineStore('airi-card', () => {
  const { t } = useI18n()
  const defaultSystemPrompt = t('settings.pages.card.creation.defaults.systemprompt')
  const defaultPostHistoryInstructions = t('settings.pages.card.creation.defaults.posthistoryinstructions')

  const cards = useLocalStorageManualReset<Map<string, AiriCard>>('airi-cards', new Map())
  const activeCardId = useLocalStorageManualReset<string>('airi-card-active-id', 'default')

  const activeCard = computed(() => cards.value.get(activeCardId.value))

  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const stageModelStore = useSettingsStageModel()
  const displayModelsStore = useDisplayModelsStore()
  const live2dStore = useLive2d()
  const vrmStore = useModelStore()
  const backgroundStore = useBackgroundStore()

  const {
    activeProvider: activeConsciousnessProvider,
    activeModel: activeConsciousnessModel,
  } = storeToRefs(consciousnessStore)

  const {
    activeSpeechProvider,
    activeSpeechVoiceId,
    activeSpeechModel,
  } = storeToRefs(speechStore)

  function stripEmbeddedBackgroundData(extension: AiriExtension): AiriExtension {
    const modulesCopy: any = { ...extension.modules }
    delete modulesCopy.preferredBackgroundDataUrl

    return {
      ...extension,
      modules: modulesCopy,
    }
  }

  function compactCard(card: AiriCard | Card | ccv3.CharacterCardV3) {
    return newAiriCard(card)
  }

  function compactAllCardsMap(source: Map<string, AiriCard>) {
    const normalizedCards = new Map<string, AiriCard>()
    for (const [id, card] of source.entries()) {
      normalizedCards.set(id, compactCard(card))
    }
    return normalizedCards
  }

  const addCard = async (card: AiriCard | Card | ccv3.CharacterCardV3) => {
    const newCardId = nanoid()

    // Extract embedded background before it gets stripped
    const ext = ('data' in card ? card.data?.extensions?.airi : card.extensions?.airi) as AiriExtension | undefined
    const modules = ext?.modules as any

    if (modules && modules.preferredBackgroundDataUrl && modules.preferredBackgroundName) {
      try {
        const res = await fetch(modules.preferredBackgroundDataUrl)
        const blob = await res.blob()
        const importedBackgroundId = await backgroundStore.addBackground('journal', blob, modules.preferredBackgroundName, undefined, newCardId)
        modules.activeBackgroundId = importedBackgroundId
      }
      catch (err) {
        console.error('[AiriCard] Failed to import embedded background', err)
      }
    }

    const nextCards = new Map(cards.value)
    nextCards.set(newCardId, compactCard(card))
    cards.value = nextCards
    return newCardId
  }

  const removeCard = (id: string) => {
    const nextCards = new Map(cards.value)
    nextCards.delete(id)
    cards.value = nextCards
  }

  const updateCard = (id: string, updates: Partial<AiriCard> | Partial<Card> | Partial<ccv3.CharacterCardV3>) => {
    const existingCard = cards.value.get(id)
    if (!existingCard)
      return false

    const updatedCard = {
      ...existingCard,
      ...updates,
    }

    const nextCards = new Map(cards.value)
    nextCards.set(id, compactCard(updatedCard))
    cards.value = nextCards
    return true
  }

  const toggleGrounding = (id: string) => {
    const card = cards.value.get(id)
    if (!card) {
      console.warn('[AiriCard] toggleGrounding: card not found for id', id)
      return
    }

    const current = card.extensions?.airi?.groundingEnabled ?? false
    console.log('[AiriCard] toggleGrounding:', { id, current, next: !current })
    updateCard(id, {
      extensions: {
        ...card.extensions,
        airi: {
          ...card.extensions?.airi,
          groundingEnabled: !current,
        },
      },
    } as any)

    // Verify persistence
    const updated = cards.value.get(id)
    console.log('[AiriCard] toggleGrounding result:', updated?.extensions?.airi?.groundingEnabled)
  }

  const getCard = (id: string) => {
    return cards.value.get(id)
  }

  const getCardDisplayModelId = (id: string) => {
    const card = cards.value.get(id)
    if (!card)
      return undefined

    return resolveAiriExtension(card).modules?.displayModelId
  }

  async function applyCardState(card: AiriCard | undefined, force = false) {
    if (!card)
      return

    const extension = resolveAiriExtension(card)
    if (!extension)
      return

    // 1. Sync Consciousness with stability guards
    if (activeConsciousnessProvider.value !== extension.modules?.consciousness?.provider)
      activeConsciousnessProvider.value = extension.modules?.consciousness?.provider
    if (activeConsciousnessModel.value !== extension.modules?.consciousness?.model)
      activeConsciousnessModel.value = extension.modules?.consciousness?.model

    // 2. Sync Speech with stability guards
    if (activeSpeechProvider.value !== extension.modules?.speech?.provider)
      activeSpeechProvider.value = extension.modules?.speech?.provider
    if (activeSpeechModel.value !== extension.modules?.speech?.model)
      activeSpeechModel.value = extension.modules?.speech?.model
    if (activeSpeechVoiceId.value !== extension.modules?.speech?.voice_id)
      activeSpeechVoiceId.value = extension.modules?.speech?.voice_id

    // 3. Sync Models & Parameters
    const newModelId = extension.modules?.displayModelId
    const modelChanged = newModelId && newModelId !== stageModelStore.stageModelSelected

    if (newModelId && (force || modelChanged)) {
      stageModelStore.stageModelSelected = newModelId
      // updateStageModel has internal stability guards for blob URL creation
      await stageModelStore.updateStageModel()
    }

    // Surgical sync of Live2D parameters if they belong to the active model
    const selectedModel = await displayModelsStore.getDisplayModel(stageModelStore.stageModelSelected)
    if (selectedModel?.format === DisplayModelFormat.Live2dZip && extension.modules?.live2d) {
      if (extension.modules.live2d.activeExpressions)
        live2dStore.activeExpressions = { ...extension.modules.live2d.activeExpressions }
      if (extension.modules.live2d.modelParameters)
        live2dStore.modelParameters = { ...extension.modules.live2d.modelParameters }

      // Only trigger full view update if the model profile itself changed or forced
      if (force || modelChanged) {
        live2dStore.shouldUpdateView()
      }
    }
    else if (selectedModel?.format === DisplayModelFormat.VRM && (force || modelChanged)) {
      vrmStore.shouldUpdateView()
    }

    // Background syncing to a global store is no longer needed manually.
    // The backgroundStore uses a computed property `activeBackgroundUrl`
    // derived directly from the active card's `activeBackgroundId`.
  }

  async function activateCard(id: string, force = false) {
    activeCardId.value = id
    await applyCardState(cards.value.get(id), force)
  }

  function resolveAiriExtension(card: Card | ccv3.CharacterCardV3): AiriExtension {
    // Get existing extension if available
    const existingExtension = ('data' in card
      ? card.data?.extensions?.airi
      : card.extensions?.airi) as AiriExtension

    // Create default modules config
    const defaultModules = {
      consciousness: {
        provider: activeConsciousnessProvider.value,
        model: activeConsciousnessModel.value,
        moduleConfigs: {
          defaultPromptPrefix: t('base.prompt.prefix'),
        },
      },
      speech: {
        provider: activeSpeechProvider.value,
        model: activeSpeechModel.value,
        voice_id: activeSpeechVoiceId.value,
      },
      displayModelId: stageModelStore.stageModelSelected,
      activeBackgroundId: 'none',
    }

    const defaultHeartbeats: HeartbeatConfig = {
      enabled: false,
      intervalMinutes: 30,
      prompt: DEFAULT_HEARTBEATS_PROMPT,
      injectIntoPrompt: true,
      useAsLocalGate: true,
      contextOptions: {
        windowHistory: true,
        systemLoad: true,
        usageMetrics: true,
      },
      schedule: {
        start: '09:00',
        end: '22:00',
      },
    }

    const defaultArtistry = {
      widgetInstruction: DEFAULT_ARTISTRY_WIDGET_INSTRUCTION,
    }

    const defaultGeneration: CharacterGenerationConfig = {
      enabled: false,
      provider: activeConsciousnessProvider.value,
      model: activeConsciousnessModel.value,
      known: {
        contextWidth: undefined,
      },
      advanced: undefined,
      importedPresetMeta: undefined,
    }

    const defaultActing: ActingConfig = {
      modelExpressionPrompt: DEFAULT_ACTING_MODEL_EXPRESSION_PROMPT,
      speechExpressionPrompt: DEFAULT_ACTING_SPEECH_EXPRESSION_PROMPT,
      speechMannerismPrompt: DEFAULT_ACTING_SPEECH_MANNERISM_PROMPT,
      idleAnimations: [],

    }

    // Return default if no extension exists
    if (!existingExtension) {
      return {
        modules: defaultModules,
        acting: defaultActing,
        agents: {},
        heartbeats: defaultHeartbeats,
        artistry: defaultArtistry,
        generation: defaultGeneration,
        groundingEnabled: false,
      }
    }

    // Merge existing extension with defaults
    const resolvedDisplayModelId = existingExtension.modules?.displayModelId
      ?? existingExtension.modules?.selectedModelId
      ?? defaultModules.displayModelId

    // Resolve legacy preferredBackgroundId to new activeBackgroundId
    const existingModulesAny = existingExtension.modules as Record<string, any> | undefined
    const resolvedActiveBackgroundId = existingModulesAny?.activeBackgroundId
      ?? existingModulesAny?.preferredBackgroundId
      ?? defaultModules.activeBackgroundId

    return {
      modules: {
        consciousness: {
          provider: existingExtension.modules?.consciousness?.provider ?? defaultModules.consciousness.provider,
          model: existingExtension.modules?.consciousness?.model ?? defaultModules.consciousness.model,
        },
        speech: {
          provider: existingExtension.modules?.speech?.provider ?? defaultModules.speech.provider,
          model: existingExtension.modules?.speech?.model ?? defaultModules.speech.model,
          voice_id: existingExtension.modules?.speech?.voice_id ?? defaultModules.speech.voice_id,
          pitch: existingExtension.modules?.speech?.pitch,
          rate: existingExtension.modules?.speech?.rate,
          ssml: existingExtension.modules?.speech?.ssml,
          language: existingExtension.modules?.speech?.language,
        },
        vrm: existingExtension.modules?.vrm,
        live2d: existingExtension.modules?.live2d,
        displayModelId: resolvedDisplayModelId,
        activeBackgroundId: resolvedActiveBackgroundId,
      },
      artistry: {
        ...existingExtension.artistry,
        widgetInstruction: existingExtension.artistry?.widgetInstruction ?? defaultArtistry.widgetInstruction,
      },
      generation: {
        enabled: existingExtension.generation?.enabled ?? defaultGeneration.enabled,
        provider: existingExtension.generation?.provider ?? defaultGeneration.provider,
        model: existingExtension.generation?.model ?? defaultGeneration.model,
        known: {
          maxTokens: existingExtension.generation?.known?.maxTokens,
          temperature: existingExtension.generation?.known?.temperature,
          topP: existingExtension.generation?.known?.topP,
          contextWidth: existingExtension.generation?.known?.contextWidth ?? defaultGeneration.known?.contextWidth,
        },
        advanced: existingExtension.generation?.advanced,
        importedPresetMeta: existingExtension.generation?.importedPresetMeta,
      },
      acting: {
        modelExpressionPrompt: existingExtension.acting?.modelExpressionPrompt ?? defaultActing.modelExpressionPrompt,
        speechExpressionPrompt: existingExtension.acting?.speechExpressionPrompt ?? defaultActing.speechExpressionPrompt,
        speechMannerismPrompt: existingExtension.acting?.speechMannerismPrompt ?? defaultActing.speechMannerismPrompt,
        idleAnimations: existingExtension.acting?.idleAnimations ?? defaultActing.idleAnimations,
      },
      outfits: existingExtension.outfits ?? [],
      agents: existingExtension.agents ?? {},
      heartbeats: {
        enabled: existingExtension.heartbeats?.enabled ?? defaultHeartbeats.enabled,
        intervalMinutes: existingExtension.heartbeats?.intervalMinutes ?? defaultHeartbeats.intervalMinutes,
        prompt: existingExtension.heartbeats?.prompt ?? defaultHeartbeats.prompt,
        injectIntoPrompt: existingExtension.heartbeats?.injectIntoPrompt ?? defaultHeartbeats.injectIntoPrompt,
        useAsLocalGate: existingExtension.heartbeats?.useAsLocalGate ?? defaultHeartbeats.useAsLocalGate,
        contextOptions: {
          windowHistory: existingExtension.heartbeats?.contextOptions?.windowHistory ?? defaultHeartbeats.contextOptions!.windowHistory,
          systemLoad: existingExtension.heartbeats?.contextOptions?.systemLoad ?? defaultHeartbeats.contextOptions!.systemLoad,
          usageMetrics: existingExtension.heartbeats?.contextOptions?.usageMetrics ?? defaultHeartbeats.contextOptions!.usageMetrics,
        },
        schedule: {
          start: existingExtension.heartbeats?.schedule?.start ?? defaultHeartbeats.schedule.start,
          end: existingExtension.heartbeats?.schedule?.end ?? defaultHeartbeats.schedule.end,
        },
      },
      proactivity_metrics: {
        ttsCount: existingExtension.proactivity_metrics?.ttsCount ?? 0,
        sttCount: existingExtension.proactivity_metrics?.sttCount ?? 0,
        chatCount: existingExtension.proactivity_metrics?.chatCount ?? 0,
        totalTurns: existingExtension.proactivity_metrics?.totalTurns ?? 0,
      },
      groundingEnabled: existingExtension.groundingEnabled ?? false,
    }
  }

  function newAiriCard(card: Card | ccv3.CharacterCardV3): AiriCard {
    const validation = safeParse(AiriCardSchema, card)
    if (!validation.success) {
      console.warn('[AiriCard] Validation issues found during normalization:', validation.issues)
      // We still proceed with normalization for robustness, but we've logged the problems.
      // In a stricter implementation, we could throw here.
    }

    const normalizeVersion = (version?: string | null) => {
      const normalized = version?.trim()
      return normalized || '1.0.0'
    }
    const normalizeRequiredText = (value: string | null | undefined, fallback: string) => {
      const normalized = value?.trim()
      return normalized || fallback
    }

    // Handle ccv3 format if needed
    if ('data' in card) {
      const ccv3Card = card as ccv3.CharacterCardV3
      return {
        name: ccv3Card.data.name,
        version: normalizeVersion(ccv3Card.data.character_version),
        description: ccv3Card.data.description ?? '',
        creator: ccv3Card.data.creator ?? '',
        notes: ccv3Card.data.creator_notes ?? '',
        notesMultilingual: ccv3Card.data.creator_notes_multilingual,
        personality: ccv3Card.data.personality ?? '',
        scenario: ccv3Card.data.scenario ?? '',
        greetings: [
          ccv3Card.data.first_mes,
          ...(ccv3Card.data.alternate_greetings ?? []),
        ],
        greetingsGroupOnly: ccv3Card.data.group_only_greetings ?? [],
        systemPrompt: normalizeRequiredText(ccv3Card.data.system_prompt, defaultSystemPrompt),
        postHistoryInstructions: normalizeRequiredText(ccv3Card.data.post_history_instructions, defaultPostHistoryInstructions),
        messageExample: ccv3Card.data.mes_example
          ? ccv3Card.data.mes_example
              .split('<START>\n')
              .filter(Boolean)
              .map(example => example.split('\n')
                .map((line) => {
                  if (line.startsWith('{{char}}:') || line.startsWith('{{user}}:'))
                    return line as `{{char}}: ${string}` | `{{user}}: ${string}`
                  throw new Error(`Invalid message example format: ${line}`)
                }))
          : [],
        tags: ccv3Card.data.tags ?? [],
        extensions: {
          ...ccv3Card.data.extensions,
          airi: stripEmbeddedBackgroundData(resolveAiriExtension(ccv3Card)),
        },
      }
    }

    return {
      ...card,
      version: normalizeVersion(card.version),
      systemPrompt: normalizeRequiredText(card.systemPrompt, defaultSystemPrompt),
      postHistoryInstructions: normalizeRequiredText(card.postHistoryInstructions, defaultPostHistoryInstructions),
      extensions: {
        ...card.extensions,
        airi: stripEmbeddedBackgroundData(resolveAiriExtension(card)),
      },
    }
  }

  function initialize() {
    cards.value = compactAllCardsMap(cards.value)

    if (cards.value.has('default'))
      return
    const nextCards = new Map(cards.value)
    nextCards.set('default', compactCard({
      name: 'ReLU',
      version: '1.0.0',
      description: SystemPromptV2(
        t('base.prompt.prefix'),
        t('base.prompt.suffix'),
      ).content,
    }))
    cards.value = nextCards
    if (!activeCardId.value)
      activeCardId.value = 'default'
  }

  async function seedDefaults(selectedId: string) {
    const nextCards = new Map(cards.value)
    let changed = false

    if (!nextCards.has('aria')) {
      const aria = compactCard({
        name: 'Dr. Aria',
        creator: 'AIRI',
        version: '1.0.0',
        description: SystemPromptV2(
          t('base.prompt.prefix'),
          t('base.prompt.suffix'),
        ).content,
        extensions: {
          airi: {
            modules: {
              displayModelId: 'preset-vrm-1',
            },
          },
        },
      } as any)
      nextCards.set('aria', aria)
      changed = true
    }

    if (!nextCards.has('lupin')) {
      const lupin = compactCard({
        name: 'Lupin',
        creator: 'AIRI',
        version: '1.0.0',
        description: SystemPromptV2(
          t('base.prompt.prefix'),
          t('base.prompt.suffix'),
        ).content,
        extensions: {
          airi: {
            modules: {
              displayModelId: 'preset-vrm-2',
            },
          },
        },
      } as any)
      nextCards.set('lupin', lupin)
      changed = true
    }

    if (changed) {
      cards.value = nextCards
    }

    if (selectedId && nextCards.has(selectedId)) {
      await activateCard(selectedId, true)
    }
    else {
      await activateCard('default', true)
    }
  }

  watch(activeCard, async (newCard: AiriCard | undefined) => {
    await applyCardState(newCard)
  })

  function resetState() {
    activeCardId.reset()
    cards.reset()
  }

  return {
    cards,
    activeCard,
    activeCardId,
    activateCard,
    addCard,
    removeCard,
    updateCard,
    getCard,
    toggleGrounding,
    getCardDisplayModelId,
    resetState,
    initialize,
    seedDefaults,

    updateCardOutfits: (id: string, outfits: AiriOutfit[]) => {
      const card = cards.value.get(id)
      if (!card)
        return false

      return updateCard(id, {
        extensions: {
          ...card.extensions,
          airi: {
            ...card.extensions?.airi,
            outfits,
          },
        },
      } as any)
    },

    applyOutfit: async (outfitId: string) => {
      if (!activeCard.value)
        return

      const extension = resolveAiriExtension(activeCard.value)
      const outfit = extension.outfits?.find(o => o.id === outfitId)
      if (!outfit)
        return

      const nextExpressions = { ...vrmStore.activeExpressions }

      // Logic: If it's an overlay, check if it's already active to support toggling OFF
      if (outfit.type === 'overlay') {
        const isCurrentlyActive = Object.entries(outfit.expressions).every(([name, weight]) => {
          return Math.abs((nextExpressions[name] || 0) - weight) < 0.05
        })

        if (isCurrentlyActive) {
          // Toggle OFF: Zero out the expressions belonging to this overlay
          for (const name of Object.keys(outfit.expressions)) {
            nextExpressions[name] = 0
          }
          vrmStore.activeExpressions = nextExpressions
          vrmStore.shouldUpdateView('outfit-toggled-off')
          return
        }
      }

      // Logic: If Base, zero out other Base outfits' expressions
      if (outfit.type === 'base') {
        const otherBaseOutfits = (extension.outfits || []).filter(o => o.type === 'base' && o.id !== outfitId)
        for (const other of otherBaseOutfits) {
          for (const expr of Object.keys(other.expressions)) {
            nextExpressions[expr] = 0
          }
        }
      }

      // Apply new outfit weights
      for (const [name, weight] of Object.entries(outfit.expressions)) {
        nextExpressions[name] = weight
      }

      vrmStore.activeExpressions = nextExpressions
      vrmStore.shouldUpdateView('outfit-applied')
    },

    currentModels: computed(() => {
      return {
        consciousness: {
          provider: activeConsciousnessProvider.value,
          model: activeConsciousnessModel.value,
        },
        speech: {
          provider: activeSpeechProvider.value,
          model: activeSpeechModel.value,
          voice_id: activeSpeechVoiceId.value,
        },
        displayModelId: stageModelStore.stageModelSelected,
      } satisfies AiriExtension['modules']
    }),
    systemPrompt: computed(() => buildSystemPrompt(activeCard.value)),
  }
})

export function buildSystemPrompt(card: AiriCard | undefined) {
  if (!card)
    return ''

  const components = [
    card.systemPrompt,
    card.description,
    card.personality,
  ].filter(Boolean)

  const acting = card.extensions?.airi?.acting
  if (acting) {
    components.push(
      acting.modelExpressionPrompt,
      acting.speechExpressionPrompt,
      acting.speechMannerismPrompt,
    )
  }

  if (card.extensions?.airi?.artistry?.provider && card.extensions?.airi?.artistry?.widgetInstruction) {
    components.push(card.extensions.airi.artistry.widgetInstruction)
  }

  return components.join('\n')
}
