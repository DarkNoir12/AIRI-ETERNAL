import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { useAiriCardStore, useArtistryStore, useBackgroundStore } from '@proj-airi/stage-ui/stores'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { artistryGenerateHeadless, widgetsAdd } from '../../../../shared/eventa'
import { getIpcRenderer } from '../../../utils/electron'

function getArtistryConfig() {
  try {
    const store = useArtistryStore()
    return {
      provider: store.activeProvider,
      model: store.activeModel,
      promptPrefix: store.defaultPromptPrefix,
      options: store.providerOptions,
      Globals: {
        comfyuiServerUrl: store.comfyuiServerUrl,
        comfyuiSavedWorkflows: store.comfyuiSavedWorkflows,
        comfyuiActiveWorkflow: store.comfyuiActiveWorkflow,
        replicateApiKey: store.replicateApiKey,
        replicateDefaultModel: store.replicateDefaultModel,
        replicateAspectRatio: store.replicateAspectRatio,
        replicateInferenceSteps: store.replicateInferenceSteps,
      },
    }
  }
  catch (e) {
    return {}
  }
}

const { context } = createContext(getIpcRenderer())
const generateHeadless = defineInvoke(context, artistryGenerateHeadless)
const addWidget = defineInvoke(context, widgetsAdd)

const imageJournalParams = z.object({
  action: z.enum(['create', 'apply']).describe('Choose "create" to generate a new image, or "apply" to use an existing one.'),
  prompt: z.string().describe('Description for the image to generate. Use empty string if not needed.'),
  title: z.string().describe('Label for the entry. Use empty string if not needed.'),
  query: z.string().describe('Search term for existing images. Use empty string if not needed.'),
  mode: z.enum(['inline', 'widget', 'bg']).describe('Display mode: "inline" (in chat), "widget" (overlay), or "bg" (environment). Default to "inline".'),
})

async function executeCreateImageJournalEntry(params: { prompt?: string, title?: string, mode?: 'inline' | 'widget' | 'bg' }) {
  if (!params.prompt?.trim())
    throw new Error('prompt is required for image_journal.create')

  const backgroundStore = useBackgroundStore()
  const cardStore = useAiriCardStore()
  const activeCard = cardStore.activeCard
  const globalArtistryConfig = getArtistryConfig()

  const cardArtistry = activeCard?.extensions?.airi?.artistry
  const artistryConfig = {
    provider: cardArtistry?.provider || globalArtistryConfig.provider,
    model: cardArtistry?.model || globalArtistryConfig.model,
    promptPrefix: cardArtistry?.promptPrefix || globalArtistryConfig.promptPrefix,
    options: cardArtistry?.options || globalArtistryConfig.options,
    Globals: globalArtistryConfig.Globals,
  }

  const title = params.title || `Generation ${new Date().toLocaleString()}`
  const mode = params.mode || 'inline'

  try {
    const artistryResult = await generateHeadless({
      prompt: artistryConfig.promptPrefix ? `${artistryConfig.promptPrefix} ${params.prompt}` : params.prompt as string,
      model: artistryConfig.model as string,
      provider: artistryConfig.provider as string,
      options: JSON.parse(JSON.stringify(artistryConfig.options || {})),
      globals: JSON.parse(JSON.stringify(artistryConfig.Globals || {})),
    })

    if (artistryResult.error || (!artistryResult.base64 && !artistryResult.imageUrl)) {
      throw new Error(`Failed to generate image: ${artistryResult.error || 'No output received'}`)
    }

    let blob: Blob
    if (artistryResult.base64) {
      let data = artistryResult.base64
      let contentType = 'image/png'
      if (typeof data === 'string' && data.includes(',')) {
        const parts = data.split(',')
        contentType = parts[0].split(':')[1]?.split(';')[0] || contentType
        data = parts[1]
      }
      const byteCharacters = atob(data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let j = 0; j < byteCharacters.length; j++)
        byteNumbers[j] = byteCharacters.charCodeAt(j)
      blob = new Blob([new Uint8Array(byteNumbers)], { type: contentType })
    }
    else {
      const response = await fetch(artistryResult.imageUrl!)
      blob = await response.blob()
    }

    const entryId = await backgroundStore.addBackground('journal', blob, title, params.prompt, cardStore.activeCardId)

    // Handle Application Logic based on Mode
    if (mode === 'bg') {
      const cardId = cardStore.activeCardId
      if (cardId) {
        const card = cardStore.cards.get(cardId)
        if (card) {
          const extension = JSON.parse(JSON.stringify(card.extensions || {}))
          if (!extension.airi)
            extension.airi = {}
          if (!extension.airi.modules)
            extension.airi.modules = {}
          extension.airi.modules.activeBackgroundId = entryId
          cardStore.updateCard(cardId, { ...card, extensions: extension })
        }
      }
    }
    else if (mode === 'widget') {
      try {
        await addWidget({
          componentName: 'artistry',
          componentProps: {
            status: 'done',
            entryId,
            imageUrl: artistryResult.imageUrl || artistryResult.base64,
            prompt: params.prompt as string,
            title,
            _skipIngestion: true,
          },
          size: 'm',
          ttlMs: 0,
        })
      }
      catch (e) {
        console.warn('[ImageJournalTool] Failed to spawn Result widget', e)
      }
    }

    // Return structured result for UI rendering
    return JSON.stringify({
      message: `Image created in ${mode} mode${mode === 'bg' ? ' and set as background' : ''}.`,
      entryId,
      imageUrl: artistryResult.imageUrl || artistryResult.base64,
      title,
      prompt: params.prompt,
      mode,
    })
  }
  catch (e) {
    console.error('[ImageJournalTool] Failed to create entry', e)
    return `Error: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function executeSetAsBackground(params: { query?: string }) {
  if (!params.query?.trim())
    return 'Error: query is required for image_journal.apply. Provide a title or ID to search for.'

  const backgroundStore = useBackgroundStore()
  const cardStore = useAiriCardStore()
  const cardId = cardStore.activeCardId
  const query = params.query.toLowerCase().trim()

  const entries = Array.from(backgroundStore.entries.values())
    .filter(e => e.characterId === null || e.characterId === cardId)

  let entry = entries.find(e => e.type === 'journal' && (e.id === query || e.id.toLowerCase().includes(query)))
  if (!entry)
    entry = entries.find(e => e.type === 'journal' && e.title.toLowerCase().includes(query))
  if (!entry)
    entry = entries.find(e => e.type !== 'journal' && e.title.toLowerCase().includes(query))

  if (entry) {
    try {
      if (cardId) {
        const card = cardStore.cards.get(cardId)
        if (card) {
          const extension = JSON.parse(JSON.stringify(card.extensions || {}))
          if (!extension.airi)
            extension.airi = {}
          if (!extension.airi.modules)
            extension.airi.modules = {}
          extension.airi.modules.activeBackgroundId = entry.id
          cardStore.updateCard(cardId, { ...card, extensions: extension })
        }
      }
      return `Background set to "${entry.title}".`
    }
    catch (e) {
      return `Error applying "${entry.title}": ${e instanceof Error ? e.message : String(e)}`
    }
  }

  const available = entries.filter(e => e.type === 'journal').map(e => e.title).slice(0, 10)
  return `No match for "${params.query}".${available.length > 0 ? ` Try: ${available.join(', ')}` : ''}`
}

async function executeImageJournalAction(params: any) {
  if (params.action === 'create')
    return await executeCreateImageJournalEntry(params)
  if (params.action === 'apply' || params.action === 'set_as_background')
    return await executeSetAsBackground(params)
  return 'No action performed.'
}

const tools: Promise<Tool>[] = [
  tool({
    name: 'image_journal',
    description: 'Manage AI-generated images. Use "create" with a "mode" (inline, widget, bg) to generate and display images. Use "apply" to switch to an existing image from the journal.',
    execute: params => executeImageJournalAction(params),
    parameters: imageJournalParams,
  }),
]

export const imageJournalTools = async () => Promise.all(tools)
