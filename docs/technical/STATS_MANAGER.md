# Translation Stats & Request Tracking System

## Overview
The **Translation Stats Manager** is a centralized, high-precision system designed to track, aggregate, and report API usage across the entire extension. It provides absolute transparency by differentiating between the **Original Text Length** (user content) and the **Network Payload Weight** (actual bytes sent), which is critical for monitoring API quotas and costs, especially for AI providers.

## Core Mandates
1.  **Golden Chain Compliance**: All logs follow the project's standard: Providers (technical detail), Managers (lifecycle/progress), StatsManager (final unified reporting).
2.  **Explicit Self-Reporting**: Unlike old systems that "guess" payload sizes, each provider is responsible for calculating and reporting its exact network weight.
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

### 3. Explicit Reporting Flow
1.  **Provider Calculation**: The concrete provider calculates `charCount` (Network) and `originalCharCount` (Original).
2.  **Explicit Passing**: These values are passed through `_executeRequest` to `_executeApiCall`.
3.  **Central Recording**: `BaseProvider` calls `statsManager.recordRequest()` at the exact moment of the network call.
4.  **Delta Extraction**: Orchestrators (Engine/Service) calculate the "Delta" (difference in stats before/after a call) to log 100% accurate per-batch progress.

## Logging Strategy

### Intermediate Logs (Progress)
- **Status**: `📊 [Batch Summary]` or `📊 [Streaming Progress]`.
- **Logic**: Shows the isolated weight of the current chunk/batch and the running total for the session.

### Final Reports (Summary)
- **Status Labels**: `✅ [Complete Summary]`, `🔄 [Page Restored]`, `ℹ️ [Stopped]`.
- **Clearing**: For standalone requests (Popup), stats are cleared immediately. For Page Translation, stats persist during scrolling and are only cleared on Restore or a new Translation Start.

## Key Files
- `src/features/translation/core/TranslationStatsManager.js`: Central state and reporting logic.
- `src/features/translation/providers/BaseProvider.js`: The recording point for all network requests.
- `src/features/translation/providers/BaseAIProvider.js`: Helper for calculating AI payload weights (prompts/history).
- `src/core/services/translation/UnifiedTranslationService.js`: Orchestrates Page Translation progress reporting.
- `src/features/translation/core/translation-engine.js`: Orchestrates Select Element streaming progress.

## Debugging Commands
Run these in the Background Service Worker console:
- `showTranslationStats()`: Prints a comprehensive table of all providers and global usage.
- `resetTranslationStats()`: Resets all metrics and session data.

---
*Last Updated: April 2026*
