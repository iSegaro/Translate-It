# Design: Contextual Sentence Translation with Placeholders

## Context

### Problem
The Select Element system uses `TreeWalker` with `NodeFilter.SHOW_TEXT` to extract individual text nodes. When a sentence contains inline elements like `<em>`, `<strong>`, or `<a>`, the extraction breaks the sentence into fragments:

```html
<p>Agent <em>Zero</em> AI rocks!</p>
```

Extracted as:
```javascript
["Agent ", "Zero", " AI rocks!"]
```

Each fragment is translated independently, losing grammatical context. This causes severe quality issues for RTL languages like Persian where word order and verb conjugation depend on full sentence structure.

### Stakeholders
- **Users**: Expect natural, contextually accurate translations
- **AI Providers**: Can handle contextual translation when given complete sentences
- **Traditional Providers**: (Google, Yandex) - Continue using atomic extraction (unchanged)

## Goals / Non-Goals

### Goals
- Extract complete sentences with grammatical context for AI providers
- Preserve inline element styling and structure in translations
- Maintain backward compatibility with traditional providers
- Support graceful fallback if placeholder system fails
- Minimize performance overhead (<5% increase)

### Non-Goals
- HTML format support for traditional providers (deferred to Phase 2)
- Placeholder system for non-AI providers
- Placeholder preservation for non-inline elements (block-level)
- Automatic placeholder insertion for missing inline elements

## Decisions

### Decision 1: Placeholder Format
**Choice**: Distinctive markers to avoid regex collisions with code snippets

**AI Providers**: `[[AIWC-0]]`, `[[AIWC-1]]`, `[[AIWC-2]]` format
- Easy to parse: `/\[\[AIWC-(\d+)\]\]/g`
- Won't occur naturally in technical content (avoids collisions with `array[0]`)
- Compact format minimizes token usage

**Traditional Providers**: `<span translate="no" data-aiwc-ph-id="0" class="aiwc-placeholder">0</span>`
- Uses HTML5 `translate="no"` attribute for native placeholder preservation
- Easy to parse: `/<span[^>]*translate="no"[^>]*data-aiwc-ph-id="(\d+)"[^>]*>/g`
- Provides fallback if placeholder markers are stripped

**Rationale**:
- The simple `[0]` format collides with code like "array[0]" on GitHub
- `[[AIWC-0]]` format (AIWC = AI Web Context) is distinctive and won't occur naturally
- Unified extraction/reassembly logic for all providers
- Easy to detect and parse with regex

**Alternatives Considered**:
- Simple `[0]` format - Collides with code like "array[0]" on GitHub
- XML-style tags: `<inline id="0">` - Too verbose, AI may try to interpret as HTML
- UUID markers: `[a1b2c3d4]` - Unnecessarily complex, wastes tokens
- Unicode markers: `[①]`, `[②]` - May not display correctly in all contexts

### Decision 2: Block-Level Container Strategy
**Choice**: Identify closest block-level ancestor (P, DIV, LI, H1-H6, TD, TH, BLOCKQUOTE, ARTICLE, SECTION)

**Rationale**:
- Block-level elements naturally contain complete thoughts/sentences
- Aligns with HTML semantic structure
- Preserves paragraph boundaries
- Reduces number of translation requests

**Alternatives Considered**:
- Sentence boundary detection with regex - Unreliable across languages, doesn't handle HTML structure
- Entire page extraction - Too large, loses element-level granularity
- User-defined boundaries - Adds UI complexity, error-prone

### Decision 3: Inline Element Flattening
**Choice**: Flatten nested inline elements into single placeholder

**Example**:
```html
<strong><em>nested</em></strong> → [0]
```

**Rationale**:
- Simpler implementation
- AI providers translate full context anyway
- Reassembly only needs to replace marker with original HTML

**Alternatives Considered**:
- Recursive placeholders: `[0[1]]` - Complex parsing, error-prone
- Separate placeholders: `nested` → `[0]` for EM, `[1]` for STRONG - Increases token count without benefit

### Decision 4: Provider-Aware Routing
**Choice**: Route AI providers to placeholder extraction; traditional providers use atomic extraction

**Rationale**:
- Traditional providers (Google, Yandex) don't reliably preserve placeholder markers
- AI providers (Gemini, OpenAI, Claude, DeepL) can follow placeholder preservation instructions
- Maintains backward compatibility
- Lowers risk - failure only affects AI providers

**Detection Logic**:
```javascript
isAIProvider(providerType) {
  const AI_PROVIDERS = ['gemini', 'openai', 'claude', 'deepl'];
  return AI_PROVIDERS.some(p => providerType.toLowerCase().includes(p));
}
```

### Decision 5: Batch Protection
**Choice**: Force placeholder-containing texts into single-item batches

**Rationale**:
- Prevents splitting placeholders across batch boundaries
- Ensures placeholder integrity during translation
- AI providers can handle single-item requests efficiently

**Implementation**:
```javascript
// For AI providers with [[AIWC-0]] format:
if (/\[\[AIWC-\d+\]\]/.test(text)) {
  batches.push([text]); // Single-item batch
}

// For traditional providers with HTML span format:
if (/<span[^>]*translate="no"[^>]*data-aiwc-ph-id/.test(text)) {
  batches.push([text]); // Single-item batch
}
```

### Decision 6: Multi-Language Smart Chunking
**Choice**: Use `Intl.Segmenter` API with hierarchical chunking strategy

**Rationale**:
- Browser standard API supporting 100+ languages (Chrome 87+, Firefox 125+, Safari 14.1+)
- Zero maintenance - no abbreviation lists to update
- Culture-aware: Knows "Mr." in English, "Dr." in German, "p.ej." in Spanish are abbreviations
- Script-aware: Handles Chinese/Japanese (no sentence dots), Thai, Arabic, Hindi correctly
- Single API call works for all supported languages

**Implementation Strategy** (Hierarchical):
1. **Layer 1**: Placeholder boundary protection (NEVER split inside `[[AIWC-0]]`)
2. **Layer 2**: Universal boundaries (double newlines `\n\n`, single newlines `\n`)
3. **Layer 3**: Language-aware sentence boundaries using `Intl.Segmenter` with `granularity: 'sentence'`
4. **Layer 4**: Character limit fallback (last resort, warn in logs)

**Example**:
```javascript
// Intl.Segmenter works for ALL languages:
const segmenter = new Intl.Segmenter(sourceLanguage, { granularity: 'sentence' });
const segments = segmenter.segment(text);
// English: "Dr. Smith lives in the U.S.A. He is happy."
//   → ["Dr. Smith lives in the U.S.A. ", "He is happy."]
// Chinese: "你好。世界！你好吗？"
//   → ["你好。", "世界！", "你好吗？"]
```

**Alternatives Considered**:
- Manual regex abbreviation lists - Too complex, unmaintainable for 100+ languages
- Character-only chunking - Breaks sentences mid-thought, poor translation quality
- Language-specific rules - Impractical to maintain for 100+ languages

### Decision 7: Extension Attribute Cleanup
**Choice**: Always remove `data-aiwc-original-id` attributes after translation completion

**Rationale**:
- Prevents addon trace pollution in website code
- Avoids conflicts with site scripts that might query attributes
- Cleaner debugging experience for web developers
- Reduces attack surface for attribute-based extension detection
- Ensures DOM is clean after translation completes

**Implementation**:
```javascript
function cleanupPlaceholderIds(blockContainer) {
  const markedElements = blockContainer.querySelectorAll('[data-aiwc-original-id]');
  for (const element of markedElements) {
    element.removeAttribute('data-aiwc-original-id');
  }
}

// Call after successful translation:
await applyReassembledHTML(blockContainer, reassembledHTML);
cleanupPlaceholderIds(blockContainer);

// Also call after timeout/failure:
cleanupPlaceholderIds(blockContainer);
```

**Cleanup Triggers**:
- After successful translation application
- After timeout reverts to original HTML
- After fallback to atomic extraction
- On PlaceholderRegistry cleanup/clear

## Risks / Trade-offs

### Risk 1: AI Providers Remove Placeholders
**Probability**: Medium
**Impact**: High (translation lost or garbled)

**Mitigation**:
- Robust fallback: Detect missing placeholders, fall back to atomic extraction
- Explicit prompt instructions with examples
- Post-translation validation: If no placeholders found, retry with atomic extraction
- Feature flag: Allow users to disable placeholder system if needed

### Risk 2: AI Modifies Placeholder Format
**Probability**: Low
**Impact**: Medium (reassembly fails)

**Mitigation**:
- Fuzzy regex matching: `/\[\[\s*AIWC-(\d+)\s*\]\]/g` handles `[[AIWC-0]]`, `[[ AIWC-0 ]]`, `[[AIWC-0 ]]`
- Whitespace-tolerant parsing for robustness
- Multiple parsing strategies before falling back
- Log all format modifications for monitoring

### Risk 3: Memory Leak from Placeholder Registry
**Probability**: Low
**Impact**: Medium (memory exhaustion)

**Mitigation**:
- Use `clear()` method on deactivation
- WeakMap for DOM element references (if needed)
- ResourceTracker integration for automatic cleanup
- Monitor memory usage in tests

### Risk 4: Performance Degradation
**Probability**: Low
**Impact**: Low (slower translations)

**Mitigation**:
- Block-level grouping reduces number of requests
- Lazy initialization of PlaceholderRegistry
- Performance benchmarks with 1000+ nodes
- Optimization if overhead exceeds 5%

### Risk 5: RTL Layout Breaks
**Probability**: Low
**Impact**: High (unreadable translations)

**Mitigation**:
- Extensive Persian testing
- Preserve existing DirectionManager logic
- Test mixed RTL/LTR content
- User testing with native Persian speakers

## Migration Plan

### Phase 1: Foundation (Week 1)
**Goal**: Build placeholder system without modifying existing behavior

1. Create `PlaceholderRegistry.js`
2. Create `blockLevelExtraction.js`
3. Create `placeholderReassembly.js`
4. Add comprehensive unit tests
5. **Milestone**: All new files have tests, no integration yet

### Phase 2: Integration (Week 2)
**Goal**: Integrate placeholder system into Select Element workflow

1. Modify `TextExtractionService.js` - Provider detection
2. Modify `domManipulation.js` - Placeholder routing
3. Modify `textProcessing.js` - Preserve placeholders
4. Modify `DOMNodeMatcher.js` - Reassembly logic
5. Add integration tests
6. **Milestone**: End-to-end placeholder flow works

### Phase 3: AI Provider Integration (Week 3)
**Goal**: Ensure AI providers handle placeholders correctly

1. Modify `BaseAIProvider.js` - Batching protection
2. Update AI provider prompts with placeholder instructions
3. Test with Gemini, OpenAI, Claude, DeepL
4. Add robustness tests (missing/modified placeholders)
5. **Milestone**: All AI providers preserve placeholders 95%+ of the time

### Phase 4: Testing & Refinement (Week 4)
**Goal**: Comprehensive testing and bug fixes

1. RTL language testing (Persian)
2. Complex HTML testing (GitHub, docs)
3. Performance testing
4. Backward compatibility testing
5. **Milestone**: Production-ready implementation

### Rollback Plan

If critical issues discovered in production:

1. **Feature flag**: Disable placeholder system via settings
   ```javascript
   settingsStore.updateSettingLocally('enablePlaceholderSystem', false);
   ```

2. **Code revert**: Comment out placeholder routing in `domManipulation.js`
   ```javascript
   // if (usePlaceholders) {
   //   return collectTextNodesWithPlaceholders(targetElement);
   // }
   ```

3. **Hotfix**: Deploy patch within 24 hours

4. **Communication**: Notify users of known issue

**Rollback Decision Criteria**:
- >5% increase in translation failures
- >10% increase in user complaints
- Critical rendering issues in RTL languages
- Memory leaks or performance degradation

## Open Questions

1. **Should we add a user setting for placeholder system?**
   - **Pros**: Allows users to disable if problematic, easier testing
   - **Cons**: Adds UI complexity, most users won't understand the setting
   - **Decision**: Add as hidden setting (not in UI) for now, expose in UI if needed

2. **How to handle inline elements with event listeners?**
   - **Pros**: Clone nodes to preserve original listeners
   - **Cons**: Cloning may miss some listeners, increases complexity
   - **Decision**: Clone nodes with `cloneNode(true)`, document behavior

3. **Should we log placeholder preservation rate?**
   - **Pros**: Monitoring data for quality assurance
   - **Cons**: Privacy concerns, data storage overhead
   - **Decision**: Log locally only, no telemetry, respect privacy settings

4. **What happens if block container is BODY or HTML?**
   - **Pros**: Maximum context for translation
   - **Cons**: Too much content, may exceed provider limits
   - **Decision**: Limit to direct children of clicked element's block parent, not entire page

## Architecture Diagram

```
User Click Element
       │
       ▼
TextExtractionService.extractText()
       │
       ├──► isAIProvider()?
       │         │
       │         ├──► YES ──► PlaceholderRegistry.register()
       │         │                   │
       │         │                   ▼
       │         │          blockLevelExtraction.extractBlockWithPlaceholders()
       │         │                   │
       │         │                   ├──► "Agent [[AIWC-0]] AI [[AIWC-1]]!"
       │         │                   │
       │         │                   └──► Mapping: [[AIWC-0]] → <em>, [[AIWC-1]] → <strong>
       │         │
       │         └──► NO ───► collectTextNodesOptimized() (existing)
       │                              │
       │                              └──► ["Agent ", "Zero", " AI"]
       │
       ▼
Translation Request (with placeholders for AI)
       │
       ▼
AI Provider (preserves [[AIWC-0]], [[AIWC-1]])
       │
       ▼
Translated: "عامل [[AIWC-0]] هوش مصنوعی [[AIWC-1]] عالی است!"
       │
       ▼
placeholderReassembly.extractPlaceholdersFromTranslation()
       │
       ├──► Found: [[AIWC-0]] at position 4, [[AIWC-1]] at position 30
       │
       ▼
placeholderReassembly.reassembleTranslationWithPlaceholders()
       │
       ├──► Replace [[AIWC-0]] with <em>Zero</em>
       ├──► Replace [[AIWC-1]] with <strong>rocks</strong>
       │
       ▼
cleanupPlaceholderIds(blockContainer)
       │
       ├──► Remove data-aiwc-original-id attributes
       │
       ▼
DOM Applied: <p>عامل <em>Zero</em> هوش مصنوعی <strong>rocks</strong> عالی است!</p>
```

## Testing Strategy

### Unit Tests (60%)
- PlaceholderRegistry: Register, retrieve, clear operations
- blockLevelExtraction: Container detection, inline element detection, text extraction
- placeholderReassembly: Placeholder parsing, reassembly, fallback logic

### Integration Tests (30%)
- End-to-end: Selection → extraction → translation → reassembly
- Multi-provider: Test all AI providers
- Cross-browser: Chrome and Firefox compatibility

### Manual Tests (10%)
- Real-world websites: GitHub, documentation sites, news sites
- RTL languages: Persian, Arabic translations
- Edge cases: Very long text, deeply nested HTML, missing placeholders

**Test Coverage Goal**: >85%

## Performance Targets

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Translation time overhead | <5% increase | Benchmark before/after |
| Memory usage | <10% increase | Chrome DevTools Memory profiler |
| Placeholder preservation rate | >95% | Automated test results |
| Fallback trigger rate | <5% | Error tracking logs |
| CPU usage | <2% increase | Chrome DevTools Performance profiler |
| Intl.Segmenter compatibility | Chrome 87+, Firefox 125+, Safari 14.1+ | Feature detection |
| Cleanup success rate | 100% | All `data-aiwc-original-id` removed |
| Multi-language chunking accuracy | >95% | Sentence boundary detection across 100+ languages |
