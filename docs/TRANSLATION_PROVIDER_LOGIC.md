# Translation Provider Logic (Selection Strategy)

This document defines the logic used by the system to determine which translation provider should be used for different features. 

## Core Architecture

The system uses a **Hierarchical Provider Selection** mechanism. Decisions are resolved centrally in `UnifiedTranslationService.js` and feature-specific managers.

### 1. Decision Hierarchy (The "Waterfall" Logic)

When a translation request is initiated, the provider is resolved based on this priority:

1.  **Direct UI Override (Highest Priority):** If the request explicitly carries a `provider` field (e.g., from Popup/Sidepanel direct translation).
2.  **Ephemeral Sync (New):** If the user has enabled "Sync Page" or "Sync Element" in the UI dropdown. This session-based toggle forces the feature to use the currently selected UI provider, bypassing stored settings.
3.  **Feature-Specific Setting (`MODE_PROVIDERS`):** If a specific mode (e.g., `select-element`, `page-translation-batch`) has an explicit provider set in settings (and Sync is OFF).
4.  **Global Default (`TRANSLATION_API`):** The system-wide default provider.

---

## Feature-Specific Behaviors

### Select Element Mode
*   **Behavior:** UI-Aware (Enhanced by Sync).
*   **Logic:** 
    *   If **Sync Element** is ON: It strictly uses the UI's active provider.
    *   If **Sync Element** is OFF: It checks `MODE_PROVIDERS['select-element']`. If set to `default` or null, it inherits the UI's active provider (legacy behavior).

### Whole Page Translation (WPT)
*   **Behavior:** Settings-Driven (Syncable).
*   **Logic:** 
    *   If **Sync Page** is ON: It uses the UI's active provider (bypasses settings).
    *   If **Sync Page** is OFF: It strictly follows `MODE_PROVIDERS['page-translation-batch']`.
    *   *Reason:* Allows users to temporarily use a high-tier provider for a specific page without changing permanent settings.

### Text Selection & Field Translation
*   **Behavior:** Feature-Locked or Global.
*   **Logic:** Follows `MODE_PROVIDERS['selection-manager']` or `MODE_PROVIDERS['content']`. If null/default, uses the Global Default.

---

## Implementation References

-   **`src/shared/config/config.js`**: Contains the `CONFIG.MODE_PROVIDERS` structure and default values.
-   **`src/core/services/translation/UnifiedTranslationService.js`**: Implements `_resolveEffectiveProvider(data, context)` which handles the logic waterfall.
-   **`src/features/page-translation/PageTranslationManager.js`**: Loads settings independently for page-wide operations.
-   **`src/features/translation/composables/useTranslationModes.js`**: (Method: `toggleSelectElement`) Captures the active UI provider and passes it to the background service.

## Guidelines for AI Maintenance
- **When adding a new feature:** Register its mode in `TranslationMode` (config.js) and add it to `MODE_PROVIDERS`.
- **When modifying resolution:** Ensure that `UnifiedTranslationService` remains the "Single Source of Truth" for resolving providers to avoid inconsistent behavior across different UI hosts (Popup vs. Sidepanel).

---

**Last Updated**: March 2026