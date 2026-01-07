# Change: Add Contextual Sentence Translation with Streaming Support

## Why

The Select Element system currently extracts text at the node level (atomic extraction), breaking sentences into fragments when inline elements are present. For example, `Agent <em>Zero</em> AI` is extracted as three separate fragments: `["Agent ", "Zero", " AI"]`.

This causes poor translation quality for **ALL languages** because:
1. Translation providers receive fragments without grammatical context
2. Word order, verb conjugation, and sentence structure depend on complete context
3. Inline tags (<em>, <strong>, <a>, <code>) break technical sentences into 10+ fragments on sites like GitHub

**Impact by Language Family**:
- **RTL Languages** (Persian, Arabic, Hebrew): Word order reversed, verb position changes
- **Inflected Languages** (Russian, German, Latin, Eastern European): Case endings, gender agreement, sentence structure
- **Analytic Languages** (English, Chinese): Fragment context still critical for accurate meaning
- **Agglutinative Languages** (Turkish, Finnish, Korean): Morpheme boundaries depend on context
- **All Languages**: Any translation benefits from full sentence grammatical context

### The Streaming Problem

The initial placeholder implementation did not consider **streaming translation workflow**. When streaming was enabled:

**Symptoms:**
- **Sentence misplacement**: Translated sentences appeared in wrong positions
- **Page corruption**: DOM structure was broken during streaming updates
- **Placeholder loss**: Inline elements were lost before final reassembly

**Root Cause:**
The placeholder system and streaming system were fundamentally incompatible:
- **Placeholder system**: Expected to preserve original DOM structure until translation completed, then perform single reassembly
- **Streaming system**: Applied progressive updates to individual text nodes, destroying the placeholder registry references

**Current Workaround (Not Ideal):**
Recent commits detect placeholder translations and skip streaming for them, but this defeats the purpose of streaming by removing real-time feedback.

**Goal**: Transition from "Atomic Node Translation" to "Contextual Sentence Translation with Streaming Support" for **ALL providers** while maintaining real-time streaming feedback.

### Critical Technical Challenges

**Challenge 1: Nested Elements (Subtree Extraction)**

When inline elements are nested, the placeholder system must capture the **entire subtree**, not just the outer element:

```
Input: <a href="#">Link with <em>emphasis</em></a>
WRONG: [0] → <a> only (loses <em>)
CORRECT: [0] → <a href="#">Link with <em>emphasis</em></a> (complete subtree)
```

The `PlaceholderRegistry` must store the complete HTML subtree for nested elements to preserve the internal structure during reassembly.

**Challenge 2: Atomic Batching for Placeholders**

The provider batching system must **never split text with placeholders** across multiple batches:

```
Input: "Hello [0] wonderful [1] world!"
DANGEROUS: Batch 1: "Hello [0] wonderful"  ← placeholder open!
           Batch 2: "[1] world!"           ← placeholder closed!
REASSEMBLY FAILS!

REQUIRED: Single batch: "Hello [0] wonderful [1] world!"
```

**Rule**: When `placeholderRegistry` is present, disable character_limit batching and send the entire text as a single atomic unit.

**Challenge 3: Unified Placeholder Format**

To avoid "double logic" for AI vs traditional providers, use a **unified placeholder format**:

```
AI Providers:        [0], [1], [2]           (simple numeric markers)
Traditional Providers: <span translate="no" data-id="0">0</span>  (HTML markers)
```

This approach:
- **Unifies code paths** - single extraction/reassembly logic for all providers
- **Preserves placeholders** in traditional providers using `translate="no"`
- **Eliminates double logic** - no separate code paths for AI vs traditional

## What Changes

- **ADDED**: Placeholder-based text extraction system with streaming awareness
- **ADDED**: Streaming coordination layer for placeholder translations
- **MODIFIED**: Text extraction to use block-level grouping with inline element placeholders
- **MODIFIED**: Streaming update service to preserve placeholder structure during progressive updates
- **MODIFIED**: Reassembly logic to work with both streaming and non-streaming results
- **MODIFIED**: Provider prompts to include placeholder preservation instructions (AI providers)
- **ADDED**: Fallback mechanism for when placeholders cannot be preserved during streaming

### Key Features

1. **Block-Level Extraction**: Group text by block-level containers (P, DIV, LI, H1-H6)

2. **Placeholder System with Subtree Support**:
   - Replace inline elements with `[0]`, `[1]`, `[2]` markers (AI) or `<span translate="no">` (Traditional)
   - **Nested element handling**: Captures complete subtrees (e.g., `<a>link <em>with</em> emphasis</a>` as one unit)
   - Stores HTML subtree in registry for accurate reassembly

3. **Atomic Batching Protection**: When placeholders detected, disables character_limit batching to prevent placeholder splitting

4. **Unified Placeholder Format**: Single extraction/reassembly logic for all providers using provider-specific marker formats

5. **Streaming-Aware Placeholders**: Real-time streaming updates that preserve placeholder structure:
   - During streaming: Apply text translations only, preserve placeholder markers
   - At completion: Perform final reassembly with original inline elements

6. **Provider-Aware Marker Format**:
   - **AI providers** (Gemini, OpenAI, Claude, DeepL): Use `[0]`, `[1]` numeric markers
   - **Traditional providers** (Google, Yandex, Bing): Use `<span translate="no" data-id="0">0</span>` HTML markers

7. **Robust Reassembly**: Parse translated text and reinsert original DOM subtrees at placeholder positions

8. **Fallback Mechanism**: Gracefully degrade to atomic extraction if streaming breaks placeholders

### Example Transformation

```
Example 1: Simple Inline Elements
─────────────────────────────────────────────────────────────────────────
Original: <p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>
Extracted: "Agent [0] AI [1]!"
Mapping: [0] → <em>Zero</em>, [1] → <strong>rocks</strong>

Streaming Update 1: "عامل [0] هوش"
Streaming Update 2: "عامل [0] هوش مصنوعی [1]!"
Final Translated: "عامل [0] هوش مصنوعی [1] عالی است!"
Reassembled: <p>عامل <em>Zero</em> هوش مصنوعی <strong>rocks</strong> عالی است!</p>

Example 2: Nested Elements (Subtree Extraction)
─────────────────────────────────────────────────────────────────────────
Original: <p>Click <a href="#">here <em>now</em></a> to continue</p>
Extracted: "Click [0] to continue"
Mapping: [0] → <a href="#">here <em>now</em></a>  (Complete subtree!)

Translated: "روی [0] کلیک کنید برای ادامه"
Reassembled: <p>روی <a href="#">here <em>now</em></a> کلیک کنید برای ادامه</p>
NOTE: The nested <em> is preserved inside the <a> element

Example 3: Atomic Batching Protection
─────────────────────────────────────────────────────────────────────────
Input: "Hello [0] wonderful [1] world!" (2000 characters, exceeds limits)
Normal Batching: Would split at character limit → BREAKS PLACEHOLDERS!
Placeholder Batching: SINGLE BATCH → Preserves placeholder integrity
Batch 1: "Hello [0] wonderful [1] world!"  (Complete text, unsplit)
```

### Streaming Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ EXTRACTION PHASE                                                │
├─────────────────────────────────────────────────────────────────┤
│ 1. Detect block container: <p>Agent <em>Zero</em> AI</p>       │
│ 2. Extract with placeholders: "Agent [0] AI"                   │
│ 3. Build registry: [0] → <em>Zero</em>                         │
│ 4. Mark request as placeholder-aware                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STREAMING PHASE (Preserves Placeholders)                       │
├─────────────────────────────────────────────────────────────────┤
│ Update 1: "عامل [0] هوش" → Apply text portions only            │
│ Update 2: "عامل [0] هوش مصنوعی" → Apply text portions only      │
│ Update 3: "عامل [0] هوش مصنوعی [1]" → Apply text portions only  │
│                                                                  │
│ CRITICAL: Inline elements [0], [1] preserved in registry       │
│ CRITICAL: Only text content between placeholders updated       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ REASSEMBLY PHASE (Stream Completion)                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. Parse final translation for placeholder markers             │
│ 2. Replace [0] with <em>Zero</em> from registry                │
│ 3. Replace [1] with original element from registry             │
│ 4. Apply complete HTML to block container                      │
└─────────────────────────────────────────────────────────────────┘
```

## Impact

### Affected Specs
- `specs/element-selection/spec.md` - MODIFIED "Text Extraction" and "Translation Application" requirements
- `specs/element-selection/streaming-placeholder-integration.md` - NEW spec for streaming + placeholder interaction

### Affected Code

**New Files** (5):
- `src/features/element-selection/utils/PlaceholderRegistry.js` - Placeholder mapping with subtree storage, streaming state, and unified format support
- `src/features/element-selection/utils/blockLevelExtraction.js` - Block-level detection with nested element subtree extraction
- `src/features/element-selection/utils/placeholderReassembly.js` - Reassembly logic with nested subtree support and unified format parsing
- `src/features/element-selection/utils/streamingPlaceholderHandler.js` - Streaming coordination for placeholder translations
- `src/features/translation/providers/batchingProtection.js` - **NEW**: Atomic batching enforcement for placeholder translations

**Modified Files** (10):
- `src/features/element-selection/utils/domManipulation.js` - Add placeholder-based extraction routing with subtree support
- `src/features/element-selection/managers/services/TextExtractionService.js` - Provider detection and placeholder flag with unified format
- `src/features/element-selection/managers/services/DOMNodeMatcher.js` - Placeholder-aware reassembly with nested elements
- `src/features/element-selection/utils/textProcessing.js` - Preserve placeholders during processing with format detection
- `src/features/element-selection/managers/services/StreamingUpdateService.js` - **NEW**: Placeholder-aware streaming application
- `src/features/element-selection/managers/services/StreamEndService.js` - **NEW**: Enhanced streaming-to-placeholder coordination
- `src/features/element-selection/managers/services/TranslationOrchestrator.js` - **NEW**: Route to placeholder streaming with atomic batching
- `src/shared/messaging/core/StreamingResponseHandler.js` - **NEW**: Streaming coordination for placeholder translations
- `src/features/translation/providers/BaseAIProvider.js` - Atomic batching protection and placeholder prompts
- `src/features/translation/providers/BaseTranslateProvider.js` - **NEW**: Atomic batching for traditional providers with placeholders

### Scope Limitations

- **Target**: ALL providers (AI + Traditional)
  - **AI Providers**: Gemini, OpenAI, Claude, DeepL
  - **Traditional Providers**: Google, Yandex, Bing, DeepL-free
- **Mode**: Select Element only (not selection, field, or popup modes)
- **Streaming Compatibility**: Full integration with streaming translation workflow
  - Real-time progress feedback for placeholder translations
  - Progressive text updates with preserved inline elements
  - Fallback to atomic extraction if streaming breaks placeholders
- **Backward Compatibility**: Fallback to atomic extraction if placeholder system fails

### Key Discovery: Traditional Providers Support Placeholders Natively

Analysis revealed that traditional providers preserve placeholder markers `[0]`, `[1]`, `[2]` as literal text during translation:
- **Google Translate**: Treats placeholders as literal text, no modifications needed
- **DeepL**: `preserve_formatting=1` helps maintain structure
- **Yandex**: Simple API preserves literal text
- **Bing**: May need batching protection for long texts with placeholders

This eliminates the need for provider-specific prompt modifications for traditional providers.

### Expected Outcomes

**Translation Quality:**
- 90%+ reduction in sentence fragmentation for AI providers
- 70%+ improvement in translation quality across all supported languages (user surveys)
  - RTL languages (Persian, Arabic): 80%+ improvement (word order restoration)
  - Inflected languages (Russian, German): 75%+ improvement (case/agreement context)
  - Asian languages (Chinese, Japanese, Korean): 70%+ improvement (sentence structure)
  - Analytic languages (English, Chinese): 65%+ improvement (context preservation)
- 95%+ placeholder preservation rate

**Broad Language Support:**
The system supports 100+ languages including:
- **RTL**: Persian, Arabic, Hebrew, Urdu, Kurdish
- **European**: English, Spanish, French, German, Italian, Portuguese, Russian, Polish, Dutch
- **Asian**: Chinese (Simplified/Traditional), Japanese, Korean, Vietnamese, Thai, Indonesian
- **Middle Eastern**: Turkish, Arabic, Hebrew, Persian, Urdu
- **Others**: Hindi, Bengali, Tamil, Telugu, and 80+ more

**Streaming Performance:**
- Real-time segment-based feedback for placeholder translations
- No page corruption or sentence misplacement during translation
- Graceful fallback when placeholders cannot be preserved
- <10% increase in translation processing time
- Progressive text updates showing translation in real-time

**Compatibility:**
- No regression for traditional providers (Google, Yandex, Bing, DeepL-free)
- Full support for all translation providers (10+ providers)
- Backward compatibility with atomic extraction fallback
- Works seamlessly across all language pairs

## Implementation Phases

### Phase 1: Streaming-Aware Placeholders (CRITICAL)

**Goal**: Make streaming updates work WITH placeholders instead of against them.

**Changes:**

1. **Modify `StreamingUpdateService`**:
   - Detect placeholder registry in request
   - Route to placeholder-aware streaming when detected
   - Apply translations to text portions only, preserve placeholder markers

2. **Add Placeholder-Aware Streaming Logic**:
   - Parse translated text for placeholders: "سلام [0] جهان [1]"
   - Apply translation to text portions while preserving placeholder markers
   - Don't modify DOM structure until stream completion

3. **Update `PlaceholderRegistry`**:
   - Track streaming state: `isStreaming = true/false`
   - Track which placeholders have been updated
   - Maintain mapping of placeholder IDs to DOM positions

### Phase 2: Hybrid Streaming (HIGH)

**Goal**: Show real-time progress while preserving placeholder structure.

**Approach:**

1. **During Streaming**:
   - Extract text portions between placeholders
   - Stream translation for text portions only
   - Update text nodes without touching inline elements
   - Show progress: "Translating segment 1/3..."

2. **At Stream Completion**:
   - Combine all streaming results
   - Perform final placeholder reassembly
   - Apply complete translation with original inline elements

### Phase 3: Fallback & Recovery (MEDIUM)

**Goal**: Handle edge cases where placeholders break during streaming.

**Mechanisms:**

1. **Placeholder Validation**:
   - Check if streaming preserved placeholder markers
   - Detect missing/modified placeholders: `[0]` → `[ 0 ]` or gone
   - Validate placeholder count matches expected

2. **Fallback Triggers**:
   - If placeholders are missing or modified
   - If provider stripped placeholders from translation
   - If registry references become invalid

3. **Atomic Extraction Fallback**:
   - Extract text at node level (original behavior)
   - Translate without placeholders
   - Accept sentence fragmentation as trade-off

## Critical Implementation Notes

1. **DOM Structure Preservation**: During streaming, NEVER replace the block container's innerHTML until stream completion.

2. **Subtree Extraction for Nested Elements**: When extracting placeholders for nested inline elements (e.g., `<a>text <em>more</em></a>`), capture the **complete HTML subtree** including all descendants, not just the outer element.

3. **Atomic Batching Enforcement**: When `placeholderRegistry` is present, **override character_limit batching** and send the entire text as a single batch. Never split text with placeholders across multiple API calls.

4. **Multi-Layer Smart Chunking with Intl.Segmenter**: When character_limit batching is unavoidable (very long texts), the chunking logic in `BaseTranslateProvider` must use a **hierarchical strategy** that works across all 100+ supported languages:

   **Layer 1: Placeholder Boundary Protection (HARD RULE - UNBREAKABLE)**
   ```javascript
   // CRITICAL: Never split inside or adjacent to placeholder markers
   const PLACEHOLDER_BOUNDARY_REGEX = /\[\[AIWC-\d+\]\]/g;

   function isInsidePlaceholder(text, position) {
     // Find all placeholder positions
     const matches = [...text.matchAll(PLACEHOLDER_BOUNDARY_REGEX)];
     for (const match of matches) {
       if (position >= match.index && position < match.index + match[0].length) {
         return true; // Position is inside placeholder marker
       }
       // Also protect 2 characters before and after placeholders
       if (Math.abs(position - match.index) <= 2 || Math.abs(position - (match.index + match[0].length)) <= 2) {
         return true;
       }
     }
     return false;
   }
   ```

   **Layer 2: Universal Boundary Detection**
   - Break at double newlines (`\n\n`) - paragraph boundaries (universal across all languages)
   - Break at single newlines (`\n`) - line boundaries

   **Layer 3: Language-Aware Sentence Boundary (GOLD STANDARD)**
   ```javascript
   // Use Intl.Segmenter API - browser standard for sentence boundary detection
   // Works for ALL 100+ languages including Chinese, Japanese, Thai, Arabic, etc.
   function splitIntoSentences(text, sourceLanguage) {
     const segmenter = new Intl.Segmenter(sourceLanguage, { granularity: 'sentence' });
     const segments = segmenter.segment(text);
     return Array.from(segments).map(s => s.segment);
   }

   // Example usage:
   // English: "Dr. Smith lives in the U.S.A. He is happy."
   //   → ["Dr. Smith lives in the U.S.A. ", "He is happy."]  // Correctly detects abbreviations!

   // Chinese: "你好。世界！你好吗？"
   //   → ["你好。", "世界！", "你好吗？"]  // Works even without dots!

   // Japanese: "こんにちは。世界！元気ですか？"
   //   → ["こんにちは。", "世界！", "元気ですか？"]  // Respects Japanese punctuation!
   ```

   **Layer 4: Character Limit Fallback (Last Resort)**
   - Only when a single sentence/segment exceeds `character_limit`
   - Warn in logs that this is non-ideal chunking

   **Complete Implementation**:
   ```javascript
   function smartChunkWithPlaceholders(text, limit, sourceLanguage = 'en') {
     if (text.length <= limit) return [text];

     // Step 1: Try paragraph boundaries first
     let chunks = splitAtParagraphBoundaries(text, limit);
     if (chunks.length > 1) return chunks;

     // Step 2: Use Intl.Segmenter for sentence boundaries
     const sentences = splitIntoSentences(text, sourceLanguage);
     chunks = groupSentencesIntoChunks(sentences, limit);

     // Step 3: Validate no placeholder was split
     for (const chunk of chunks) {
       if (isPlaceholderSplit(chunk)) {
         // Fallback to single chunk if placeholder would be split
         this.logger.warn('Cannot chunk without splitting placeholder, using single batch');
         return [text];
       }
     }

     return chunks;
   }

   function groupSentencesIntoChunks(sentences, limit) {
     const chunks = [];
     let currentChunk = '';
     let currentLength = 0;

     for (const sentence of sentences) {
       const sentenceLength = sentence.length;

       // If adding this sentence would exceed limit
       if (currentLength + sentenceLength > limit && currentChunk.length > 0) {
         chunks.push(currentChunk.trim());
         currentChunk = sentence;
         currentLength = sentenceLength;
       } else {
         currentChunk += sentence;
         currentLength += sentenceLength;
       }
     }

     if (currentChunk.length > 0) {
       chunks.push(currentChunk.trim());
     }

     return chunks;
   }
   ```

   **Benefits of Intl.Segmenter**:
   - ✅ **Zero maintenance**: No abbreviation lists to update
   - ✅ **100+ languages**: Works for all supported languages out of the box
   - ✅ **Culture-aware**: Knows that "Mr." in English, "Dr." in German, "p.ej." in Spanish are abbreviations
   - ✅ **Script-aware**: Handles Chinese/Japanese (no sentence-ending dots), Thai, Arabic, Hindi correctly
   - ✅ **Browser standard**: Supported in Chrome 87+, Firefox 125+, Safari 14.1+
   - ✅ **Fallback available**: Polyfill available for older browsers

5. **DOM Reference Resilience with Unique Identifiers**: In `PlaceholderRegistry`, add a unique identifier to each element before storing:
   ```javascript
   const uniqueId = `aiwc-orig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
   element.setAttribute('data-aiwc-original-id', uniqueId);
   this.placeholders.set(id, { root: element, html: outerHTML, uniqueId });
   ```

6. **Unique Placeholder Format to Avoid Regex Collisions**: CRITICAL - The simple `[0]` format will collide with code snippets on sites like GitHub. Use a more distinctive format:
   ```javascript
   // WRONG: Collides with code like "array[0]"
   format: "[0]"

   // CORRECT: Distinctive format that won't occur naturally
   AI Format: "[[AIWC-0]]" or "{aiwc-0}" or "«AIWC-0»"
   Traditional Format: `<span translate="no" data-aiwc-ph-id="0" class="aiwc-placeholder">0</span>`
   ```
   This prevents false positives when translating technical documentation or code.

   **Note**: Update all regex patterns to match the chosen format:
   ```javascript
   // For [[AIWC-0]] format (recommended):
   const PLACEHOLDER_REGEX_AI = /\[\[AIWC-(\d+)\]\]/g;
   const PLACEHOLDER_BOUNDARY_REGEX = /\[\[AIWC-\d+\]\]/g;

   // For traditional format:
   const PLACEHOLDER_REGEX_TRADITIONAL = /<span[^>]*translate="no"[^>]*data-aiwc-ph-id="(\d+)"[^>]*>/g;
   ```

7. **Text-Only Streaming**: When placeholders are present, only stream and update the text portions, not the entire DOM structure.

8. **Placeholder Marker Protection**: Ensure streaming doesn't modify placeholder markers - only the text between them.

9. **Whitespace-Tolerant Placeholder Detection**: AI providers may add whitespace. Use whitespace-tolerant regex for your chosen format:
   ```javascript
   // For [[AIWC-0]] format with whitespace tolerance:
   const PLACEHOLDER_REGEX_AI = /\[\[\s*AIWC-(\d+)\s*\]\]/g;

   // For {aiwc-0} format with whitespace tolerance:
   const PLACEHOLDER_REGEX_AI = /\{\s*aiwc-(\d+)\s*\}/g;

   // For traditional format:
   const PLACEHOLDER_REGEX_TRADITIONAL = /<span[^>]*translate="no"[^>]*data-aiwc-ph-id="(\d+)"[^>]*>/g;
   ```

10. **Unified Format Detection**: The placeholder reassembly logic must detect both formats based on chosen pattern.

11. **Orphan Segment Timeout Handling**: Implement per-block timeout to prevent partial translation states:
    - Each block has a timeout (e.g., 60 seconds) from first segment arrival
    - If timeout expires before all segments complete, revert block to original state
    - Clear partial translations and registry to prevent inconsistent UI
    - Log timeout for debugging and retry consideration

12. **Granular Fallback at Translation Unit Level**: If placeholder validation fails, fall back at the **block level** (Translation Unit), not globally:
    - Each block container is an independent Translation Unit
    - If block A fails validation, only block A falls back to atomic
    - Blocks B, C, D continue with placeholder-based translation
    - This prevents one bad segment from ruining the entire page translation

13. **Cleanup of data-aiwc-original-id Attributes**: CRITICAL - After translation completion, always remove the `data-aiwc-original-id` attributes from DOM elements:
    ```javascript
    function cleanupPlaceholderIds(blockContainer) {
      const markedElements = blockContainer.querySelectorAll('[data-aiwc-original-id]');
      for (const element of markedElements) {
        element.removeAttribute('data-aiwc-original-id');
      }
    }

    // Call this after successful translation application
    await applyReassembledHTML(blockContainer, reassembledHTML);
    cleanupPlaceholderIds(blockContainer); // Prevent addon trace pollution
    ```

    **Why this matters**:
    - **Prevents addon trace pollution**: No extension markers left in website code
    - **Avoids conflicts**: Website scripts won't query or conflict with our attributes
    - **Clean DOM**: Website developers see clean translated content, not extension artifacts
    - **Security**: Reduces attack surface for attribute-based detection
    - **Debugging**: Makes debugging easier by not cluttering DOM inspection

14. **Final Reassembly Authority**: The `_handlePlaceholderTranslation` method at stream end is the ONLY place that should modify DOM structure for placeholder translations.

15. **Fallback Detection**: If streaming produces results without placeholders (provider stripped them), immediately fall back to atomic extraction.

16. **Registry Lifecycle**: PlaceholderRegistry must be cleared after translation completion or cancellation to prevent memory leaks.

17. **Placeholder Boundary Validation**: Before sending to API, validate that all placeholder markers are properly opened and closed.

18. **Recovery by Query Selector**: When element references are lost, recover using the unique identifier:
    ```javascript
    getPlaceholderOrRecover(id) {
      let entry = this.placeholders.get(id);
      if (entry && document.contains(entry.root)) {
        return entry.root;
      }
      if (entry && entry.uniqueId) {
        const recovered = document.querySelector(`[data-aiwc-original-id="${entry.uniqueId}"]`);
        if (recovered) {
          entry.root = recovered;
          return recovered;
        }
      }
      return null;
    }
    ```

19. **Revert Functionality Integration**: CRITICAL - The placeholder system must integrate with the existing StateManager revert mechanism:
    ```javascript
    // BEFORE modifying blockContainer.innerHTML:
    const originalInnerHTML = blockContainer.innerHTML;

    // Apply translation with placeholders
    await applyReassembledHTML(blockContainer, reassembledHTML);

    // Store with original HTML for revert
    orchestrator.stateManager.addTranslatedElement(
      blockContainer,
      new Map([[blockContainer.textContent, reassembledHTML]]),
      originalInnerHTML  // CRITICAL: Pre-translation snapshot
    );
    ```

    **Why this matters**:
    - **Existing revert system**: StateManager.revertTranslations() emits `hide-translation` event
    - **Conflict**: Placeholder system replaces entire innerHTML, losing original structure
    - **Solution**: Capture pre-translation HTML and pass to StateManager
    - **StateManager update**: Modify signature to accept optional third parameter `originalHTML?`
    - **Cleanup scope separation**:
      - `data-aiwc-original-id`: Temporary, cleaned after translation ✅
      - `data-original-html`: Persistent until user revert, cleaned separately ❌

    **Implementation requirements**:
    1. Modify `StateManager.addTranslatedElement(element, translations, originalHTML?)` to accept optional third parameter
    2. Store `originalHTML` if provided, otherwise fall back to `element.innerHTML`
    3. Update `revertTranslations()` to restore from stored `originalHTML` instead of `originalContent`
    4. Add cleanup for `data-original-html` after successful revert

## Testing Strategy

### Test Cases

**Core Functionality Tests:**

1. **Multi-Language with Placeholders (Success)**:
   - Input: `<p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>`
   - Persian Translation: "عامل <em>Zero</em> هوش مصنوعی <strong>rocks</strong> عالی است!"
   - German Translation: "Agent <em>Zero</em> KI <strong>rockt</strong>!"
   - Russian Translation: "Агент <em>Zero</em> ИИ <strong>просто отличная</strong>!"
   - Verify: No page corruption, inline elements preserved across all languages

2. **Placeholder Loss Fallback**:
   - Input: `<p>Click <a href="#">here</a> to continue</p>`
   - Translation: "اینجا کلیک کنید برای ادامه" (placeholders stripped)
   - Expected: Fall back to atomic extraction

3. **RTL with Embedded LTR**:
   - Input: `<p>Get <strong>40% off</strong> today</p>`
   - Translation: "دریافت <strong>40% off</strong> تخفیف امروز"
   - Verify: LTR portions wrapped correctly, no repositioning

4. **Nested Elements - Simple Nesting**:
   - Input: `<p>Text <a href="#">link <em>with</em> emphasis</a> more text</p>`
   - Extracted: "Text [0] more text"
   - Registry: [0] → `<a href="#">link <em>with</em> emphasis</a>` (complete subtree)
   - Verify: Nested `<em>` preserved inside `<a>`, structure intact

5. **Nested Elements - Deep Nesting**:
   - Input: `<p>Click <a href="#"><strong>link</strong> with <em>emphasis</em> and <code>code</code></a></p>`
   - Extracted: "Click [0]"
   - Registry: [0] → Complete `<a>` subtree with all descendants
   - Verify: All nested elements (`<strong>`, `<em>`, `<code>`) preserved in correct positions

6. **Atomic Batching - Long Text with Placeholders**:
   - Input: Text with placeholders that exceeds character_limit (e.g., 5000 chars)
   - Normal batching: Would split at character limit
   - Placeholder batching: Must NOT split, send as single batch
   - Verify: No placeholder splitting, all markers remain intact

7. **Atomic Batching - Multiple Placeholders Near Limit**:
   - Input: "Start [0] middle [1] middle [2] end" (exactly at character limit boundary)
   - Verify: Entire text sent as one batch, placeholders not split across batches

8. **Multiple Block Containers**:
   - Input: `<div><p>Para 1 with <strong>emphasis</strong></p><p>Para 2</p></div>`
   - Verify: Each paragraph processed independently with separate placeholder registries

9. **Segment Interruption**:
   - Scenario: User cancels during segment-based translation
   - Verify: Cleanup happens, registry cleared, no DOM corruption

**Language-Specific Tests:**

10. **Inflected Language (Russian) - Case Agreement**:
    - Input: `<p>I see the <strong>big red</strong> car</p>`
    - Translation: "Я вижу <strong>большую красную</strong> машину"
    - Verify: Adjectives agree with nouns in case/gender/number

11. **Agglutinative Language (Turkish) - Morpheme Boundaries**:
    - Input: `<p>My <strong>blue</strong> house</p>`
    - Translation: "Benim <strong>mavi</strong> evim"
    - Verify: Suffixes correctly applied to all words

12. **Asian Language (Chinese) - Sentence Structure**:
    - Input: `<p>I <strong>yesterday</strong> went to school</p>`
    - Translation: "我<strong>昨天</strong>去了学校"
    - Verify: Time word placement preserved correctly

13. **Language with Special Characters (German)**:
    - Input: `<p>Get <strong>ä</strong> and <strong>ü</strong> and <strong>ß</strong></p>`
    - Translation: "Holen Sie <strong>ä</strong> und <strong>ü</strong> und <strong>ß</strong>"
    - Verify: Special characters preserved correctly

14. **Bidirectional Text (Hebrew)**:
    - Input: `<p>The word <strong>שלום</strong> means peace</p>`
    - Translation: "המילה <strong>שלום</strong> פירושה שלום"
    - Verify: RTL and LTR portions correctly positioned

15. **Complex Script (Thai)**:
    - Input: `<p>Hello <strong>สวัสดี</strong> world</p>`
    - Translation: "สวัสดี <strong>Hello</strong> โลก"
    - Verify: Thai script preserved, tone marks intact

**Unified Placeholder Format Tests:**

16. **AI Provider Placeholder Format**:
    - Provider: Gemini
    - Format: `[0]`, `[1]`, `[2]`
    - Verify: Numeric markers generated and correctly reassembled

17. **Traditional Provider Placeholder Format**:
    - Provider: Google Translate
    - Format: `<span translate="no" data-id="0">0</span>`
    - Verify: HTML markers generated, `translate="no"` prevents Google from translating placeholder
    - Verify: Reassembly correctly parses HTML markers

**Edge Case & Resilience Tests:**

18. **Granular Fallback - Partial Failure**:
    - Input: 3 block containers on page: Block A, Block B, Block C
    - Scenario: Block A has placeholders that get corrupted by provider
    - Expected: Only Block A falls back to atomic extraction
    - Verify: Blocks B and C continue with placeholder-based translation
    - Verify: Page not completely ruined by one bad block

19. **AI Whitespace Variation**:
    - Input: `Click [0] to continue`
    - AI Output: `اینجا [ 0 ] کلیک کنید برای ادامه` (spaces inside brackets)
    - Verify: Whitespace-tolerant regex correctly extracts placeholder ID
    - Verify: Reassembly succeeds despite irregular spacing

20. **DOM Reference Loss Recovery**:
    - Input: `<a href="#">link</a>` with `data-aiwc-original-id="aiwc-12345"`
    - Scenario: Original DOM reference invalidated by partial update
    - Recovery: Query by `[data-aiwc-original-id="aiwc-12345"]` finds element again
    - Verify: Element recovered and reassembly succeeds

21. **Smart Chunking with Intl.Segmenter (Multi-Language)**:
    - **English**:
      - Input: "Dr. Smith lives in the U.S.A. He is happy. [[AIWC-0]] agrees."
      - Chunking: Uses Intl.Segmenter with `granularity: 'sentence'`
      - Verify: Correctly detects "Dr." and "U.S.A." as abbreviations, NOT sentence boundaries
      - Verify: Chunks: ["Dr. Smith lives in the U.S.A. ", "He is happy. ", "[[AIWC-0]] agrees."]

    - **Chinese** (no sentence-ending dots):
      - Input: "你好。世界！[[AIWC-0]]你好吗？"
      - Chunking: Uses Intl.Segmenter with locale `zh`
      - Verify: Correctly splits at Chinese punctuation: `。`, `！`, `？`
      - Verify: Chunks: ["你好。", "世界！", "[[AIWC-0]]你好吗？"]

    - **Japanese**:
      - Input: "田中さんです。よろしく。[[AIWC-0]]お願いします。"
      - Chunking: Uses Intl.Segmenter with locale `ja`
      - Verify: Correctly splits at Japanese punctuation: `。`, `！`
      - Verify: Chunks: ["田中さんです。", "よろしく。", "[[AIWC-0]]お願いします。"]

    - **German**:
      - Input: "Z.B. das ist gut. Und [[AIWC-0]]? Ja!"
      - Chunking: Uses Intl.Segmenter with locale `de`
      - Verify: Correctly detects "z.B." as abbreviation (not sentence boundary)
      - Verify: Chunks: ["Z.B. das ist gut. ", "Und [[AIWC-0]]? ", "Ja!"]

    - **Placeholder Boundary Protection**:
      - Input: "Start. [[AIWC-0]] middle. End."
      - Chunking limit: Very low (e.g., 10 chars)
      - Verify: Never splits inside or adjacent to `[[AIWC-0]]`
      - Verify: Falls back to single batch if necessary to protect placeholder

**Edge Case & Resilience Tests (Continued):**

22. **Regex Collision Avoidance - Code Snippets**:
    - Input: `<p>The array[0] contains value and data[index]</p>`
    - Placeholders: `[[AIWC-0]]`, `[[AIWC-1]]` (distinctive format)
    - Extracted text: "The array[0] contains [[AIWC-0]] and data[[AIWC-1]]"
    - Verify: Code `array[0]` and `data[index]` NOT mistaken for placeholders
    - Verify: Only AIWC-prefixed placeholders `[[AIWC-0]]`, `[[AIWC-1]]` are extracted
    - Verify: Regex `/\[\[AIWC-(\d+)\]\]/g` correctly ignores non-AIWC brackets

23. **Orphan Segment Timeout Recovery**:
    - Input: Block with 3 expected segments
    - Scenario: Segment 1 and 3 arrive, Segment 2 never arrives (network error)
    - After 60 seconds: Timeout triggers
    - Expected: Block reverts to original untranslated state
    - Verify: No partial/corrupted translation remains visible
    - Verify: Registry cleared, cleanup performed

24. **Partial Segment Recovery with Retransmission**:
    - Input: Block with missing Segment 2, timeout approaching
    - Scenario: Automatic retry triggered before timeout
    - Expected: Segment 2 successfully re-fetched
    - Verify: All segments combined correctly, translation completed

25. **Multiple Block Independent Timeouts**:
    - Input: 3 blocks (A, B, C) with placeholder translations
    - Scenario: Block A timeout, Blocks B and C complete normally
    - Expected: Block A reverted to original, B and C translated with placeholders
    - Verify: Blocks processed independently, no cross-block interference

26. **Cleanup of data-aiwc-original-id Attributes**:
    - Input: `<p>Text with <a href="#" data-aiwc-original-id="aiwc-123">link</a></p>`
    - After Translation: `<p>متن با <a href="#" data-aiwc-original-id="aiwc-123">لینک</a></p>`
    - Cleanup Called: `cleanupPlaceholderIds(blockContainer)`
    - Expected: `<p>متن با <a href="#">لینک</a></p>` (attribute removed)
    - Verify: `data-aiwc-original-id` attribute removed from all elements
    - Verify: No extension traces left in translated DOM
    - Verify: `querySelectorAll('[data-aiwc-original-id]')` returns empty NodeList
    - Verify: Website scripts cannot detect extension markers

27. **Cleanup After Orphan Segment Timeout**:
    - Input: Block with timeout and `data-aiwc-original-id` markers
    - Scenario: Timeout triggers reversion to original HTML
    - Expected: All `data-aiwc-original-id` attributes cleaned up even after timeout
    - Verify: Registry cleared
    - Verify: No orphaned attributes remain in DOM
    - Verify: Block returned to clean original state

28. **Revert Functionality with Placeholder Translations**:
    - Input: `<p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>`
    - Translation Applied: `<p>عامل <em>Zero</em> هوش مصنوعی <strong>rocks</strong> عالی است!</p>`
    - Original HTML Stored: `<p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>`
    - User Triggers Revert: Presses revert shortcut or clicks revert button
    - Expected: Block restored to original HTML exactly
    - Verify: `StateManager.addTranslatedElement()` received `originalHTML` parameter
    - Verify: `revertTranslations()` restores from stored `originalContent`
    - Verify: Inline elements (`<em>`, `<strong>`) preserved correctly in revert
    - Verify: `hide-translation` event emitted correctly
    - Verify: Block returns to exact pre-translation state
    - Verify: No placeholder artifacts remain after revert

29. **Revert Backward Compatibility with Atomic Extraction**:
    - Input: Traditional provider (Google, Yandex) translation without placeholders
    - StateManager Called: `addTranslatedElement(element, translations)` (2 parameters)
    - Expected: Falls back to capturing `element.innerHTML` after translation
    - Verify: Optional third parameter works correctly (null/undefined)
    - Verify: Backward compatibility maintained for existing code paths
    - Verify: Atomic extraction revert still works as before
    - Verify: No breaking changes to non-placeholder translations
