The user wants me to create a comprehensive markdown summary of the entire conversation history. Let me extract the key information:

**Overall Goal:**
- The user has forked `dasilva333/airi` to `DarkNoir12/AIRI-ETERNAL`
- Main focus: extending AIRI's speech/TTS capabilities (OmniVoice, Fish Speech) and making VRM model expressions work properly
- Sync fork with upstream while preserving custom additions

**Key Knowledge:**
1. Fork lineage: moeru-ai/airi → dasilva333/airi → DarkNoir12/AIRI-ETERNAL
2. Git remotes: `origin` (fork), `upstream` (dasilva333/airi)
3. VRM model from VRoid Studio exports blendshapes like `Fcl_ALL_Neutral`, `Fcl_ALL_Angry`, etc., which `@pixiv/three-vrm` v3.5.1 normalizes to standard VRM 1.0 preset names (`happy`, `angry`, `sad`, `surprised`, `relaxed`, `aa`, `ih`, `ou`, `ee`, `oh`, `blink`, etc.)
4. ACT token format: `<|ACT:{"emotion":{"name":"happy","intensity":1},"motion":"agent007"}|>`
5. The `aa/ih/ou/ee/oh` expressions are driven by lip sync, so manual clicking in UI doesn't work (expected behavior)
6. `@lemonneko/crop-empty-pixels` package is missing (upstream issue)
7. 8 pre-existing test failures from upstream (Windows path issues, categoriser bugs, plugin path resolution)
8. `koffi` module not found for Win32 sensors
9. OmniVoice server at `servers/omnivoice/`
10. Free-tier models on OpenRouter get rate-limited (429 errors)


11. Groq doesn't support OpenRouter `:free` models—each provider has its own model catalog, and when switching providers, the active model needs to be reset to avoid compatibility issues.

**Recent Actions:**
1. Created `AIRI-ETERNAL-CONTEXT.md` as the fork's context file
2. Cleaned up stray files (upstream_providers.ts, sync-report, temp files)
3. Fixed cross-provider model leak (consciousness store wasn't clearing the model on provider switches)
4. Eliminated duplicate speech processing in chat.vue
5. Fixed tool schema validation for Groq/strict providers by making all parameters required
6. Added rate-limit retry with exponential backoff
7. Detected system/developer message 400 errors and automatically merged system messages into the first user message
8. Injected VRM expressions dynamically into the LLM ACT prompt based on what's available
9. Updated ACT token parsing to handle dynamic JSON keys where the emotion name is the key
10. Bypassed the speech pipeline queue for ACT emotions and dispatched them directly to the VRM instead
11. Reduced blend time from 0.3s to 0.05s for near-instant expression changes
12. Separated emotions from motions in parseActEmotion
13. Fixed character card expressions (removed "neutral", corrected "Surprised" to lowercase)

**Current Status:**
The expression pipeline is operational but still experiencing timing issues where some expressions lag or mismatch with the chat output. I need to test with a specific prompt and potentially remove any duplicate dispatches from the speech queue. The remaining work includes updating the OmniVoice bypass for text transformation, verifying OmniVoice TTS functionality, adding num_ctx error patterns, cleaning up stale electron.vite.config files, and investigating the Koffi sensor issue.# Project Summary

## Overall Goal
Maintain and extend the **AIRI-ETERNAL** fork (`DarkNoir12/AIRI-ETERNAL`) of `dasilva333/airi` with custom speech/TTS providers (OmniVoice, Fish Speech) and ensure VRM 1.0 model expressions from VRoid Studio are properly driven by LLM ACT tokens in sync with TTS voice.

## Key Knowledge

### Fork Architecture
- **Lineage**: `moeru-ai/airi` → `dasilva333/airi` → `DarkNoir12/AIRI-ETERNAL`
- **Git remotes**: `origin` = our fork, `upstream` = `dasilva333/airi`
- **Sync strategy**: Always `git merge upstream/main` (never rebase), create backup branch before merging
- **Stack**: Vue 3, TypeScript, Vite, Electron, Pinia, `@pixiv/three-vrm` v3.5.1, xsai for LLM

### VRM Expression System
- VRoid Studio exports blendshapes like `Fcl_ALL_Neutral`, `Fcl_ALL_Joy`, `Fcl_MTH_A` → `@pixiv/three-vrm` v3.5.1 normalizes to VRM 1.0 preset names: `happy`, `angry`, `sad`, `surprised`, `relaxed`, `aa`, `ih`, `ou`, `ee`, `oh`, `blink`, `blinkLeft`, `blinkRight`
- `aa/ih/ou/ee/oh` are **visemes driven by lip sync** — manual clicking in UI doesn't work (lip sync overrides every frame). They DO work automatically during TTS.
- **ACT token format**: `<|ACT:{"emotion":{"name":"happy","intensity":1},"motion":"agent007"}|>`
- Expressions dispatched via `vrmViewerRef.value.setExpression(value, intensity, 2000)` → `useVRMEmote.setEmotionWithResetAfter()` → frame loop blends over **0.05s**

### ACT Token Pipeline (Current Flow)
1. LLM outputs `<|ACT:...|>` token in streaming response
2. `parseActEmotion()` parses token → returns `{ emotions, motions }` separately
3. **Emotions dispatched directly** to VRM (bypasses speech queue)
4. **Motions** go through VRMA animation system
5. ACT token also forwarded to speech pipeline for TTS delivery tags

### Provider/Model Behavior
- **Free-tier OpenRouter models** (`:free`) get rate-limited (429) — retry with backoff (1.5s → 3s → 6s, max 3 attempts)
- **Groq does NOT have OpenRouter models** — each provider has its own model list
- When switching providers, `consciousness.ts` resets `activeModel` to prevent sending wrong model to wrong provider
- `num_ctx` only sent to Ollama (`localhost:11434`), not to other providers
- System/developer message errors (e.g., `gemma-3-12b-it`) auto-detected → system messages merged into first user message

### Custom Additions in This Fork
| Path | Purpose |
|---|---|
| `servers/omnivoice/` | OmniVoice TTS inference server (PyTorch) |
| `packages/stage-ui/src/libs/providers/providers/omnivoice/` | OmniVoice provider definition |
| `packages/stage-ui/src/libs/providers/providers/fish-speech/` | Fish Speech provider definition |
| `apps/stage-tamagotchi/src/renderer/composables/use-chat-speech-bridge.ts` | Chat-to-speech bridge composable |
| `packages/pipelines-audio/src/processors/tts-chunker.ts` | TTS text chunker |
| `packages/stage-ui/src/composables/llm-json-interceptor.ts` | LLM JSON response interceptor |

### Known Pre-existing Upstream Issues (NOT our bugs)
1. **8 test failures**: Windows path separators (3), reasoning categoriser bugs (4), plugin path resolution (1)
2. **4 empty test suites**: `stage-ui-live2d` .vue files can't be parsed by vitest, missing `@lemonneko/crop-empty-pixels`
3. **`stage-web` typecheck error**: `@pixiv/three-vrm` version mismatch (`3.5.0` vs `3.5.1`) at `model-driver-mediapipe.vue:251`
4. **`koffi` not found**: Win32 sensors unavailable — `Cannot find module 'koffi'`
5. **30 lint warnings**: unused vars, control char regexes, empty stub files — all cosmetic

### Commands
```bash
pnpm dev:tamagotchi   # Electron desktop dev
pnpm typecheck        # Full typecheck (stage-web error is upstream, ignore)
pnpm test:run         # All tests (8 pre-existing failures, ignore)
pnpm lint:fix         # Lint + auto-fix
```

## Recent Actions

### Completed
1. [DONE] Created `AIRI-ETERNAL-CONTEXT.md` as fork-specific context file (replaced `QWEN.md`)
2. [DONE] Cleaned up stray files: `upstream_providers.ts`, `sync-report-2026-04-07_10-32.md`, `tmp_server_runtime.ts`, timestamped config files
3. [DONE] Fixed cross-provider model leak — `consciousness.ts` now resets model when provider changes
4. [DONE] Eliminated double-speech bug — removed duplicate `useChatSpeechBridge()` from `chat.vue`; single speech owner is main window's `Stage.vue`
5. [DONE] Fixed tool schema 400 on Groq/strict providers — made all `text_journal` and `image_journal` tool params required
6. [DONE] Added rate-limit retry with exponential backoff and user-friendly error messages
7. [DONE] Added system/developer message 400 auto-detection — merges system messages into first user message
8. [DONE] Dynamic expression injection — `buildSystemPrompt()` reads `useModelStore().availableExpressions` and injects actual VRM expressions into LLM prompt reactively
9. [DONE] Fixed ACT token parser — handles dynamic JSON key format (`{"happy":{...},"motion":"..."}`) where emotion name IS the JSON key
10. [DONE] Separated emotions from motions in `parseActEmotion()` — returns `{ emotions, motions }` separately
11. [DONE] Bypassed speech pipeline queue for expressions — emotions dispatch directly to VRM, eliminating 2-4 second delay
12. [DONE] Reduced expression blend time from 0.3s to 0.05s for near-instant sync
13. [DONE] Fixed character card `eternal-ai.json` — removed `neutral` (not a VRM expression), fixed `Surprised` → `surprised`, separated expressions from animations in prompt

### Discovered
- `parseActEmotion()` is exported and used by `Stage.vue` for direct emotion dispatch
- `useVRMEmote.setEmotion()` auto-registers unknown expressions with case-insensitive matching
- The speech pipeline's `specialTokenQueue` was the bottleneck — expressions went through full TTS → playback → dispatch pipeline

## Current Plan

### [IN PROGRESS] Expression Timing Chaos
Expressions are working but some fire late or mismatch the voice. Root cause analysis:
- Multiple ACT tokens stream rapidly and override each other's 2000ms reset timer
- The speech pipeline may still be duplicating emotion dispatch via `intent.writeSpecial(special)`

### Next Steps
1. [TODO] Test with controlled prompt: *"Cycle through happy, angry, surprised, sad, relaxed with 3-second pauses between each ACT token"*
2. [TODO] If chaos persists: remove `intent.writeSpecial(special)` for ACT tokens to eliminate duplicate dispatch from speech queue
3. [TODO] Add expression debounce/throttle to prevent rapid-fire ACT tokens from canceling each other
4. [TODO] Verify VRMA animations (motions) work separately from facial expressions

### Future Work
5. [TODO] Add OmniVoice to `transformTextForSpeech()` bypass in `speech.ts` (like chatterbox)
6. [TODO] Verify OmniVoice TTS works with both Default Voice and Jen Frankie after all fixes
7. [TODO] Consider adding `num_ctx` to error patterns for providers that reject it unexpectedly
8. [TODO] Clean up remaining stale `electron.vite.config.*.mjs` files

---

## Summary Metadata
**Update time**: 2026-04-07T23:37:25.160Z
