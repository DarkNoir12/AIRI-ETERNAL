import type { IpcRenderer } from 'electron'

/**
 * Safely retrieves the Electron IPC renderer if available.
 * Returns a no-op mock in browser-only environments to prevent crashes.
 */
export function getIpcRenderer(): any {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer) {
    return window.electron.ipcRenderer
  }

  // No-op mock for browser environments
  const noop = () => {}
  const noopPromise = async () => {}
  const noopListeners = () => () => {}

  return {
    send: noop,
    sendSync: noop,
    sendTo: noop,
    sendToHost: noop,
    postMessage: noop,
    invoke: noopPromise,
    on: noopListeners,
    once: noopListeners,
    removeListener: noop,
    removeAllListeners: noop,
    addListener: noop,
    off: noop,
    setMaxListeners: noop,
    getMaxListeners: () => 0,
    emit: () => false,
    eventNames: () => [],
    listenerCount: () => 0,
    listeners: () => [],
    prependListener: noopListeners,
    prependOnceListener: noopListeners,
    rawListeners: () => [],
  } as unknown as IpcRenderer
}

/**
 * Safely retrieves the platform name.
 * Returns 'web' in browser-only environments.
 */
export function getPlatform(): string {
  if (typeof window !== 'undefined' && window.platform) {
    return window.platform
  }

  return 'web'
}
