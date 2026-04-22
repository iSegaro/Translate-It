# TTS (Text-to-Speech) System Documentation

## Overview

The Text-to-Speech (TTS) system in Translate-It is a **multi-engine, context-aware** audio architecture. It provides high-quality neural voices through **Microsoft Edge TTS** and reliable fallback via **Google TTS**. The system is designed for maximum stability, zero-latency playback, and intelligent language detection across all extension contexts (Popup, Sidepanel, and WindowsManager).

**Modular Architecture**: The system follows a "Provider-less Dispatcher" pattern, where a central controller manages state, engine selection, and error recovery without leaking complexity to the UI. All engine-specific data is centralized to ensure a **Single Source of Truth**.

---

## Architecture & Message Flow

The system uses a layered approach to separate UI interaction, logic routing, and audio execution.

### System Flow Diagram

```
[ UI Components ] 
(TTSButton.vue - Standardized across all contexts)
       │
       ▼
[ useTTSSmart.js ] ──► (Independent instance-level state: idle, loading, playing, error)
       │
       ▼ (MessageActions.GOOGLE_TTS_SPEAK)
       │
[ TTSDispatcher.js ] ◄─┐ (The Brain: Proactive Detection & Engine Selection)
       │               │
       ├─► [ TTSLanguageService.js ] (Checks engine support via PROVIDER_CONFIGS)
       │               │
       │               └─► [ TTSVoiceService.js ] (Dynamic list & Dialect matching)
       │
       ├─► [ handleEdgeTTS.js ] ──► [ EdgeTTSClient.js ] (Logic-only synthesize)
       │            │                      │
       │            └──────────────────────┼──► [ TTSCircuitBreaker.js ]
       │                                   │    (Failure monitoring)
       └─► [ handleGoogleTTS.js ] ──► [ Google TTS API ]
                    │
                    ▼
[ TTSStateManager.js ] ──► [ Offscreen Document (Chrome) / Direct Audio (Firefox) ]
(Lifecycle & Broadcast)       (Persistent environment, stop-only logic)
```

---

## Core Components

### 1. `ttsProviders.js` (The Data Vault)
The **Single Source of Truth** for the entire TTS module. It contains:
- **`PROVIDER_CONFIGS`**: Centralized object containing URLs, trusted tokens, supported languages, and technical parameters (User-Agents, App IDs, cleaning Regex).
- **Circuit Breaker Settings**: Defines failure thresholds and recovery windows for each engine.

### 2. `TTSDispatcher.js` (The Router)
The central intelligence of the system. It intercepts all speech requests and performs:
- **Proactive Detection**: Identifies the language before the first attempt if "Smart Detection" is enabled.
- **Engine Resolution**: Decides between Google or Edge based on user preference and native language support.
- **Smart Recovery**: Handles Edge failures (e.g., 0-byte audio) by triggering re-detection and falling back to the alternative engine.

### 3. `TTSStateManager.js` (Unified State & Targeted Broadcast)
Manages the shared state across all handlers:
- **Targeted Broadcast**: Implements a `broadcastStatus` mechanism that notifies ONLY the initiating tab (all its frames/Shadow DOM) and internal extension contexts (Popup/Sidepanel). This improves performance by reducing unnecessary cross-tab traffic while ensuring UI synchronization in complex environments.
- **Offscreen Persistence**: Controls the lifecycle of the Offscreen document. Uses `stopAudioOnly()` instead of closing the document to eliminate latency.
- **Status Mapping**: Translates internal engine events into unified statuses: `completed`, `error`, `stopped`, and `idle`.

### 4. `EdgeTTSClient.js` (Neural Worker)
A **logic-only** client for Microsoft Edge TTS:
- **Mobile Emulation**: Uses fixed Mobile App IDs and modern User-Agents to ensure authenticity.
- **Security**: Implements HMAC-SHA256 signatures and JWT token expiry management.
- **Resilience**: Integrated with the Circuit Breaker to prevent IP blocking on server failures.

### 5. `TTSLanguageService.js` (Capability Manager)
Acts as a validator for engine capabilities:
- **Logic Separation**: Decoupled from data; fetches support matrices from `ttsProviders.js`.
- **Async Resolution**: Coordinates with `TTSVoiceService` to find the best available neural voice name.

### 6. `TTSCircuitBreaker.js` (Protection Layer)
Prevents overwhelming failing services and protects user IP reputation:
- **State Persistence**: Stores "Open/Closed" states in `storage.local` to survive worker suspensions.
- **Thresholds**: Automatically blocks requests to an engine if it fails 5 times within a 10-minute window.
- **Cooldown**: Enforces a 15-minute reset period before allowing new attempts.

### 7. `TTSVoiceService.js` (Voice Management)
Handles the dynamic aspects of Microsoft Edge voices:
- **Dynamic Fetching**: Downloads the live voice list from Microsoft using a trusted client token.
- **Caching**: Implements a 24-hour cache in `storage.local` to avoid redundant network requests.
- **Dialect Prioritization**: Implements a "Preferred Region" logic (e.g., prioritizing `en-US` over `en-AU` for English) to ensure natural sounding defaults.

---

## Smart Language Detection & Voice Selection

### Provider-led Detection Inheritance (Highly Accurate)
To ensure 100% accurate pronunciation, the TTS system integrates with the translation provider's feedback loop:
1.  **Translation Feedback**: When a provider (e.g., Google or Gemini) translates text, it identifies the source language. This verified result is registered in `LanguageDetectionService`.
2.  **TTS Request**: When the user clicks the TTS button, the `TTSDispatcher` calls the detection service.
3.  **Cache Hit**: The system retrieves the **verified** provider detection from the session cache (Layer 0), bypassing probabilistic internal detection.
4.  **Perfect Pronunciation**: The TTS uses this verified code to select the exactly matching neural voice (e.g., distinguishing between Portuguese and Brazilian Portuguese if the provider specified it).

### Detection Inheritance (Optimization)
To minimize latency and prevent "Short Text Detection" warnings, the TTS system prioritizes inherited detection data:
1.  **Inheritance Bypass**: If the UI component (e.g., `TTSButton`) provides an explicit `sourceLanguage` (inherited from a previous translation), the `TTSDispatcher` **bypasses** all internal detection logic.
2.  **Reset-on-Change Safety**: The system implements a "Reset-on-Change" rule. If the source text is modified in the UI, the inherited language is reset to `auto`, forcing a fresh detection to prevent stale voice selection.

### Internal Multi-tiered Detection (Fallback)
If no inherited language is available, the system uses its tiered strategy (`_detectLanguage`):

### Dialect Matching Logic
When searching for a voice, the system follows this priority:
1.  **Strict Locale Match**: Matches the requested language + preferred dialect (e.g., `en-US`).
2.  **Neural Family Match**: Finds any available Neural voice in the same language group.
3.  **Static Fallback**: Uses the hardcoded mapping in `ttsProviders.js` as a last resort.

---

## Lifecycle & State Management

### Optimized UI Reactivity
- **Instance-Level Scoping**: Each call to `useTTSSmart.js` creates an independent state. This allows multiple TTS buttons on the same page to operate without unwanted synchronization.
- **Broadcast Synchronization**: UI components listen for `GOOGLE_TTS_ENDED` broadcasts to stay in sync with the background state, even if they didn't initiate the request.
- **Instant Feedback**: The composable clears previous error states at the start of each call, ensuring the UI always reacts to retries.
- **Background Initialization**: `LifecycleManager.js` triggers a background voice list update on startup if the 24-hour cache has expired.

### Reliable Messaging
- **Proactive Error Notification**: `TTSDispatcher` notifies the state manager immediately upon logical failures (Circuit Breaker, Unsupported Language) before network calls are made.
- **Response Validation**: Handlers verify the `success` field from the Offscreen document.
- **Failure Propagation**: Technical failures (like `synthesis-failed` or `Circuit Breaker OPEN`) are bubbled up to the UI button immediately via the broadcast channel.

---

## User Configuration

Users can control the system through the **TTS Tab** in Options:
- **TTS Engine**: Default preference (Google or Edge).
- **Engine Fallback**: Allows automatic switching between providers if one fails or lacks support.
- **Smart Language Detection**: Enables/disables automatic language correction.

---

## Browser Compatibility

| Feature | Chromium (Chrome/Edge) | Firefox |
| :--- | :--- | :--- |
| **Playback** | Offscreen Document | Direct Background Audio |
| **Edge TTS** | Full (Signature + Token) | Full |
| **Detection** | Multi-tiered Script Analysis | Multi-tiered Script Analysis |
| **Cleanup** | `stopAudioOnly()` (Persistent) | `Audio.pause() + null` |

---

## Troubleshooting for Developers

### Audio plays but UI stays in "Loading"
- **Cause**: The Offscreen document encountered an error and didn't call `sendResponse`.
- **Fix**: Check `offscreen.js` for missing `sendResponse` calls in `catch` blocks or retry handlers.

### "Circuit Breaker OPEN" Error
- **Cause**: The engine has failed too many times recently.
- **Resolution**: Check internet connection or server status. Wait 15 minutes or manually clear `TTS_CIRCUIT_STATE` in `storage.local` for testing.

### English sounds like a different accent (e.g., Australian)
- **Resolution**: Verify `dialectPriorities` in `TTSVoiceService.js`. If the preferred dialect (e.g., `en-us`) is not in the live voice list, the system falls back to the first alphabetical match.

---
**Last Updated**: April 6, 2026
