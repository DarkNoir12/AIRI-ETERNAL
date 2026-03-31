import type { ActiveWindowEntry, WindowInfo } from '@proj-airi/stage-shared'

import os from 'node:os'

import { spawnSync } from 'node:child_process'

import activeWin from 'active-win'
import loudness from 'loudness'
import si from 'systeminformation'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import {
  sensorsGetActiveWindow,
  sensorsGetActiveWindowHistory,
  sensorsGetIdleTime,
  sensorsGetLocalTime,
  sensorsGetSystemLoad,
  sensorsGetVolumeLevel,
} from '@proj-airi/stage-shared'
import { ipcMain, powerMonitor } from 'electron'

const log = useLogg('main/sensors').useGlobalConfig()

export function setupSensorsService() {
  const { context } = createContext(ipcMain)
  const activeWindowHistory: ActiveWindowEntry[] = []

  let lastActiveWinErrorTime = 0
  const ERROR_LOG_INTERVAL = 60000 // Only log once per minute

  async function getActiveWindowInfo(): Promise<WindowInfo | null> {
    try {
      const result = await activeWin()
      if (result) {
        return {
          title: result.title || 'Unknown',
          processName: result.owner.name || 'Unknown',
        }
      }
    }
    catch (err) {
      const now = Date.now()
      if (now - lastActiveWinErrorTime > ERROR_LOG_INTERVAL) {
        log.withError(err).debug('Native active-win failed; using system fallbacks.')
        lastActiveWinErrorTime = now
      }

      // Fallback for Windows: Use PowerShell to get the window with the largest CPU usage among windowed processes
      // as a heuristic for the 'active' window. This avoids native dlopen/Add-Type issues.
      if (process.platform === 'win32') {
        try {
          const psCommand = '(Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Sort-Object CPU -Descending | Select-Object -First 1) | Select-Object MainWindowTitle, ProcessName | ConvertTo-Json'
          const { stdout } = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCommand], { encoding: 'utf8', windowsHide: true })
          if (stdout) {
            const parsed = JSON.parse(stdout)
            return {
              title: parsed.MainWindowTitle || 'Unknown',
              processName: parsed.ProcessName || 'Unknown',
            }
          }
        }
        catch (psErr) {
          // Ignore PS fallback errors to avoid spam
        }
      }
    }

    return null
  }

  /*
  setInterval(async () => {
    const current = await getActiveWindowInfo()
    if (!current)
      return

    const now = Date.now()
    const lastEntry = activeWindowHistory.at(-1)
    if (lastEntry && lastEntry.window.title === current.title && lastEntry.window.processName === current.processName) {
      lastEntry.endTime = now
      lastEntry.durationMs = lastEntry.endTime - lastEntry.startTime
    }
    else {
      activeWindowHistory.push({
        window: current,
        startTime: now,
        endTime: now,
        durationMs: 0,
      })

      if (activeWindowHistory.length > MAX_HISTORY)
        activeWindowHistory.shift()
    }
  }, 10000)
*/

  defineInvokeHandler(
    context,
    sensorsGetIdleTime,
    async () => {
      return powerMonitor.getSystemIdleTime() * 1000
    },
  )

  defineInvokeHandler(
    context,
    sensorsGetActiveWindow,
    async () => {
      return getActiveWindowInfo()
    },
  )

  defineInvokeHandler(
    context,
    sensorsGetActiveWindowHistory,
    async () => {
      return activeWindowHistory
    },
  )

  async function getVolumeLevel(): Promise<number> {
    try {
      const vol = await loudness.getVolume()
      const muted = await loudness.getMuted()
      if (muted)
        return 0
      return vol
    }
    catch (err) {
      log.withError(err).warn('Failed to get system volume via loudness')
    }

    return 0
  }

  defineInvokeHandler(
    context,
    sensorsGetVolumeLevel,
    async () => {
      return getVolumeLevel()
    },
  )

  async function getSystemLoad() {
    let cpuLoads: [number, number, number] = [0, 0, 0]
    let gpuLoad = 0

    try {
      const load = await si.currentLoad()
      const val = load.currentLoad / 100
      cpuLoads = [val, val, val] // si doesn't provide 1/5/15 load avg directly in a cross-platform way as easily as this, but currentLoad is more meaningful for real-time sensors.
    }
    catch (err) {
      log.withError(err).warn('Failed to get CPU load via systeminformation')
      // Fallback to os.loadavg if si fails
      cpuLoads = os.loadavg() as [number, number, number]
    }

    try {
      const graphics = await si.graphics()
      // Take the max utilization across all GPUs
      gpuLoad = Math.max(0, ...graphics.controllers.map((c: any) => (c.utilizationGpu || 0) as number))
    }
    catch (err) {
      log.withError(err).warn('Failed to get GPU load via systeminformation')
    }

    return {
      cpu: cpuLoads,
      gpuAvg: gpuLoad,
    }
  }

  defineInvokeHandler(
    context,
    sensorsGetSystemLoad,
    async () => {
      return getSystemLoad()
    },
  )

  defineInvokeHandler(
    context,
    sensorsGetLocalTime,
    async () => {
      return new Date().toLocaleString()
    },
  )

  return context
}
