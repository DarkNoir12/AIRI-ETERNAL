# AIRI Fork: Core Feature Report

This document tracks the high-level, user-facing features and architectural shifts that define this fork. It serves as a living reference for the project's evolution beyond the baseline implementation.

---

## 1. Chat & Desktop Experience
Focuses on immersion, transparency, and reducing the "black box" nature of AI interactions.

- **ACT-Driven Bubble Styling**: Chat bubbles automatically apply **background tints**, **border glows**, and **transitions** based on character performance tokens (e.g., `[happy]`, `[angry]`, `(surprised)`). Mood-colored borders give each message a distinct personality.
- **Unified Journaling Feed**: A horizontal Interaction Area above the chat input that displays a **real-time carousel** of the latest 2 text journals and 3 image journals — visible at a glance without opening extra panels.
- **Persona-Driven Auto-Titles**: Automated short-term memory blocks are assigned **character-consistent titles** (e.g., *"My thoughts after 108 messages together~"*) instead of static IDs.
- **Context Limit Transparency**: A visual **Context Meter** (progress bar) and **Token Counter** (e.g., `46.7K`) that transition from Green → Yellow → Red as the character's memory limit is approached.
- **Atomic Session Rebuilds**: A context-aware "Rebuild" logic that semantically **compacts long-running conversations** into a clean state while preserving the last 3 days of continuity.
- **Configurable Send Key**: User-selectable chat submission hotkey (e.g., Enter vs. Ctrl+Enter) via General Settings.

---

## 2. Character Card System
A full-featured card creation, configuration, and portability layer.

- **Per-Character LLM Generation Settings**: Each AIRI card can override the global LLM provider, model, temperature, top-p, and max tokens via a dedicated **Generation** tab. Designed with future SillyTavern preset import compatibility in mind.
- **V-Hack / Mutation Studio Foundation**: Model settings now include a native **V-Hack-style editing surface** for AI-assisted texture and mutation workflows, expanding AIRI from pure card configuration into in-app visual experimentation.
- **AIRI JSON Export**: A full-fidelity native JSON format (`airi-card` v1) that preserves all extensions (modules, artistry, acting, heartbeats). **Does not include personal chat history or private data** — only the configured character settings, ensuring cards are safe to share.
- **Background Bundling on Export**: The character's currently active background/scene is exported **with the card**, so anyone who imports it gets the background automatically applied.
- **SillyTavern PNG Import/Export**: Full `chara_card_v2` compatibility, allowing users to **import existing community cards** and export AIRI cards as shareable PNGs with embedded metadata and a framed portrait preview.
- **Dynamic Card Export Snapshots**: Session-aware snapshot system that captures **active outfits and expressions** in real-time for export previews.
- **Duplicate Handling**: Automatic rename-on-import (`Lain`, `Lain (2)`, `Lain (3)`) prevents accidental overwrites.

---

## 3. ACT Token & Expression Pipeline
A structured pipeline that maps AI dialogue tokens into real-time VRM/Live2D expression and animation changes.

- **Full ACT Token Pipeline**: AI output is parsed for `<|ACT:...|>` tokens, which flow through `processMarkers()` → `parseActEmotion()` → `emotionsQueue` → VRM `expressionManager`. Drives **morph targets and material color binds** directly.
- **Heuristic Mood Mapping**: A 7-archetype system (`happy`, `sad`, `angry`, `surprised`, `thinking`, `flustered`, `relaxed`) that maps dozens of keywords to core visual states for bubble styling and UI feedback, independent of the VRM pipeline.
- **Custom Expression Key Mapping**: Users can define **custom keys** that map directly to their VRM model's expression names, enabling any model's unique expressions to be driven by ACT tokens.
- **Dynamic Name Resolution**: Expression names not in the hardcoded map are resolved via **case-insensitive search** of the VRM's `expressionMap`, allowing any model's custom expressions to work without code changes.
- **VRMA-Aware ACT Tokens**: ACT tokens can trigger full-body **VRMA animations** (e.g., `<|ACT:{"animation":"crab_dance"}|>`), not just facial expressions. A priority system ensures VRMA takes precedence over blendshape matches.
- **Smooth Transitions**: All emotion changes use a lerp-based blending system — when one emotion activates, all others fade to zero simultaneously over a configurable `blendDuration`.

---

## 4. VRM Animation Ecosystem
A fully customizable idle and performance animation system for VRM models.

- **Revamped VRM Settings Panel**: The VRM model settings surface has been reorganized into a cleaner, more structured editing experience for animations, expressions, and model controls.
- **24 Built-In VRMA Presets**: An expanded library of **24 type-safe, standardized English-named** animation presets selectable via a dropdown in Model Settings, with cross-fade transitions.
- **Per-Character Animation Palettes**: Each character card can be configured with a **subset of the 24 presets** that the idle sampler will cycle through, rather than using the full library. This allows personality-specific animation curation (e.g., calm poses for one character, energetic dances for another).
- **ACT-Triggered Animations**: AI characters can trigger specific animations on-demand via ACT tokens, with automatic cross-fade back to the user's chosen idle on completion.
- **"Idle Hairball" Random Cycle**: A global toggle that continuously **samples random animations** from the character's configured palette, cross-fading between them to keep the character feeling "alive" at rest.
- **Performance Priority System**: When an ACT performance token fires, the idle cycle **pauses and yields**, then resumes a new random idle once the performance completes.
- **User VRMA Uploads**: Users can upload their own `.vrma` files (from marketplaces like Booth.pm) and add them to the animation library.

---

## 5. Scenes & Background Manager
Character-scoped backgrounds and the foundation for AI-driven environment control.

- **2 Bundled Scenic Backgrounds**: Ships with **2 built-in scene backgrounds** out of the box for a richer first-run experience.
- **Character-Scoped Backgrounds**: Each AIRI card can specify a **preferred background** that persists across sessions and can be set directly from the Artistry gallery widget.
- **Transparency-Aware Rendering**: Both Live2D (PixiJS `backgroundAlpha: 0`) and VRM (Three.js `clearAlpha: 0`) renderers use **fully transparent canvases**, allowing layered composition with DOM backgrounds.
- **Background-Journal Integration**: The Image Journal and Background systems are **bridged** — generated artistry images can be set as the character's background in a single click.
- **AI-Driven Background Creation**: The AI can not only set an existing image from the journal as a background, but also **generate a new image and set it as the background** in one action — letting the character "redecorate" on the fly.
- **Background Portability**: Active backgrounds are exported **with the AIRI card**, so anyone who imports a character gets their scene automatically applied.

---

## 6. Memory & Continuity
A sophisticated multi-layered storage system designed for multi-day, consistent roleplay.

- **Two-Layer Memory Model**:
    - **Short-Term (Context Summaries)**: Daily derived "blocks" of conversation history automatically injected into the LLM context.
    - **Long-Term (Durable Journal)**: A persistent, append-only archive stored in **IndexedDB**, allowing for years of recall without context bloat.
- **Unified Retrieval System**: Smart memory lookup that searches **Long-Term first**, then falls back to **Short-Term blocks**, ensuring character recall is seamless across storage layers.
- **Character-Centric Boundary**: Strict isolation of memory per character profile, preventing identity bleed or cross-contamination between different "Souls."
- **Immutable Daily Summaries**: Once a day ends, a final immutable summary is generated, locking in the "soul" of that day's interactions for future recall.

---

## 7. Artistry & Creative Generation
A complete redesign of the image generation pipeline, focusing on performance and user creative control.

- **Native ComfyUI API Support**: Direct, high-speed HTTP integration with any local or network **ComfyUI instance**. No middleware, CLI bridges, or WSL requirements.
- **Replicate Cloud Support**: First-class integration with **Replicate's API** as a remote generation provider. Pricing transparency is built into the UI — models are sorted with cost-per-generation visible, and starting at **$5 for ~1,600 images** on their cheapest models, it's a great option for users who can't render locally.
- **Interactive Gallery Widget**: A premium "Flip Card" display with **front-face** image preview, **back-face** generation metadata (Prompt, Remix ID, Render Time), and one-click **"Set as Background"**.
- **NanoBanana Provider Support**: Added **NanoBanana** as another first-class artistry backend alongside Replicate and ComfyUI, widening the generation and mutation toolset available to AIRI.
- **"Bring Your Own Workflow" (BYOW)**: Users can upload any `workflow_api.json` from ComfyUI and visually map specific nodes (prompts, seeds, LoRA weights) to be **controllable by the AI**.
- **Workflow Templates & Presets**: Save and name complex node graphs as reusable templates. Different AI characters can be assigned **unique generation "personalities"** and prompt prefixes.
- **Bidirectional `{{PROMPT}}` / `{{IMAGE}}` Placeholders**: Artistry workflows can now reuse prompt text and source images through explicit placeholders, enabling cleaner remix and image-conditioned generation flows across provider backends.
- **Automated Image Handoff**: Generated art is instantly archived into the character-scoped **Image Journal**, ensuring no creation is lost across sessions.

---

## 8. Vision Support
Decoupled Vision-Language Model (VLM) support — not present in the upstream project.

- **Dedicated Vision Store**: A separate `vision` store for VLM provider and model selection, keeping it independent from the primary Chat LLM ("Mind" vs. "Senses").
- **Direct Handover Strategy**: When images are attached, the request is routed **entirely to the VLM** for that turn, allowing cost optimization (e.g., cheap LLM for chat, Gemini Pro Vision for images).
- **Drag-and-Drop / Paste Attachments**: Image attachment support via **drag-and-drop** and **clipboard paste** in both the Desktop and Web chat areas, with a preview strip above the input.
- **Image-Aware Chat History**: Attached images are tracked in the chat history as `image_url` content parts, allowing the AI to reference previously shared images in context.
- **Local & Remote VLM Inference**: Supports **Ollama** and **LM Studio** for fully local VLM inference, plus **OpenAI**, **OpenRouter**, and **Native Gemini SDK** for cloud-based vision.

---

## 9. Provider Integrations
Custom provider integrations not present in the upstream project.

- **Chatterbox TTS**: A first-class speech provider with deep integration:
    - **Preset & Profile CRUD**: A dedicated Chatterbox Management Studio (`Settings → Providers → Speech → Chatterbox`) for creating and managing speech presets and text transformation profiles.
    - **Dynamic Preset Resolution**: Presets combine base voice, model mode, exaggeration, and mannerism profiles into reusable speech configurations.
    - **Capability-Driven Helpers**: Provider capabilities (`supportsSpeechTags`, `availableMannerisms`) are queried at runtime to power context-aware helper UI in the Acting tab.
    - **Semantic Speech Pipeline**: End-to-end flow from ACT token parsing → provider-side text preprocessing → mannerism transformation → TTS synthesis.
- **Deepgram STT (Nova-2/Nova-3)**: Native integration for high-speed transcription with a secure **main-process JWT-based CORS bypass** for the Electron environment.
- **DeepSeek / GLM-4 Streaming**: Added streaming support for `reasoning-delta` events and hardened the categorizer against **malformed tag typos** to prevent prompt stalls.
- **Qwen Portal Provider**: Added a first-class **Qwen Portal** integration with dedicated OAuth plumbing through the unified provider registry.

---

## 10. Situational Awareness & Proactivity
Enables the character to perceive and react to the user's real-world desktop environment.

- **OS Sensor Integration**: Proactive injection of real-time telemetry into the LLM context, including **Active Window Title**, **Program Name**, and **User Idle (AFK) status**.
- **Activity History Tracking**: AIRI can track and reference **which applications you've been using** and for how long, allowing for more grounded and reactive roleplay.
- **Environment Telemetry**: Real-time awareness of **CPU/GPU load**, **System Volume** (PowerShell-backed sensor), and **Local Time**, allowing characters to coordinate their energy levels or suggestions with your PC's state.
- **Tool-Aware Proactivity**: Dynamic tool registration for the Heartbeats pipeline — the AI can fetch and use **contextually relevant tools** (Volume, Time, etc.) during proactive evaluation.
- **Metric-Driven Milestones**: Tracking of session-level metadata (total turns, journal entry counts) to trigger **special conversational milestones** or "save-point" reminders.

---

## 11. Desktop Stage (Control Island & UI)
The floating interaction hub for the desktop experience.

- **Glassmorphic Control Island**: A floating, draggable UI component using `backdrop-blur-xl` and semi-transparent backgrounds, following an iOS-style **"island" pattern**.
- **Emotion Picker Sub-Menu**: Direct access to **8 emotion triggers** (Happy, Sad, Angry, Surprised, Neutral, Think, Cool, Random) from the Control Island drawer.
- **Fade-on-Hover Intelligence**: A specialized **"Eye" mode** that makes the UI nearly invisible when the mouse hovers over the model area, ensuring the character's performance is never obscured.
- **Profile Switcher**: Inline popover for switching between AI souls/profiles without leaving the Stage.
- **Animation Cycle Button**: One-click cycling through available VRM idle animations directly from the island.
- **ScrollLock Mic Toggle**: A physical hardware key binding for **push-to-talk / toggle microphone** without touching the UI.
- **Manual (Pure Mic) Mode**: Bypasses VAD entirely for **clean push-to-talk** microphone triggering.
- **Resource Status Island**: A separate floating indicator that shows real-time **module loading progress** and a "Ready!" status with expandable details.
- **Transcription Feedback Toasts**: Real-time `🎤 You said: {text}` confirmation during voice interactions.

---

## 12. Platform & Operations
Internal hardening to ensure the app remains a stable, performant "Daily Driver."

- **Interaction Throttling**: Sophisticated **rate-limiting (200ms)** on window move/resize events to prevent IPC flooding and UI stuttering during desktop manipulation.
- **Secure CORS Bypass**: A main-process header interceptor for Electron that allows secure communication with external providers without breaking browser safety policies.
- **Environment Guardrails**: Strict enforcement of **Node.js >= 20.14.0** and **pnpm >= 10.0.0** via `.npmrc` to prevent the `tsdown` build crashes found in modern dependencies.
- **Identity-Guarded Character Switching**: Suppresses redundant model reloads and duplicate toasts when card metadata updates **without an actual model switch**.
- **Tray Position Restore**: Auto-restores last window position from a saved snapshot on startup.
- **Provider Onboarding & Metadata UX**: The provider settings surface now includes more beginner-friendly onboarding cues and richer provider metadata presentation to make initial setup easier to understand.

---

## 13. Integrated Upstream PRs
Features from pending upstream PRs that have been squatted, integrated, and maintained in this fork.

| PR # | Feature | Author | Link |
|:---|:---|:---|:---|
| #1256 | **Amazon Bedrock Provider** — Adds AWS Bedrock as a first-class LLM provider | @chaosreload | [PR](https://github.com/moeru-ai/airi/pull/1256) |
| #1302 | **OpenRouter TTS** — Adds OpenRouter as a speech (TTS) provider | @monolithic827 | [PR](https://github.com/moeru-ai/airi/pull/1302) |
| #851 | **Configurable Chat Send Key** — Adds user-selectable send key option (Enter/Ctrl+Enter) | @cheesemori | [PR](https://github.com/moeru-ai/airi/pull/851) |
| #1026 | **xAI Grok Voice Providers** — Adds Grok TTS/STT as speech providers | — | [PR](https://github.com/moeru-ai/airi/pull/1026) |
