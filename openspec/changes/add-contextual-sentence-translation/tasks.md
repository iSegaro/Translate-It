# Implementation Tasks

## 1. Foundation - Placeholder Registry
- [x] 1.1 Create `PlaceholderRegistry.js` class in `src/features/element-selection/utils/`
  - [x] Implement `register(inlineElement)` method
  - [x] Add unique identifier generation: `aiwc-orig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  - [x] Set `data-aiwc-original-id` attribute on element before storing
  - [x] Store complete subtree HTML for nested elements
  - [x] Implement `getPlaceholder(id)` method
  - [x] Implement `getPlaceholderOrRecover(id)` method with querySelector fallback
  - [x] Implement `clear()` method that also calls cleanupPlaceholderIds
  - [ ] Add unit tests for registry operations

## 2. Foundation - Block-Level Extraction
- [x] 2.1 Create `blockLevelExtraction.js` in `src/features/element-selection/utils/`
  - [x] Implement `findBlockContainer(startElement)` function
  - [x] Implement `isInlineElement(element)` function
  - [x] Implement `isBlockElement(element)` function
  - [x] Implement `extractBlockWithPlaceholders(blockContainer, registry)` function
  - [x] Use `[[AIWC-0]]` format for placeholder markers
  - [x] Implement recursive `extractTextWithInlinePlaceholders(node, registry)` function
  - [x] Capture complete subtree for nested inline elements (e.g., `<a>text <em>more</em></a>`)
  - [ ] Add unit tests for DOM traversal logic
  - [ ] Test nested element subtree extraction

## 3. Foundation - Placeholder Reassembly
- [x] 3.1 Create `placeholderReassembly.js` in `src/features/element-selection/utils/`
  - [x] Implement `extractPlaceholdersFromTranslation(translatedText)` with regex pattern
  - [x] Use whitespace-tolerant regex: `/\[\[\s*AIWC-(\d+)\s*\]\]/g`
  - [x] Implement `reassembleTranslationWithPlaceholders(translatedText, registry, blockContainer)` function
  - [x] Implement `handleMissingPlaceholders(translatedText, foundPlaceholders, registry)` fallback
  - [ ] Add unit tests for reassembly logic

- [x] 3.2 Implement Cleanup Functionality in `placeholderReassembly.js`
  - [x] Add `cleanupPlaceholderIds(blockContainer)` function
  - [x] Query all elements with `[data-aiwc-original-id]` attribute
  - [x] Remove `data-aiwc-original-id` attribute from each element
  - [x] Log count of cleaned elements for debugging
  - [ ] Add unit tests for cleanup functionality
  - [ ] Test cleanup is called after successful translation
  - [ ] Test cleanup is called after timeout/fallback
  - [ ] Test cleanup is called on PlaceholderRegistry.clear()
  - [x] Ensure cleanup does NOT remove `data-original-html` (for revert persistence)

- [x] 3.3 Update StateManager for Placeholder Revert Support
  - [x] Modify `StateManager.addTranslatedElement()` signature:
    - [x] Add optional third parameter: `originalHTML`
    - [x] Update function signature: `addTranslatedElement(element, translations, originalHTML = null)`
    - [x] Store `originalHTML` if provided, otherwise use `element.innerHTML`
  - [x] Update stored data structure:
    - [x] Use `originalContent: originalHTML || element.innerHTML`
    - [x] Ensure backward compatibility with existing callers
  - [x] Update `revertTranslations()` method:
    - [x] Restore from stored `originalContent` (now contains pre-translation snapshot)
    - [x] Emit `hide-translation` event as before
    - [x] Clear translated element from map after successful revert
  - [x] Add cleanup for `data-original-html` attribute:
    - [x] After successful revert, remove `data-original-html` if present
    - [x] Ensure this cleanup is separate from `cleanupPlaceholderIds()`
    - [ ] Test that revert works correctly with placeholder translations
    - [ ] Test that atomic extraction revert still works (backward compatibility)

## 4. Integration - Text Extraction Service
- [x] 4.1 Modify `TextExtractionService.js`
  - [x] Add `isAIProvider(providerType)` method
  - [x] Add `usePlaceholders` parameter to `extractText()` method
  - [x] Create `extractWithPlaceholders(element, registry)` method
  - [x] Update provider detection logic
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
- [x] 7.1 Modify `DOMNodeMatcher.js`
  - [x] Add `_applyPlaceholderReassembly(blockContainer, translatedText, placeholderRegistry)` method
  - [x] Add `applyTranslationWithPlaceholderSupport()` routing method
  - [x] Implement placeholder detection with `_hasPlaceholders()` method
  - [x] Implement `_validatePlaceholderPreservation()` validation method
  - [x] Add fallback logic for missing placeholders
  - [ ] Add integration tests

## 8. AI Provider Integration
- [x] 8.1 Modify `BaseAIProvider.js`
  - [x] Update batching logic to prevent splitting placeholder-containing texts
  - [x] Add placeholder preservation check: `if (/\[\[AIWC-\d+\]\]/.test(text))`
  - [x] Force placeholder texts into single-item batches
  - [ ] Add tests for batching protection

- [x] 8.2 Implement Multi-Language Smart Chunking with Intl.Segmenter
  - [x] Add `splitIntoSentences(text, sourceLanguage)` using `Intl.Segmenter` API
  - [x] Implement hierarchical chunking strategy:
    - [x] Layer 1: Placeholder boundary protection (NEVER split inside `[[AIWC-0]]`)
    - [x] Layer 2: Paragraph boundaries (double newlines `\n\n`)
    - [x] Layer 3: Sentence boundaries using `Intl.Segmenter` with `granularity: 'sentence'`
    - [x] Layer 4: Character limit fallback (last resort, warn in logs)
  - [x] Add `validatePlaceholderBoundaries(chunks, originalText)` function
  - [x] Implement `isInsidePlaceholder(text, position)` for boundary detection
  - [x] Add `groupSentencesIntoChunks(sentences, limit)` helper function
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

- [ ] 9.8 Revert Functionality Tests
  - [ ] Test revert with placeholder translations
    - [ ] Verify `StateManager.addTranslatedElement()` receives `originalHTML` parameter
    - [ ] Verify pre-translation HTML captured correctly
    - [ ] Verify `revertTranslations()` restores from stored `originalContent`
    - [ ] Verify inline elements (`<em>`, `<strong>`, `<a>`) preserved in revert
    - [ ] Verify `hide-translation` event emitted correctly
    - [ ] Verify block returns to exact pre-translation state
    - [ ] Verify no placeholder artifacts remain after revert
  - [ ] Test revert backward compatibility with atomic extraction
    - [ ] Verify optional third parameter works (null/undefined)
    - [ ] Verify atomic extraction revert still works with 2 parameters
    - [ ] Verify Google Translate revert unchanged
    - [ ] Verify Yandex Translate revert unchanged
    - [ ] Verify no breaking changes to existing code paths
  - [ ] Test StateManager signature update
    - [ ] Verify `addTranslatedElement(element, translations, originalHTML = null)` works
    - [ ] Verify fallback to `element.innerHTML` when `originalHTML` not provided
    - [ ] Verify backward compatibility with existing callers

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
