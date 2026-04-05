# TTS (Text-to-Speech) System Documentation

## Overview

The Text-to-Speech (TTS) system in Translate-It is a **multi-engine, context-aware** audio architecture. It provides high-quality neural voices through **Microsoft Edge TTS** and reliable fallback via **Google TTS**. The system is designed for maximum stability, zero-latency playback, and intelligent language detection across all extension contexts (Popup, Sidepanel, and WindowsManager).

**Unified Modular Architecture**: The system follows a "Provider-less Dispatcher" pattern, where a central controller manages state, engine selection, and error recovery without leaking complexity to the UI.

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
       ├─► [ TTSLanguageService.js ] (Checks engine support: Google vs Edge)
       │
       ├─► [ handleEdgeTTS.js ] ──► [ EdgeTTSClient.js ] (HTTP + Signature)
       │            │
       └─► [ handleGoogleTTS.js ] ──► [ Google TTS API ]
                    │
                    ▼
[ TTSStateManager.js ] ──► [ Offscreen Document (Chrome) / Direct Audio (Firefox) ]
(Single Source of Truth)      (Persistent environment, stop-only logic)
```

---

## Core Components

### 1. `TTSDispatcher.js` (The Router)
The central intelligence of the system. It intercepts all speech requests and performs:
- **Proactive Detection**: If `auto` is requested or "Smart Detection" is ON, it identifies the language before the first attempt.
- **Engine Resolution**: Decides whether to use Google or Edge based on user preference and language support.
- **Smart Recovery**: If Edge fails (e.g., 0-byte audio), it triggers re-detection and falls back to Google as a safety net.

### 2. `TTSStateManager.js` (Unified State)
Manages the shared state across all handlers:
- **Offscreen Persistence**: Controls the lifecycle of the Offscreen document. Uses `stopAudioOnly()` instead of closing the document to eliminate latency in consecutive requests.
- **Sender Tracking**: Ensures `GOOGLE_TTS_ENDED` events are routed back to the correct requester (Popup vs Sidepanel).
- **Deduplication**: Prevents redundant requests for the same text/language pair.

### 3. `EdgeTTSClient.js` (Neural Engine)
A high-performance client for Microsoft Edge TTS:
- **Authenticity**: Uses HMAC-SHA256 signatures to mimic Edge browser requests.
- **Efficiency**: Implements token caching to reduce network overhead.
- **Native Support**: Provides high-quality Persian (`fa-IR`) voices without needing Arabic fallbacks.

### 4. `TTSLanguageService.js` (Capability Manager)
Acts as a validator for engine capabilities:
- **Support Matrix**: Knows which engine supports which ISO codes.
- **Engine Fallback**: If Google doesn't support Persian, it signals the Dispatcher to switch to Edge (if Fallback is enabled in settings).

---

## Smart Language Detection

The system uses a multi-tiered strategy (`_detectLanguage`) to identify text language:

1.  **Script Markers (100% Accuracy)**: Identifies unique characters like `پ چ ژ گ` (Persian) vs `ة` (Arabic), or Hiragana/Katakana (Japanese).
2.  **Encoding Check**: Differentiates between Persian `ی/ک` and Arabic `ي/ك`.
3.  **Script Validation**: Prevents browser API false positives (e.g., stops short English words from being detected as Korean).
4.  **Native API**: Uses `browser.i18n.detectLanguage` as a high-speed arbiter for Latin-based languages.

---

## Lifecycle & State Management

### Simplified State Machine
The system has been simplified by **removing Pause/Resume** logic, which was unstable in MV3.
- **States**: `idle` | `loading` | `playing` | `error`.
- **Toggle Logic**: Clicking while playing now performs a full `Stop`.

### Persistent Offscreen (Chrome)
To ensure 60fps performance and instant audio:
- The Offscreen document is created only when needed.
- `TTS_STOP` now only pauses the `Audio` element and clears the `src`, keeping the document alive for the next request.

---

## User Configuration

Users can control the system through the **TTS Tab** in Options:
- **TTS Engine**: Default preference (Google or Edge).
- **Engine Fallback**: Allows automatic switching to the other engine if the preferred one doesn't support the language.
- **Smart Language Detection**: Enables/disables automatic language correction on failure.

---

## Browser Compatibility

| Feature | Chromium (Chrome/Edge) | Firefox |
| :--- | :--- | :--- |
| **Playback** | Offscreen Document | Direct Background Audio |
| **Edge TTS** | Supported (HTTP + Signature) | Supported |
| **Detection** | Native `i18n` + Script Analysis | Native `i18n` + Script Analysis |
| **Cleanup** | `stopAudioOnly()` | `Audio.pause() + null` |

---

## Troubleshooting for Developers

### Audio doesn't play, but UI shows "Playing"
- **Check Offscreen Console**: Look for `net::ERR_CONTENT_DECODING_FAILED` or `403 Forbidden`. This usually means the Edge Signature or Token is invalid.
- **Message Path**: Verify `TTSStateManager` has the correct `currentTTSSender`.

### TTS Button hangs in "Loading"
- **Cause**: A handler didn't call `sendResponse` in the Offscreen document.
- **Fix**: Ensure all `catch` blocks in `offscreen.js` return a `{ success: false }` response.

### "Edge returned empty audio data"
- **Cause**: Language mismatch (e.g., sending Persian text to an English-only voice).
- **Resolution**: Ensure `TTS_AUTO_DETECT_ENABLED` is ON or the correct voice is mapped in `TTSLanguageService`.

---
**Last Updated**: April 2026
