# Technical Addendum: API Provider Architecture & Payload Requirements

## 1. Context: The Provider Hierarchy
The extension uses a class-based inheritance model for translation services:
- **BaseProvider:** Handles rate limiting, proxy management, and the core `translateSegments` loop.
- **BaseTranslateProvider / BaseAIProvider:** Adds batching strategies (`character_limit` vs `smart`).
- **Implementation Classes (e.g., GoogleTranslate, GeminiProvider):** Handle the actual network requests and response parsing.

## 2. Identified Conflict in Data Flow
Currently, there is a mismatch between the DOM extraction and the Provider inputs:
- **Current Flow:** `DOM (Text Nodes)` -> `Array of Strings` -> `Provider.translate()` -> `Join("\n")` -> `API`.
- **The Issue:** This flow loses the "Segment Mapping." If we move to sentence-level translation with placeholders (e.g., `<span>0</span>`), the Provider must be aware that it is handling **HTML-formatted segments**, not plain text.

## 3. Required Changes in Provider Logic

### A. Payload Format (GoogleTranslate.js)
The `GoogleTranslateProvider` must be modified to ensure the API treats the input as HTML to protect the placeholders.
- **Action:** In the `translate` method, when calling the Google API, the request parameter must include `format=html`.
- **Data Preservation:** The logic that currently `split("\n")` the response must be more robust to ensure that if Google returns a placeholder in a different position (due to grammar), it is still correctly mapped back.

### B. Batching Integrity (BaseAIProvider.js / BaseTranslateProvider.js)
The batching logic currently only cares about character limits.
- **Constraint:** A "Translation Unit" (a sentence containing multiple placeholders) **must never be split** between two different API calls (batches). 
- **Action:** The `balancedBatching` or `character_limit` logic must be updated to treat a sentence-with-placeholders as an "Atomic Batch Item."

### C. Response Mapping
- **The Challenge:** Traditional NMTs (Google/Bing) might occasionally alter the spacing inside or around the `<span>` tags.
- **Requirement:** The `extractResponse` and `parseAndCleanTranslationResponse` functions in the Providers must be capable of cleaning up any "hallucinated" spaces added by the translator inside the placeholder tags (e.g., converting `<span translate="no"> 0 </span>` back to `<span>0</span>`).

## 4. Provider Interface Specification
When refactoring, ensure the following interface is maintained:
- **Input:** `texts` (Array of strings, potentially containing HTML placeholders).
- **Options:** `from`, `to`, `abortController`.
- **Output:** `Array<string>` of the same length as the input, where each element corresponds to the translated version of the input segment.

## 5. Implementation Note for AI
When rewriting the `translate` methods:
1. Detect if the input string contains HTML tags.
2. If yes, force the API to `HTML` mode.
3. Post-process the output to ensure placeholders (`[0]` or `<span>0</span>`) are intact and properly formatted for the `reassembleTranslations` logic in `textProcessing.js`.
