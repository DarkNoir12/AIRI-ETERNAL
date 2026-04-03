export * from './providers'
export * from './types'
export * from './validators'

export function getProviderValidationIntervalMs() {
  return 10 * 60 * 1000 // 10 minutes
}
