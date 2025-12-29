# Implementation Tasks: Improve Select Element Reliability

## 1. Setup and Preparation
- [x] 1.1 Create element-selection base specification ✓
- [x] 1.2 Create unified change directory structure ✓
- [x] 1.3 Write proposal.md with problem statement and solution overview ✓
- [x] 1.4 Create design.md with technical decisions and architecture ✓
- [x] 1.5 Validate proposal structure with `openspec validate --strict`

## 2. Phase 1: RTL Direction Handling Fix (Critical - Week 1)

### 2.1 Simplify textDirection.js
- [x] 2.1.1 Backup current implementation for reference
- [x] 2.1.2 Remove complex word-ratio calculation logic (477 → 165 lines)
- [x] 2.1.3 Implement target-language-first detection algorithm
- [x] 2.1.4 Update default RTL detection thresholds (0.1 → 0.4)
- [x] 2.1.5 Keep content analysis only as fallback when target language unknown
- [x] 2.1.6 Test simplified implementation with sample texts

### 2.2 Remove Mixed Content Processing
- [x] 2.2.1 Remove functions that wrap English terms in `<span dir="ltr">`
- [x] 2.2.2 Eliminate `processMixedContentForDisplay` logic
- [x] 2.2.3 Remove Unicode control character insertion for mixed content
- [x] 2.2.4 Verify RTL texts display correctly without complex processing

### 2.3 Update TranslationUIManager.js
- [x] 2.3.1 Remove redundant RTL detection functions
- [x] 2.3.2 Simplify direction application in translation display
- [x] 2.3.3 Ensure target language is properly propagated
- [x] 2.3.4 Test with various RTL language combinations

### 2.4 Clean Up CSS Classes
- [x] 2.4.1 Remove unused `.ltr-term` CSS class from content-main-dom.css
- [x] 2.4.2 Remove unused `.aiwc-mixed-text` CSS class
- [x] 2.4.3 Simplify direction-related CSS classes
- [x] 2.4.4 Verify no visual regressions in translation display

### 2.5 Phase 1 Testing
- [ ] 2.5.1 Test RTL translations with English technical terms (API, Z.ai, etc.)
- [ ] 2.5.2 Test LTR translations with RTL words
- [ ] 2.5.3 Test edge cases (numbers, URLs, mixed scripts)
- [ ] 2.5.4 Measure performance improvement (should be significant)

## 3. Phase 2: Segment ID System Implementation (Important - Week 2-3)

### 3.1 Modify textExtraction.js
- [x] 3.1.1 Add unique segment ID generation during text collection
- [x] 3.1.2 Create segment metadata structure with ID, text, and DOM reference
- [x] 3.1.3 Update `collectTextNodes` to assign and track segment IDs
- [x] 3.1.4 Implement segment ID preservation through text processing
- [x] 3.1.5 Test segment ID assignment with various DOM structures

### 3.2 Update textProcessing.js
- [ ] 3.2.1 Modify text segmentation to preserve segment IDs
- [ ] 3.2.2 Update reassembly logic to use ID-based matching
- [x] 3.2.3 Simplify multi-strategy indexing with reliable ID matching
- [x] 3.2.4 Ensure segment IDs are maintained through provider requests
- [x] 3.2.5 Test with large content requiring segmentation

### 3.3 Enhance domManipulation.js
- [x] 3.3.1 Update translation application to use segment IDs
- [x] 3.3.2 Implement ID-based DOM element lookup and modification
- [x] 3.3.3 Remove complex text matching logic now replaced by IDs
- [x] 3.3.4 Add error handling for missing segment IDs
- [x] 3.3.5 Test translation application with complex nested elements

### 3.4 Implement Hybrid Provider Response Handling
- [ ] 3.4.1 Add smart detection for JSON vs array provider responses
- [ ] 3.4.2 Create JSON response parser for segment-aware providers
- [ ] 3.4.3 Implement fallback to array format for traditional providers
- [ ] 3.4.4 Update StreamingTranslationEngine for segment ID support
- [ ] 3.4.5 Test with all provider types (Google, Bing, OpenAI, Gemini)

### 3.5 Update Provider Integration
- [ ] 3.5.1 Modify provider request format to include segment IDs when supported
- [ ] 3.5.2 Update response processing to handle segment-aware responses
- [ ] 3.5.3 Ensure backward compatibility with existing providers
- [ ] 3.5.4 Test translation accuracy with segment-aware providers

## 4. Phase 3: Integration and Testing (Week 4)

### 4.1 Comprehensive Testing
- [ ] 4.1.1 Test all language pairs, especially RTL → LTR and LTR → RTL
- [ ] 4.1.2 Test with all translation providers
- [ ] 4.1.3 Test on complex websites (Shadow DOM, iframes, dynamic content)
- [ ] 4.1.4 Test performance with large text selections
- [ ] 4.1.5 Test memory usage and cleanup on deactivation

### 4.2 Cross-Browser Testing
- [ ] 4.2.1 Test on Chrome (latest stable)
- [ ] 4.2.2 Test on Firefox (latest stable)
- [ ] 4.2.3 Test on Edge (latest stable)
- [ ] 4.2.4 Verify consistent behavior across browsers
- [ ] 4.2.5 Test browser-specific features and workarounds

### 4.3 Performance Benchmarking
- [ ] 4.3.1 Measure text extraction performance with segment IDs
- [ ] 4.3.2 Measure direction detection performance (should improve significantly)
- [ ] 4.3.3 Measure memory usage before and after changes
- [ ] 4.3.4 Compare with baseline implementation
- [ ] 4.3.5 Optimize any performance regressions

### 4.4 Documentation and Cleanup
- [ ] 4.4.1 Update inline code documentation
- [ ] 4.4.2 Add comments to new segment ID logic
- [ ] 4.4.3 Create or update technical documentation
- [ ] 4.4.4 Remove any remaining unused code
- [ ] 4.4.5 Final code review and optimization

## 5. Validation and Release
- [ ] 5.1 Run `openspec validate improve-select-element-reliability --strict`
- [ ] 5.2 Fix any validation issues
- [ ] 5.3 Create test cases for critical functionality
- [ ] 5.4 Verify all tasks are completed
- [ ] 5.5 Prepare for code review and merge

## Dependencies
- Phase 1 must be completed before Phase 2
- Phase 3 depends on completion of both Phase 1 and Phase 2
- All provider testing requires active API keys

## Parallelizable Work
- 2.1, 2.2, and 2.3 can be done in parallel
- 3.1, 3.2, and 3.3 can be done in parallel
- 4.1, 4.2, and 4.3 can be done in parallel