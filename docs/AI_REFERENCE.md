# AIRI AI Reference Sheet

Concise mapping of conceptual features to technical file paths for rapid context retrieval.

## Core UI & Surfaces

- **Floating Island (Stage)**: `packages/stage-ui/src/components/scenes/Stage.vue` (Host for models, speech, background)
- **Control Island (Original)**: `apps/stage-tamagotchi/src/renderer/components/stage-islands/controls-island/index.vue` (Main chevron/drag logic)
- **Gemini Control Island**: `.../controls-island/gemini-controls.vue` (Left-side sparkle controls)
- **Whisperbox**: `packages/stage-ui/src/components/scenarios/chat/WhisperDock.vue` (Mid-center keyboard input)
- **Resource Island**: `apps/stage-tamagotchi/src/renderer/components/stage-islands/resource-status-island/index.vue`
- **VRM Character**: `packages/stage-ui-three/src/components/Model/VRMModel.vue` (3D rendering & expressions)
- **Live2D Character**: `packages/stage-ui-live2d/src/components/scenes/live2d/Canvas.vue`
- **Gemini Panel**: `apps/stage-tamagotchi/src/renderer/pages/notice/gemini.vue` (UI) | `packages/stage-ui/src/stores/modules/live-session.ts` (Bidi WebSocket)
- **System Tray**: `apps/stage-tamagotchi/src/main/tray/index.ts` (Electron main process)
- **Caption Overlay**: `apps/stage-tamagotchi/src/renderer/pages/caption.vue` (UI) | `apps/stage-tamagotchi/src/main/windows/caption/` (Manager)
- **Widgets Host (Standalone)**: `apps/stage-tamagotchi/src/renderer/pages/widgets.vue` (Renderer window for all widgets)
- **Widget Window Manager**: `apps/stage-tamagotchi/src/main/windows/widgets/index.ts` (Handles life-cycle, snapshots, and TTL)

## Settings & Editing

- **AIRI Card Editor**: `packages/stage-pages/src/pages/settings/airi-card/index.vue`
    - **Identity Tab**: `.../tabs/CardCreationTabIdentity.vue`
    - **Behavior Tab**: `.../tabs/CardCreationTabBehavior.vue`
    - **Generation Tab**: `.../tabs/CardCreationTabGeneration.vue`
    - **Acting Tab**: `.../tabs/CardCreationTabActing.vue`
    - **Artistry Tab**: `.../tabs/CardCreationTabArtistry.vue`
    - **Modules Tab**: `.../tabs/CardCreationTabModules.vue`
    - **Proactivity Tab**: `.../tabs/CardCreationTabProactivity.vue`
- **Vision Settings**: `packages/stage-pages/src/pages/settings/modules/vision.vue` | `visionStore`
- **Modules/Systems**: `packages/stage-pages/src/pages/settings/modules/`
- **Providers Config**: `packages/stage-pages/src/pages/settings/providers/`

## Engine & Subsystems

- **ACT Pipeline**: `packages/stage-ui/src/composables/use-llm-marker-parser.ts` (Parser) | `packages/stage-ui-three/src/services/expression.ts` (Execution)
- **Memory (Long-term)**: `packages/stage-ui/src/stores/memory-text-journal.ts` (IndexedDB) | `Settings -> Memory -> Long Term`
- **Text Journal Operations**: `write`, `search` (Involved in tool definitions)
- **Semantic Search Index**: `Transformers.js` / `Orama` / `Voy` (Local indexing in `IndexedDB`)
- **Memory (Short-term)**: `packages/stage-ui/src/stores/memory-short-term.ts` (Daily summaries)
- **VRM Animations**: `packages/stage-ui-three/src/assets/vrm/animations/index.ts` (Assets) | `packages/stage-ui-three/src/stores/model-store.ts` (State)
- **Artistry/ComfyUI**: `apps/stage-tamagotchi/src/main/services/airi/widgets/providers/comfyui.ts` (Native HTTP API)
- **Scene/Background**: `packages/stage-ui/src/components/scenes/Stage.vue` (Layer) | `packages/stage-pages/src/pages/settings/scene/index.vue` (UI)
- **Model Position/Lights**: `packages/stage-ui/src/components/scenarios/settings/model-settings/vrm.vue`
- **Proactivity/Heartbeats**: `packages/stage-ui/src/stores/proactivity.ts` (Idle logic)
- **Control Island State**: `packages/stage-ui/src/stores/settings/controls-island.ts` (Shared) | `apps/stage-tamagotchi/src/renderer/stores/controls-island.ts` (Renderer)
- **Image Journal Store**: `packages/stage-ui/src/stores/background.ts` (Handles Builtin, Scene, Journal, and Selfie types)
- **Artistry Bridge**: `apps/stage-tamagotchi/src/main/services/airi/widgets/artistry-bridge.ts` (Main process bridge for image widgets)
- **Image Attachments**: `packages/stage-layouts/src/components/Widgets/ChatArea.vue` (State) | `packages/ui/src/components/form/textarea/basic-text-area.vue` (Drop)
- **User Image Render**: `packages/stage-ui/src/components/scenarios/chat/user-item.vue`
- **STT/Microphone**: `apps/stage-tamagotchi/src/renderer/pages/index.vue` (Tamagotchi) | `apps/stage-web/src/pages/index.vue` (Web)

## Chatbox Elements
- **Chat History (Host)**: `packages/stage-ui/src/components/scenarios/chat/history.vue`
- **Assistant Bubble**: `.../chat/assistant-item.vue`
- **User Bubble**: `.../chat/user-item.vue`
- **Bubble Render Parts**: `.../chat/response-part.vue` (Text) | `.../chat/tool-call-block.vue` (Tools)
- **Journal Strip (Chips)**: `apps/stage-tamagotchi/src/renderer/components/InteractiveArea.vue` (Scrollable Image/Text previews)
- **Toolbar Strip**: `apps/stage-tamagotchi/src/renderer/components/InteractiveArea.vue` (Buttons: Grounding, Memory, Trash, Send)
- **Bubble Styling (ACT)**: extracted from performance tokens in `ChatArea.vue`

## Key Directories

- `packages/stage-ui`: Core business logic, components, and Pinia stores.
- `packages/stage-shared`: Common constants (`emotions.ts`, `events.ts`) and utils.
- `apps/stage-tamagotchi`: Electron-specific main/renderer code.
- `docs/content/en/docs/advanced/architecture/`: Source for all detailed architecture specifications.

## Nicknames Index

- **"chatbox"** -> `ChatArea.vue` / `Interaction*.vue`
- **"the island"** -> `Stage.vue`
- **"pencil artistry"** -> `CardCreationTabArtistry.vue`
- **"the staging_widgets thing"** -> `apps/stage-tamagotchi/src/renderer/stores/tools/builtin/widgets.ts` (The spawning tool)
- **"the backends"** -> `packages/stage-ui/src/stores/providers.ts`
- **"the brain"** -> `packages/stage-ui/src/stores/modules/`
