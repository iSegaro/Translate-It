# Language Detection System

## Overview

The **Language Detection System** is a high-precision, multi-layered architecture designed to identify the language of a given text. It is specifically optimized to distinguish between languages with similar scripts (e.g., Persian vs. Arabic) and to handle both short user inputs and large-scale web content translation.

**Architecture Status**: Production Ready (Hybrid & Context-Aware)
**Key Metrics**: 100% deterministic for unique script markers, optimized statistical analysis for long texts.

---

## The Philosophy: Precision over Probability

The system is built on the principle that **Deterministic Evidence** (unique characters) should always outweigh **Statistical Guessing**, especially for short strings where browser APIs often fail.

1.  **Certainty First**: If a text contains the character "گ", it is Persian. No statistical model is needed to confirm this.
2.  **Context Sensitivity**: The reliability of detection methods changes with text length. Statistical models (Browser API) get better as text grows longer, while character-based detection is instant and reliable even for single words.
3.  **Graceful Degradation**: When certainty and statistics fail, the system falls back to user preferences and script-based defaults.

---

## Architecture

The system follows a **Dynamic Three-Layer Flow** that reorders itself based on the input length.

```
[ Input Text ]
      │
      ▼
[ Length Check ] ─── (Threshold: 60 chars) ───┐
      │                                       │
      ▼ (Short Text)                          ▼ (Long Text)
┌──────────────────────────┐            ┌──────────────────────────┐
│ 1. Deterministic Layer   │            │ 1. Statistical Layer     │
│    (Unique Markers)      │            │    (Browser i18n API)    │
└─────────────┬────────────┘            └─────────────┬────────────┘
              │                                       │
┌─────────────▼────────────┐            ┌─────────────▼────────────┐
│ 2. Statistical Layer     │            │ 2. Deterministic Layer   │
│    (Browser i18n API)    │            │    (Unique Markers)      │
└─────────────┬────────────┘            └─────────────┬────────────┘
              │                                       │
              └───────────────┬───────────────────────┘
                              ▼
                ┌──────────────────────────┐
                │ 3. Heuristic Layer       │
                │    (User Prefs/Defaults) │
                └──────────────────────────┘
```

---

## Detection Layers

### 1. Deterministic Layer (Unique Markers)
This layer uses regular expressions to find "Smoking Gun" characters that exist in only one language within a script family.
- **Arabic Script**: Distinguishes **Persian** (`پ چ ژ گ ک ی`), **Arabic** (`ة ي ك ى`), **Urdu** (`ٹ ڈ ڑ`), and **Pashto**.
- **Chinese Script**: Distinguishes **Simplified** (`们 国`) from **Traditional** (`們 國`).
- **Devanagari Script**: Distinguishes **Marathi** (`ळ`) from **Hindi**.

### 2. Statistical Layer (Browser API)
Utilizes `browser.i18n.detectLanguage`. 
- **Reliability Check**: Only accepts the result if the API marks it as `isReliable: true`.
- **Strength**: Excellent for European languages and long, mixed-content paragraphs.

### 3. Heuristic Layer (Fallbacks)
The safety net for ambiguous strings (e.g., "سلام").
- **User Preferences**: Consults `storage.local` for user-defined priorities (e.g., "Always prefer Persian for Arabic script").
- **Script Defaults**: Uses the most likely language for a script if no other data is available.

---

## Core Components

### 1. `LanguageSwappingService.js` (The Orchestrator)
- **Method**: `getDetectedLanguage(text)`
- **Role**: Coordinates the layers, handles the length-based logic, and manages the asynchronous flow between script analysis and Browser APIs.

### 2. `textAnalysis.js` (The Engine)
- **Method**: `detectArabicScriptLanguage`, `detectChineseScriptLanguage`, etc.
- **Role**: Contains the "Low-Level" یونیکد analysis logic. It has a `useDefaults` toggle to separate "Definitive Detection" from "Heuristic Guessing".

---

## Technical Details

### Length-Based Optimization
The system uses a `STATISTICAL_RELIABILITY_THRESHOLD = 60`.
- **Why 60?** Statistical models typically require enough "context" (words/bigrams) to be accurate. Below this threshold, a single unique character is a much stronger signal than a probability score.

### Usage in Swapping Logic
The detection system is the heart of **Bilingual Swapping**. If the detected source language matches the user's target language, the system automatically swaps the target to a fallback (e.g., English) to ensure the user always gets a meaningful translation.

---

## Development Guide

### Adding a New Language Marker
1. Open `src/shared/utils/text/textAnalysis.js`.
2. Find the relevant script detection function.
3. Add the unique Unicode characters to the `ExclusiveChars` regex.
4. Ensure the language code is added to the constants at the top of the file.

### Adjusting Thresholds
If you notice that long mixed-language pages are being misidentified, consider lowering the `STATISTICAL_RELIABILITY_THRESHOLD` in `LanguageSwappingService.js`.

---

## Key Files

- `src/features/translation/providers/LanguageSwappingService.js`: Main detection entry point.
- `src/shared/utils/text/textAnalysis.js`: Character-level detection logic.
- `src/shared/config/languageConstants.js`: Language code mappings and canonical names.

---
**Last Updated**: April 21, 2026
