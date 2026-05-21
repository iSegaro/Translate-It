# Subtitle Translation System Documentation

## Overview

The Subtitle Translation system is a standalone, robust, and extensible tool designed to translate subtitle files (such as `.srt`) into different target languages while fully preserving subtitle formats, timestamps, and style tags. 

It implements a progressive batching translation model designed to handle large subtitle files seamlessly. It leverages the extension's unified provider translation infrastructure but remains entirely decoupled from other translation flows (like whole page or element selection) to ensure clean separation of concerns and optimal performance.

---

## Architecture

```text
       UI Context (Popup/Tab)            │             Background Context
┌──────────────────────────────────────┐ │ ┌──────────────────────────────────────────────┐
│           SubtitleApp.vue            │ │ │        SubtitleTranslationCoordinator        │
│       (Theme Sync & Dropzone)        │ │ │           (Central Background Owner)         │
└──────────────────┬───────────────────┘ │ └──────────────────────┬───────────────────────┘
                   │                     │                        │
        useSubtitleTranslation.js        │       0. Reset Provider├─→ UnifiedTranslationService
        (UI-to-Messaging Bridge)         │                        │   (Clear Circuit Breaker)
                   │                     │       1. Parse         ├─→ SubtitleParserFactory
                   ▼                     │                        │   (Returns SrtAdapter)
         Unified Messaging Bus           │       2. Protect       ├─→ SubtitleTextProtector
      (SUBTITLE_TRANSLATE Msg + ID)      │                        │   (Placeholders for formatting)
                   │                     │       3. Plan Batches  ├─→ SubtitleBatchPlanner
                   │                     │                        │   (Optimized character limit chunks)
                   │                     │       4. Context       ├─→ SubtitleContextBuilder
                   │                     │                        │   (Coherence across dialogues)
                   ├─────────────────────┼──────────────────────→│
                   │                     │  UnifiedModeCoordinator   │
                   │                     │  (_processGenericBatch)   │
                   │                     │           │               │
                   │                     │       5. Translate     ├──┴─→ UnifiedTranslationService
                   │                     │                        │     (Generic translation request)
                   │                     │                        │
                   │                     │       6. Track Progress├─→ SubtitleProgressTracker
                   │                     │                        │   (Dynamic ETA & statistcs)
                   │                     │                        │
                   │                     │       7. Serialize     ├─→ SrtAdapter
                   │                     │                        │   (Creates output file string)
                   │                     │                        │
                   │◄────────────────────┼────────────────────────┘
            Progress Updates             │
    (SUBTITLE_TRANSLATE_PROGRESS Msg)    │
```

---

## Core Components

### 1. [SubtitleApp.vue](file:///home/amir/Works/Translate-It/Extension/src/apps/subtitle/SubtitleApp.vue)
The main entry point for the subtitle translation user interface, designed as a premium, glassmorphic standalone application.

*   **Responsibilities:**
    *   **File Selection**: Hosts the dropzone component for file uploads.
    *   **Live Preview**: Integrates `SubtitleViewer.vue` to show both original preview and live translation updates.
    *   **Configuration**: Allows selecting the source and target languages, along with the translation provider.
    *   **Progress Dashboard**: Renders real-time translation statistics, completion bars, and dynamic ETAs.
    *   **Theme Integration**: Syncs seamlessly with the extension-wide Pinia `settingsStore` theme preferences (`light`, `dark`, or `auto`) and listens for real-time broadcasts.

---

### 2. [useSubtitleTranslation.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/composables/useSubtitleTranslation.js)
A reactive composable bridging the Subtitle UI application with the background service worker using the message bus.

*   **Responsibilities:**
    *   Acts as the single source of truth for the subtitle translation state in the UI context (e.g., status, progress percent, error messages, loaded file name).
    *   Manages unique **Job IDs** to prevent context collisions across multiple tabs.
    *   Dispatches background commands such as `SUBTITLE_TRANSLATE` and `SUBTITLE_TRANSLATE_CANCEL`.
    *   Listens to messaging triggers (`SUBTITLE_TRANSLATE_PROGRESS`, `SUBTITLE_TRANSLATE_COMPLETE`, `SUBTITLE_TRANSLATE_ERROR`) and automatically updates reactive state variables, including live cue updates.

---

### 3. [SubtitleTranslationCoordinator.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/core/SubtitleTranslationCoordinator.js)
The **Background Orchestrator**. It owns the lifecycle of a subtitle translation job from raw string parsing to finalized output serialization.

*   **Key Flow:**
    1.  Receives raw subtitle file content and a unique `jobId` from the message bus.
    2.  Resets provider state (Circuit Breaker) via `UnifiedTranslationService` to ensure a clean start.
    3.  Invokes `SubtitleParserFactory` to obtain a suitable parser adapter and converts the raw string into structured `Cue` objects.
    4.  Runs validations on the subtitle format and limits using `SubtitleValidationService`.
    5.  Extracts and masks style tags (e.g., `<i>`, `<b>`, `<font>`) via `SubtitleTextProtector` to safeguard formatting.
    6.  Resolves target provider batch limits with `SubtitleProviderLimitsResolver` and uses `SubtitleBatchPlanner` to chunk the protected cues into optimal batches.
    7.  Optionally injects conversational dialogue context using `SubtitleContextBuilder`.
    8.  **Unified Delegation**: Hands over the batch processing to `UnifiedModeCoordinator._processGenericBatch`. This ensures standardized error handling, retry logic, and provider state management.
    9.  **Stability Guard**: Each batch is wrapped in a `Promise.race` with a **300,000ms (5-minute)** timeout to prevent background hangs.
    10. **Signal Monitoring**: Listens to `AbortController` signals to immediately halt operations if a user cancels the job.
    11. Monitors results, updates `SubtitleProgressTracker`, and broadcasts progress messages (including translated text) to the UI.
    12. **Fatal Error Rescue**: If a terminal error occurs (e.g., invalid API key), it stops the job but allows the user to download the partial progress.
    13. Re-injects protected tags, serializes the translated cues back into the original format, and reports job completion.

---

## Stability & Resiliency

To ensure the extension remains stable during heavy background operations, the following measures are implemented:

### 1. Timeout Management
All translation batches are subject to a **5-minute hard timeout** (`BATCH_TIMEOUT_MS`). This prevents "Zombie Jobs" from consuming background resources indefinitely if a provider becomes unresponsive or the network hangs.

### 2. Abortable Operations
The system uses the `AbortController` API. When a user clicks "Cancel" in the UI, a signal is propagated through the Coordinator down to the `UnifiedModeCoordinator`, which immediately stops further batch processing and rejects pending promises.

### 3. Progressive Output
Instead of waiting for the entire file to finish, the system streams translated cues back to the UI in real-time. This reduces the risk of data loss; even if the browser crashes, the UI often has a significantly updated state.

---

### 4. [SubtitleValidationService.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/core/SubtitleValidationService.js)
A critical service responsible for ensuring the integrity of translation results before they are committed to the final file.

*   **Responsibilities:**
    *   **Result Alignment**: Verifies that the number of translated strings matches the number of original cues in a batch.
    *   **Token Restoration**: Coordinates with `SubtitleTextProtector` to re-inject formatting tags into the translated text.
    *   **Integrity Checks**: Detects if the translation engine accidentally removed or corrupted structure tokens (e.g., `@@SUB_TAG_0@@`).
    *   **Status Management**: Marks cues as `translated` or `failed` based on validation outcomes.

---

### 5. [SubtitleParserFactory.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/parsers/SubtitleParserFactory.js)
A creational design pattern factory that determines and instantiates the correct parser adapter based on the file name extension.

*   **API & Adapters:**
    *   `getAdapter(filename)`: Inspects file extension (e.g., `.srt`) and returns the appropriate adapter.
    *   [SrtAdapter.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/parsers/SrtAdapter.js): Handles `.srt` parser (`parse`) and string serializer (`serialize`).

---

### 6. [SubtitleTextProtector.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/formatting/SubtitleTextProtector.js)
A specialized protection adapter designed to shield formatting elements from being altered, corrupted, or translated by AI/traditional translation engines.

*   **Protected Elements:**
    *   HTML tags (`<i>`, `<b>`, `<u>`, `<font color="...">`).
    *   Styling braces (`{\an8}`, `{\i1}`).
    *   Internal newlines and system-specific markers.
*   **Mechanics:**
    *   `protect(text)`: Scans the cue text, replaces protected segments with numeric tokens (e.g., `@@SUB_TAG_0@@`), and returns the protected text alongside a restoration dictionary.
    *   `restore(protectedText, tagMap)`: Re-injects the original formatting tags from the map back into the translated text, even if the translation engine added extra spaces or altered the token casing.

---

### 7. [SubtitleBatchPlanner.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/core/SubtitleBatchPlanner.js)
Handles the mathematical chunking of structured cue arrays to guarantee optimal translation volume without exceeding API payloads.

*   **Key Features:**
    *   **Dynamic Planning**: Takes resolved character limits and maximum batch item limits from the limits resolver.
    *   **Deduplication**: Identifies identical cues (e.g., "[Music]", "Yes.") to avoid redundant translation costs and improve speed.
    *   **Safety Splitting**: Ensures that cumulative character lengths (including context envelopes) never exceed provider bounds.

---

### 8. [SubtitleProgressTracker.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/core/SubtitleProgressTracker.js)
A high-accuracy mathematical tracker that manages translation completion metrics.

*   **Metrics Tracked:**
    *   Percentage of cues processed (`percent`).
    *   Total successful cue translations vs. failed failures.
    *   Adaptive **Estimated Time of Arrival (ETA)** using rolling average throughput calculations, preventing erratic ETA jumps.

---

### 9. [SubtitleContextBuilder.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/core/SubtitleContextBuilder.js)
Provides context-aware capabilities to AI providers to improve translation coherence.

*   **AI Sliding Window**: Appends a sliding window of metadata containing immediately preceding cues to help LLMs understand dialogue flow.
*   **DeepL Batch Context**: Implements `buildBatchContext` specifically for DeepL's 1024-character context limit, providing dialogue continuity across batch boundaries.
*   **Formatting**: Provides `formatContextString` to inject context cleanly into system prompts.

---

## Optimization & Quality Strategies

### 1. AI Prompt Templates
The system uses specialized templates defined in `src/features/subtitle-translation/prompts/subtitlePrompt.js`:
*   **System Prompt**: Instructs the AI to act as a subtitle expert, preserve tone, and strictly respect structure tokens.
*   **Batch Instructions**: Directs the AI to return results in a strict JSON format for reliable parsing.

### 2. Progressive Limit Resolution
Different translation services enforce widely different payload limitations. The [SubtitleProviderLimitsResolver](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/core/SubtitleProviderLimitsResolver.js) adaptively scales constraints:
*   **Traditional Engines (Google/Yandex)**: Set to high cue counts but strictly capped total characters.
*   **AI Engines (OpenAI/Gemini)**: Scaled to balance token budgets, context envelopes, and rate limits.

---

## Theme & Sync System

The Subtitle page fully supports light and dark modes, perfectly synced with options and popup.
- **State Inheritance**: Reactive computed property `isDark` mapped to `settingsStore`.
- **Cross-Tab Theme Broadcasts**: Listens for `THEME_CHANGED` messages via `MessagingBus`.
- **System Awareness**: Captures system-level theme shifts using `window.matchMedia`.

---

## Messaging Protocol

### 1. Command Actions (UI to Background)
*   `SUBTITLE_TRANSLATE`: Initiates a translation job.
    *   **Payload**: `{ jobId, content, filename, sourceLanguage, targetLanguage, providerId, options }`
*   `SUBTITLE_TRANSLATE_CANCEL`: Interrupts and terminates the active job.
    *   **Payload**: `{ jobId }`

### 2. Status Signals (Background to UI)
*   `SUBTITLE_TRANSLATE_PROGRESS`: Dispatched sequentially as batches complete.
    *   **Payload**: `{ jobId, progress: { percent, processed, ... }, updatedCues: [{ id, translatedText, status }] }`
*   `SUBTITLE_TRANSLATE_COMPLETE`: Triggered when serialization completes.
    *   **Payload**: `{ jobId, content, stats }`
*   `SUBTITLE_TRANSLATE_ERROR`: Fired upon validation failures or unrecoverable errors.
    *   **Payload**: `{ jobId, error }`

---

## File Structure

```text
src/
├── apps/
│   └── subtitle/
│       ├── SubtitleApp.vue                 # Premium Subtitle UI & Theme Manager
│
└── features/
    └── subtitle-translation/
        ├── components/
        │   ├── SubtitleFileDropzone.vue    # Glassmorphic Drag & Drop panel
        │   ├── SubtitleProgressPanel.vue   # Progress stats & track bar
        │   └── SubtitleViewer.vue          # Preview & Live translation viewer
        │
        ├── composables/
        │   └── useSubtitleTranslation.js   # State store & message emitter
        │
        ├── core/
        │   ├── SubtitleBatchPlanner.js     # Batch compiler & deduplicator
        │   ├── SubtitleContextBuilder.js   # AI & DeepL context generator
        │   ├── SubtitleProgressTracker.js  # Completion & ETA calculations
        │   ├── SubtitleProviderLimitsResolver.js # Provider constraints registry
        │   ├── SubtitleTranslationCoordinator.js # Background orchestrator
        │   └── SubtitleValidationService.js # Result validator & restorer
        │
        ├── formatting/
        │   └── SubtitleTextProtector.js    # Formatting & tag masking
        │
        ├── parsers/
        │   ├── SrtAdapter.js               # Subrip (.srt) parser & serializer
        │   └── SubtitleParserFactory.js    # Parser selection factory
        │
        ├── prompts/
        │   └── subtitlePrompt.js           # AI system & batch templates
        │
        └── types/
            └── subtitleTypes.js            # Normalized cue & state types
```

---

## Debugging

Subtitle operations utilize the `LOG_COMPONENTS.SUBTITLE` component key. 
- **Debug Logs**: Shows batch planning, token protection details, and progress rescue events.
- **Job Tracking**: Each job is tagged with a unique `jobId` in logs for easy filtering.

---

## References
*   [Unified Messaging System](./MessagingSystem.md)
*   [Memory Management and Resource Tracker](./MEMORY_GARBAGE_COLLECTOR.md)
*   [Centralized Translation Providers](./PROVIDERS.md)
