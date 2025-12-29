# Design: Improve Select Element Reliability

## Context
The Select Element feature currently suffers from two major architectural problems:

1. **Over-Engineered RTL Detection**: The `textDirection.js` module uses 477 lines of complex logic with word-ratio calculations, pattern matching, and mixed content processing that wraps English terms in `<span dir="ltr">` with CSS classes. This approach is error-prone and unnecessary, as demonstrated by Immersive Translate's simple solution of using container-level `dir="rtl"` for RTL translations, which preserves HTML formatting and relies on Unicode bidirectional algorithm for mixed content.

2. **Unreliable Segment Mapping**: The current text extraction and reassembly process uses content-based matching that can fail when translations change text structure. There's no persistent identifier to map translations back to their original DOM positions, leading to incorrect text placement.

## Goals / Non-Goals
### Goals
- Fix RTL display issues that make translations unreadable for RTL language users
- Simplify direction detection logic from 477 lines to ~30 lines
- Implement reliable segment identification and mapping
- Maintain backward compatibility with all translation providers
- Reduce code complexity and improve maintainability

### Non-Goals
- Complete rewrite of the element selection system
- Breaking changes to existing provider APIs
- Removal of existing features (only simplification and improvements)

## Decisions

### Decision 1: Immersive Translate-Style Container Direction
**What**: Apply text direction at the container level using `dir` attribute based on target language, preserving inline HTML formatting without modification.

**Why**:
- Follows proven pattern from Immersive Translate which works reliably
- Simpler than complex content analysis and span wrapping
- Preserves original HTML formatting (<em>, <strong>, etc.) like Immersive Translate
- Container-level `dir` attribute handles mixed content automatically via Unicode bidi
- Eliminates 447 lines of complex mixed content processing

**Alternatives considered**:
- Keep current span-wrapping approach (rejected: over-engineered, error-prone)
- Complex content analysis with thresholds (rejected: unreliable, complex)
- CSS-only solutions (rejected: doesn't work for all scenarios)

### Decision 2: Unique Segment IDs During Extraction
**What**: Assign a unique ID to each text segment during extraction and maintain a mapping to the original DOM element.

**Why**:
- Provides reliable mapping regardless of translation content changes
- Enables ID-based translation application that's immune to text matching failures
- Works with all provider types (JSON and array responses)
- Simplifies reassembly logic significantly

**Alternatives considered**:
- Improve content-based matching (rejected: fundamentally unreliable)
- Use DOM paths as identifiers (rejected: can break with dynamic content)

### Decision 3: Hybrid Provider Response Handling
**What**: Implement smart detection for provider response types with automatic fallback to array format for traditional providers.

**Why**:
- Maintains compatibility with existing providers
- Allows AI providers to use enhanced JSON responses with segment mapping
- Graceful degradation ensures no provider is left behind
- Future-proof for new provider types

**Alternatives considered**:
- Force all providers to use JSON (rejected: breaks existing providers)
- Keep only array format (rejected: limits AI provider capabilities)

### Decision 4: Phased Implementation
**What**: Implement changes in phases, starting with RTL fix (highest user impact) followed by segment ID system.

**Why**:
- Minimizes risk by testing major changes separately
- RTL fix provides immediate user benefit
- Allows rollback of individual phases if issues arise
- Easier code review and testing

**Alternatives considered**:
- Implement both simultaneously (rejected: too much change at once, harder to debug)

## Risks / Trade-offs

### Risk: RTL Detection Oversimplification
**Risk**: Simplified logic might not handle edge cases correctly
**Mitigation**: Keep content analysis as fallback for unknown target languages, add comprehensive testing for language pairs

### Risk: Segment ID Performance Impact
**Risk**: Storing segment mappings might increase memory usage
**Mitigation**: Use efficient data structures (Map), cleanup mappings on deactivation, measure impact during implementation

### Risk: Provider Compatibility Issues
**Risk**: Changes might break existing provider integrations
**Mitigation**: Hybrid response handling with fallbacks, extensive testing with all provider types

### Trade-off: Reduced Flexibility vs. Simplicity
**Trade-off**: Removing complex mixed content processing reduces flexibility in edge cases
**Justification**: Current complexity causes more problems than it solves; target-language-first approach is more reliable

## Migration Plan

### Phase 1: RTL Direction Fix (Week 1)
1. Simplify `textDirection.js` to ~30 lines following Immersive Translate pattern
2. Implement container-level `dir` attribute based on target language
3. Remove span-wrapping for English terms (preserve <em>, <strong>, etc.)
4. Remove mixed content processing and CSS classes (`.ltr-term`, `.aiwc-mixed-text`)
5. Test RTL translations with preserved English terms like <em>API</em>, <em>Z.ai</em>

### Phase 2: Segment ID System (Week 2-3)
1. Modify `textExtraction.js` to assign unique IDs
2. Update `textProcessing.js` for segment ID support
3. Enhance `domManipulation.js` for ID-based application
4. Implement hybrid provider response handling
5. Test with all provider types

### Phase 3: Integration & Polish (Week 4)
1. Comprehensive testing across browsers
2. Performance benchmarking
3. Documentation updates
4. Final validation and cleanup

### Rollback Plan
- Each phase can be independently rolled back
- Feature flags can control individual improvements
- Existing implementations remain as fallbacks

## Open Questions
- Should we use exactly the same class names as Immersive Translate (`notranslate immersive-translate-target-wrapper`) or our own naming convention?
- How deep should HTML formatting preservation go? Should we handle nested elements like `<em><strong>...</strong></em>`?
- Should we add optional enhanced features like Immersive Translate's font-style `<font>` wrapper, or keep it simple?
- How should we handle edge cases where target language is RTL but content is mostly English? (follow Immersive Translate: always use target language direction)