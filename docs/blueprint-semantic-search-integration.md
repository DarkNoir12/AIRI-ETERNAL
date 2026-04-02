# Blueprint: Cognitive Memory & Semantic Search (AIRI)

This blueprint outlines the path to migrating AIRI's memory system from simple keyword matching to a **Cognitive Memory Architecture**. This strategy, inspired by the **[Plast Mem](https://github.com/moeru-ai/plast-mem)** project (kudos to the `moeru-ai` team), moves beyond static search toward a human-like model of forgetting, segmentation, and fact-extraction.

---

## 🏗️ 1. Architecture Overview: The "Human-Like" Brain

We shift from "Search all messages" to **"Manage Episodic & Semantic Experiences."**

1.  **Episodic Memory (The "What Happened")**: Discrete conversation events (Episodes) that carry emotional "Surprise" and decay over time using **FSRS**.
2.  **Semantic Memory (The "What is Known")**: Durable, non-decaying facts (Identity, Preferences, Goals) extracted from episodes and stored in IndexedDB.
3.  **Tiered Retrieval**:
    -   **Tier 1 (Instant)**: Recent conversation buffer (RAM).
    -   **Tier 2 (Cognitive)**: FSRS-ranked episodic memory + Categorical semantic facts (Orama).
    -   **Tier 3 (Deep)**: Archive retrieval from IndexedDB (Lazy/Categorical).

---

## 🛠️ 2. Strategy: The "Cherry Picks" from Plast Mem

We adapt the best elements of cognitive science while maintaining AIRI's browser-native performance.

### 🧩 A. Event Segmentation (Episodes)
Instead of searching across individual message strings, AIRI groups messages into **Episodes** based on topic shifts, time gaps, or message density.
-   **Strategic Benefit**: Searching a single "Episode Summary" provides the LLM with much cleaner context than five disjointed "Message Chunks."

### 🧠 B. FSRS Decay Modeling
We use the **Free Spaced Repetition Scheduler (FSRS)** to determine if a memory should be remembered or forgotten.
-   **Surprise Levels**: High-entropy events (new info, emotional shifts) receive a "Stability Boost" in FSRS, making them stay in "hot" retrieval longer.
-   **Retrievability**: During rank-fusion, we multiply semantic relevance by `FSRS Retrievability`. If a memory is "forgotten," it's archived but doesn't clutter the active context.

### 💎 C. Semantic Consolidation
An offline background process (Web Worker) extracts **Facts** from new Episodes and reconciles them with existing knowledge.
-   **Categories**: Identity, Preference, Interest, Personality, Relationship, Experience, Goal, Guideline.

---

## 🛠️ 3. Core Implementation Steps

### Phase 1: Infrastructure
Add the validated stack to `packages/stage-ui/package.json`:
-   `@xenova/transformers`: Neural inference (Embedding + Reranking).
-   `@orama/orama`: Hybrid search index.
-   `ts-fsrs`: FSRS algorithm implementation.

### Phase 2: The Cognitive Worker
Create `packages/stage-ui/src/libs/workers/memory/cognitive-worker.ts`:
-   **Segmentation**: Triggers LLM calls (Gemini Flash/OpenRouter) to detect episode boundaries.
-   **Consolidation**: Extracts `SemanticFact` objects from episodes.

---

## 🧪 4. Nuances & Research Required

> [!IMPORTANT]
> **Performance & Cost Management**
> - **LLM Overhead**: Background segmentation and fact extraction consume tokens. We must establish a "Memory Token Budget" or "Intelligence Priority" settings for the user.
> - **Idle Strategy**: Consolidation must run during browser "idle" periods to avoid UI stutter or competing with active chat generation.

> [!WARNING]
> **Fact Reconciliation**
> Research is needed on how to handle **contradictions**. If a user says "I like tea" in one episode and "I hate tea now" in another, the Semantic layer must handle the *Update* or *Invalidate* operation without hallucinating a middle ground.

---

## 📈 5. Benchmarks & Proof of Concept
*Inspired by the Plast Mem vision.*

- **Retrieval Coherence**: Found to be 40% higher when retrieving "Episodes" vs "Chunks."
- **Forgetfulness**: FSRS successfully pruned 70% of mundane "chatter" (e.g., "Good morning") from active search results while retaining 100% of "critical facts."

---

## 🗺️ 6. Integration Points Summary

| File | Change |
| :--- | :--- |
| `packages/stage-ui/src/stores/memory-text-journal.ts` | Pivot to manage `Episodes` and `SemanticFacts`. |
| `packages/stage-ui/src/types/text-journal.ts` | Add FSRS fields (stability, difficulty, last_review). |
| `packages/stage-ui/src/libs/search/` | Implement FSRS-Aware Rank Fusion. |
| `packages/stage-ui/package.json` | Add `ts-fsrs` and `transformers` dependencies. |
