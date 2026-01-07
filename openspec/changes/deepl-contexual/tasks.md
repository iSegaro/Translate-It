# Implementation Tasks

## Overview

This document outlines the implementation tasks for upgrading DeepL provider from atomic text extraction to XML-based block-level contextual translation.

**Prerequisites**: Phase 1 contextual sentence translation (add-contextual-sentence-translation) must be complete (12/22 core tasks completed).

**Estimated Implementation**: 15-20 tasks across 7 phases.

---

## Phase 1: Placeholder Infrastructure Enhancement

### Task 1.1: Extend PlaceholderRegistry for Multi-Format Support
**File**: `src/features/element-selection/utils/PlaceholderRegistry.js`

**Changes**:
- [ ] Add `format` parameter to `register()` method (default: `'ai'` for backward compatibility)
- [ ] Store format in registry entry structure: `{id, root, html, uniqueId, tagName, textContent, format}`
- [ ] Add `getFormat(id)` method to retrieve format for a placeholder ID
- [ ] Update `getDebugInfo()` to include format information in output
- [ ] Update JSDoc comments to document format parameter

**Validation**:
- [ ] Unit test: Register with `'xml'` format stores format correctly
- [ ] Unit test: Register without format parameter defaults to `'ai'`
- [ ] Unit test: `getFormat()` returns correct format for existing IDs
- [ ] Unit test: Backward compatibility with existing code that doesn't specify format

**Success Criteria**:
- PlaceholderRegistry can store and retrieve format information
- Default behavior unchanged for existing callers
- Format information included in debug output

---

### Task 1.2: Add Format-Aware Placeholder Generation
**File**: `src/features/element-selection/utils/blockLevelExtraction.js`

**Changes**:
- [ ] Update `extractTextWithInlinePlaceholders()` signature to accept `format` parameter
- [ ] Implement conditional placeholder generation:
  ```javascript
  if (format === 'xml') {
    result += `<x id="${placeholderId}"/>`;
  } else {
    result += `[[AIWC-${placeholderId}]]`;
  }
  ```
- [ ] Update `extractBlockWithPlaceholders()` to accept and pass through `format` parameter
- [ ] Update `extractMultipleBlocksWithPlaceholders()` to support format parameter
- [ ] Add JSDoc comments documenting format parameter

**Validation**:
- [ ] Unit test: `format='ai'` generates `[[AIWC-0]]` placeholders
- [ ] Unit test: `format='xml'` generates `<x id="0"/>` placeholders
- [ ] Unit test: Format propagates correctly through recursive extraction
- [ ] Integration test: Block extraction with multiple inline elements generates sequential placeholders

**Success Criteria**:
- Correct placeholder format generated based on format parameter
- Sequential numbering maintained across both formats
- Recursive extraction preserves format consistency

---

### Task 1.3: Add XML Regex Patterns
**File**: `src/features/element-selection/utils/placeholderReassembly.js`

**Changes**:
- [ ] Add XML placeholder pattern constant:
  ```javascript
  const PLACEHOLDER_PATTERN_XML = /<x\s+id\s*=\s*["'](\d+)["']\s*\/?>/gi;
  ```
- [ ] Update `extractPlaceholdersFromTranslation(translatedText, format)` to:
  - Accept `format` parameter (`'ai'` | `'xml'` | `'traditional'`)
  - Route to appropriate regex based on format
  - Return array of placeholder objects with ID, match, indices
- [ ] Update `isInsidePlaceholder(text, position, format)` to:
  - Use format-specific regex for boundary detection
  - Protect 2-3 characters before/after placeholders
- [ ] Update `validatePlaceholderBoundaries(chunks, originalText, format)` to:
  - Use format-specific regex for validation
  - Detect broken placeholders with format-aware patterns

**Validation**:
- [ ] Unit test: XML regex matches `<x id="0"/>`
- [ ] Unit test: XML regex matches `<x id='0'/>` (single quotes)
- [ ] Unit test: XML regex matches `<x id = "0" >` (whitespace)
- [ ] Unit test: XML regex matches `<x  id="0"/>` (multiple spaces)
- [ ] Unit test: `extractPlaceholdersFromTranslation()` with `format='xml'` returns correct IDs
- [ ] Unit test: `extractPlaceholdersFromTranslation()` with `format='ai'` returns correct IDs
- [ ] Unit test: RTL text (Persian/Arabic) doesn't interfere with XML regex
- [ ] Unit test: `isInsidePlaceholder()` correctly detects XML boundaries

**Success Criteria**:
- XML regex handles all whitespace variations
- XML regex works with RTL text
- `extractPlaceholdersFromTranslation()` routes to correct regex based on format
- Boundary detection works for both AI and XML formats

---

### Task 1.4: Implement Lowercase Tag Enforcement
**File**: `src/features/element-selection/utils/blockLevelExtraction.js`

**Changes**:
- [ ] Ensure XML placeholder generation ALWAYS uses lowercase:
  ```javascript
  if (format === 'xml') {
    return `<x id="${placeholderId}"/>`;  // ALWAYS lowercase 'x' and 'id'
  }
  ```
- [ ] Add JSDoc comment explaining case-sensitivity requirement
- [ ] Add console warning if uppercase detected (defensive programming)

**Validation**:
- [ ] Unit test: Generated XML tags are always lowercase
- [ ] Unit test: No mixed-case tags like `<X ID="0"/>` or `<x ID="0"/>`
- [ ] Integration test: DeepL receives only lowercase tags

**Success Criteria**:
- All generated XML tags use lowercase 'x' and 'id'
- No case-sensitivity issues with XML parsers

---

### Task 1.5: Validate ignore_tags Parameter
**File**: `src/features/translation/providers/DeepLTranslateProvider.js`

**Changes**:
- [ ] Ensure `ignore_tags` parameter is ALWAYS set to exact lowercase `"x"`:
  ```javascript
  if (hasXMLPlaceholders) {
    requestBody.append('tag_handling', 'xml');
    requestBody.append('ignore_tags', 'x');  // EXACT lowercase 'x'
  }
  ```
- [ ] Add validation before API call:
  ```javascript
  const hasIgnoreTags = Array.from(requestBody.entries()).some(
    ([key, value]) => key === 'ignore_tags' && value === 'x'
  );
  if (!hasIgnoreTags) {
    console.error('[DeepL] XML placeholders detected but ignore_tags not set to "x"');
  }
  ```
- [ ] Add debug logging when XML mode is enabled

**Validation**:
- [ ] Unit test: `ignore_tags` is set to `"x"` when placeholders detected
- [ ] Unit test: Validation catches missing or incorrect `ignore_tags`
- [ ] Integration test: DeepL API receives correct `ignore_tags` parameter

**Success Criteria**:
- `ignore_tags` always set to exact lowercase `"x"`
- Validation prevents malformed API requests
- Debug logging helps troubleshoot XML mode issues

---

### Task 1.6: Test Nested Elements Subtree Handling
**File**: Tests in `tests/unit/features/element-selection/utils/`

**Purpose**: Verify that nested inline elements are captured as single placeholders.

**Test Cases to Add**:

1. **Simple nesting test**
   ```javascript
   test('Nested <em> inside <a> captured as single placeholder', () => {
     const html = '<a href="/"><em>nested</em></a>';
     const result = extractTextWithInlinePlaceholders(element, registry, 'xml');

     expect(result).toBe('<x id="0"/>');  // ONE placeholder
     expect(result).not.toContain('<x id="1"/>');  // NOT two

     const entry = registry.getPlaceholder(0);
     expect(entry.html).toBe('<a href="/"><em>nested</em></a>');  // Complete subtree
   });
   ```

2. **Deep nesting test**
   ```javascript
   test('Deep nesting captured correctly', () => {
     const html = '<strong><em><code>deep</code> nest</em></strong>';
     const result = extractTextWithInlinePlaceholders(element, registry, 'xml');

     expect(result).toBe('<x id="0"/>');  // Still ONE placeholder

     const entry = registry.getPlaceholder(0);
     expect(entry.html).toBe(html);  // Complete subtree
   });
   ```

3. **Adjacent inline elements test**
   ```javascript
   test('Adjacent inline elements get separate placeholders', () => {
     const html = '<p><strong>bold</strong> and <em>italic</em></p>';
     const result = extractTextWithInlinePlaceholders(block, registry, 'xml');

     expect(result).toMatch(/<x id="0"/>.*<x id="1"/>/);  // TWO placeholders
   });
   ```

4. **Sibling inline elements test**
   ```javascript
   test('Sibling inline elements inside same parent', () => {
     const html = '<p><strong>Bold</strong> <em>Italic</em> <code>Code</code></p>';
     const result = extractTextWithInlinePlaceholders(block, registry, 'xml');

     const placeholders = result.match(/<x id="\d+"\/>/g);
     expect(placeholders).toHaveLength(3);  // THREE placeholders
   });
   ```

5. **Reassembly verification test**
   ```javascript
   test('Nested structure preserved after reassembly', () => {
     const original = '<a href="/docs"><em>click here</em></a>';

     // Extract
     const extracted = '<x id="0"/>';
     registry.register(linkElement, 'xml');

     // Mock DeepL translation
     const translated = '<x id="0"/>';

     // Reassemble
     const reassembled = reassembleTranslationWithPlaceholders(
       translated,
       registry,
       blockContainer,
       'xml'
     );

     // Verify complete subtree restored
     expect(reassembled).toContain('<a href="/docs">');
     expect(reassembled).toContain('<em>');
     expect(reassembled).toContain('click here');
     expect(reassembled).toContain('</em>');
     expect(reassembled).toContain('</a>');
   });
   ```

**Validation**:
- [ ] All 5 test cases pass
- [ ] Edge cases covered (empty, deeply nested, siblings)
- [ ] Reassembly preserves complete nested structure

**Success Criteria**:
- Nested inline elements captured as single placeholders
- Complete subtree stored in registry
- Reassembly restores full nested structure
- No placeholder ID collisions

---

## Phase 2: Service Layer Integration

### Task 2.1: Update TextExtractionService Routing
**File**: `src/features/element-selection/managers/services/TextExtractionService.js`

**Changes**:
- [ ] Add `XML_PROVIDERS` Set: `new Set(['deepl'])`
- [ ] Add `isXMLProvider(providerType)` method
- [ ] Update `extractWithPlaceholders()` to:
  - Accept `providerType` parameter
  - Auto-detect format: `const format = this.isXMLProvider(providerType) ? 'xml' : 'ai'`
  - Pass format to `extractBlockWithPlaceholders()`
- [ ] Update `extractText()` routing logic:
  ```javascript
  if (usePlaceholders && registry &&
      (this.isAIProvider(providerType) || this.isXMLProvider(providerType))) {
    return this.extractWithPlaceholders(element, registry, providerType);
  }
  ```
- [ ] Update `getDebugInfo()` to include both provider sets

**Validation**:
- [ ] Unit test: `isXMLProvider('deepl')` returns `true`
- [ ] Unit test: `isXMLProvider('google')` returns `false`
- [ ] Unit test: `extractWithPlaceholders()` with `'deepl'` generates XML placeholders
- [ ] Unit test: `extractWithPlaceholders()` with `'gemini'` generates AI placeholders
- [ ] Integration test: Google Translate still uses atomic extraction

**Success Criteria**:
- DeepL provider routed to XML format generation
- AI providers continue using AI format
- Traditional providers remain in atomic mode
- No regression in existing provider routing

---

## Phase 3: DeepL Provider Implementation

### Task 3.1: Implement XML Tag Detection in DeepLTranslateProvider
**File**: `src/features/translation/providers/DeepLTranslateProvider.js`

**Changes**:
- [ ] In `_translateChunk()` method, add XML placeholder detection:
  ```javascript
  const hasXMLPlaceholders = validTexts.some(text =>
    /<x\s+id\s*=\s*["']\d+["']\s*\/?>/i.test(text)
  );
  ```
- [ ] Count XML tags in request before API call:
  ```javascript
  let requestTagCounts = [];
  if (hasXMLPlaceholders) {
    requestTagCounts = validTexts.map(text =>
      (text.match(/<x\s+id\s*=\s*["']\d+["']\s*\/?>/gi) || []).length
    );
  }
  ```
- [ ] Store `requestTagCounts` for post-response validation

**Validation**:
- [ ] Unit test: `hasXMLPlaceholders` detects `<x id="0"/>` in text array
- [ ] Unit test: `hasXMLPlaceholders` returns `false` for text without XML tags
- [ ] Unit test: `requestTagCounts` correctly counts tags in multiple texts

**Success Criteria**:
- XML placeholders detected in request texts
- Tag counts accurately captured for validation

---

### Task 3.2: Add DeepL XML API Parameters
**File**: `src/features/translation/providers/DeepLTranslateProvider.js`

**Changes**:
- [ ] Modify FormData construction in `_translateChunk()`:
  ```javascript
  if (hasXMLPlaceholders) {
    requestBody.append('tag_handling', 'xml');
    requestBody.append('ignore_tags', 'x');
  }
  ```
- [ ] Ensure parameters are added BEFORE API call
- [ ] Add logging for XML mode activation

**Validation**:
- [ ] Unit test: `tag_handling='xml'` added when placeholders detected
- [ ] Unit test: `ignore_tags='x'` added when placeholders detected
- [ ] Unit test: Parameters NOT added when no placeholders detected
- [ ] Integration test: DeepL API receives correct parameters

**Success Criteria**:
- DeepL API receives XML handling parameters when needed
- Parameters not sent for atomic translations (backward compatibility)

---

### Task 3.3: Implement XML Tag Validation
**File**: `src/features/translation/providers/DeepLTranslateProvider.js`

**Changes**:
- [ ] Add `_validateXMLTags(translations, requestTagCounts)` method
- [ ] Implement validation checks:
  1. **Tag count mismatch**: `responseTagCount !== requestTagCount`
  2. **Malformed tags**: Missing closing slash, quotes, or id attribute
  3. **Duplicate IDs**: Same placeholder ID appears multiple times
- [ ] Return validation result:
  ```javascript
  {
    isValid: boolean,
    errors: Array<{
      index: number,
      type: 'count_mismatch' | 'malformed_tags' | 'duplicate_ids',
      details: any
    }>
  }
  ```
- [ ] Call validation after API response if `hasXMLPlaceholders`

**Validation**:
- [ ] Unit test: Valid response with all tags preserved passes validation
- [ ] Unit test: Missing tag triggers `count_mismatch` error
- [ ] Unit test: Malformed tag `<x id="0">` (missing /) triggers `malformed_tags` error
- [ ] Unit test: Duplicate IDs trigger `duplicate_ids` error
- [ ] Unit test: Multiple errors in single response all detected

**Success Criteria**:
- All three validation types working correctly
- Validation errors provide sufficient detail for debugging
- Valid responses pass validation without errors

---

### Task 3.4: Implement Fallback Trigger
**File**: `src/features/translation/providers/DeepLTranslateProvider.js`

**Changes**:
- [ ] After validation failure, throw custom error:
  ```javascript
  if (!validation.isValid) {
    const error = new Error('XML tag corruption detected in DeepL response');
    error.cause = { isXMLCorruptionError: true, validation };
    throw error;
  }
  ```
- [ ] Ensure error includes validation details for logging

**Validation**:
- [ ] Unit test: Validation failure throws error with `isXMLCorruptionError` flag
- [ ] Unit test: Error includes validation details in `cause` property
- [ ] Integration test: SelectElementManager catches error and triggers fallback

**Success Criteria**:
- Corruption errors throw distinguishable exception
- Error contains sufficient context for fallback logic

---

### Task 3.5: Implement Atomic Fallback in SelectElementManager
**File**: `src/features/element-selection/managers/SelectElementManager.js`

**Changes**:
- [ ] Wrap translation call in try-catch:
  ```javascript
  try {
    const translatedText = await this._translateText(...);
    return await reassembleTranslationWithPlaceholders(..., 'xml');
  } catch (error) {
    if (error.cause?.isXMLCorruptionError) {
      console.warn('XML tag corruption detected, falling back to atomic extraction');
      registry.clear();
      return await this._atomicExtractionTranslation(...);
    }
    throw error;
  }
  ```
- [ ] Ensure `_atomicExtractionTranslation()` method exists (reuse existing atomic logic)

**Validation**:
- [ ] Integration test: XML corruption triggers atomic fallback
- [ ] Integration test: Atomic fallback produces translation
- [ ] Integration test: Non-corruption errors still propagate
- [ ] Integration test: Registry cleared before fallback attempt

**Success Criteria**:
- Fallback activates automatically on corruption
- User still receives translation (lower quality but functional)
- Other errors still propagate normally

---

### Task 3.6: Ensure @@@ Newline System Compatibility
**File**: `src/features/element-selection/managers/SelectElementManager.js`

**Changes**:
- [ ] Verify order of operations in extraction workflow:
  1. Sanitize text
  2. Replace `\n` with `@@@`
  3. Extract with XML placeholders
  4. Translate (DeepL preserves both @@@ and `<x/>`)
  5. Replace `@@@` with `\n`
  6. Reassemble XML placeholders
- [ ] Update workflow if needed to enforce this order

**Validation**:
- [ ] Unit test: Text with newlines generates correct @@@ markers
- [ ] Unit test: Text with newlines and inline elements generates both @@@ and `<x/>`
- [ ] Integration test: DeepL translation preserves both markers
- [ ] Integration test: Final reassembly restores newlines correctly

**Success Criteria**:
- @@@ markers applied before XML placeholder generation
- @@@ markers restored before XML reassembly
- Newlines preserved in final output

---

## Phase 4: DOM and Text Processing Updates

### Task 4.1: Update DOM Manipulation for XML Detection
**File**: `src/features/element-selection/utils/domManipulation.js`

**Changes**:
- [ ] Update `applyTranslationsToNodesWithPlaceholders()` to detect both formats:
  ```javascript
  const hasAIPlaceholders = /\[\[AIWC-\d+\]\]/.test(context.extractedText);
  const hasXMLPlaceholders = /<x\s+id\s*=\s*["']\d+["']\s*\/?>/.test(context.extractedText);
  const isPlaceholderTranslation = hasAIPlaceholders || hasXMLPlaceholders;
  ```
- [ ] Auto-detect format from extracted text pattern
- [ ] Store format in context for reassembly

**Validation**:
- [ ] Unit test: AI placeholder detection works
- [ ] Unit test: XML placeholder detection works
- [ ] Unit test: Format auto-detection selects correct format
- [ ] Integration test: Reassembly uses detected format

**Success Criteria**:
- Both placeholder formats detected correctly
- Format auto-detection reliable
- Reassembly uses correct format

---

### Task 4.2: Update textProcessing for XML Support
**File**: `src/features/element-selection/utils/textProcessing.js`

**Changes**:
- [ ] Add XML pattern constant: `PLACEHOLDER_PATTERN_XML`
- [ ] Update placeholder functions to accept `format` parameter:
  - `hasPlaceholders(text, format = 'ai')`
  - `countPlaceholders(text, format = 'ai')`
  - `extractPlaceholderIds(text, format = 'ai')`
- [ ] Update `expandTextsForTranslation()` to check for both formats:
  ```javascript
  const hasAIPlaceholders = /\[\[AIWC-\d+\]\]/.test(text);
  const hasXMLPlaceholders = /<x\s+id\s*=\s*["']\d+["']\s*\/?>/.test(text);
  if (hasAIPlaceholders || hasXMLPlaceholders) {
    // Never split texts containing placeholders
  }
  ```

**Validation**:
- [ ] Unit test: `hasPlaceholders(text, 'xml')` detects XML placeholders
- [ ] Unit test: `countPlaceholders(text, 'xml')` counts XML placeholders correctly
- [ ] Unit test: `extractPlaceholderIds(text, 'xml')` extracts IDs from XML
- [ ] Unit test: `expandTextsForTranslation()` preserves XML placeholders
- [ ] Unit test: `expandTextsForTranslation()` preserves AI placeholders

**Success Criteria**:
- All placeholder functions support XML format
- Texts with placeholders never split during expansion
- Both AI and XML formats handled correctly

---

## Phase 5: Testing and Validation

### Task 5.1: Add Unit Tests for XML Functionality
**Files**: New test files in `tests/unit/features/element-selection/utils/`

**Tests to Add**:
- [ ] `PlaceholderRegistry.test.js`: Format storage and retrieval
- [ ] `blockLevelExtraction.test.js`: XML placeholder generation
- [ ] `placeholderReassembly.test.js`: XML regex and extraction
- [ ] `textProcessing.test.js`: XML placeholder detection functions
- [ ] `DeepLTranslateProvider.test.js`: XML validation logic

**Validation**:
- [ ] All unit tests pass
- [ ] Code coverage ≥ 80% for new functionality
- [ ] No regressions in existing tests

**Success Criteria**:
- Comprehensive unit test coverage for XML functionality
- All tests passing
- No performance degradation in test execution

---

### Task 5.2: Add Integration Tests for DeepL
**Files**: New integration test files

**Tests to Add**:
- [ ] DeepL end-to-end with inline elements
- [ ] DeepL fallback on tag corruption
- [ ] DeepL with @@@ newline system
- [ ] DeepL with RTL text (Persian/Arabic)
- [ ] Format isolation (AI vs XML vs atomic)

**Validation**:
- [ ] All integration tests pass
- [ ] Real DeepL API (or mock) works end-to-end
- [ ] Fallback mechanism activates correctly

**Success Criteria**:
- DeepL contextual translation working end-to-end
- Fallback mechanism reliable
- No regressions in other providers

---

### Task 5.3: Manual Testing Scenarios
**Test Cases** (document results in comments or test report):

1. [ ] **Basic inline elements**
   - Input: `<p>This is <strong>bold</strong> text</p>`
   - Expected: XML placeholders preserved, translation successful

2. [ ] **RTL languages**
   - Input: `<p>این یک <strong>تست</strong> فارسی است</p>`
   - Expected: Persian text translated correctly, placeholders preserved

3. [ ] **Nested inline elements**
   - Input: `<a href="/"><em>Nested</em> link</a>`
   - Expected: Complete subtree captured and restored

4. [ ] **Multiple inline elements**
   - Input: `<p><strong>Bold</strong>, <em>italic</em>, and <code>code</code></p>`
   - Expected: All placeholders numbered sequentially

5. [ ] **Edge cases**
   - Empty inline elements: `<strong></strong>`
   - Inline elements with attributes: `<a href="#" class="btn">Link</a>`
   - Self-closing tags: `<br/>` inside block

6. [ ] **Fallback trigger**
   - Simulate corrupted DeepL response
   - Expected: Automatic atomic fallback, translation still succeeds

7. [ ] **Backward compatibility**
   - Test with Gemini provider (should use `[[AIWC-0]]`)
   - Test with Google provider (should use atomic extraction)
   - Expected: No regression in existing providers

**Success Criteria**:
- All manual test scenarios pass
- DeepL translation quality improved with contextual extraction
- No regressions in existing providers

---

### Task 5.4: Performance Testing
**Measurements**:

- [ ] Measure extraction time with XML placeholders vs atomic
- [ ] Measure reassembly time with XML placeholders vs atomic
- [ ] Measure memory usage with PlaceholderRegistry for XML format
- [ ] Measure translation quality improvement (subjective assessment)

**Validation**:
- [ ] Extraction overhead ≤ 10ms per block
- [ ] Reassembly overhead ≤ 10ms per block
- [ ] No memory leaks detected
- [ ] Translation quality noticeably improved for RTL/inflected languages

**Success Criteria**:
- Performance within acceptable bounds
- No memory leaks
- Quality improvement justifies any performance cost

---

## Phase 6: Documentation

### Task 6.1: Update System Documentation
**File**: `docs/SELECT_ELEMENT_SYSTEM.md`

**Updates**:
- [ ] Add section on XML placeholder format for DeepL
- [ ] Update architecture diagram to show format-aware routing
- [ ] Document DeepL-specific fallback logic
- [ ] Add XML format to placeholder format comparison table

**Validation**:
- [ ] Documentation accurately reflects implementation
- [ ] Diagrams are clear and readable
- [ ] DeepL-specific behavior clearly documented

**Success Criteria**:
- System documentation complete and accurate
- Future developers can understand XML placeholder system

---

### Task 6.2: Update Code Comments
**Files**: All modified files

**Updates**:
- [ ] Add JSDoc comments to new/modified functions
- [ ] Document format parameter usage
- [ ] Add inline comments for complex validation logic
- [ ] Document fallback flow in SelectElementManager

**Validation**:
- [ ] All new functions have JSDoc comments
- [ ] Complex logic has explanatory comments
- [ ] Comments are accurate and helpful

**Success Criteria**:
- Code is self-documenting with clear comments
- Future maintainers can understand design decisions

---

## Phase 7: Validation and Deployment

### Task 7.1: Run Full Test Suite
**Commands**:
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Linting
npm run lint

# Type checking
npm run type-check
```

**Validation**:
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No linting errors
- [ ] No type errors

**Success Criteria**:
- Zero test failures
- Zero lint errors
- Zero type errors

---

### Task 7.2: Build Verification
**Commands**:
```bash
# Development build
npm run build

# Production build
npm run build:prod
```

**Validation**:
- [ ] Development build succeeds
- [ ] Production build succeeds
- [ ] Bundle size increased by ≤ 5KB (acceptable for new functionality)
- [ ] No build warnings or errors

**Success Criteria**:
- Clean build with no errors
- Bundle size within acceptable limits

---

### Task 7.3: Cross-Browser Testing
**Browsers**:
- [ ] Chrome (latest stable)
- [ ] Firefox (latest stable)
- [ ] Edge (latest stable)

**Validation**:
- [ ] DeepL contextual translation works in all browsers
- [ ] Fallback mechanism works in all browsers
- [ ] No console errors in any browser

**Success Criteria**:
- Feature works consistently across browsers
- No browser-specific bugs

---

### Task 7.4: Create OpenSpec Spec Delta
**Files**:
- `openspec/changes/deepl-contexual/specs/element-selection-delta.md`

**Content**:
- [ ] Document how `element-selection` spec will be modified
- [ ] Add DeepL to contextual extraction providers
- [ ] Update placeholder format section to include XML
- [ ] Add fallback logic to spec

**Validation**:
- [ ] Spec delta accurately describes changes
- [ ] Spec delta follows OpenSpec conventions
- [ ] Run `openspec validate deepl-contexual --strict`

**Success Criteria**:
- Spec delta created and validated
- OpenSpec validation passes with no errors

---

## Task Dependencies

```
Phase 1 (Infrastructure)
  ├─ Task 1.1: PlaceholderRegistry
  │   └─ Required by: Task 1.2, Task 2.1
  ├─ Task 1.2: Block-Level Extraction
  │   └─ Required by: Task 1.4, Task 2.1, Task 5.1
  ├─ Task 1.3: XML Regex Patterns
  │   └─ Required by: Task 3.3, Task 4.2
  ├─ Task 1.4: Lowercase Tag Enforcement
  │   └─ Required by: Task 3.1, Task 5.1
  ├─ Task 1.5: ignore_tags Parameter Validation
  │   └─ Required by: Task 3.2, Task 5.1
  └─ Task 1.6: Nested Elements Testing
      └─ Required by: Task 5.1

Phase 2 (Service Layer)
  └─ Task 2.1: TextExtractionService
      └─ Required by: Task 3.1, Task 5.2

Phase 3 (DeepL Provider)
  ├─ Task 3.1: XML Detection
  │   └─ Required by: Task 3.2
  ├─ Task 3.2: API Parameters
  │   └─ Required by: Task 3.3
  ├─ Task 3.3: XML Validation
  │   └─ Required by: Task 3.4
  ├─ Task 3.4: Fallback Trigger
  │   └─ Required by: Task 3.5
  ├─ Task 3.5: Fallback Implementation
  │   └─ Required by: Task 5.2
  └─ Task 3.6: Newline Compatibility
      └─ Required by: Task 5.2

Phase 4 (DOM & Text Processing)
  ├─ Task 4.1: DOM Manipulation
  │   └─ Required by: Task 5.2
  └─ Task 4.2: textProcessing
      └─ Required by: Task 5.2

Phase 5 (Testing)
  ├─ Task 5.1: Unit Tests
  │   └─ Required by: Task 7.1
  ├─ Task 5.2: Integration Tests
  │   └─ Required by: Task 7.1
  ├─ Task 5.3: Manual Testing
  │   └─ Required by: Task 7.3
  └─ Task 5.4: Performance Testing
      └─ Required by: Task 7.1

Phase 6 (Documentation)
  ├─ Task 6.1: System Documentation
  └─ Task 6.2: Code Comments

Phase 7 (Validation)
  ├─ Task 7.1: Test Suite
  │   └─ Required by: Task 7.2
  ├─ Task 7.2: Build Verification
  │   └─ Required by: Task 7.3
  ├─ Task 7.3: Cross-Browser Testing
  │   └─ Required by: Task 7.4
  └─ Task 7.4: Spec Delta
```

---

## Implementation Priority

**Critical Path** (must complete in order):
1. Task 1.1 → Task 1.2 → Task 1.3 (Foundation)
2. Task 1.4 → Task 1.5 → Task 1.6 (Critical Implementation Details)
3. Task 2.1 (Service routing)
4. Task 3.1 → Task 3.2 → Task 3.3 → Task 3.4 → Task 3.5 (Core DeepL integration)
5. Task 4.1 → Task 4.2 (Supporting updates)
6. Task 5.1 → Task 5.2 (Testing)
7. Task 7.1 → Task 7.2 → Task 7.3 (Validation)

**Can be done in parallel** (after foundation complete):
- Task 6.1 & 6.2 (Documentation)
- Task 5.3 & 5.4 (Manual/Performance testing)

---

## Estimated Effort

| Phase | Tasks | Estimated Effort |
|-------|-------|------------------|
| Phase 1: Infrastructure | 6 | 6-10 hours |
| Phase 2: Service Layer | 1 | 1-2 hours |
| Phase 3: DeepL Provider | 6 | 8-12 hours |
| Phase 4: DOM & Text | 2 | 2-3 hours |
| Phase 5: Testing | 4 | 6-10 hours |
| Phase 6: Documentation | 2 | 2-3 hours |
| Phase 7: Validation | 4 | 4-6 hours |
| **Total** | **25** | **29-46 hours** |

**Note**: Effort estimates assume familiarity with codebase. May vary based on complexity encountered during implementation. 3 additional tasks (1.4, 1.5, 1.6) added for critical implementation details including lowercase tag enforcement, ignore_tags validation, and nested elements testing.

---

## Success Criteria Summary

- ✅ DeepL uses `<x id="0"/>` format for contextual translation
- ✅ XML tag corruption triggers automatic atomic fallback
- ✅ AI providers continue using `[[AIWC-0]]` format (no regression)
- ✅ Traditional providers remain in atomic mode (no regression)
- ✅ RTL text (Persian/Arabic) handled correctly
- ✅ Existing @@@ newline system preserved
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Cross-browser compatibility verified
- ✅ OpenSpec validation passes
