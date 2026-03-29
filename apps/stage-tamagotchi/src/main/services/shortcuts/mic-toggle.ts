import type { BrowserWindow } from 'electron'

import type { MicToggleHotkey } from '../../../shared/eventa'

import { spawnSync } from 'node:child_process'

import { globalShortcut, ipcMain } from 'electron'

let currentHotkey: MicToggleHotkey = 'Scroll'
let currentWindow: BrowserWindow | null = null

/**
 * Stop any existing monitoring and unregister shortcuts
 */
export function cleanupMicToggleShortcut() {
  globalShortcut.unregisterAll()
  ipcMain.removeAllListeners('mic-state-changed')
}

/**
 * Setup global microphone toggle shortcut using Electron globalShortcut
 */
export function setupMicToggleShortcut(mainWindow: BrowserWindow, hotkey: MicToggleHotkey = 'Scroll') {
  currentWindow = mainWindow
  currentHotkey = hotkey

  cleanupMicToggleShortcut()

  const keyMap = {
    Scroll: { electron: 'Scrolllock', send: 'SCROLLLOCK' },
    Caps: { electron: 'Capslock', send: 'CAPSLOCK' },
    Num: { electron: 'Numlock', send: 'NUMLOCK' },
  }

  const { electron: electronKey, send: sendKey } = keyMap[currentHotkey]

  console.log(`[Mic Toggle] Setting up shortcut with hotkey: ${currentHotkey}`)

  // 1. Initial State Check (Windows only fallback for LED sync)
  // We don't poll anymore. We just react to the global shortcut.
  // The globalShortcut consumes the event, so the LED won't toggle by itself.
  // We will manually toggle it to keep the OS/User in sync.

  const registerShortcut = () => {
    try {
      const isRegistered = globalShortcut.register(electronKey, () => {
        console.log(`[Mic Toggle] Hotkey ${electronKey} pressed`)
        if (currentWindow) {
          currentWindow.webContents.send('toggle-mic-from-shortcut')
        }
      })

      if (!isRegistered) {
        console.warn(`[Mic Toggle] Failed to register global shortcut for ${electronKey}`)
      }
    }
    catch (err) {
      console.error(`[Mic Toggle] Error registering global shortcut: ${err}`)
    }
  }

  registerShortcut()

  // 2. Listen to renderer state changes to sync the LED
  ipcMain.on('mic-state-changed', (_event, _micEnabled: boolean) => {
    // On Windows, try to sync the LED if possible.
    // Since globalShortcut consumes the keypress, the LED state is controlled by US.
    // We send a toggle if the target state doesn't match our 'presumed' LED state.
    // NOTE: This uses WScript.Shell which is safer than Add-Type.
    if (process.platform === 'win32') {
      console.log(`[Mic Toggle] Syncing LED for ${electronKey}`)
      // Temporarily unregister to avoid infinite loop from simulated keypress
      globalShortcut.unregister(electronKey)

      const syncScript = `$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys('{${sendKey}}')`
      spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', syncScript], { windowsHide: true })

      // Re-register after a small delay to ensure the OS has processed the simulated key
      setTimeout(() => {
        registerShortcut()
      }, 500)
    }
  })
}
