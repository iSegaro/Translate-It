# Translation Provider Implementation Guide

## Overview

This document provides a comprehensive guide for implementing translation providers within the Translate-It system. The architecture has evolved into a **Coordinator-led model** where providers focus on raw execution while a central orchestrator handles language logic, normalization, and response consistency.

**Core Mandate**: All providers must inherit from `BaseProvider` (or its children) and adhere to the **Unified Response Contract**.

---

## Architecture Overview

The system is built upon a layered execution pipeline:

1.  **ProviderCoordinator (Orchestrator)**: The entry point for all translation requests. It handles:
    - Language Swapping (Bilingual Logic).
    - Auto-detection fallbacks.
    - Result cleaning and normalization.
    - Unified Response generation.
2.  **OptimizedJsonHandler**: A specialized orchestrator for complex, high-volume tasks (like Select Element) that manages intelligent batching and real-time streaming to the browser tabs.
3.  **BaseProvider / BaseAIProvider / BaseTranslateProvider**: Modular base classes that implement provider-specific logic (JSON mode, character limits, prompt prep).
4.  **Provider Utilities**: Specialized modules in `providers/utils/` that handle heavy lifting like API execution (`ProviderRequestEngine`), parsing (`AIResponseParser`), and text processing (`AITextProcessor`).
5.  **ProviderManifest**: The single source of truth for provider metadata, lazy loading, and UI display settings.

---

## Unified Response Contract

To prevent runtime crashes (like "split is not a function"), all providers (via the Coordinator) must return a **Unified Response Object**:

```javascript
{
  translatedText: string | array,  // The actual result
  detectedLanguage: string,       // ISO code (e.g., 'en', 'fa')
  provider: string,               // Provider name (e.g., 'GoogleGemini')
  sourceLanguage: string,         // Final source code used
  targetLanguage: string          // Final target code used
}
```

---

## Modularized Utilities (`providers/utils/`)

### 1. Request & Execution
- **ProviderRequestEngine**: Centralizes API call execution, header preparation, proxy handling, and orchestrates the **Multi-API Key Failover** lifecycle.
- **TraditionalBatchProcessor**: Manages character-limit chunking and sequential execution for traditional providers.

### 2. AI & Context Logic
- **AIConversationHelper**: Manages session history and context-enriched prompt preparation (Injecting Page Title/Headings).
- **AITextProcessor**: Handles complexity analysis and smart segment splitting.
- **AIResponseParser**: Robustly parses results from AI artifacts (Markdown, JSON blocks) and cleans "AI Chatter."

### 3. Traditional Provider Helpers
- **TraditionalTextProcessor**: Handles character-limit chunking and network weight calculation.
- **TraditionalStreamManager**: Orchestrates the streaming lifecycle for chunk-based traditional translations.

---

## Provider Implementation Workflow

### 1. Define Constants (`ProviderConstants.js`)
Add the constant ID and Name:
- `ProviderNames.YOUR_PROVIDER`: The class name (e.g., `'YourTranslate'`)
- `ProviderRegistryIds.YOUR_ID`: The registry ID (e.g., `'yourid'`)

### 2. Implement the Provider Class
Create a new class in `src/features/translation/providers/`:

#### A. AI Providers (Inherit from `BaseAIProvider`)
Implement `_callAI(systemPrompt, userText, options)`.
- Use `_preparePromptAndText` for standard context injection.
- AI providers should favor **JSON Mode** for batch requests.

#### B. Traditional Providers (Inherit from `BaseTranslateProvider`)
Implement `_translateChunk(chunkTexts, source, target, options)`.
- Respect `characterLimit` and `maxChunksPerBatch`.

### 3. Register in the Manifest (`ProviderManifest.js`)
Add to `PROVIDER_MANIFEST`. This handles UI registration and icon mapping.

---

## Implementation Rules & Best Practices

### 1. Coordination Principle
**NEVER override the `translate()` method.** 
The `BaseProvider.translate()` method delegates to the `ProviderCoordinator`. To implement custom logic, override `_batchTranslate` or specialized internal methods.

### 2. Optimization Level Awareness
Providers must be "Optimization-Aware." Use the `getProviderOptimizationLevelAsync` helper to adjust behavior:
- **Level 1 (Economy)**: Large batches, low concurrency.
- **Level 5 (Turbo)**: Small batches, high concurrency, enabled streaming.

### 3. Language Normalization
Implement `convertLanguage(code)` in your provider class to map standard ISO codes to provider-specific codes (e.g., `fa` -> `farsi` for legacy APIs).

### 4. Segment Mapping (The "Split" Safety)
If your provider merges multiple text segments into a single request, you **MUST** ensure they are split back correctly.
- AI: Use `AIResponseParser.parseBatchResult`.
- Traditional: Use `TranslationSegmentMapper.mapTranslationToOriginalSegments`.

---

## Stability, Rate Limiting & Failover

### 1. Multi-API Key Failover
The system supports multiple API keys per provider (stored as newline-separated strings).
- **Automatic Rotation**: If a key fails with a "Retryable Error" (Quota Exceeded, Invalid Key, Rate Limit), the `ProviderRequestEngine` automatically switches to the next available key.
- **Key Promotion**: Successfully used keys are "promoted" to the top of the list to ensure the fastest start for subsequent requests.
- **Validation**: The `ApiKeyManager` provides tools to test and reorder keys, ensuring valid keys are always prioritized.

### 2. Priority-Based Scheduling
Requests are queued based on their impact on UX:
- **HIGH**: Interactive UI (Popup, Selection, Sidepanel).
- **NORMAL**: Standard on-demand requests.
- **LOW**: Background tasks (Whole Page Translation).

### 3. Circuit Breaker
If all available keys fail or the provider is consistently unstable, the **RateLimitManager** "opens the circuit," temporarily disabling the provider for 60 seconds to prevent wasted requests and UI lag.

---

## Services & Specialized Components

- **RateLimitManager**: The core governance layer for request throttling, prioritization, and stability.
- **ApiKeyManager**: Manages the lifecycle of API keys, failover logic, and health testing.
- **LanguageDetectionService**: Used by the Coordinator to resolve `auto` source languages.
- **LanguageSwappingService**: Implements Bilingual Logic (swapping based on detected input).
- **RequestHealthMonitor**: Monitors provider success rates and triggers health-based alerts.
- **StreamingManager**: A global registry that coordinates real-time UI updates from multiple background streams.

---

**Last Updated**: April 2026
