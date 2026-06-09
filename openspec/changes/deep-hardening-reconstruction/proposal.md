## Why

The current DOM translation reconstruction system uses a heuristic regex-split approach that is sensitive to minor LLM-induced mutations and potential marker collisions. While functional, it needs to be made more resilient to real-world LLM output variations and accidental collisions without introducing over-engineered complexity or nondeterministic heuristics. The goal is to move to a "strict generator / tolerant parser" model that maintains reconstruction integrity through deterministic validation.

## What Changes

- **Strict Generator / Tolerant Parser**: The system will generate markers in a strict canonical format (`@@TI_SEG_<entropy>_<sessionId>_<segmentId>@@`) but use a parser tolerant of realistic LLM mutations (spacing, casing in keywords, zero-width noise) for metadata only.
- **Deterministic Validation Model**: False-positive detection is handled by strict matching of `sessionId`, `entropy`, and `segmentId`. Any sequence not matching these exact values is treated as literal text, eliminating the need for heuristic context detection (e.g., URLs, code blocks).
- **Entropy-Scoped Escaping**: Implement a practically collision-resistant escaping mechanism for literal `@@` sequences using entropy-scoped escaping (e.g., `@@TI_ESC_<entropy>@@`).
- **Structural Validation**: Explicitly verify segment IDs, ordering, and session consistency (monotonic IDs, no duplicates, no missing segments).
- **Transaction-Scoped Bidi Cache**: Refactor the direction cache to be scoped to the reconstruction lifecycle, ensuring fresh state and preventing stale direction issues.
- **Post-Assembly Processing**: Explicitly define that reconstruction occurs after complete block assembly to keep the parser architecture simple and debuggable.

## Capabilities

### New Capabilities
- `hardened-reconstruction-protocol`: Defines the strict canonical grammar, the entropy-scoped escaping protocol, and the robust tokenization strategy.
- `structural-integrity-mechanisms`: Establishes requirements for detecting and recovering from corrupted or malformed LLM responses with deterministic behavior.

### Modified Capabilities
- (None)

## Impact

- **Core Reconstructor**: Refactoring of `src/features/element-selection/core/BlockGroupReconstructor.js` to implement the hardened parser, escaping protocol, and transaction-scoped cache.
- **Test Suite**: Migration and expansion of tests in `BlockGroupReconstructor.test.js` and `DomTranslatorStress.test.js` to include fuzzy marker scenarios, collision tests, and structural corruption cases.
