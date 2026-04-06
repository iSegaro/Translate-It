# Translation Provider Implementation Guide

## Overview

This document provides a comprehensive guide for implementing translation providers within the Translate-It system. All providers must inherit from `BaseProvider` and adhere to the Rate Limiting and Circuit Breaker patterns.

## Architecture Overview

The system is built upon **Unified Provider Discovery**:
- **ProviderManifest**: The heart of the system. A single file containing all identities, display settings, and provider loading logic.
- **BaseProvider / BaseAIProvider**: Base classes that coordinate translation logic, now modularized for better maintainability.
- **Provider Utilities**: Specialized modules in `providers/utils/` that handle heavy lifting like API execution, parsing, and text processing.
- **ProviderConstants**: Name and ID constants to prevent typos.
- **ProviderConfigurations**: Precise technical settings (Rate Limit, Batching, Features).
- **RateLimitManager**: Manages request rate limits (automatically populated from technical settings).

---

## Modularized Utilities (`providers/utils/`)

To prevent file bloat, core logic is delegated to these specialized helpers:

### 1. Request & Execution
- **ProviderRequestEngine**: Centralizes API call execution, header preparation, proxy handling, and multi-key failover logic.
- **TraditionalBatchProcessor**: Manages sequential batch processing and rate-limited execution for traditional providers.

### 2. AI & Context Logic
- **AIConversationHelper**: Handles session history, turn management, and context-enriched prompt preparation.
- **AITextProcessor**: Manages smart batching based on complexity, placeholder protection, and sentence splitting (`Intl.Segmenter`).
- **AIResponseParser**: Cleans AI artifacts and robustly parses JSON results from Markdown blocks.
- **AIStreamManager**: Orchestrates real-time streaming of results for AI providers.

### 3. Traditional Provider Helpers
- **TraditionalTextProcessor**: Handles character-limit chunking and network weight calculation for traditional services.
- **TraditionalStreamManager**: Manages streaming lifecycle for chunk-based traditional translations.

---

## Workflow: Adding a New Provider (Quick Start)

### 1. Define Constants (`ProviderConstants.js`)
Add the constant ID and Name:
- `ProviderNames.YOUR_PROVIDER`: The class name (e.g., `'YourTranslate'`)
- `ProviderRegistryIds.YOUR_ID`: The registry ID (e.g., `'yourid'`)

### 2. Implement the Provider Class (`providers/YourProvider.js`)
Create a new class inheriting from `BaseTranslateProvider` or `BaseAIProvider`:
- **Traditional**: Implement `_translateChunk(chunkTexts, ..., options = {})`.
- **AI**: Implement `_translateSingle(text, ..., originalCharCount = 0)`.

### 3. Register in the Manifest (`ProviderManifest.js`)
Add the provider to `PROVIDER_MANIFEST`. This automatically handles UI registration, icons, and lazy loading.

---

## Provider Implementation Rules

### 1. MANDATORY: Inherit from BaseProvider
All providers must inherit from `BaseProvider` or its specialized children (`BaseTranslateProvider` / `BaseAIProvider`).

### 2. DO NOT Override translate() Method
Never override the `translate()` method. It handles critical coordination (Language Swapping, JSON mode, Rate Limiting). Implement only the internal `_translateChunk` or `_translateSingle` methods.

### 3. MANDATORY: Use ProviderNames constant
Always use `ProviderNames` constants in the class constructor:
```javascript
constructor() {
  super(ProviderNames.YOUR_PROVIDER);
}
```

### 4. MANDATORY: Accurate Character Reporting
Every provider must report exact network consumption. Use the delegated helpers to calculate and pass:
- **charCount**: Total network payload (including prompts, history, delimiters).
- **originalCharCount**: Raw length of the input text.

---

## Statistics & Accurate Reporting

The system uses **Explicit Self-Reporting**. Base classes provide helpers (via Utilities) to simplify this:

### 1. Calculation Helpers
- **Traditional**: Internal methods use `TraditionalTextProcessor.calculateTraditionalCharCount(texts)`.
- **AI**: Internal methods use `_calculateAIPayloadChars(messages)` to sum system instructions, history, and user text.

### 2. Reporting Example
When executing a request, ensure metrics are passed to the engine:

```javascript
await this._executeRequest({
  url,
  fetchOptions,
  charCount: networkChars,          // From specialized processor
  originalCharCount: originalChars, // Raw input length
  sessionId: options.sessionId,
  // ...
});
```

---

## Rate Limiting & Multi-API Key Failover

- **Configuration**: Technical settings are centralized in `ProviderConfigurations.js`.
- **Failover**: If `needsApiKey: true` is set in the manifest, the `ProviderRequestEngine` automatically switches to the next available key upon retryable errors (e.g., 429).

## Summary of Optimization

- **Maintainability**: Large classes are split into focused utility modules.
- **Consistency**: Centralized parsing and request handling ensure uniform error management.
- **Scalability**: New features (like Context Summary) can be added to utility modules without bloating the provider classes.

---

**Last Updated**: April 2026
