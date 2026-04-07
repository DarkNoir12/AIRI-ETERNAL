# Implementation Plan: Onboarding Character Selection (High Fidelity)

We are elevating the "Character Selection" step into a premium visual experience. Each trope will be presented with its **Built-in Thumbnail**, **Name**, and **Brief Bio** to create a compelling "Choose Your Starter" moment.

## User Review Required

> [!IMPORTANT]
> **This is the final draft of the Character Selection Step.**
> - **Visuals**: We will use the `previewImage` from the `display-models` store (AvatarSample_A/B and Hiyori) to show their faces in the onboarding.
> - **Scientist Pivot**: "Dr. Aris" is officially renamed to **Dr. Aria** (Female Scientist archetype).
> - **Janny Promotion**: **JannyAI (https://jannyai.com/)** is prioritized as the cleanest landing page for discovery.

## 1. Character Grid (The "Starter Souls")

| Character | Role | Model Assignment | Bio Snippet |
| :--- | :--- | :--- | :--- |
| **ReLU** | The Companion | `Hiyori (Pro)` | "A soulful connection that evolves alongside your data and heart." |
| **Dr. Aria** | The Scientist | `AvatarSample_A` | "A brilliant, sharp-witted guide managing the AIRI research layer." |
| **Lupin** | The Guardian | `AvatarSample_B` | "A loyal wolf-girl with fierce instincts and a protective heart." |
| **Custom** | Import | *Dynamic* | "Import your own soul from .json or .png character cards." |

---

## 2. Proposed Changes

### [Component] Step Character Selection
#### [NEW] [step-character-selection.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-character-selection.vue)
- Create a reactive grid using `UnoCSS`.
- Fetch `previewImage` URLs from `useDisplayModelsStore`.
- Implement a hover-zoom effect for character portraits.
- Add the discovery footer promoting **JannyAI** (https://jannyai.com/), Chub.ai, and CharacterHub.

### [Component] Onboarding Orchestrator
#### [MODIFY] [onboarding.vue](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/components/scenarios/dialogs/onboarding/onboarding.vue)
- Insert the `StepCharacterSelection` component as Step 5 (after Model Selection).
- Implement the "Finalization" logic: When the user finish the onboarding, call `cardStore.seedDefaults()` to ensure all 3 starters are added to their permanent library.

### [Store] AIRI Card Store
#### [MODIFY] [airi-card.ts](file:///c:/Users/h4rdc/Documents/Github/airi-rebase-scratch/packages/stage-ui/src/stores/modules/airi-card.ts)
- Add the `seedDefaults()` method.
- This method will verify if ReLU, Aria, and Lupin exist; if not, it will create them using the **Gold Standard** proactive prompts and correct `displayModelId` links.

---

## 3. Visual Strategy
- **Portraits**: Large circular or rounded-square avatars.
- **Glassmorphism**: Cards will use `backdrop-blur` and a slight white border for a premium feel.
- **Micro-Animations**: Transitions between cards and model selection will be a smooth horizontal slide.

## Open Questions

1. **JanitorAI Note**: You mentioned JanitorAI doesn't allow SillyTavern exports easily—I'll remove it from the "Cleanest Experience" recommendation in the text if you prefer, leaving only JannyAI as the "best" one.
2. **First Greeting**: I will use the first greeting from the `greetings` array as the "Sub-text" under the bio in the card. Does that sound good?

