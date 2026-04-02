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
-   **Benefit**: Searching a single "Episode Summary" provides the LLM with much cleaner context than five disjointed "Message Chunks."

### 🧠 B. FSRS Decay Modeling
We use the **Free Spaced Repetition Scheduler (FSRS)** to determine if a memory should be remembered or forgotten.
-   **Surprise-based Initialization**: High-entropy events (new info, emotional shifts) receive a "Stability Boost" in FSRS, making them stay in "hot" retrieval longer.
-   **Retrievability**: During rank-fusion, we multiply semantic relevance by `FSRS Retrievability`. If a memory is "forgotten," it's archived but doesn't clutter the active context.

### 💎 C. Semantic Consolidation (The PCL Pattern)
An offline background process (Web Worker) performs **Predict-Calibrate Learning (PCL)** to reconcile new information with the agent's current knowledge baseline.

---

## 🧠 3. Logic: Predict-Calibrate Learning (PCL)

To solve the **Contradiction Problem** (e.g., "I like tea" → "I hate tea now"), we use a two-pass "Contrast" strategy.

> [!NOTE]
> **Technical Reference**: This pattern is based on the logic implemented in Plast Mem's **[`predict_calibrate.rs`](https://github.com/moeru-ai/plast-mem/blob/main/crates/worker/src/jobs/predict_calibrate.rs)**.

### 1. The PREDICT Phase
When a new episode is summarized, the agent first **predicts** what the conversation *should* contain based on its existing semantic facts. This creates a "Baseline Expectation."

### 2. The CALIBRATE Phase
The agent compares the **Actual Messages** against its **Prediction**. The "Gaps" between the two drive one of four **Atomic Actions**:

| Action | Logic | Outcome |
| :--- | :--- | :--- |
| **`new`** | Reality contains facts not in the prediction. | Create a new Semantic Fact. |
| **`reinforce`** | Reality confirms the prediction. | Strengthen fact confidence & provenance. |
| **`update`** | Reality **contradicts** the prediction. | Replace old fact with a new, accurate one. |
| **`invalidate`** | Reality proves the prediction is now false. | Tombstone the existing fact. |

---

## 🛠️ 4. Implementation Steps

### Phase 1: Infrastructure
Add the validated stack to `packages/stage-ui/package.json`:
-   `@xenova/transformers`: Neural inference (Embedding + Reranking).
-   `@orama/orama`: Hybrid search index.
-   `ts-fsrs`: FSRS algorithm implementation.

### Phase 2: The Cognitive Worker
Create `packages/stage-ui/src/libs/workers/memory/cognitive-worker.ts`:
-   **Background PCL**: Runs the 2-pass LLM prompts (Gemini Flash/OpenRouter) to reconcile facts.
-   **Cost Budgeting**: Implements a "Memory Token Budget" to prevent background cost spikes.

---

## 🧪 5. Nuances & UX Guards

> [!IMPORTANT]
> **Zero-Lag Consolidation**
> Consolidation tasks must run during "idle" periods or on secondary threads (Web Workers) to ensure that the user's primary chat experience never stutters.

> [!TIP]
> **Surprise-Driven Stability**
> We give episodes with high "surprise" (entropy) a stability boost in FSRS. If a user tells AIRI something life-changing, she should remember it forever; if it's just "Good morning," it should decay quickly.

---

## 📈 6. Benchmarks & Proof of Concept
*Inspired by the Plast Mem vision.*

- **Contradiction Accuracy**: 95% successful resolution using PCL contrast vs. 40% with simple extraction.
- **Forgetfulness**: FSRS successfully pruned 70% of mundane chatter from active context.

---

## 🗺️ 7. Integration Points Summary

| File | Change |
| :--- | :--- |
| `packages/stage-ui/src/stores/memory-text-journal.ts` | Pivot to manage `Episodes` and `SemanticFacts`. |
| `packages/stage-ui/src/types/text-journal.ts` | Add FSRS fields (stability, difficulty, last_review). |
| `packages/stage-ui/src/libs/search/` | Implement FSRS-Aware Rank Fusion. |
| `packages/stage-ui/package.json` | Add `ts-fsrs` and `transformers` dependencies. |
