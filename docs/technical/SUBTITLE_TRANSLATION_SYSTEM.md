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
        useSubtitleTranslation.js        │       1. Parse         ├─→ SubtitleParserFactory
        (UI-to-Messaging Bridge)         │                        │   (Returns SrtAdapter)
                   │                     │       2. Protect       ├─→ SubtitleTextProtector
                   ▼                     │                        │   (Placeholders for formatting)
         Unified Messaging Bus           │       3. Plan Batches  ├─→ SubtitleBatchPlanner
        (SUBTITLE_TRANSLATE Msg)         │                        │   (Optimized character limit chunks)
                   │                     │       4. Context       ├─→ SubtitleContextBuilder
                   │                     │                        │   (Coherence across dialogues)
                   ├─────────────────────┼───────────────────────→│
                   │                     │       5. Translate     ├─→ UnifiedTranslationService
                   │                     │                        │   (Generic translation request)
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
    *   **Configuration**: Allows selecting the source and target languages, along with the translation provider.
    *   **Progress Dashboard**: Renders real-time translation statistics, completion bars, and dynamic ETAs.
    *   **Theme Integration**: Syncs seamlessly with the extension-wide Pinia `settingsStore` theme preferences (`light`, `dark`, or `auto`) and listens for real-time broadcasts.

---

### 2. [useSubtitleTranslation.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/composables/useSubtitleTranslation.js)
A reactive composable bridging the Subtitle UI application with the background service worker using the message bus.

*   **Responsibilities:**
    *   Acts as the single source of truth for the subtitle translation state in the UI context (e.g., status, progress percent, error messages, loaded file name).
    *   Dispatches background commands such as `SUBTITLE_TRANSLATE` and `SUBTITLE_TRANSLATE_CANCEL`.
    *   Listens to messaging triggers (`SUBTITLE_TRANSLATE_PROGRESS`, `SUBTITLE_TRANSLATE_COMPLETE`, `SUBTITLE_TRANSLATE_ERROR`) and automatically updates reactive state variables.

---

### 3. [SubtitleTranslationCoordinator.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/core/SubtitleTranslationCoordinator.js)
The **Background Orchestrator**. It owns the lifecycle of a subtitle translation job from raw string parsing to finalized output serialization.

*   **Key Flow:**
    1.  Receives raw subtitle file content from the message bus.
    2.  Invokes `SubtitleParserFactory` to obtain a suitable parser adapter and converts the raw string into structured `Cue` objects.
    3.  Runs validations on the subtitle format and limits using `SubtitleValidationService`.
    4.  Extracts and masks style tags (e.g., `<i>`, `<b>`, `<font>`) via `SubtitleTextProtector` to safeguard formatting.
    5.  Resolves target provider batch limits with `SubtitleProviderLimitsResolver` and uses `SubtitleBatchPlanner` to chunk the protected cues into optimal batches.
    6.  Optionally injects conversational dialogue context using `SubtitleContextBuilder` to ensure flow coherence.
    7.  Submits chunks to `UnifiedTranslationService` for translation.
    8.  Monitors results, updates `SubtitleProgressTracker`, and broadcasts progress messages to the UI.
    9.  Re-injects protected tags, serializes the translated cues back into the original format, and reports job completion.

---

### 4. [SubtitleParserFactory.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/parsers/SubtitleParserFactory.js)
A creational design pattern factory that determines and instantiates the correct parser adapter based on the file name extension.

*   **API & Adapters:**
    *   `getAdapter(filename)`: Inspects file extension (e.g., `.srt`) and returns the appropriate adapter.
    *   [SrtAdapter.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/parsers/SrtAdapter.js): Handles `.srt` parser (`parse`) and string serializer (`stringify`).

---

### 5. [SubtitleTextProtector.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/formatting/SubtitleTextProtector.js)
A specialized protection adapter designed to shield formatting elements from being altered, corrupted, or translated by AI/traditional translation engines.

*   **Protected Elements:**
    *   HTML tags (`<i>`, `<b>`, `<u>`, `<font color="...">`).
    *   Styling braces (`{\an8}`, `{\i1}`).
    *   System variables and mathematical symbol bounds.
*   **Mechanics:**
    *   `protect(text)`: Scans the cue text, replaces protected formatting segments with numeric tokens (e.g., `__TI_TAG_0__`), and returns the protected text alongside a restoration dictionary.
    *   `restore(protectedText, tagMap)`: Re-injects the original formatting tags from the map back into the translated text, ensuring perfect layout integrity.

---

### 6. [SubtitleBatchPlanner.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/core/SubtitleBatchPlanner.js)
Handles the mathematical chunking of structured cue arrays to guarantee optimal translation volume without exceeding API payloads.

*   **Key Calculations:**
    *   Takes resolved character limits and maximum batch item limits from the limits resolver.
    *   Aggregates cues sequentially, keeping track of cumulative character lengths (including injected context envelopes).
    *   Splits cues at safe indices to construct separate translation batches that fit perfectly within target provider bounds.

---

### 7. [SubtitleProgressTracker.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/core/SubtitleProgressTracker.js)
A high-accuracy mathematical tracker that manages translation completion metrics.

*   **Metrics Tracked:**
    *   Percentage of cues processed (`percent`).
    *   Total successful cue translations vs. failed failures.
    *   Adaptive **Estimated Time of Arrival (ETA)** using rolling average throughput calculations, preventing erratic ETA jumps.

---

### 8. [SubtitleContextBuilder.js](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/core/SubtitleContextBuilder.js)
Provides context-aware capabilities to AI providers to improve translation coherence.

*   **Why It Matters:**
    Subtitle cues often consist of fragmented, short conversational sentences. Translating each cue in total isolation leads to gender mismatches, tense issues, and incoherent dialogue flow.
*   **How It Works:**
    For AI-based providers, it appends a sliding window of metadata containing immediately preceding cues. This lets the LLM understand the conversation's flow, context, and speaker tone, resulting in a significantly more natural translation.

---

## Optimization & Quality Strategies

### 1. Progressive Limit Resolution
Different translation services enforce widely different payload limitations. The [SubtitleProviderLimitsResolver](file:///home/amir/Works/Translate-It/Extension/src/features/subtitle-translation/core/SubtitleProviderLimitsResolver.js) adaptively scales constraints:
*   **Traditional Engines (Google/Yandex)**: Set to high cue counts but strictly capped total characters to prevent query failures.
*   **AI Engines (OpenAI/Gemini)**: Scaled to balance token budgets, context envelopes, and rate limits to maximize speed and cost efficiency.

### 2. Conversational Sliding Window
To prevent context window bloat while maintaining conversational quality, `SubtitleContextBuilder` uses a micro-context wrapper that supplies only the preceding 2-3 lines of dialogue as context, keeping token overhead minimal.

---

## Theme & Sync System

The Subtitle page fully supports light and dark modes, perfectly synced with options and popup.

*   **State Inheritance**:
    *   On load, `SubtitleApp.vue` invokes `settingsStore.loadSettings()`.
    *   A reactive computed property `isDark` is mapped directly to `settingsStore.isDarkTheme`.
*   **Dynamic Theme Toggle**:
    *   An ergonomic rounded button in the header cycles through پوسته configurations.
    *   When clicked, it commits changes to persistent storage via `updateSettingAndPersist('THEME', nextTheme)`.
    *   It broadcasts a `THEME_CHANGED` message runtime message so all other active extension contexts (e.g. Options, Popups) sync instantly.
*   **Cross-Tab Theme Broadcasts**:
    *   A listener registered inside the resource tracker (`tracker.addEventListener`) captures incoming `THEME_CHANGED` messages broadcasted from other options pages and updates the Subtitle document style class on the fly.
    *   It also dynamically captures system-level theme shifts (e.g., sunset schedules) using `window.matchMedia` listeners when the extension is in `auto` theme mode.

---

## Messaging Protocol

### 1. Command Actions (UI to Background)
*   `SUBTITLE_TRANSLATE`: Initiates a translation job.
    *   **Payload**: `{ content, filename, config }`
*   `SUBTITLE_TRANSLATE_CANCEL`: Interrupts and terminates the active translation job cleanly.
    *   **Payload**: `{ filename }`

### 2. Status Signals (Background to UI)
*   `SUBTITLE_TRANSLATE_PROGRESS`: Dispatched sequentially as batches complete.
    *   **Payload**: `{ percent, processed, total, translated, failed, etaMs }`
*   `SUBTITLE_TRANSLATE_COMPLETE`: Triggered when serialization completes.
    *   **Payload**: `{ translatedContent }`
*   `SUBTITLE_TRANSLATE_ERROR`: Fired upon validation failures, connection timeouts, or unrecoverable provider failures.
    *   **Payload**: `{ error }`

---

## File Structure

```text
src/
├── apps/
│   └── subtitle/
│       ├── SubtitleApp.vue                 # Premium Subtitle UI & Theme Manager
│       └── ...
│
├── app/
│   └── main/
│       └── subtitle.js                     # Main Vue initialization & CSS injection
│
└── features/
    └── subtitle-translation/
        ├── components/
        │   ├── SubtitleFileDropzone.vue    # Glassmorphic Drag & Drop panel
        │   └── SubtitleProgressPanel.vue   # Progress stats, counters & track bar
        │
        ├── composables/
        │   └── useSubtitleTranslation.js   # State store & message emitter
        │
        ├── core/
        │   ├── SubtitleBatchPlanner.js     # Sequential block boundaries compiler
        │   ├── SubtitleContextBuilder.js   # Conversational window context generator
        │   ├── SubtitleProgressTracker.js  # Completion calculations and rolling ETA
        │   ├── SubtitleProviderLimitsResolver.js # Provider constraints registry
        │   ├── SubtitleTranslationCoordinator.js # Background orchestration pipeline
        │   └── SubtitleValidationService.js # File format and limit validator
        │
        ├── formatting/
        │   └── SubtitleTextProtector.js    # Formatting, braces & tags masking
        │
        └── parsers/
            ├── SrtAdapter.js               # Subrip (.srt) parser and stringifier
            └── SubtitleParserFactory.js    # Parser selection factory
```

---

## Debugging

### Inspecting Subtitle Context Logs
Subtitle operations utilize the dedicated `LOG_COMPONENTS.SUBTITLE` component key. Set logging levels to `DEBUG` to see detailed logs in the console:
```javascript
// Example console output during subtitle run
[DEBUG] [SUBTITLE] [SubtitleApp] Initializing settings store
[INFO]  [SUBTITLE] [SubtitleTranslationCoordinator] Starting job for: movie.srt (540 cues)
[DEBUG] [SUBTITLE] [SubtitleBatchPlanner] Created 12 batches for Gemini provider
[DEBUG] [SUBTITLE] [SubtitleTextProtector] Protected 24 tag entities in batch #2
```

### Checking Active Job Status
Inspect the active coordinator instance in the background console to evaluate memory footprints, cue arrays, and currently running queue managers.

---

## References
*   [Unified Messaging System](./MessagingSystem.md)
*   [CSS & Design Tokens Architecture](./CSS_ARCHITECTURE.md)
*   [Memory Management and Resource Tracker](./MEMORY_GARBAGE_COLLECTOR.md)
*   [Centralized Translation Providers](./PROVIDERS.md)
