import { defineStore } from 'pinia'
import { toRef } from 'vue'

import { useSettingsCaptions } from './captions'
import { useSettingsChat } from './chat'
import { useSettingsControlsIsland } from './controls-island'
import { useSettingsGeneral } from './general'
import { useSettingsLive2d } from './live2d'
import { useSettingsStageModel } from './stage-model'
import { useSettingsTheme } from './theme'

// Export sub-stores
export * from './audio-device'
export * from './chat'
export * from './controls-island'
export * from './general'
export * from './live2d'
export * from './stage-model'
export * from './theme'
// Export constants
export { DEFAULT_THEME_COLORS_HUE } from './theme'

/**
 * Unified settings store for backward compatibility.
 * This aggregates all sub-stores into one interface.
 *
 * @deprecated Use individual setting stores (useSettingsCore, useSettingsTheme, etc.) instead.
 * This store exists only for backward compatibility and will be removed in a future version.
 */
export const useSettings = defineStore('settings', () => {
  const chat = useSettingsChat()
  const general = useSettingsGeneral()
  const stageModel = useSettingsStageModel()
  const live2d = useSettingsLive2d()
  const theme = useSettingsTheme()
  const controlsIsland = useSettingsControlsIsland()
  const captions = useSettingsCaptions()

  async function resetState() {
    await stageModel.resetState()
    chat.resetState()
    general.resetState()
    live2d.resetState()
    theme.resetState()
    controlsIsland.resetState()
    captions.resetState()
  }

  return {
    // Core settings
    disableTransitions: toRef(general, 'disableTransitions'),
    usePageSpecificTransitions: toRef(general, 'usePageSpecificTransitions'),
    language: toRef(general, 'language'),
    remoteSyncEnabled: toRef(general, 'remoteSyncEnabled'),
    websocketSecureEnabled: toRef(general, 'websocketSecureEnabled'),
    sendMode: toRef(chat, 'sendMode'),
    streamIdleTimeoutMs: toRef(chat, 'streamIdleTimeoutMs'),

    // Stage model settings
    stageModelRenderer: toRef(stageModel, 'stageModelRenderer'),
    stageModelSelected: toRef(stageModel, 'stageModelSelected'),
    stageModelSelectedUrl: toRef(stageModel, 'stageModelSelectedUrl'),
    stageModelSelectedFile: toRef(stageModel, 'stageModelSelectedFile'),
    stageModelSelectedDisplayModel: toRef(stageModel, 'stageModelSelectedDisplayModel'),
    stageViewControlsEnabled: toRef(stageModel, 'stageViewControlsEnabled'),
    lastReloadReason: toRef(stageModel, 'lastReloadReason'),

    // Live2D settings
    live2dDisableFocus: toRef(live2d, 'live2dDisableFocus'),
    live2dIdleAnimationEnabled: toRef(live2d, 'live2dIdleAnimationEnabled'),
    live2dAutoBlinkEnabled: toRef(live2d, 'live2dAutoBlinkEnabled'),
    live2dForceAutoBlinkEnabled: toRef(live2d, 'live2dForceAutoBlinkEnabled'),
    live2dShadowEnabled: toRef(live2d, 'live2dShadowEnabled'),
    live2dMaxFps: toRef(live2d, 'live2dMaxFps'),

    // Theme settings
    themeColorsHue: toRef(theme, 'themeColorsHue'),
    themeColorsHueDynamic: toRef(theme, 'themeColorsHueDynamic'),

    // UI settings
    allowVisibleOnAllWorkspaces: toRef(controlsIsland, 'allowVisibleOnAllWorkspaces'),
    alwaysOnTop: toRef(controlsIsland, 'alwaysOnTop'),
    controlsIslandIconSize: toRef(controlsIsland, 'controlsIslandIconSize'),

    // Caption settings
    showCaptions: toRef(captions, 'showCaptions'),
    captionFontSize: toRef(captions, 'fontSize'),
    captionOpacity: toRef(captions, 'opacity'),
    captionDocking: toRef(captions, 'docking'),
    captionFollowStage: toRef(captions, 'followStage'),
    captionLayoutMode: toRef(captions, 'layoutMode'),
    captionResetTrigger: toRef(captions, 'resetTrigger'),
    triggerCaptionReset: captions.triggerReset,

    // Methods
    setThemeColorsHue: theme.setThemeColorsHue,
    applyPrimaryColorFrom: theme.applyPrimaryColorFrom,
    isColorSelectedForPrimary: theme.isColorSelectedForPrimary,
    initializeStageModel: stageModel.initializeStageModel,
    updateStageModel: stageModel.updateStageModel,
    resetState,
  }
})
