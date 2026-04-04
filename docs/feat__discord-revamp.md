# Feat: Discord Revamp

## Vision & Goals
Transitioning the Discord integration from a disconnected "second process" bot into a unified service running directly within the main AIRI architecture.

### Core Principles
- **Unified Context**: Interactions flow through the same Episode/Memory logic as the Desktop app (no isolated session IDs).
- **Single Process**: Logic is bundled into AIRI's Tamagotchi services (no separate bot process required).
- **Live Mode**: A low-latency audio bridge connecting Discord VC directly to the Gemini Live WebSocket.
- **Modern UX**: Native Discord Slash Commands (Proper Plugin Model) instead of hacky text guide triggers.

---

## 1. Planned Slash Commands

| Command | Description | Implementation Status |
| :--- | :--- | :--- |
| `/new` | Equivalent to the trash can icon (Clear Context). | Planned |
| `/summon` | Joins the user's current Voice Channel. | Built-in (to be announced) |
| `/leave` | Leaves the Voice Channel. | Built-in (to be announced) |
| `/context` | Rollup summary of context usage (token metrics). | Planned |
| `/history` | Dumps the last 5 messages from the current conversation. | Planned |
| `/status` | Connection report (Character sync, Provider health). | Planned |
| `/live` | Experimental Gemini Live audio bridging. | Planned |
| `/character` | Switches the active AIRI card/profile directly from Discord. | Planned |
| `/emotion` | Manually triggers character expressions/animations on the desktop avatar. | Planned |

---

## 2. Technical Pathing

### Character Identity & Sync
The Discord service will mirror the **Active Character** on the screen.
- `/status` will report the current AI profile.
- All outbound messages will be prefixed with the Character's name (e.g., `Lain: {content}`) for multi-user clarity.

### Artistry & Inline Media
- **Inline Artistry**: Generated images (widgets/backgrounds) from the Artistry pipeline will be returned as native Discord attachments for a seamless experience.

### Context Integration
Discord interactions will feed into the central **Prompt Builder**.
- All users in a channel share a single "Episode" unless otherwise configured.
- Memory sync ensures Discord logs appear in the central system audit history.
- **Proactive Messaging**: Implementation of heuristics to route heartbeats/proactive turns to the last active channel used by the user.

### Live Mode Bridge
Instead of a standard `Text -> STT -> LLM -> TTS -> Text` loop:
1. Discord raw audio receiver.
2. Direct pipe to the **Gemini Live API WebSocket**.
3. Raw audio return from API.
4. Direct pipe to Discord VC audio sender.
5. **No text is involved in this cycle.**
6. **Interruption & Barge-in**: Researching technical feasibility for natural, overlapping dialogue in the Discord VC context.

---

## 3. Implementation Roadmap

### Phase 1: Service Migration (No 2nd Process)
The logic will be moved from `services/discord-bot` into a native Electron service. This removes the need for a separate process and WebSocket bridge.
- **Service Root**: `apps/stage-tamagotchi/src/main/services/airi/discord/`
- **Entry Point**: `apps/stage-tamagotchi/src/main/services/airi/discord/index.ts`
- **DI Registration**: Injected into `Injeca` via `apps/stage-tamagotchi/src/main/index.ts`.

### Phase 2: Native Slash Command "Plugin"
Instead of parsing raw text guide triggers, we use a structured command registration.
- **Registry**: `apps/stage-tamagotchi/src/main/services/airi/discord/registry.ts`
- **Command Handlers**: Ported and cleaned up from `services/discord-bot/src/bots/discord/commands/`.

### Phase 3: Character & Context Unification
Synchronizing the bot with the Desktop renderer state.
- **State Sync**: Uses `@moeru/eventa` to track the active character profile.
- **Prefix Logic**: Automatically prefixes messages with the character's name (e.g. `Lain: {text}`).
- **Context Routing**: Discord messages are sent via IPC to the Renderer's `ChatStore`, ensuring they pass through the same **Prompt Builder** and **Memory layers**.

### Phase 4: Gemini Live Audio Bridge (Experimental)
The "Holy Grail" of voice interaction on Discord.
- **Pipe**: Connects the Discord `VoiceConnection` (Opus stream) directly to the `GeminiLiveService` WebSocket.
- **Effect**: Real-time, full-duplex audio without text serialization.

---

## 4. Key Files for Adjustment

### [Main Process (Tamagotchi)]
- **[NEW]** `apps/stage-tamagotchi/src/main/services/airi/discord/service.ts`
- **[NEW]** `apps/stage-tamagotchi/src/main/services/airi/discord/commands/*.ts`
- **[MODIFY]** `apps/stage-tamagotchi/src/main/index.ts` (Service injection)
- **[MODIFY]** `apps/stage-tamagotchi/src/shared/eventa.ts` (IPC contracts)

### [Renderer Process (Stage UI)]
- **[MODIFY]** `packages/stage-ui/src/stores/modules/discord.ts` (UI state management)
- **[MODIFY]** `packages/stage-pages/src/pages/settings/modules/messaging-discord.vue` (Unified toggle)

### [Project Cleanup]
- **[DELETE]** `services/discord-bot/` (Deprecated legacy process)
- **[MODIFY]** `package.json` (Adding `@discordjs/voice`, `libsodium-wrappers`, and `@discordjs/opus` to core dependencies)
