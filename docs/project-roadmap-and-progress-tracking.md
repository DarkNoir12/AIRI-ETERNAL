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

#### 2026-04-02 - Performance Stability & Provider Expansion
- **Performance Regression Fix (Windows)**: Successfully identified and reverted the Async PBO rendering implementation to the robust synchronous fallback. This resolved the "App Not Responding" and mouse jitter issues reported on Windows.
- **Proactivity Memoization**: Optimized the `proactivity` store by memoizing usage metrics (TTS/STT/Chat counts). Heavy filtering logic is now throttled to the 10s sensor tick instead of running on every reactive update.
- **AWS Polly Native Integration**: Implemented direct neural speech synthesis using `aws4fetch` for secure V4 signing, bypassing local proxies and supporting dynamic region-based voice discovery.
- **MCP Management Dashboard**: Launched the premium Antigravity-inspired hub for Model Context Protocol servers. Includes curated discovery, tool titration (per-tool toggles), and real-time status counts.
- **Localization Rollout (Z.ai & Azure)**: Completed professional marketing copy and backfilled missing titles for 9 locales.

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
- **Artistry & Proactivity Refinement**:
    - [ ] **Artistry Character Toggle**: Allow users to fully disable artistry features on a per-character basis, which will dynamically update the character's system prompt builder to omit relevant image-generation instructions and tool definitions.
    - [ ] **Artistry Global "None" Provider**: Implement a "none" state at the global provider level to allow disabling image generation across the entire app, regardless of individual character settings.
    - [ ] **Proactivity Pipeline Overhaul**: Revisit the end-to-end proactivity pipeline focusing on three key tenets:
        - **Cross-Platform Compatibility**: Ensure robust performance on Windows, macOS, and Linux with graceful fallbacks for platform-specific sensors (e.g., fallback for PowerShell-based volume on non-Windows).
        - **Performance Optimization**: Minimize main-thread blocking and resource consumption during sensor polling and evaluation ticks.
        - **Context Parity**: Ensure the proactivity engine receives the same high-fidelity context payload (same sensors, tool definitions, and history) as the standard chat pipeline to prevent inconsistent reasoning or a "brain-split" where the AI thinks it has access to sensors/tools that are actually missing or broken.

- **TTS & Ingestion Stability**:
    - [ ] **Chat-Box TTS Restoration**: Investigate and fix the recurring issue where chat-box output becomes silent while other ingestion paths (e.g., Whisperdock) remain audible.
    - [ ] **Consistent Tool Architecture**: Consolidate tool definitions and pipeline registration logic across all entry points (Chatbox, Whisperdock, Proactivity, Google Live API) to eliminate duplicate logic and ensure consistent tool availability.

- **Character Outfit & Habitat Management**:
    - [ ] **Live2D Expression Mapping**: Bridge functionality from VRM to allow mapping Live2D expressions to Control Island emojis.
    - [ ] **Live2D Outfit System**: Port and enable the modular wardrobe/outfit system for Live2D models.
    - [ ] **Outfit Context**: Integrate available and active outfit labels into the Chat Context Manager.
    - [ ] **Permanent Outfit Changes (`change_outfit` tool)**: Implement a polymorphic tool for the AI to perform non-ephemeral swaps, supporting mutually exclusive swaps and additive layer/accessory controls. (Blocked until Live2D outfit system is ready).
- **Browser-Integrated Card Imports (Phase 2)**: (Next Focus) Deep integration with external character sites via an in-app Electron browser. Hooks for direct importing while respecting site ads/iframes.
- **Vision Feature Integration**:
  - [/] **Gemini 2.5 vs 3.1 Support**: Implement support for both versions to compare the "richer" experience of 2.5 vs the standard 3.1 implementation. [/]
- **Discord Bot Enhancements**:
    - [ ] **Discord Proactive Messaging**: Implement proactive message routing to Discord based on recent activity heuristics (e.g., routing heartbeats to the last active channel used by the user).
    - [ ] **Slash Command: Character Switching**: Add a `/character` slash command to allow switching the active AIRI card directly from Discord.
    - [ ] **Slash Command: Manual Emotions**: Add an `/emotion` slash command to manually trigger character expressions/animations on the desktop avatar from Discord.
    - [ ] **Inline Artistry**: Integrate Artistry/Image generation into the Discord pipeline, allowing the bot to return generated images (widgets/backgrounds) as inline attachments in the Discord chat.
    - [ ] **Interruption & Barge-in (Research)**: Investigate technical feasibility for conversational interruption/barge-in within the Discord bot context, allowing for more natural, overlapping dialogue.

- **Infrastructure & UI Health**:
    - [ ] **Settings - System Revamp**: Completely overhaul the `settings > system` page to resolve the current "hodge-podge" of disjointed, nested, and potentially duplicated settings:
        - **Consolidation**: Pivot away from deep nesting and instead group related settings on a single, well-organized page with clear section headers.
        - **Developer Mode Relegation**: Move developer-specific tools and configuration out of the main system flow to prevent clutter for standard users.
        - **Deduplication Audit**: Conduct a full audit to identify and merge settings that are currently duplicated across different pages (e.g., speech or consciousness settings appearing in multiple places).
        - **Emphasis on Discoverability**: Focus on a flatter hierarchy where most critical system options are accessible without multiple layers of navigation.
    - [ ] **Context-Width Global Mapping**: Implement a global storage map (local storage) that links `providerId` and `modelName` to a user-defined `contextWidth`.
    - [ ] **Generation Tab Persistence**: Update the generation settings tab to automatically update this global map when a value greater than 0 is set.
    - [ ] **Context-Width Inheritance**: Refine the chatbox loading-bar logic to coalesce settings: if a character's context width is unset, it should inherit the value from the global map matching the active provider/model pair.
    - [ ] **Control Island Mutual Exclusion**: Refactor the Control Islands (Main and Gemini/Module-specific) to ensure only one can be open at a time; opening one should automatically close any other open island.
    - [ ] **Gemini Control Island Auto-Hide Logic**: Update the button behaviors in the Gemini/Module Control Island to match the "Main" island's established UX:
        - **Toggle buttons** (e.g., Grounding toggle, Voice/Custom mode toggle) should trigger an auto-hide of the island panel.
        - **Cycle buttons** (e.g., Interval cycling) should keep the island panel open for further interaction.
    - [ ] **Status Indicator Audit**: Revisit `settings>modules` and `settings>providers` to ensure the "green state" (connected/enabled) indicators are working accurately for all entries.
    - [ ] **Model Selector Stability (Research & Design)**: Investigate and resolve the "reactive reset" bug where selecting a temporary preview model in the Model Selector is overridden by the active character's stored model configuration:
        - **Problem**: Users on character "Mint" (set to `mint123.vrm`) select `mint456.vrm` in the Model Selector for a temporary preview; reactive logic currently forces a reset back to `mint123.vrm` after a few moments.
        - **Proposed Solution**: Detect when the user is in the Model Selector route/page and suppress the character-scoped model restoration logic.
        - **UI Enhancement**: If the active character's model configuration differs from the current Model Selector preview, display a non-intrusive warning: *"Your model will be restored to the one set on your character once you leave this page unless you click Apply Now."*
        - **Current Workaround (Kludgy)**: Users are currently forced to "Set model to {character}" just to avoid a reset, even if they aren't ready to commit to the change.
- [x] **Privacy Indicator**: Add visual feedback in Controls Island when AIRI is "Watching". [x]
- **[Experimental] Widget-Native Transient Chat Bubbles**:
  - Context-aware, at-a-glance chat history overlaid directly on the transparent `Stage.vue` model layer.
  - Typed queries from Whisperdock push directly to the Stage as right-aligned bubbles, with the AI's response cascading below it.
  - Maintains only the active context (last 2-3 turns) so the model isn't obscured. Designed optimally for characters tuned for short, conversational responses.
  - Frosted glass aesthetics to blend seamlessly with the desktop background and model canvas.
  - Focuses on TTS audio delivery; text is aggressively truncated to save space, but expands to reveal the full response upon click/hover if the user missed the audio cue.

## Defunct / Scrapped Ideas
- **Live2D ZIP Repackaging**: Intercepting oversized ZIP imports on the Electron side (Scrapped; focus shifted to asset autonomy).
- **Onboarding Overhaul (Phase 1)**: (Completed via Sense Portal / Easy Mode).
- **Modular Wardrobe System**: (Completed).
- **Integrated Profile Switcher**: (Completed).
- **Character Photo Mode**: (Completed).
- **MCP Management UI**: (Completed).
