<script setup lang="ts">
import InteractiveArea from '../components/InteractiveArea.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'

// NOTICE: Speech hooks are registered by Stage.vue (WidgetStage) in the main window.
// We intentionally do NOT register useChatSpeechBridge() here because both windows share
// the same chat hooks bus. If both register, every token gets forwarded to TTS twice,
// causing double-speech. The main window is the single speech owner.
</script>

<template>
  <div h-full w-full pt="44px" overflow-y-scroll>
    <WindowTitleBar
      title="Chat"
      icon="i-solar:chat-line-bold"
    />
    <InteractiveArea
      class="interaction-area block"
      h-full w-full p-4 transition="opacity duration-250"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
