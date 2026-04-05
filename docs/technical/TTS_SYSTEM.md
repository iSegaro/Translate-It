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
(TTSButton.vue / ActionToolbar)
       │
       ▼
[ useTTSSmart.js ] ──► (Manages local UI state: idle, loading, playing, error)
       │
       ▼ (MessageActions.GOOGLE_TTS_SPEAK)
       │
[ TTSDispatcher.js ] ◄─┐ (The Brain: Proactive Detection & Engine Selection)
       │               │
       ├─► [ TTSLanguageService.js ] (Checks engine support via PROVIDER_CONFIGS)
       │
       ├─► [ handleEdgeTTS.js ] ──► [ EdgeTTSClient.js ] (Logic-only synthesize)
       │            │
       └─► [ handleGoogleTTS.js ] ──► [ Google TTS API ]
                    │
                    ▼
[ TTSStateManager.js ] ──► [ Offscreen Document (Chrome) / Direct Audio (Firefox) ]
(Lifecycle Manager)           (Persistent environment, stop-only logic)
```

---

## Core Components

### 1. `ttsProviders.js` (The Data Vault)
The **Single Source of Truth** for the entire TTS module. It contains:
- **`PROVIDER_CONFIGS`**: Centralized object containing URLs, voice mappings, supported languages, and technical parameters (User-Agents, versions, cleaning Regex) for all engines.
- **Engine IDs**: Uses the global `TTS_ENGINES` constant to prevent magic strings.

### 2. `TTSDispatcher.js` (The Router)
The central intelligence of the system. It intercepts all speech requests and performs:
- **Proactive Detection**: If `auto` is requested or "Smart Detection" is ON, it identifies the language before the first attempt.
- **Engine Resolution**: Decides whether to use Google or Edge based on user preference and language support.
- **Smart Recovery**: If Edge fails (e.g., 0-byte audio), it triggers re-detection and falls back to the alternative engine if "Fallback" is enabled.

### 3. `TTSStateManager.js` (Unified State)
Manages the shared state across all handlers:
- **Offscreen Persistence**: Controls the lifecycle of the Offscreen document. Uses `stopAudioOnly()` instead of closing the document to eliminate latency.
- **Sender Tracking**: Ensures `GOOGLE_TTS_ENDED` events are routed back to the correct requester.

### 4. `EdgeTTSClient.js` (Neural Worker)
A **logic-only** client for Microsoft Edge TTS:
- **Emulation**: Uses dynamic session-based User IDs and modern User-Agents to mimic real browser/app traffic.
- **Authenticity**: Implements HMAC-SHA256 signatures and JWT token expiry management.
- **Auto-Refresh**: Automatically refreshes expired tokens and retries failed requests once.

### 5. `TTSLanguageService.js` (Capability Manager)
Acts as a validator for engine capabilities:
- **Logic Separation**: Decoupled from data; it fetches all support matrices from `ttsProviders.js`.
- **Engine Fallback**: Coordinates with the Dispatcher to switch engines (e.g., Google to Edge for Persian) when the primary engine lacks support.

---

## Smart Language Detection

The system uses a multi-tiered strategy (`_detectLanguage`) to identify text language:

1.  **Script Markers (100% Accuracy)**: Identifies unique characters like `پ چ ژ گ` (Persian) vs `ة` (Arabic), or Hiragana/Katakana (Japanese).
2.  **Encoding Check**: Differentiates between Persian `ی/ک` and Arabic `ي/ك` encodings.
3.  **Script Validation**: Prevents browser API false positives (e.g., stops short English words from being detected as Korean).
4.  **Instant Markers**: Detects specific Latin diacritics (like `ß` for German or `ñ` for Spanish) for ultra-fast identification.

---

## Lifecycle & State Management

### Optimized UI Reactivity
- **Error Reset**: The `useTTSSmart.js` composable explicitly clears previous error states at the beginning of each `speak()` call, ensuring the UI always reacts to retries even for identical text.
- **State Machine**: Simplified to `idle` | `loading` | `playing` | `error`. Pause/Resume logic was removed for MV3 stability.

### Reliable Messaging
- **Response Validation**: Background handlers now explicitly check the `success` field returned by the Offscreen document instead of assuming success on message delivery.
- **Failure Propagation**: Errors in the Offscreen layer (like `synthesis-failed`) are forwarded through the handler and dispatcher to immediately update the UI button state.

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

### Audio doesn't play, but UI shows "Playing"
- **Check Offscreen Console**: Look for `net::ERR_CONTENT_DECODING_FAILED`. This usually means the Edge binary data was corrupted or the Signature format is slightly off.
- **Token Cache**: Force clear `tokenCache` in `EdgeTTSClient` to re-authenticate.

### TTS Button hangs in "Loading"
- **Cause**: A failure occurred in `offscreen.js` without calling `sendResponse`.
- **Fix**: Ensure all error paths in `handleWebSpeechFallback` and `playCachedAudio` call `sendResponse({ success: false })`.

### "Google doesn't support language"
- **Resolution**: Check `src/features/tts/constants/ttsProviders.js`. If a language is in the list but fails with HTTP 400, it should be removed from the `supportedLanguages` Set to force an Edge fallback.

---
**Last Updated**: April 6, 2026