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
Provides the project's official language list (`LANGUAGE_CODE_TO_NAME_MAP`). It acts as the "Source of Truth" (SSOT) for the **Trust Filter**, ensuring we don't adopt obscure browser detections unless they are recognized by the extension.

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
| **Latin** | `è ì ò ù` (Italian) | `it` |
| **Latin** | `ã õ` (Portuguese) | `pt` |
| **Latin** | `êëîïûùôç` (French unique markers) | `fr` |
| **Latin** | `ç` + `ığşİ` (Turkish) | `tr` |
| **Cyrillic** | `а-яё` (Russian), `ґєії` (Ukrainian) | `ru`, `uk` |
| **CJK Range** | Hiragana/Katakana (Japanese), Hangul (Korean) | `ja`, `ko` |

*Note: Common markers like `é, è, à` are intentionally skipped in the French deterministic layer to allow the Statistical Layer to provide higher precision for ambiguous Latin strings (e.g., distinguishing French from Italian or Acehnese).*

### 2. Statistical Layer (Browser API)
Utilizes `browser.i18n.detectLanguage`. Results are validated against the internal Trust Filter.

### 3. Heuristic Layer (Fallbacks)
The safety net for ambiguous strings:
- **User Preferences**: Consults `storage.local`.
- **Script Defaults**: Arabic script defaults to `fa`, Devanagari defaults to `hi`, Chinese defaults to `zh-cn`.

---

## Technical Details

### 1. Statistical Reliability Threshold (60 chars)
- Below **60 chars**, deterministic markers (Layer 1) are prioritized.
- Above **60 chars**, the Browser API is prioritized.

### 2. Trust Filter (Dynamic Context Validation)
To prevent misidentification of short strings (e.g., "hello" as Serbian `sr`), the system implements a **Context-Aware Trust Filter**:

- **Dynamic Trust Set**: A set of languages deemed "safe" to accept for short strings:
    1. **User's Context**: UI Language + Active Target Language.
    2. **Global Trusted Set**: Managed in `languageConstants.js` as `GLOBAL_TRUSTED_LANGUAGES`. Includes major world languages and explicitly supported minor languages.
- **Confidence Bypass**: If a detection has a confidence score **> 80%**, it bypasses the Trust Set restriction, allowing for accurate detection of niche languages.
- **Validation**: If a result fails both checks, it is rejected, and the system falls back to Heuristics.

### 3. Detection vs. Provider Support (Philosophy)
The system separates **Detection** from **Execution**:
- We aim to detect the *actual* language as accurately as possible (e.g., detecting `ace` for Acehnese).
- If the chosen **Translation Provider** does not support that specific code, the `ProviderCoordinator` handles the fallback (usually by retrying with `auto` or using a phonetic mapping for TTS).

---

## Development Guide

### How to use in a new module
```javascript
import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';
const detectedLang = await LanguageDetectionService.detect(someText);
```

### How to add a new Language Marker (Internal)
1.  **Engine Update**: Update `src/shared/utils/text/textAnalysis.js` regex.
2.  **Service Integration**: Update `getDeterministicResult` in `LanguageDetectionService.js`.

### How to add a new Language (Full Support)
If you want to add support for a language previously unknown to the extension:

1.  **SSOT Registration**: Add the language code and name to `LANGUAGE_NAME_TO_CODE_MAP` in `src/shared/config/languageConstants.js`. **(Critical: Without this, detection will be rejected by Validation 4).**
2.  **Provider Mapping**: Add the code to the relevant provider lists in `PROVIDER_SUPPORTED_LANGUAGES` (e.g., `google`, `bing`, `yandex`).
3.  **Trust Expansion**: Add the code to `GLOBAL_TRUSTED_LANGUAGES` in `src/shared/config/languageConstants.js`.
4.  **TTS Mapping (Optional)**: If the language lacks a native voice but uses a similar script (e.g., Acehnese using Latin), add a mapping to `TTSLanguageService.js` (e.g., `ace -> en`).

---

## Key Files

-   **`src/shared/services/LanguageDetectionService.js`**: The central orchestrator (Brain).
-   **`src/shared/utils/text/textAnalysis.js`**: Unicode analysis (Engine).
-   **`src/shared/config/languageConstants.js`**: Source of Truth for all language codes.
-   **`src/features/tts/services/TTSDispatcher.js`**: Consumer for audio synthesis.
-   **`src/features/translation/providers/LanguageSwappingService.js`**: Consumer for bilingual swapping.
-   **`src/features/tts/services/TTSLanguageService.js`**: Phonetic mappings and fallback logic.

---
**Last Updated**: April 21, 2026
