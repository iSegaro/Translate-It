# Language Detection System

## Overview

The **Language Detection System** is a centralized, high-precision architecture designed to identify the language of any text across the extension (Translation, TTS, and UI Swapping). It uses a hybrid approach that combines deterministic script analysis with statistical models, dynamically adjusting its strategy based on text length and project-wide language constants.

**Architecture Status**: Unified & Production Ready  
**Single Source of Truth**: `LanguageDetectionService.js`  
**Key Metrics**: 100% deterministic for unique script markers, trust-filtered for short strings.

---

## 🏗 Architecture & Flow

The system follows a **Dynamic Three-Layer Flow** that reorders itself based on the input length to maximize accuracy.

### Dynamic Flow Diagram
```
       [ Input Text ]
             │
             ▼
      [ Length Check ] ─── (Threshold: 60 chars) ───┐
             │                                      │
      ▼ (Short Text)                         ▼ (Long Text)
┌──────────────────────────┐           ┌──────────────────────────┐
│ 1. Deterministic Layer   │           │ 1. Statistical Layer     │
│    (Unique Markers)      │           │    (Browser i18n API)    │
└─────────────┬────────────┘           └─────────────┬────────────┘
              │                                     │
┌─────────────▼────────────┐           ┌─────────────▼────────────┐
│ 2. Statistical Layer     │           │ 2. Deterministic Layer   │
│    (Browser i18n API)    │           │    (Unique Markers)      │
└─────────────┬────────────┘           └─────────────┬────────────┘
              │                                     │
              └───────────────┬─────────────────────┘
                              ▼
                ┌──────────────────────────┐
                │ 3. Heuristic Layer       │
                │    (User Prefs / Defaults)│
                └──────────────────────────┘
```

---

## Core Components

### 1. `LanguageDetectionService.js` (The Brain)
The central orchestrator for all detection requests. It manages the dynamic flow logic, threshold checks, and asynchronous coordination between the script engine and Browser APIs. All other services (TTS, Translation) **must** use this service to ensure consistency.

### 2. `textAnalysis.js` (The Engine)
Contains low-level Unicode range analysis and script-specific detection functions. It differentiates between "Definitive Markers" (using `useDefaults: false`) and "Heuristic Guessing" (using `useDefaults: true`).

### 3. `languageConstants.js` (The Validator)
Provides the project's official language list (`LANGUAGE_CODE_TO_NAME_MAP`). It acts as the "Source of Truth" for the **Trust Filter**, ensuring we don't adopt obscure browser detections for short strings.

---

## 🔍 Detection Layers & Supported Markers

### 1. Deterministic Layer (The "Smoking Gun")
Uses specialized Regex to find characters unique to specific languages.

| Script Family | Language Markers | Detected Code |
| :--- | :--- | :--- |
| **Arabic** | `پ چ ژ گ ک ی` (Persian-specific) | `fa` |
| **Arabic** | `ة ي ك ى` (Arabic-specific) | `ar` |
| **Arabic** | `ٹ ڈ ڑ ں ہ ے` (Urdu-specific) | `ur` |
| **Arabic** | `ښ څ ډ ړ ږ ښ ګ` (Pashto-specific) | `ps` |
| **Chinese** | `们 国 学 会 这` (Simplified) | `zh-cn` |
| **Chinese** | `們 國 學 會 這` (Traditional) | `zh-tw` |
| **Devanagari**| `ळ` (Marathi-unique) | `mr` |
| **Latin** | `ß` (German), `ñ` (Spanish), `å ø æ` (Nordic) | `de`, `es`, `no` |
| **Latin** | `ç` + `ığşİ` (Turkish) | `tr` |
| **Cyrillic** | `а-яё` | `ru` |
| **CJK Range** | Hiragana/Katakana (Japanese), Hangul (Korean) | `ja`, `ko` |

### 2. Statistical Layer (Browser API)
Utilizes `browser.i18n.detectLanguage`. Results are only accepted if `isReliable` is true and they pass the internal validation logic.

### 3. Heuristic Layer (Fallbacks)
The safety net for ambiguous strings (e.g., "سلام"):
- **User Preferences**: Consults `storage.local` for user priorities.
- **Script Defaults**: Arabic script defaults to `fa`, Devanagari defaults to `hi`, Chinese defaults to `zh-cn`.

---

## Technical Details

### 1. Statistical Reliability Threshold (60 chars)
Statistical models require context (words/density) to be accurate. 
- Below **60 chars**, a single "Smoking Gun" character is considered more reliable than an API's probability score.
- Above **60 chars**, the API is prioritized as it can better identify the "dominant" language in mixed-content nodes.

### 2. Trust Filter (Dynamic Context Validation)
To prevent misidentification of short/ambiguous strings (e.g., detecting "hello" as Serbian `sr`), the system implements a **Context-Aware Trust Filter**:

- **Reliability Check**: If the Browser API's result is marked as `isReliable: false`, the filter is activated for strings shorter than 25 characters.
- **Dynamic Trust Set**: The system dynamically constructs a set of "Expected Languages" based on:
    1. **User's UI Locale**: The language of the extension's interface.
    2. **Active Target Language**: The language the user is currently translating into.
    3. **Global Bridge (en)**: English is always trusted for Latin script.
- **Validation**: If the detected language is not in this **Dynamic Trust Set**, the result is rejected as "unreliable," and the system falls back to Layer 3 (Heuristics).

### 3. Script/Result Consistency
Every statistical result is cross-checked against the text's physical script family. For example, if the API returns 'en' for a text containing Arabic characters, the result is automatically discarded. This prevents logic crashes in downstream services like TTS which expect specific voice engines for specific scripts.

---

## Development Guide

### How to use in a new module
Always import the centralized service. Do NOT use `textAnalysis.js` directly for detection.
```javascript
import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';

const detectedLang = await LanguageDetectionService.detect(someText);
```

### How to add a new Language Marker
1.  **Engine Update**: Open `src/shared/utils/text/textAnalysis.js` and add the unique Unicode characters to the relevant regex.
2.  **SSOT Registration**: ensure the language code is in `LANGUAGE_NAME_TO_CODE_MAP` in `languageConstants.js`.
3.  **Service Integration**: Open `src/shared/services/LanguageDetectionService.js` and add the new check in `getDeterministicResult`.

---

## Key Files

-   **`src/shared/services/LanguageDetectionService.js`**: The central orchestrator (Brain).
-   **`src/shared/utils/text/textAnalysis.js`**: Low-level Unicode analysis (Engine).
-   **`src/shared/config/languageConstants.js`**: Official supported languages (Source of Truth).
-   **`src/features/tts/services/TTSDispatcher.js`**: Consumer for audio synthesis.
-   **`src/features/translation/providers/LanguageSwappingService.js`**: Consumer for bilingual swapping.

---
**Last Updated**: April 21, 2026
