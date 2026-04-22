# Translation Provider Logic (Selection Strategy)

This document defines the logic used by the system to determine which translation provider should be used for different features. 

## Core Architecture

The system uses a **Hierarchical Provider Selection** mechanism combined with an **Execution Strategy** layer. Decisions are resolved centrally in `UnifiedTranslationService.js` and executed through the `ProviderCoordinator.js`.

### 1. Decision Hierarchy (The "Waterfall" Logic)

When a translation request is initiated, the provider is resolved based on this priority:

1.  **Direct UI Override (Highest Priority):** If the request explicitly carries a `provider` field (e.g., from Popup/Sidepanel direct translation).
2.  **Ephemeral Sync (Smart Overrides):** 
    - **Sync Page**: When enabled, Whole Page Translation bypasses settings and uses the UI's active provider.
    - **Sync Element**: When enabled, Select Element mode uses the UI's active provider.
3.  **Feature-Specific Setting (`MODE_PROVIDERS`):** Configured in Options (e.g., `select-element`, `page-translation-batch`).
4.  **Global Default (`TRANSLATION_API`):** The fallback system-wide provider.

### 2. Execution Orchestration (New)

Once a provider is selected, the **ProviderCoordinator** determines the technical strategy:
- **Language Normalization**: Maps standard codes to provider-specific ones.
- **Optimization Awareness**: Adjusts batch sizes and concurrency based on the 1-5 level scale.
- **Streaming Decisions**: Decides whether to use chunk-based streaming or unified JSON response.

---

## Feature-Specific Behaviors

### Select Element Mode
*   **Behavior:** UI-Aware & Batch-Optimized.
*   **Logic:** 
    - Uses `OptimizedJsonHandler` for batch processing.
    - **Sync Element** allows instant switching between AI (for context) and Traditional (for speed) providers without refreshing settings.

### Whole Page Translation (WPT)
*   **Behavior:** Throughput-Driven.
*   **Logic:** 
    - Uses `PageTranslationScheduler` to balance API costs vs. rendering speed.
    - **Sync Page** is critical for users who want to use a specific AI provider (like Gemini) temporarily for complex technical pages.

### Text Selection (WindowsManager)
*   **Behavior:** Interactive & Context-Rich.
*   **Logic:** 
    - **Manual Override:** Persistent per-window lifecycle.
    - **Smart Prompting**: The selection mode passes extra context (Headings, Page Title) to AI providers to improve accuracy.
    - **Dictionary Fallback**: Uses `MODE_PROVIDERS['dictionary-translation']` for single words.

---

## Implementation References

-   **`src/shared/config/config.js`**: Defines `MODE_PROVIDERS` and default settings.
-   **`src/features/translation/core/ProviderCoordinator.js`**: The final orchestration hub for all resolved requests.
-   **`src/core/services/translation/UnifiedTranslationService.js`**: Handles the `_resolveEffectiveProvider` waterfall.
-   **`src/features/translation/core/managers/OptimizedJsonHandler.js`**: Manages the batching logic for Select Element.

## Guidelines for AI Maintenance
- **When adding a new feature:** Register its mode in `TranslationMode` (config.js) and update the resolution waterfall if it requires unique inheritance.
- **When modifying resolution:** Ensure `UnifiedTranslationService` remains the source of truth for *selecting* the provider, while `ProviderCoordinator` remains the source of truth for *executing* it.

---

**Last Updated**: April 2026