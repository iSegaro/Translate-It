# Translation Stats & Request Tracking System

## Overview
The **Translation Stats Manager** is a centralized, high-precision system designed to track, aggregate, and report API usage across the entire extension. It provides absolute transparency by differentiating between the **Original Text Length** (user content) and the **Network Payload Weight** (actual bytes sent), which is critical for monitoring API quotas and costs, especially for AI providers.

## Core Mandates
1.  **Golden Chain Compliance**: All logs follow the project's standard: Providers (technical detail), Managers (lifecycle/progress), StatsManager (final unified reporting).
2.  **Explicit Self-Reporting**: Unlike old systems that "guess" payload sizes, providers supply network payload values and `ProviderRequestEngine` records each physical request.
3.  **Dual-Metric Tracking**: Every request records two distinct values:
    -   **Original Chars**: The raw length of the text the user intended to translate.
    -   **Network Chars**: The actual payload size (including system prompts, history, JSON formatting, and delimiters).
4.  **Session-Based Isolation**: Independent operations (e.g., Select Element vs. Whole Page) are strictly isolated using `sessionId` to prevent statistical leakage.

## Architecture

### 1. StatsManager (The Central Brain)
- **Location**: `@/features/translation/core/TranslationStatsManager.js`
- **Responsibility**: A singleton that acts as the "Source of Truth" for all API statistics.
- **Key Method**: `printSummary(sessionId, options)` — A unified reporting engine that handles icon selection, duration formatting, and dual-metric display logic.

### 2. Dual-Metric Logic
The system automatically determines how to display characters in logs based on the overhead:
- **Low Overhead**: If the difference between Original and Network is negligible (e.g., `< 5` chars), it shows a single number: `Chars: 31`.
- **Significant Overhead**: For AI or batched requests, it shows both: `Chars: 100 (Network: 1,291)`.

### 3. Physical Reporting Flow
1.  **Provider Calculation**: The concrete provider calculates `charCount` (Network) and `originalCharCount` (Original).
2.  **Explicit Passing**: These values are passed through `ProviderRequestEngine.executeRequest` to `executeApiCall`.
3.  **Central Recording**: `ProviderRequestEngine` calls `statsManager.recordRequest()` at the exact moment of the physical network call.
4.  **Delta Extraction**: Orchestrators (Engine/Service) calculate the "Delta" (difference in stats before/after a call) to log 100% accurate per-batch progress.

### 4. Purpose-Attributed Physical Counters

Each physical request is normalized to one purpose before recording:

- `PRIMARY_TRANSLATION`: Normal provider execution.
- `STRUCTURED_RECOVERY`: Provider-local structured recovery after a structured response contract violation.

Calls, network characters, original characters, and non-cancellation physical failures are counted once per physical request. Missing or invalid purposes are normalized to `PRIMARY_TRANSLATION` before recording.

```js
global: {
  totalCalls, totalChars, totalOriginalChars, totalErrors,
  callsByPurpose, charsByPurpose, errorsByPurpose,
}

provider: {
  calls, chars, originalChars, errors,
  callsByPurpose, charsByPurpose, errorsByPurpose,
  quality,
}

session: {
  calls, chars, originalChars, errors,
  callsByPurpose, charsByPurpose, errorsByPurpose,
}
```

### 5. Recovery Quality Counters

Quality counters exist globally and per provider only:

```js
quality: {
  structuredResponseViolations,
  recoveryPasses,
  operationsWithRecovery,
  operationsRecovered,
  operationsRecoveryFailed,
  operationsRecoveryIncomplete,
  operationsRecoverySuperseded,
}
```

Physical counters measure HTTP/provider execution cost. Quality counters measure logical recovery behavior from finalized `TranslationOperation` reports. There are no session-scoped quality counters, stored rates, persistence, or schema migration. In-memory reset initializes both physical and quality counters.

Quality counters are observational: they do not alter `RateLimitManager`, provider selection, retry policy, or routing.

## Logging Strategy

### Intermediate Logs (Progress)
- **Status**: `📊 [Batch Summary]` or `📊 [Streaming Progress]`.
- **Logic**: Shows the isolated weight of the current chunk/batch and the running total for the session.

### Final Reports (Summary)
- **Status Labels**: `✅ [Complete Summary]`, `🔄 [Page Restored]`, `ℹ️ [Stopped]`.
- **Clearing**: For standalone requests (Popup), stats are cleared immediately. For Page Translation, stats persist during scrolling and are only cleared on Restore or a new Translation Start.

## Key Files
- `src/features/translation/core/TranslationStatsManager.js`: Central state and reporting logic.
- `src/features/translation/providers/utils/ProviderRequestEngine.js`: **Physical call owner**. `executeApiCall` calls `statsManager.recordRequest()` at the moment of each physical network call and `statsManager.recordError()` on non-cancellation physical failures.
- `src/features/translation/providers/BaseProvider.js`: Provider execution abstraction/delegation (language normalization, batching, config validation). It does **not** perform physical stats recording; that happens in `ProviderRequestEngine.executeApiCall`.
- `src/features/translation/providers/BaseAIProvider.js`: Helper for calculating AI payload weights (prompts/history).
- `src/core/services/translation/UnifiedTranslationService.js`: Orchestrates Page Translation progress reporting.
- `src/features/translation/core/translation-engine.js`: Orchestrates Select Element streaming progress.

## Stats vs. Diagnostics

Do not conflate physical call stats with other counters:

- **Physical provider-call stats** (`TranslationStatsManager`, recorded by `ProviderRequestEngine`): counts HTTP/provider execution cost, chars, and non-cancellation errors.
- **Queue/retry diagnostics**: attempt and retry events traced by `QueueManager` (via `appendTranslationDiagnostic`), not physical call counts.
- **Feature progress counters**: per-feature progress (e.g. `SubtitleProgressTracker`, `PdfTranslationCoordinator`) tracking translated/failed units; these are feature-level, not physical provider-call statistics.

## Debugging Commands

`window`-based helpers (`showTranslationStats()`, `resetTranslationStats()`) are bound by `TranslationStatsManager` only when `typeof window !== 'undefined'`. They are therefore available only in **windowed contexts** (e.g. a popup/sidepanel/options DevTools). In the **MV3 background service worker**, `window` is undefined, so these globals are **not** attached; use component-level logging there instead.

---
*Last Updated: April 2026*
