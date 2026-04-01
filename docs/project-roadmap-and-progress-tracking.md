# AIRI Progress Overview

This document tracks the current development state of the AIRI project, specifically within the `airi-rebase-scratch` workspace.

## Feature Branches

| Branch Name | Description | Status |
|-------------|-------------|--------|
| `feat/artistry` | AI-generated art and image generation features (e.g., DALL-E integration). | Active |
| `feat/control-islands-camera` | Enhanced camera controls and positioning for the application's scenes/islands. | Active |
| `feat/live2d-customizations-panel` | A dedicated settings panel for fine-tuning Live2D model behaviors and visuals. | Active |
| `feat/model-selector-redesign` | (PR #1297) Re-engineered model selector with categorized grouping and real-time validation. | Submitted |
| `feat/scrolllock-mic-toggle` | (PR #1298) Feature to toggle the microphone mute state using the ScrollLock key. | Submitted |
| `feat/speech-pipeline-stability` | (PR #1299) Improvements to the VAD and speech processing pipeline for better stability and lower latency. | Submitted |
| `feat/stt-feedback-log-cleanup` | (PR #1300) Visual STT feedback toasts and refined terminal logging. | Submitted |
| `feat/tray-position-startup-fix` | (PR #1289) Auto-restore window position from snapshot on startup. | Submitted |
| `feat/vrm-live2d-expressions-customizations` | Shared logic and UI for emotion/expression mapping across both VRM and Live2D models. | Active |
| `feat/artistry-enhancements` | Reorganizing Artistry UI and automating widget prompt injection. | Active |
| `feat/volume-sensor-integration` | Integrating system volume levels into the proactivity sensor suite. | Completed |

## Recent Changes (in `airi-rebase-scratch`)

#### 2026-03-31 - Research: Standalone Sticker System & Multi-Window Widgets
- **Multi-Window Widget Architecture**: Successfully refactored the `WidgetsWindowManager` to support spawning multiple, independent Electron windows instead of a single reusable panel. Each standalone widget now gets its own window lifecycle.
- **Strict Sticker Transparency**: Implemented a specialized window configuration for stickers that disables "Acrylic" vibrancy to ensure perfect transparency.
- **Adhesive Sticker Spawning**: Integrated a "Standalone" toggle in the Sticker Library to trigger independent widget spawning with 60s auto-decay and manual dismissal.
- **ScrollLock State Opt-out**: Disabled the renderer-side mic-state syncing to prevent unwanted ScrollLock LED flickering on Windows.

#### 2026-03-30 - Kawaii Sticker System & Context Awareness Refinement
- **Dynamic System Prompt Synchronization**: Implemented a hot-swapping mechanism that automatically updates the active chat's system message when character settings (persona, traits, description) change. No chat reset required.
- **Character-Scoped Sticker Library**: Re-engineered the sticker system to isolate libraries per character. Implemented a fresh `library-v2` store to ensure strict data separation.
- **Sticker Hallucination Suppression**: Hardened the AI context prompt with CRITICAL instructions and implemented direct tool-call error feedback to prevent the LLM from hallucinating unavailable stickers.
- **Kawaii Sticker System UI**: Added "Clear Library" functionality for scoped deletion and renamed "Clear All" to "Clear Screen" for functional clarity.
- **Sticker Asset Cleanup**: Batch-processed the `Project-Mint-2` sticker set to normalize filenames, strip timestamps, and promote high-quality base assets.
- **Kawaii Sticker System ("Full Gusto")**: Initial implementation of the persistent sticker system with viewport-wide "wild" randomized spawning. Includes an automated 60s cleanup loop for both AI and manual placements.
- **Sticker Awareness**: Integrated a new context provider that keeps AIRI aware of what stickers are currently decorating her screen.
- **Visual State Awareness (Expressions)**: Developed the `Expressions` context provider, allowing the AI to "see" its own active expressions and props (e.g., blushing, glasses, cat ears) in both VRM and Live2D.
- **Intelligent Scene Filtering**: Refined the `Scenes` context provider to strictly filter for environmental backgrounds, preventing roleplay confusion from selfies or journal images.
- **Vue Template Fixes**: Resolved literal mustache tag parsing errors in `HackerPanel.vue` using `v-pre`.

#### 2026-03-29 - Onboarding Overhaul, Modular Wardrobe & Interface Revamp
- **Integrated Profile Switcher**: Redesigned the Character Profile Picker in the Control Island. Replaced the popover UI with an integrated sub-menu, adding utility buttons for Gallery and Profile Management. This resolves layout issues on small windows.
- **Sense Portal (Easy Mode)**: Implemented a streamlined, zero-config onboarding path using **Qwen Portal OAuth** and **Deepgram**.
- **Onboarding Orchestration**: Developed a modular multi-step setup flow with branching paths (Easy vs. Advanced) and automatic provider/model initialization.
- **Polymorphic UI Components**: Enhanced the core `Button` primitive to support polymorphism, enabling seamless integration of external setup links.
- **Modular Wardrobe Architecture**: Implemented a schema-driven wardrobe system that persists outfit bundles (base vs. overlay) within the AIRI character card.
- **Interactive Build Mode**: Created a real-time staging area for outfits with state snapshotting/restoration, allowing users to preview complex expression combinations before saving.
- **Control Island Integration**: Integrated live wardrobe data into the desktop island hub with visual feedback for active base and overlay layers.
- **Character Photo Mode**: Implemented a standalone, countdown-based (3-2-1) capture mode in the Control Island. Generates high-quality composite PNGs of the character + active background with an interactive camera flash effect.
- **Selfie-Enhanced Previews**: Character cards in settings now dynamically display the latest captured 'selfie' as the preview portrait.
- **Smart Viewfinder & Framing**: Added a 16:9 dashed-border viewfinder during countdown and shifted the card preview to a **15% top-offset** for optimal character headroom.
- **Gallery Download Support**: Added direct "Download" functionality to character-scoped image journals.
- **Icon Standardisation**: Updated expressions and profile icons for better distinctness and accessibility.

#### 2026-03-28 - Neural Memory & Interface Refinement

#### 2026-03-27 - Reload Accountability & Asset Autonomy

- **Reload Accountability (Stage UI)**: Implemented tracking and display of "reload reasons" (e.g., manual selection, initial load) in the loading overlay to improve observability of redundant scene resets.
- **Journal Background Awareness**: Successfully implemented proactivity sensor awareness of the active stage background chosen from the `image_journal`.
- **CUIPP Standalone Extraction**: Transitioned the bridge into a clean standalone generation worker architecture.
- **Agentic Asset Creation (Stage/Widgets)**: AIRI can now proactively generate her own stage backgrounds and widget images.
- **Scenic Background Starter Pack**: Integrated the initial collection of default scenic backgrounds.
- **Image Journal Integration**: Successfully implemented the `image_journal` as a first-class tool and persistent UI component, replacing ephemeral widget-based generation.

### 2026-03-20 - Memory Milestone: Short-Term + Long-Term Foundations
- **Short-Term Memory Rebuild Prototype**: Implemented per-character rebuild-from-history that groups chat logs by local day, generates one summary block per day, stores those blocks durably, and injects recent blocks into new/reset sessions for continuity.
- **Long-Term Memory / `text_journal`**: Implemented a first-class append-only journal tool with:
  - `create`
  - `search`
  - Both are scoped to the active character and backed by IndexedDB-style local storage.
- **Real Long-Term Memory UI**: Replaced the mock long-term memory page with a real archive view that reads stored entries, supports per-character filtering, and supports keyword search.
- **Toolchain Alignment Across Pipelines**: Confirmed and documented that typed chat, STT-triggered chat, and proactivity in Tamagotchi now all consume the shared `builtinTools` surface, so new builtin tools like `text_journal` do not need to be manually re-wired into each pipeline.
- **Chat Presentation Polish for Journal Writes**: Added a custom presentation layer for `text_journal` create calls so journal saves render as a formatted memory card in chat rather than raw JSON tool arguments.

### 2026-03-17 - Live2D Fixes, Churn Suppression & Tool-Aware Proactivity
- **Live2D 206 Fix**: Resolved critical `206 Partial Content` loading failure in `opfs-loader.ts` by normalizing responses into full `200` blobs.
- **Character Switcher Churn Fix**: Implemented **Identity Guards** in `index.vue` and the `airi-card` store. Redundant model reloads and "You selected..." toasts are now suppressed when character metadata updates without an actual model switch.
- **Improved Refresh Logic**: The Control Island's refresh button now triggers a **Forced Model Reload** via the store, allowing model resets without a full window reload.
- **Proactivity Tool Registration**: Implemented a dynamic tool registration system for the Heartbeats pipeline. The AI can now fetch and use contextually relevant tools (Volume, Time, etc.) during proactive evaluation.
- **DeepSeek/GLM-4.7 Support**: Added streaming support for `reasoning-delta` events and hardened the categorizer against malformed tag typos to prevent prompt stalls.
- **Selective Upstream Sync Audit**: Completed a thorough comparison against the March 15th upstream baseline (`65faf3f`). Confirmed upstream is primarily churn; integrated functional message-flattening logic into the fork.
- **System Volume Sensor**: Integrated a PowerShell-backed sensor for real-time volume levels in the proactivity payload.
- **Hotkey Persistence**: Fixed race condition where microphone toggle (e.g., Caps Lock) would reset to Scroll Lock.

### Prior Improvements
- **Dynamic AIRI Card Exports**: Session-aware snapshot system capturing outfits and expressions in real-time.
- **Expanded VRM Animation Library**: Increased library to 24 type-safe presets with standardized English naming.
- **Artistry System Refactor**: Moved configuration to character card settings with automated widget prompt injection.
- **Manual (Pure Mic) Mode**: Bypasses VAD for pure manual microphone triggering.
- **Heartbeats System (Proactivity)**: Restored proactivity UI and sensor-backed payload previews.

## Project Structure

- **Primary Workspace**: `airi-rebase-scratch`
  - Fork connected to `dasilva333/airi:main`. local branch `main`.
- **Staging/Clean Room**: `airi-clean-pr`
  - Used for isolating features into clean PR branches.

## Pending Items (Roadmap)
- **AIRI Card Export Preview Modes**: Explore an optional export mode that bakes the currently selected stage background into the composed PNG preview, while keeping the current transparent/framed export as the default. This should stay optional so card portability and predictable framing are not lost.
- **Onboarding Overhaul (Phase 1)**: Successfully implemented **Sense Portal (Easy Mode)** with OAuth and automatic provider configuration.
- **Modular Wardrobe System**: Successfully implemented.
- **Integrated Profile Switcher**: Successfully implemented in the Control Island.
- **Character Photo Mode / Saved Shots**: Successfully implemented (Full composite capture + Gallery Download + Selfie Previews).
- [ ] **Character Outfit & Habitat Management**:
  - [ ] **Outfit Context**: Integrate available and active outfit labels into the Chat Context Manager.
  - [ ] **Permanent Outfit Changes**: Implement `change_outfit` tool for non-ephemeral swaps (unlike ACT emotions).
  - [ ] **Polymorphic Tool Logic**: Interface should support a single mutually exclusive swap + additive arrays for enabling/disabling layers/accessories.
- **Browser-Integrated Card Imports (Phase 2)**: (Next Focus) Deep integration with external character sites via an in-app Electron browser. Hooks for direct importing while respecting site ads/iframes.
- **Vision Feature Integration**: Bridge the interval-based "Vision Witness" feature from main branch (Alpha 22-23).
  - [ ] **Research Upstream Logic**: Analyze the "jankier" screenshot hacks used in main and identify the core capture-and-prompt pipeline.
  - [ ] **Architect Vision Store**: Implement a proper `VisionStore` in `packages/stage-ui` to handle both "Reactive Vision" (User-sent) and "Witness Vision" (Ambient).
  - [ ] **Ambient Modality**: Evaluate if this belongs in a new "Ambient Image" provider class or works within existing VLM abstractions.
  - [/] **Gemini Live API Integration**: Developed [Design Document](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/docs/design-gemini-live-api-integration.md). Includes plans for real-time multimodal I/O, tool call plumbing, and chat history inscription using the `google-genai` SDK.
  - [ ] **ScrollLock Syncing Cleanup**: Fully remove or refactor the ScrollLock mic-toggle state syncing logic in the backend to prevent unwanted LED flickering and OS overlays. (Currently partially disabled in backend).
- [ ] **MCP Management UI (Settings > Modules)**:
  - [ ] Refactor the basic `mcp.vue` into a premium, Antigravity-inspired interface.
  - [ ] Implement the **MCP Store** for curated server discovery (Search, Filesystem, GitHub).
  - [ ] Implement the **Server Manager** with tool status counts (e.g., `91/91 tools`) and per-tool toggles.
  - [ ] Add **Integrated Guidance** templates at the top of the configuration view.
  - [ ] Add a "Refresh" capability to re-poll available tools without restarting the app.
- [ ] **Privacy Indicator**: Add visual feedback in Controls Island when AIRI is "Watching".
- [ ] **Provider Refactor (Low Priority)**: Split "Google Gemini API" (API Key) and "Google Gemini OAuth" (Bearer Token) into distinct provider types in `stores/providers.ts` to prevent credential misuse in standard Chat vs. Bidi endpoints.


## Defunct / Scrapped Ideas
- **Live2D ZIP Repackaging**: Intercepting oversized ZIP imports on the Electron side (Scrapped; focus shifted to asset autonomy).
