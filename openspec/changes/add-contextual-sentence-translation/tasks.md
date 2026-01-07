# Implementation Tasks

## 1. Foundation - Placeholder Registry
- [ ] 1.1 Create `PlaceholderRegistry.js` class in `src/features/element-selection/utils/`
  - [ ] Implement `register(inlineElement)` method
  - [ ] Add unique identifier generation: `aiwc-orig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  - [ ] Set `data-aiwc-original-id` attribute on element before storing
  - [ ] Store complete subtree HTML for nested elements
  - [ ] Implement `getPlaceholder(id)` method
  - [ ] Implement `getPlaceholderOrRecover(id)` method with querySelector fallback
  - [ ] Implement `clear()` method that also calls cleanupPlaceholderIds
  - [ ] Add unit tests for registry operations

## 2. Foundation - Block-Level Extraction
- [ ] 2.1 Create `blockLevelExtraction.js` in `src/features/element-selection/utils/`
  - [ ] Implement `findBlockContainer(startElement)` function
  - [ ] Implement `isInlineElement(element)` function
  - [ ] Implement `isBlockElement(element)` function
  - [ ] Implement `extractBlockWithPlaceholders(blockContainer, registry)` function
  - [ ] Use `[[AIWC-0]]` format for placeholder markers
  - [ ] Implement recursive `extractTextWithInlinePlaceholders(node, registry)` function
  - [ ] Capture complete subtree for nested inline elements (e.g., `<a>text <em>more</em></a>`)
  - [ ] Add unit tests for DOM traversal logic
  - [ ] Test nested element subtree extraction

## 3. Foundation - Placeholder Reassembly
- [ ] 3.1 Create `placeholderReassembly.js` in `src/features/element-selection/utils/`
  - [ ] Implement `extractPlaceholdersFromTranslation(translatedText)` with regex pattern
  - [ ] Use whitespace-tolerant regex: `/\[\[\s*AIWC-(\d+)\s*\]\]/g`
  - [ ] Implement `reassembleTranslationWithPlaceholders(translatedText, registry, blockContainer)` function
  - [ ] Implement `handleMissingPlaceholders(translatedText, foundPlaceholders, registry)` fallback
  - [ ] Add unit tests for reassembly logic

- [ ] 3.2 Implement Cleanup Functionality in `placeholderReassembly.js`
  - [ ] Add `cleanupPlaceholderIds(blockContainer)` function
  - [ ] Query all elements with `[data-aiwc-original-id]` attribute
  - [ ] Remove `data-aiwc-original-id` attribute from each element
  - [ ] Log count of cleaned elements for debugging
  - [ ] Add unit tests for cleanup functionality
  - [ ] Test cleanup is called after successful translation
  - [ ] Test cleanup is called after timeout/fallback
  - [ ] Test cleanup is called on PlaceholderRegistry.clear()

## 4. Integration - Text Extraction Service
- [ ] 4.1 Modify `TextExtractionService.js`
  - [ ] Add `isAIProvider(providerType)` method
  - [ ] Add `usePlaceholders` parameter to `extractText()` method
  - [ ] Create `extractWithPlaceholders(element, registry)` method
  - [ ] Update provider detection logic
  - [ ] Add integration tests

## 5. Integration - DOM Manipulation
- [ ] 5.1 Modify `domManipulation.js`
  - [ ] Add `collectTextNodesWithPlaceholders(targetElement)` function
  - [ ] Modify `collectTextNodes()` to accept `usePlaceholders` parameter
  - [ ] Route AI providers to placeholder-based extraction
  - [ ] Maintain backward compatibility for traditional providers
  - [ ] Add tests for routing logic

## 6. Integration - Text Processing
- [ ] 6.1 Modify `textProcessing.js`
  - [ ] Update `processTextIntoSegments()` to preserve placeholder markers
  - [ ] Add placeholder detection regex: `/\[\[AIWC-(\d+)\]\]/g`
  - [ ] Skip splitting segments that contain placeholders
  - [ ] Modify `reassembleTranslations()` to handle placeholder units
  - [ ] Add tests for placeholder preservation

## 7. Integration - DOM Node Matcher
- [ ] 7.1 Modify `DOMNodeMatcher.js`
  - [ ] Add `_applyPlaceholderReassembly(translationUnit, translatedText)` method
  - [ ] Update `applyTranslationsToNodes()` to detect placeholder units
  - [ ] Implement reinsertion of original DOM nodes at placeholder positions
  - [ ] Add fallback logic for missing placeholders
  - [ ] Add integration tests

## 8. AI Provider Integration
- [ ] 8.1 Modify `BaseAIProvider.js`
  - [ ] Update batching logic to prevent splitting placeholder-containing texts
  - [ ] Add placeholder preservation check: `if (/\[\[AIWC-\d+\]\]/.test(text))`
  - [ ] Force placeholder texts into single-item batches
  - [ ] Add tests for batching protection

- [ ] 8.2 Implement Multi-Language Smart Chunking with Intl.Segmenter
  - [ ] Add `splitIntoSentences(text, sourceLanguage)` using `Intl.Segmenter` API
  - [ ] Implement hierarchical chunking strategy:
    - [ ] Layer 1: Placeholder boundary protection (NEVER split inside `[[AIWC-0]]`)
    - [ ] Layer 2: Paragraph boundaries (double newlines `\n\n`)
    - [ ] Layer 3: Sentence boundaries using `Intl.Segmenter` with `granularity: 'sentence'`
    - [ ] Layer 4: Character limit fallback (last resort, warn in logs)
  - [ ] Add `validatePlaceholderBoundaries(chunks, originalText)` function
  - [ ] Implement `isInsidePlaceholder(text, position)` for boundary detection
  - [ ] Add `groupSentencesIntoChunks(sentences, limit)` helper function
  - [ ] Add unit tests for 100+ languages:
    - [ ] English: "Dr. Smith lives in the U.S.A." → Correctly detects abbreviations
    - [ ] Chinese: "你好。世界！" → Splits at Chinese punctuation
    - [ ] Japanese: "こんにちは。" → Respects Japanese punctuation
    - [ ] Arabic: "مرحباً. كيف حالك؟" → Handles RTL correctly
    - [ ] Persian: "سلام. حال شما چطور است؟" → Works with Persian text
    - [ ] German: "z.B. und Dr. Müller" → Knows German abbreviations
    - [ ] Spanish: "p.ej. y sr." → Handles Spanish abbreviations

- [ ] 8.3 Update AI Provider Prompts
  - [ ] Modify `GoogleGemini.js` prompt builder with placeholder instructions
  - [ ] Modify `OpenAI.js` prompt builder with placeholder instructions
  - [ ] Modify `ClaudeProvider.js` prompt builder with placeholder instructions (if exists)
  - [ ] Modify `DeepLTranslate.js` prompt builder with placeholder instructions
  - [ ] Add prompt template with placeholder preservation rules:
    - [ ] Instruct to preserve `[[AIWC-0]]` format exactly
    - [ ] Provide examples of correct placeholder handling
    - [ ] Warn against renumbering or modifying placeholders

## 9. Testing & Validation
- [ ] 9.1 Unit Tests
  - [ ] Test PlaceholderRegistry operations (register, retrieve, clear)
  - [ ] Test block container detection (P, DIV, LI, H1-H6)
  - [ ] Test inline element detection (EM, STRONG, A, CODE)
  - [ ] Test placeholder extraction from translated text
  - [ ] Test reassembly with various placeholder scenarios
  - [ ] Test Intl.Segmenter sentence boundary detection across languages
  - [ ] Test placeholder boundary validation logic

- [ ] 9.2 Integration Tests
  - [ ] Test end-to-end: extraction → translation → reassembly
  - [ ] Test with Gemini provider
  - [ ] Test with OpenAI provider
  - [ ] Test with DeepL provider
  - [ ] Test fallback to atomic extraction on failure
  - [ ] Test streaming with placeholder preservation

- [ ] 9.3 Multi-Language Tests (100+ Languages)
  - [ ] Test RTL languages (Persian, Arabic, Hebrew, Urdu, Kurdish)
    - [ ] Test Persian translation with inline elements
    - [ ] Test sentence context preservation
    - [ ] Test word order correctness
    - [ ] Compare quality before/after
  - [ ] Test European languages (English, Spanish, French, German, Italian, Portuguese, Russian, Polish, Dutch)
    - [ ] Test abbreviation handling (Dr., Mr., Mrs., etc.)
    - [ ] Test sentence boundary detection
  - [ ] Test Asian languages (Chinese Simplified/Traditional, Japanese, Korean, Vietnamese, Thai, Indonesian)
    - [ ] Test Chinese sentence splitting without dots
    - [ ] Test Japanese punctuation handling
    - [ ] Test Thai word boundaries
  - [ ] Test inflected languages (Russian, German, Latin, Eastern European)
    - [ ] Test case ending preservation
    - [ ] Test gender agreement context
  - [ ] Test agglutinative languages (Turkish, Finnish, Korean)
    - [ ] Test morpheme boundary handling
    - [ ] Test context for word formation

- [ ] 9.4 Complex HTML Tests
  - [ ] Test on GitHub (code fragments, EM, STRONG tags)
  - [ ] Test on documentation sites (nested inline elements)
  - [ ] Test tables and lists
  - [ ] Test deeply nested HTML structures

- [ ] 9.5 Performance Tests
  - [ ] Measure memory usage with placeholder registry
  - [ ] Test with very large blocks (1000+ nodes)
  - [ ] Measure translation time overhead
  - [ ] Optimize if overhead exceeds 5%

- [ ] 9.6 Backward Compatibility Tests
  - [ ] Test Google Translate (atomic extraction unchanged)
  - [ ] Test Yandex Translate (atomic extraction unchanged)
  - [ ] Test switching between AI and traditional providers
  - [ ] Verify no regression in existing functionality

- [ ] 9.7 Cleanup Functionality Tests
  - [ ] Test cleanup after successful translation
    - [ ] Verify `data-aiwc-original-id` removed from all elements
    - [ ] Verify no extension attributes remain in DOM
  - [ ] Test cleanup after timeout/fallback
    - [ ] Verify attributes cleaned when translation fails
    - [ ] Verify attributes cleaned when timeout occurs
  - [ ] Test cleanup on PlaceholderRegistry.clear()
    - [ ] Verify cleanup triggered on registry clear
    - [ ] Verify no memory leaks from stale references
  - [ ] Test cleanup with multiple block containers
    - [ ] Verify all blocks cleaned independently
    - [ ] Verify no cross-block contamination

## 10. Documentation
- [ ] 10.1 Update System Documentation
  - [ ] Update `docs/SELECT_ELEMENT_SYSTEM.md` with placeholder system details
  - [ ] Add architecture diagram for placeholder flow
  - [ ] Document new utility files and their purposes
  - [ ] Document `[[AIWC-0]]` placeholder format and rationale
  - [ ] Document Intl.Segmenter-based chunking strategy
  - [ ] Document cleanup functionality for `data-aiwc-original-id`

- [ ] 10.2 Code Comments
  - [ ] Add JSDoc comments to PlaceholderRegistry
  - [ ] Add JSDoc comments to blockLevelExtraction functions
  - [ ] Add JSDoc comments to placeholderReassembly functions
  - [ ] Add JSDoc comments to cleanupPlaceholderIds function
  - [ ] Add JSDoc comments to Intl.Segmenter integration
  - [ ] Document multi-language support (100+ languages)
