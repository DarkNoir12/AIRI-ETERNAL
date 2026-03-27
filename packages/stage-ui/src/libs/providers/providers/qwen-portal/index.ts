import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { useProvidersStore } from '../../../../stores/providers'
import { createOpenAICompatibleValidators } from '../../validators/openai-compatible'
import { defineProvider } from '../registry'
import { refreshQwenToken } from './oauth'

const qwenPortalConfigSchema = z.object({
  apiKey: z
    .string('API Key'),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://portal.qwen.ai/v1/'),
  refreshToken: z
    .string()
    .optional(),
  expiresAt: z
    .number()
    .optional(),
})

type QwenPortalConfig = z.input<typeof qwenPortalConfigSchema>

export const providerQwenPortal = defineProvider<QwenPortalConfig>({
  id: 'qwen-portal',
  name: 'Qwen Portal',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.qwen-portal.title'),
  description: 'Alibaba Cloud Native - Best-in-class Chinese and coding models',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.qwen-portal.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:qwen',
  iconColor: '#6058F8',
  business: () => ({
    pricing: 'paid',
    deployment: 'cloud',
  }),

  createProviderConfig: ({ t }) => qwenPortalConfigSchema.extend({
    apiKey: qwenPortalConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: qwenPortalConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),

  async createProvider(config) {
    const providerId = 'qwen-portal'
    const providersStore = useProvidersStore()

    let apiKey = (config.apiKey || '').trim()
    const refreshToken = (config.refreshToken || '').trim()
    const expiresAt = config.expiresAt || 0
    const baseUrl = (config.baseUrl || 'https://portal.qwen.ai/v1/').trim()

    // Auto-refresh token if it's expired or about to expire (within 5 minutes)
    if (refreshToken && expiresAt && Date.now() + 5 * 60 * 1000 > expiresAt) {
      try {
        const newToken = await refreshQwenToken(refreshToken)
        apiKey = newToken.access_token

        // Update store credentials
        if (providersStore.providers[providerId]) {
          providersStore.providers[providerId].apiKey = newToken.access_token
          providersStore.providers[providerId].refreshToken = newToken.refresh_token
          providersStore.providers[providerId].expiresAt = newToken.expires_at
        }
      }
      catch (error) {
        console.warn('Qwen token refresh failed during provider creation:', error)
      }
    }

    return createOpenAI(apiKey, baseUrl)
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },

  extraMethods: {
    listModels: async () => {
      const providerId = 'qwen-portal'
      return [
        {
          id: 'coder-model',
          name: 'Qwen Coder',
          provider: providerId,
          description: 'Optimized for coding tasks.',
          contextLength: 32768,
        },
        {
          id: 'vision-model',
          name: 'Qwen Vision',
          provider: providerId,
          description: 'Optimized for vision and image understanding.',
          capabilities: ['vision'],
          contextLength: 32768,
        },
      ]
    },
  },

  validators: {
    ...createOpenAICompatibleValidators({
      checks: [],
    }),
  },
})
