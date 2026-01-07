# Implementation Tasks

## 1. Foundation - Placeholder Registry
- [ ] 1.1 Create `PlaceholderRegistry.js` class in `src/features/element-selection/utils/`
  - [ ] Implement `register(inlineElement)` method
  - [ ] Implement `getPlaceholder(id)` method
  - [ ] Implement `clear()` method for cleanup
  - [ ] Add unit tests for registry operations

## 2. Foundation - Block-Level Extraction
- [ ] 2.1 Create `blockLevelExtraction.js` in `src/features/element-selection/utils/`
  - [ ] Implement `findBlockContainer(startElement)` function
  - [ ] Implement `isInlineElement(element)` function
  - [ ] Implement `isBlockElement(element)` function
  - [ ] Implement `extractBlockWithPlaceholders(blockContainer, registry)` function
  - [ ] Implement recursive `extractTextWithInlinePlaceholders(node, registry)` function
  - [ ] Add unit tests for DOM traversal logic

## 3. Foundation - Placeholder Reassembly
- [ ] 3.1 Create `placeholderReassembly.js` in `src/features/element-selection/utils/`
  - [ ] Implement `extractPlaceholdersFromTranslation(translatedText)` with regex pattern
  - [ ] Implement `reassembleTranslationWithPlaceholders(translatedText, registry, blockContainer)` function
  - [ ] Implement `handleMissingPlaceholders(translatedText, foundPlaceholders, registry)` fallback
  - [ ] Add unit tests for reassembly logic

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
  - [ ] Add placeholder detection regex: `/\[\d+\]/`
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
  - [ ] Add placeholder preservation check: `if (/\[\d+\]/.test(text))`
  - [ ] Force placeholder texts into single-item batches
  - [ ] Add tests for batching protection

- [ ] 8.2 Update AI Provider Prompts
  - [ ] Modify `GoogleGemini.js` prompt builder with placeholder instructions
  - [ ] Modify `OpenAI.js` prompt builder with placeholder instructions
  - [ ] Modify `ClaudeProvider.js` prompt builder with placeholder instructions (if exists)
  - [ ] Modify `DeepLTranslate.js` prompt builder with placeholder instructions
  - [ ] Add prompt template with placeholder preservation rules

## 9. Testing & Validation
- [ ] 9.1 Unit Tests
  - [ ] Test PlaceholderRegistry operations (register, retrieve, clear)
  - [ ] Test block container detection (P, DIV, LI, H1-H6)
  - [ ] Test inline element detection (EM, STRONG, A, CODE)
  - [ ] Test placeholder extraction from translated text
  - [ ] Test reassembly with various placeholder scenarios

- [ ] 9.2 Integration Tests
  - [ ] Test end-to-end: extraction → translation → reassembly
  - [ ] Test with Gemini provider
  - [ ] Test with OpenAI provider
  - [ ] Test with DeepL provider
  - [ ] Test fallback to atomic extraction on failure

- [ ] 9.3 RTL Language Tests
  - [ ] Test Persian translation with inline elements
  - [ ] Test sentence context preservation
  - [ ] Test word order correctness
  - [ ] Compare quality before/after

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

## 10. Documentation
- [ ] 10.1 Update System Documentation
  - [ ] Update `docs/SELECT_ELEMENT_SYSTEM.md` with placeholder system details
  - [ ] Add architecture diagram for placeholder flow
  - [ ] Document new utility files and their purposes

- [ ] 10.2 Code Comments
  - [ ] Add JSDoc comments to PlaceholderRegistry
  - [ ] Add JSDoc comments to blockLevelExtraction functions
  - [ ] Add JSDoc comments to placeholderReassembly functions
