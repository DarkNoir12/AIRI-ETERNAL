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

#### 2026-03-28 - Neural Memory & Interface Refinement
- **Semantic Brain Sandbox (PoC)**: Validated a high-performance, hybrid (BM25 + Vector + Reranking) memory retrieval pipeline. Verified sub-15ms retrieval across a 5,000-chunk dataset (100M token sample).
- **Stabilized Local Whisper Anchor**: Hardened the local transcription pipeline for "always-on" reliable speech recognition.
- **Split Artistry Presets**: Restored and bifurcated Replicate presets to support distinct "Generation" vs. "Editing" workflows in the Artistry tab.
- **Dual-Purpose Send Button**: Implemented a context-aware send button and improved Enter key reliability for intuitive chat interactions.

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
- **Character Photo Mode / Saved Shots**: Explore a lightweight "photo mode" for capturing stills of the current character pose/frame directly from stage. Initial scope should be simple one-click image capture and download; a later extension could allow cards to keep a preferred preview shot for export. Keep this intentionally small to avoid overengineering into a full screenshot studio too early.
- **Onboarding Flow Repackaging (Phase 1)**: (Current Focus) Redesign the initial setup to include a character picker and import links (e.g., character hubs) early in the flow. Move character settings to be more approachable, ensuring users know how to edit personality/behavior immediately after import.
- **Browser-Integrated Card Imports (Phase 2)**: Deep integration with external character sites via an in-app Electron browser. Hooks for direct importing while respecting site ads/iframes.
- **Agentic Asset Creation (Continued)**:
  - **Outfits (textures)**: (Coming soon)
  - **Simple 3D Props**: (Coming eventually)
- **Long-Term Memory Semantic Search**: Verified (See `docs/blueprint-semantic-search-integration.md`). Ready for full store integration.


## Defunct / Scrapped Ideas
- **Live2D ZIP Repackaging**: Intercepting oversized ZIP imports on the Electron side (Scrapped; focus shifted to asset autonomy).
