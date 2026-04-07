import { z } from 'zod'

import { defineProvider } from '../registry'

const fishSpeechConfigSchema = z.object({
  baseUrl: z
    .string('Base URL')
    .default('http://127.0.0.1:8080'),
  voice: z
    .string('Voice ID')
    .default('default'),
  temperature: z
    .number('Temperature')
    .default(0.7),
  topP: z
    .number('Top P')
    .default(0.7),
  repetitionPenalty: z
    .number('Repetition Penalty')
    .default(1.2),
  chunkLength: z
    .number('Chunk Length')
    .default(200),
})

type FishSpeechConfig = z.input<typeof fishSpeechConfigSchema>

export const providerFishSpeech = defineProvider<FishSpeechConfig>({
  id: 'fish-speech',
  order: 50,
  name: 'Fish Speech',
  nameLocalize: () => 'Fish Speech',
  description: 'Fish Speech 1.5 TTS - Fast, lightweight, voice cloning',
  descriptionLocalize: () => 'Fish Speech 1.5 TTS - Fast, lightweight, voice cloning',
  tasks: ['text-to-speech'],
  icon: 'i-solar:fish-bold-duotone',
  iconColor: 'i-solar:fish-bold-duotone',

  createProviderConfig: _ctx => fishSpeechConfigSchema.extend({
    baseUrl: fishSpeechConfigSchema.shape.baseUrl
      .meta({
        labelLocalized: 'Base URL',
        descriptionLocalized: 'The base URL of the Fish Speech server',
        placeholderLocalized: 'http://127.0.0.1:8080',
      }),
    voice: fishSpeechConfigSchema.shape.voice
      .meta({
        labelLocalized: 'Voice ID',
        descriptionLocalized: 'Reference voice ID (use "default" for built-in voice)',
        placeholder: 'default',
      }),
    temperature: fishSpeechConfigSchema.shape.temperature
      .meta({
        labelLocalized: 'Temperature',
        descriptionLocalized: 'Controls randomness in voice generation (0.1-1.0)',
        section: 'advanced',
        type: 'number',
      }),
    topP: fishSpeechConfigSchema.shape.topP
      .meta({
        labelLocalized: 'Top P',
        descriptionLocalized: 'Nucleus sampling threshold (0.1-1.0)',
        section: 'advanced',
        type: 'number',
      }),
    repetitionPenalty: fishSpeechConfigSchema.shape.repetitionPenalty
      .meta({
        labelLocalized: 'Repetition Penalty',
        descriptionLocalized: 'Penalizes repeated content (0.9-2.0)',
        section: 'advanced',
        type: 'number',
      }),
    chunkLength: fishSpeechConfigSchema.shape.chunkLength
      .meta({
        labelLocalized: 'Chunk Length',
        descriptionLocalized: 'Text chunk size for iterative processing (100-1000)',
        section: 'advanced',
        type: 'number',
      }),
  }),

  createProvider(config) {
    return {
      speech: (_model: string) => {
        return {
          baseURL: 'http://fish-speech.invalid/v1/',
          model: 'fish-speech-1.5',
          async fetch(_url: string | URL | Request, options?: RequestInit) {
            const rootBaseUrl = config.baseUrl?.toString() || ''
            const normalizedUrl = rootBaseUrl.endsWith('/') ? rootBaseUrl : `${rootBaseUrl}/`

            let body: { input?: string, text?: string } = {}
            try {
              body = JSON.parse(options?.body as string)
            }
            catch {
              body = {}
            }

            const text = body.input || body.text || ''
            const voiceId = config.voice?.toString() || 'default'

            const chunkLength = typeof config.chunkLength === 'number' ? Math.round(config.chunkLength) : 200
            const temperature = typeof config.temperature === 'number' ? config.temperature : 0.7
            const topP = typeof config.topP === 'number' ? config.topP : 0.7
            const repetitionPenalty = typeof config.repetitionPenalty === 'number' ? config.repetitionPenalty : 1.2

            const fishPayload: Record<string, unknown> = {
              text,
              format: 'wav',
              chunk_length: chunkLength,
              top_p: topP,
              repetition_penalty: repetitionPenalty,
              temperature,
              max_new_tokens: 1024,
              references: [],
              reference_id: null,
              seed: 42,
            }

            if (voiceId && voiceId !== 'default') {
              fishPayload.reference_id = voiceId
            }

            const response = await fetch(`${normalizedUrl}v1/tts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(fishPayload),
              signal: options?.signal,
            })

            if (!response.ok) {
              const errorText = await response.text().catch(() => '')
              throw new Error(`Fish Speech TTS failed: ${response.status} ${errorText}`)
            }

            return response
          },
        }
      },
    }
  },

  validationRequiredWhen: () => true,
  validators: {
    validateConfig: [
      () => ({
        id: 'fish-speech:check-config',
        name: 'Check Configuration',
        validator: async (config) => {
          const errors: Array<{ error: unknown }> = []
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''

          if (!baseUrl)
            errors.push({ error: new Error('Base URL is required.') })

          if (baseUrl) {
            try {
              const parsed = new URL(baseUrl)
              if (!parsed.host)
                errors.push({ error: new Error('Base URL is not absolute. Check your input.') })
            }
            catch {
              errors.push({ error: new Error('Base URL is invalid. It must be an absolute URL.') })
            }
          }

          return {
            errors,
            reason: errors.length > 0 ? errors.map(item => (item.error as Error).message).join(', ') : '',
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
    validateProvider: [
      () => ({
        id: 'fish-speech:check-connectivity',
        name: 'Check Connectivity',
        validator: async (config) => {
          const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
          if (!baseUrl) {
            return {
              errors: [{ error: new Error('Base URL is required.') }],
              reason: 'Base URL is required.',
              reasonKey: '',
              valid: false,
            }
          }

          try {
            const normalizedUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
            const response = await fetch(`${normalizedUrl}v1/health`)
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`)
            }
            const data = await response.json()
            if (data?.status !== 'ok') {
              throw new Error('Server returned unhealthy status')
            }
          }
          catch (e) {
            return {
              errors: [{ error: new Error(`Failed to reach Fish Speech server: ${(e as Error).message}`) }],
              reason: `Failed to reach Fish Speech server: ${(e as Error).message}`,
              reasonKey: '',
              valid: false,
            }
          }

          return {
            errors: [],
            reason: '',
            reasonKey: '',
            valid: true,
          }
        },
      }),
    ],
  },

  business: () => ({
    pricing: 'free',
    deployment: 'local',
  }),
})
