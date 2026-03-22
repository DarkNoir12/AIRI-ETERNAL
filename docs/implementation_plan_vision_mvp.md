# Implementation Plan: Vision MVP (OpenAI & OpenRouter)

This plan outlines the integration of decoupled vision support- **Phase 1 (MVP)**: Focus on **OpenAI** and **OpenRouter** for robust vision support. OpenRouter provides a wide range of models (including free ones) for testing.
- **Phase 1.5 (Local Extension)**: Investigate and verify **Ollama** and **llama.cpp** vision support. Confirm handling of `.mmproj` vision projectors.
- **Phase 2 (Native Native)**: Implement direct native support for **Google Gemini** (Vertex AI / Google AI SDK) to avoid dependency on intermediate providers.

## Proposed Changes

### 1. Registry & Core Metadata
Update the provider registry to support vision-specific tasks and metadata.

#### [MODIFY] [providers.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/providers.ts)
- Add `'vision'` to the `ProviderCategory` union.
- Update `ProviderMetadata` for OpenAI and OpenRouter to include the `vision` category.

#### [MODIFY] [converters.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/providers/converters.ts)
- Update `getCategoryFromTasks` to return `'vision'` if `image-to-text` or `vision` tasks are present.

### 2. Vision Settings Store
#### [MODIFY] [converters.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/providers/converters.ts)
- Update `getCategoryFromTasks` to return `'vision'` when tasks include `vision`.
- Ensure new providers with `vision` task are correctly categorized.

#### [NEW] [vision.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/modules/vision.ts)
- Create a new Pinia store `useVisionStore` to manage:
    - `activeProvider`: The selected VLM provider (OpenAI or OpenRouter).
    - `activeModel`: The specific VLM model.
    - `contextWindow`: Number of images to include in the context (Default: 5).
- Persist these settings using the same pattern as `consciousness.ts`.

### 3. Settings UI
Build the configuration interface for Vision.

#### [MODIFY] [modules/vision.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-pages/src/pages/settings/modules/vision.vue)
- Replace WIP content with a functional model selector (Provider -> Model) using the `useVisionStore`.

#### [MODIFY] [providers/index.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-pages/src/pages/settings/providers/index.vue)
- Add a new "Vision" block configuration to render a dedicated tab for vision-capable providers.

### 4. Chat Inference (Strategy B)
Implement the Direct Handover logic when images are attached.

#### [MODIFY] [chat.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/chat.ts)
- In `ingest`, check if the message contains attachments.
- In `performSend`, if `visionStore.activeProvider` is set and attachments exist:
    - Use the VLM provider/model for the entire turn.
    - Format the message using the OpenAI-compatible content parts array (text + image_url).
    - Fallback to the default LLM if no vision provider is configured (with a warning/toast).

### 5. Image Handling & UI
Enhance the input and preview mechanisms.

#### [MODIFY] [basic-text-area.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/ui/src/components/form/textarea/basic-text-area.vue)
- Add `@drop` event listener and `onDrop` handler.
- Emit `paste-file` event on successful drop of images.

#### [MODIFY] [ChatArea.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-layouts/src/components/Widgets/ChatArea.vue)
- Add `attachments` ref to store pending images.
- Implement `handleFilePaste`/`handleFileDrop` to convert files to Base64 and create a preview URL.
- Render an image preview strip above the text area with "Remove" buttons.
- Pass `attachments` to `ingest` on send.

#### [MODIFY] [InteractiveArea.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/apps/stage-tamagotchi/src/renderer/components/InteractiveArea.vue)
- Synchronize with `ChatArea.vue` for `handleFileDrop` and preview logic.

### 6. Chat History Rendering
#### [MODIFY] [user-item.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/components/scenarios/chat/user-item.vue)
- Detect `image_url` parts in `message.content` (array format).
- Render a grid of images alongside the text.

#### [MODIFY] [assistant-item.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/components/scenarios/chat/assistant-item.vue)
- Ensure it can handle array-based content if the VLM response includes non-text parts.

## Verification Plan

### Automated Tests (Standalone)
- Run `/tmp/test-openai-vision.mjs` with an OpenAI API key to verify base64 serialization and API response.
- Run `/tmp/test-gemini-vision.mjs` (using OpenRouter endpoint) to verify OpenRouter compatibility.

### Local Vision Support (Experimental)
- [ ] Create `C:\tmp\test-ollama-vision.mjs` to verify vision support in the local Ollama provider.
- [ ] Research `llama.cpp` `--mmproj` flag integration for direct local inference if needed beyond Ollama.

### Manual Verification
1. **Selection**: Go to `Settings > Modules > Vision` and select "GPT-4o-mini" as the provider/model.
2. **Persistence**: Refresh the app and ensure the selection is saved.
3. **Drafting**: Drag/Paste an image into the chat box. Verify the preview appears.
4. **Sending**: Send the message + image. Verify the VLM responds correctly to the image content.
5. **History**: Verify the sent image and the VLM's response are rendered correctly in the chat history.
6. **No VLM**: Disable the vision provider and try to send an image; verify a toast or error message is shown.
