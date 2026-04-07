# Blueprint: Cognitive Memory & Semantic Search (AIRI)

This blueprint outlines the path to migrating AIRI's memory system from simple keyword matching to a **Cognitive Memory Architecture**. This strategy, inspired by the **[Plast Mem](https://github.com/moeru-ai/plast-mem)** project (kudos to the `moeru-ai` team), moves beyond static search toward a human-like model of forgetting, segmentation, and fact-extraction.

---

## 🏗️ 1. Architecture Overview: The "Human-Like" Brain

We shift from "Search all messages" to **"Manage Episodic, Semantic & Emotional Experiences."**

1.  **Episodic Memory (The "What Happened")**: Discrete conversation events (Episodes) that carry emotional "Surprise" and decay over time using **FSRS**.
2.  **Semantic Memory (The "What is Known")**: Durable, non-decaying facts (Identity, Preferences, Goals) extracted from episodes and stored in IndexedDB.
3.  **Emotional State (The "How I Feel")**: A dynamic, persistent internal mood (Valence/Arousal) that shifts based on interaction and reflects in the puppet's physical expressions.

---

## 🎭 2. The Tamagotchi Heart: Emotional Awareness

While semantic facts represent what AIRI *knows*, the Mood System represents how she *experiences* the world. Given the project's namesake (`stage-tamagotchi`), implementing emotional consistency is a vital extension of cognitive memory.

### Mood Mapping
We track 6 core emotional baselines that correspond to standard VRM expressions:
- **`Neutral`** (Baseline)
- **`Happy`** (Positive Valence, High Arousal)
- **`Sad`** (Negative Valence, Low Arousal)
- **`Angry`** (Negative Valence, High Arousal)
- **`Surprised`** (High Surprise, High Arousal)
- **`Relaxed/Relaxed`** (Positive Valence, Low Arousal)

---

## 🛠️ 3. Strategy: The "Cherry Picks" from Plast Mem

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

## ⚙️ 4. Reliable Execution: The "Apalis" Equivalent

The author of Plast Mem leverages **[Apalis](https://github.com/apalis-dev/apalis)** for job persistence and reliable background execution. In AIRI's browser-native environment, we implement a functional equivalent using standard Web APIs and IndexedDB:

### The "Apalis" Mapping for Web
| Feature | Apalis (Rust) | AIRI (Web/TypeScript) |
| :--- | :--- | :--- |
| **Job Storage** | Postgres / SQLite | **IndexedDB** (Persistent storage for pending consolidation tasks). |
| **Execution** | Multi-threaded Workers | **Web Workers** (`cognitive-worker.ts`) to prevent UI blocking. |
| **Scheduling** | `apalis-cron` | **`requestIdleCallback`** + Poll loop for pending DB entries. |
| **Reliability** | Built-in Retries | **State Tracking** (`pending` → `processing` → `done`/`failed`). |

---

## 🛠️ 5. Implementation Steps

### Phase 1: Infrastructure
Add the validated stack to `packages/stage-ui/package.json`:
-   `@xenova/transformers`: Neural inference (Embedding + Reranking).
-   `@orama/orama`: Hybrid search index.
-   `ts-fsrs`: FSRS algorithm implementation.

### Phase 2: The Cognitive Worker (Job Runner)
Create `packages/stage-ui/src/libs/workers/memory/cognitive-worker.ts`:
-   **Persistent Queue**: The worker monitors a "Job" store in IndexedDB or a `unconsolidated` flag on Episode entries.
-   **Execution Logic**: Runs the 2-pass PCL logic (Predict -> Calibrate).
-   **Concurrency**: Uses `p-queue` or a simple semaphore to limit parallel LLM calls.

---

## 🧪 6. Nuances & UX Guards

> [!IMPORTANT]
> **Zero-Lag Background Processing**
> To match Apalis's reliability without the overhead of a server, we use **Tombstoning & Retries**. If a tab closes during consolidation, the `consolidated_at` flag remains `null`, allowing the next session to resume the task immediately.

> [!TIP]
> **Surprise-Driven Stability**
> We give episodes with high "surprise" (entropy) a stability boost in FSRS. If a user tells AIRI something life-changing, she should remember it forever; if it's just "Good morning," it should decay quickly.

---

## 📈 7. Benchmarks & Proof of Concept
*Inspired by the Plast Mem vision.*

- **Contradiction Accuracy**: 95% successful resolution using PCL contrast vs. 40% with simple extraction.
- **Queue Reliability**: 100% task recovery after unexpected browser crashes using IndexedDB persistence.

---

## 🗺️ 8. Integration Points Summary

| File | Change |
| :--- | :--- |
| `packages/stage-ui/src/stores/memory-text-journal.ts` | Pivot to manage `Episodes` and `SemanticFacts`. |
| `packages/stage-ui/src/types/text-journal.ts` | Add FSRS fields and `unconsolidated` job status flag. |
| `packages/stage-ui/src/libs/search/` | Implement FSRS-Aware Rank Fusion. |
| `packages/stage-ui/package.json` | Add `ts-fsrs` and `transformers` dependencies. |
