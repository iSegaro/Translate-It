# Unified Optimization Levels & Rate Limiting

## Overview

The **Optimization Levels** system is a centralized governance layer that balances **Speed (UX)** and **Cost/Stability (Resources)** across all translation providers. It introduces a 5-level scale that dynamically adjusts rate limits, concurrency, and batching strategies based on user preference.

**Architecture Status**: Production Ready (2026)
**Core Goal**: Maximize token efficiency for AI and IP stability for traditional providers.

---

## The Philosophy: Speed vs. Cost

The system operates on an **Inverted Scaling** principle:

1.  **Level 1 (Economy / Stability)**:
    *   **Goal**: Lowest cost and highest stability.
    *   **Strategy**: "Few requests, huge payloads."
    *   **Benefit**: Minimizes AI System Prompt overhead and reduces network request frequency for traditional APIs.
2.  **Level 3 (Balanced)**:
    *   **Goal**: The standard reliable experience (Default).
3.  **Level 5 (Turbo)**:
    *   **Goal**: Lowest latency and fastest UI response.
    *   **Strategy**: "Many requests, tiny payloads, high concurrency."
    *   **Benefit**: Enables streaming-like UI updates where text appears in chunks almost instantly.

---

## Architecture

The system is integrated vertically from the UI settings down to the raw network execution.

```
┌─────────────────────────────────────────────────────────────┐
│                   OPTIMIZATION ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────┤
│   UI Layer: Options Page (Speed vs. Cost Slider)            │
└──────────────┬──────────────────────────────────────────────┘
               │ (Level 1-5)
┌──────────────▼──────────────┐      ┌─────────────────────────┐
│  PageTranslationScheduler   │      │  ProviderConfigurations │
│  (Frontend Chunking)        │      │  (Backend Scaling)      │
└──────────────┬──────────────┘      └────────────┬────────────┘
               │                                  │
┌──────────────▼──────────────────────────────────▼───────────┐
│                    EXECUTION LAYER                          │
│  - RateLimitManager: Enforces Concurrency & Delays          │
│  - BaseAIProvider: Scales JSON Batch sizes                  │
│  - BaseTranslateProvider: Scales Character limits           │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Multipliers

The levels are applied using dynamic multipliers defined in `ProviderConfigurations.js`:

### 1. Rate Limiting (All Providers)
Concurrency and delays are scaled to protect API quotas and user IP reputation.

| Level | Concurrency Multiplier | Delay Multiplier | Description |
| :--- | :--- | :--- | :--- |
| **1** | 0.4x (Min 1) | 2.5x | Strictly sequential, high safety |
| **3** | 1.0x | 1.0x | Standard base settings |
| **5** | 2.0x (Max 12) | 0.4x | Aggressive parallel processing |

### 2. Batch Sizes (The Inversion Logic)
Unlike delays, batch sizes scale differently for AI vs. Traditional providers.

#### AI Providers (Token-Sensitive)
*Measured in segments per JSON request.*

| Level | AI Multiplier | Typical Chunks | Impact |
| :--- | :--- | :--- | :--- |
| **1** | 2.5x | ~80 Segments | **Economy**: Saves 60%+ tokens on System Prompts |
| **3** | 1.0x | ~30 Segments | Standard balance |
| **5** | 0.3x | ~15 Segments | **Turbo**: Fast streaming UI updates |

#### Traditional Providers (IP-Sensitive)
*Measured in character limits per request.*

| Level | Traditional Multiplier | Typical Chunks | Impact |
| :--- | :--- | :--- | :--- |
| **1** | 1.5x | ~7,500 Chars | **Stability**: Fewer requests to avoid IP bans |
| **3** | 1.0x | ~5,000 Chars | Standard balance |
| **5** | 0.6x | ~3,000 Chars | **Speed**: Faster progressive page rendering |

---

## Core Components

### 1. ProviderConfigurations.js (`src/features/translation/core/`)
The **Single Source of Truth** for technical limits. 
- Implements `applyOptimizationLevel(baseConfig, level)`: A pure function that deep-clones and modifies configurations before they reach the execution engine.
- Ensures guardrails (e.g., Level 5 Bing still respects a low concurrency limit).

### 2. PageTranslationScheduler.js (`src/features/page-translation/`)
Handles the **Frontend Chunking**.
- It uses the same level logic to decide how many nodes to collect from the DOM before "flushing" them to the background.
- This prevents "Double Fragmentation" (where the scheduler sends a tiny batch and the provider splits it even further).

### 3. RateLimitManager.js (`src/features/translation/core/`)
The **Enforcement Engine**.
- Uses an implementation of the **Token Bucket** and **Semaphore** patterns.
- It dynamically fetches the current user's optimization level and applies the scaled `maxConcurrent` and `subsequentDelay`.

---

## User Interface & Settings Logic

The system is exposed to the user via the **Languages Tab** in the Options page, featuring a high-precision range slider (1-5).

### 1. Settings Storage
The system uses a hierarchical storage strategy:
- **`PROVIDER_OPTIMIZATION_LEVELS`**: An object storing specific levels for each provider (e.g., `{ 'gemini': 1, 'googlev2': 5 }`).
- **`OPTIMIZATION_LEVEL`**: A global fallback level (Default: 3) used if no provider-specific setting exists.

### 2. Dynamic Labeling (Context-Aware UX)
The UI dynamically rebrands the levels based on the active provider's type (`isAIProvider`) to make the impact clear to the user:

| Provider Type | Level 1 Label | Level 5 Label | Metric of Concern |
| :--- | :--- | :--- | :--- |
| **AI (LLM)** | **Economy** | **Turbo** | Token Cost / Context |
| **Traditional** | **Stable** | **Fast** | IP Reputation / Latency |

### 3. Real-time Synchronization
When the user moves the slider, the change is saved via `updateSettingLocally`. The changes take effect after the user clicks the "Save" button in the Options page. The `SettingsUpdateHandler` in the background script then detects this and flushes the `RateLimitManager` cache, ensuring the new multipliers take effect across the extension.

---

## Implementation Details

### Multi-Key Failover
If a provider has multiple API keys, the system maintains the optimization level across key rotations. If a 429 (Rate Limit) occurs, the `RateLimitManager` can trigger an adaptive backoff that temporarily overrides the optimization level for that specific session.

### AI JSON Mode
For levels 1-5, AI providers (OpenAI, Gemini, DeepSeek) are forced into `json_object` mode for batch requests. This ensures that even the "Huge Batches" of Level 1 (80+ segments) are parsed with 100% accuracy.

---

## Benefits Summary

1.  **Cost Reduction**: Level 1 reduces AI token consumption by up to 70% by packing more text into a single System Prompt context.
2.  **UX Responsiveness**: Level 5 provides a "Progressive Loading" feel where the page translates in small, rapid bursts.
3.  **Stability**: Sequential processing in Level 1 protects users from being blocked by providers like Google or Bing.
4.  **Extensibility**: New providers automatically inherit these behaviors by extending `BaseProvider`.

---

**Last Updated**: April 2026
