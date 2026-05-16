# Dictionary & Linguistic Features Integration Plan

This document provides a technical blueprint for integrating advanced dictionary features (Parts of Speech, Definitions, Examples, Synonyms) into the **Translate-It** project.

## 1. Overview
The goal is to evolve the current translation engine from providing simple text-to-text results to a full-featured linguistic tool. This involves utilizing specific "Lookup" and "Dictionary" endpoints/parameters from established providers.

---

### Bing Translator
Bing uses a specialized multi-request strategy for words/short phrases.

1.  **Phase 1: Detection & Base Translation**
    - **Endpoint**: `ttranslatev3`
    - Purpose: Detect language and get the primary meaning.
2.  **Phase 2: Dictionary Lookup**
    - **Endpoint**: `tlookupv3`
    - Parameters: `from`, `to`, `text`.
    - Data: Returns `posTag`, `displayTarget`, and `backTranslations` (Synonyms).
3.  **Phase 3: Examples**
    - **Endpoint**: `texamplev3`
    - Parameters: `from`, `to`, `text`, `translation`.
    - Data: Returns `examples` with `sourceTerm` and `targetTerm` for highlighting.

---

## 2. Implementation Strategy for Translate-It

### Step 1: Base Provider Update
- Update `BaseTranslateProvider` to include a flag `supportsDictionary`.
- AI Providers (Gemini/OpenAI) can be prompted to return this structure naturally using **JSON Mode**.

### Step 2: Hybrid Orchestration
Implement a `HybridCoordinator` that can:
- Fetch `mainMeaning` from a fast provider (e.g., Google).
- Fetch `definitions` and `examples` from a rich provider (e.g., Bing or an AI Provider) if the input is a single word.

### Step 3: UI Host & Components
- **DetailSection Component**: A collapsible section for Noun/Verb groupings.
- **ExampleList Component**: Renders source/target examples with HTML sanitization (for `<b>` tags).

---

## 3. Technical Caveats
1.  **Rate Limiting**: Since Dictionary APIs (especially Bing) require multiple hits, strict character-based caching is mandatory.
2.  **Sanitization**: Data from `dt=ex` or Bing Examples often contains HTML tags (`<b>`, `<i>`). Use `DOMPurify` before rendering in the Shadow DOM.
