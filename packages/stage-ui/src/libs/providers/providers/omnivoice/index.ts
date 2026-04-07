import { z } from 'zod'

import { defineProvider } from '../registry'

const omnivoiceConfigSchema = z.object({
  baseUrl: z
    .string('Base URL')
    .default('http://127.0.0.1:8082'),
  voice: z
    .string('Voice ID')
    .default('default'),
  seed: z
    .number('Seed')
    .default(42),
  speed: z
    .number('Speed')
    .default(1.0),
  numStep: z
    .number('Steps')
    .default(32),
})

type OmniVoiceConfig = z.input<typeof omnivoiceConfigSchema>

export const providerOmniVoice = defineProvider<OmniVoiceConfig>({
  id: 'omnivoice',
  order: 50,
  name: 'OmniVoice',
  nameLocalize: () => 'OmniVoice',
  description: '600+ languages, voice cloning, voice design, 40x real-time speed',
  descriptionLocalize: () => '600+ languages, voice cloning, voice design, 40x real-time speed',
  tasks: ['text-to-speech'],
  icon: 'i-solar:world-bold-duotone',
  iconColor: 'i-solar:world-bold-duotone',

  createProviderConfig: _ctx => omnivoiceConfigSchema.extend({
    baseUrl: omnivoiceConfigSchema.shape.baseUrl
      .meta({
        labelLocalized: 'Base URL',
        descriptionLocalized: 'The base URL of the OmniVoice server',
        placeholderLocalized: 'http://127.0.0.1:8082',
      }),
    voice: omnivoiceConfigSchema.shape.voice
      .meta({
        labelLocalized: 'Voice ID',
        descriptionLocalized: 'Reference voice ID (use "default" for built-in voice)',
        placeholder: 'default',
      }),
    seed: omnivoiceConfigSchema.shape.seed
      .meta({
        labelLocalized: 'Seed',
        descriptionLocalized: 'Random seed for consistent voice (0-999999)',
        section: 'advanced',
        type: 'number',
      }),
    speed: omnivoiceConfigSchema.shape.speed
      .meta({
        labelLocalized: 'Speed',
        descriptionLocalized: 'Speaking rate factor (>1.0 faster, <1.0 slower)',
        section: 'advanced',
        type: 'number',
      }),
    numStep: omnivoiceConfigSchema.shape.numStep
      .meta({
        labelLocalized: 'Steps',
        descriptionLocalized: 'Diffusion steps (16 for fast, 32 for quality)',
        section: 'advanced',
        type: 'number',
      }),
  }),

  createProvider(config) {
    return {
      speech: (_model: string) => {
        return {
          baseURL: 'http://omnivoice.invalid/v1/',
          model: 'omnivoice',
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
            const seed = typeof config.seed === 'number' ? config.seed : 42
            const speed = typeof config.speed === 'number' ? config.speed : 1.0
            const numStep = typeof config.numStep === 'number' ? Math.round(config.numStep) : 32

            const payload: Record<string, unknown> = {
              text,
              format: 'wav',
              seed,
              speed,
              num_step: numStep,
            }

            const response = await fetch(`${normalizedUrl}v1/tts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: options?.signal,
            })

            if (!response.ok) {
              const errorText = await response.text().catch(() => '')
              throw new Error(`OmniVoice TTS failed: ${response.status} ${errorText}`)
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
        id: 'omnivoice:check-config',
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
        id: 'omnivoice:check-connectivity',
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
              errors: [{ error: new Error(`Failed to reach OmniVoice server: ${(e as Error).message}`) }],
              reason: `Failed to reach OmniVoice server: ${(e as Error).message}`,
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
