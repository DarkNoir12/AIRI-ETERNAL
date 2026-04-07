# AIRI-ETERNAL — Fork Context

> **This is the instructional context for `DarkNoir12/AIRI-ETERNAL`, a fork of `dasilva333/airi` (itself a fork of `moeru-ai/airi`).**
> Last updated: 2026-04-07

---

## What This Fork Is

**AIRI-ETERNAL** (`DarkNoir12/AIRI-ETERNAL`) is a personal fork focused on extending AIRI's **speech/TTS capabilities** with custom providers (OmniVoice, Fish Speech), a speech-bridge composable, audio processing utilities, and a standalone OmniVoice inference server.

### Lineage

```
moeru-ai/airi (upstream original)
  └─ dasilva333/airi (upstream fork — active development, 33+ commits merged)
       └─ DarkNoir12/AIRI-ETERNAL (this fork — speech extensions + upstream sync)
```

### Git Remotes

| Remote | URL | Purpose |
|---|---|---|
| `origin` | `DarkNoir12/AIRI-ETERNAL` | Our fork (push target) |
| `upstream` | `dasilva333/airi` | Upstream fork (fetch for sync) |

**Current sync status:** ✅ Fully synced. All upstream commits merged via `29ea4af3`. We have 11 commits ahead of upstream (OmniVoice setup, sync docs, typecheck fixes).

---

## Our Custom Additions (Fork-Specific)

These are the files and features **we added** that don't exist in upstream:

### Speech Providers & Infrastructure

| File / Path | Purpose |
|---|---|
| `servers/omnivoice/` | **Standalone OmniVoice TTS inference server** — PyTorch-based, supports reference audio cloning, multilingual voices. Includes training scripts (`run_finetune.sh`, `run_emilia.sh`), data config, and docs. |
| `packages/stage-ui/src/libs/providers/providers/omnivoice/index.ts` | OmniVoice provider definition for the AIRI provider system. |
| `packages/stage-pages/src/pages/settings/providers/speech/omnivoice.vue` | OmniVoice settings UI page. |
| `packages/stage-ui/src/libs/providers/providers/fish-speech/` | Fish Speech provider definition. |
| `packages/stage-ui/src/stores/modules/speech.ts` (modified) | Added `omnivoice` to validation bypass list (skips voice-fetching for providers with built-in defaults). |
| `packages/stage-ui/src/stores/providers.ts` (modified) | Added OmniVoice provider definition with Jen Frankie voice, `ref_audio` payload logic. |
| `packages/stage-ui/src/components/scenes/Stage.vue` (modified) | Added OmniVoice model/voice resolution block matching the Chatterbox pattern. |

### Speech Pipeline & Composables

| File / Path | Purpose |
|---|---|
| `apps/stage-tamagotchi/src/renderer/composables/use-chat-speech-bridge.ts` | **Composable that bridges chat events to speech** — hooks into `onBeforeMessageComposed`, `onTokenLiteral`, etc. to trigger TTS during streaming responses. |
| `packages/pipelines-audio/src/processors/tts-chunker.ts` | **TTS text chunker** — breaks long text into manageable chunks for TTS processing. |

### Utilities

| File / Path | Purpose |
|---|---|
| `packages/stage-ui/src/composables/llm-json-interceptor.ts` | LLM JSON response interceptor — handles malformed JSON from providers. |
| `start_all.bat` | Batch script to start all dev servers at once. |

### i18n

| File / Path | Purpose |
|---|---|
| `packages/i18n/src/locales/en/settings.yaml` (modified) | Added `settings.pages.providers.provider.omnivoice.title` and `.description`. |
| `packages/i18n/src/locales/ja/settings.yaml` (modified) | Japanese OmniVoice translation. |
| `packages/i18n/src/locales/zh-Hans/settings.yaml` (modified) | Simplified Chinese OmniVoice translation. |

---

## Upstream Changes We've Merged

From `dasilva333/airi` (33 commits, merged 2026-04-07):

### Notable upstream features
- **Narrative Logic for TTS** (`85fcc91e`) — strips asterisks, brackets, parentheses, emojis before TTS. Our OmniVoice provider benefits from this automatically.
- **Universal Speech Transformer** — `transformTextForSpeech()` function in `speech.ts`. Cleans text before TTS generation.
- **Caption overlay system** — persistent caption window, docking logic, 3x3 command center.
- **Sensors & proactivity** — Win32 FFI via Koffi, hardware-level turn reset, Live API master gate.
- **Image journal refactor** — multi-modal `mode` system with inline rendering.
- **Control Island UX** — mutual exclusion, Gemini auto-hide, context-width inheritance.
- **30+ architecture docs** — comprehensive specs for chat/STT/proactivity pipelines, memory, scenes, vision, etc.

### ⚠️ Upstream changes that affect our code

| Area | What upstream changed | Impact on our code |
|---|---|---|
| `speech.ts` | Added `transformTextForSpeech()` that runs before TTS. Bypasses `chatterbox`. | OmniVoice should ideally be added to the transformer bypass too (like chatterbox) to avoid double-processing. |
| `Stage.vue` | Added `transformTextForSpeech()` call in TTS pipeline. Live2D emotion refactor. | Our OmniVoice block is in a different section (model/voice resolution) — no conflict. |
| `providers.ts` | Added `supportsSSML` and `supportsPitch` flags to 6 providers. | No conflict — we added OmniVoice at the end of the file. |

---

## Known Issues & TODOs

### Post-Merge TODOs
1. **Add OmniVoice to `transformTextForSpeech()` bypass** — upstream's transformer skips `chatterbox`; add `omnivoice` to avoid double-processing.
2. **Pre-existing upstream error** — `apps/stage-web/src/pages/devtools/model-driver-mediapipe.vue:251` — type mismatch in `vrmPoseApplier.applyPoseDirectionsToVrm`. Unrelated to our fork; upstream needs to fix it.
3. **Verify OmniVoice still works** — test TTS generation with both Default Voice and Jen Frankie after merge.

### Things That May Be Broken (unclear if needed)
- `apps/stage-tamagotchi/electron.vite.config.1775501041216.mjs` — a generated timestamped config file that was committed. Should probably be cleaned up / gitignored.
- Various `.env` files committed to `apps/server/`, `packages/stage-ui/`, `services/*/` — should be in `.gitignore`.
- `tmp_server_runtime.ts` — temp file at repo root.

---

## Merge / Sync Strategy (for future upstream pulls)

When dasilva333 pushes new commits to his fork, here's the process:

### Step 1: Fetch and check
```bash
git fetch upstream
git log --oneline HEAD..upstream/main   # see what's new
```

### Step 2: Merge (not rebase — safer for conflict resolution)
```bash
git branch backup/pre-merge-$(date +%Y%m%d)   # safety net
git merge upstream/main --no-edit
```

### Step 3: Resolve conflicts
Expected conflict areas (based on prior merge):
- `pnpm-lock.yaml` — accept upstream
- `AGENTS.md` — manual merge, keep our structure + their additions
- `packages/stage-ui/src/stores/modules/speech.ts` — check our bypass list addition wasn't lost
- `packages/i18n/src/locales/*/settings.yaml` — YAML branch merge (usually auto-resolves)

### Step 4: Verify
```bash
pnpm typecheck
pnpm lint:fix
```

### Step 5: Push
```bash
git push origin main
```

---

## Project Architecture (Inherited from Upstream)

> For full details, see `AGENTS.md` in the repo root. This is a quick reference.

### Monorepo Structure
```
apps/
  stage-tamagotchi/   — Electron desktop app (main focus for this fork)
  stage-web/          — Web / PWA
  stage-pocket/       — Mobile (Capacitor)
  server/             — Backend server
packages/
  stage-ui/           — Core business components, composables, Pinia stores
  stage-ui-three/     — Three.js + VRM rendering
  stage-ui-live2d/    — Live2D support
  stage-pages/        — Shared settings pages (including our omnivoice.vue)
  pipelines-audio/    — Audio processing (including our tts-chunker.ts)
  i18n/               — Translations
  ... (30+ more)
servers/
  omnivoice/          — OUR OmniVoice inference server (PyTorch)
services/
  discord-bot/        — Discord integration
  minecraft/          — Minecraft integration
  telegram-bot/       — Telegram integration
  satori-bot/         — Satori integration
```

### Key Tech
- **Frontend**: Vue 3, TypeScript, Vite, Pinia, VueUse, UnoCSS
- **Desktop**: Electron 40, electron-vite
- **3D**: Three.js + @pixiv/three-vrm, Live2D via Pixi
- **IPC**: @moeru/eventa
- **DI**: injeca
- **Validation**: Valibot
- **Testing**: Vitest
- **Build**: Turbo + pnpm workspace filters

### Commands (quick reference)
```bash
pnpm dev:tamagotchi   # Electron desktop dev
pnpm dev:web          # Web dev
pnpm typecheck        # Full typecheck
pnpm test:run         # All tests
pnpm lint:fix         # Lint + auto-fix
pnpm build:tamagotchi # Build Electron app
pnpm build:packages   # Build all packages (must run before app builds)
```

---

## Fork-Specific Notes for Agents

### When working on speech/TTS code
- Our OmniVoice provider lives at `packages/stage-ui/src/libs/providers/providers/omnivoice/index.ts`
- The settings page is at `packages/stage-pages/src/pages/settings/providers/speech/omnivoice.vue`
- The speech bridge composable is `apps/stage-tamagotchi/src/renderer/composables/use-chat-speech-bridge.ts`
- The TTS chunker is `packages/pipelines-audio/src/processors/tts-chunker.ts`
- The inference server is `servers/omnivoice/server.py`

### When syncing from upstream
1. Always create a backup branch before merging
2. Use `git merge`, not `git rebase` — preserves both histories
3. After merge, run `pnpm typecheck` and `pnpm lint:fix`
4. Verify our OmniVoice additions survived the merge
5. Update this file if new custom files are added

### Provider system rules
- New providers go in `packages/stage-ui/src/stores/providers.ts` (providerDefinitions)
- Settings pages go in `packages/stage-pages/src/pages/settings/providers/speech/<id>.vue`
- i18n keys go in `packages/i18n/src/locales/*/settings.yaml` under `settings.pages.providers.provider.<id>`
- Providers with built-in defaults (built-in voices/models) should be added to the validation bypass in `speech.ts`

### File naming convention
- This file: `QWEN.md` → `AIRI-ETERNAL-CONTEXT.md` (renamed for clarity)
- Sync reports: `sync-report-YYYY-MM-DD_HH-MM.md`
- Session transcripts: `session-<session-id>-where.md`
