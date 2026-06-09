## Context

The DOM translation reconstruction system must balance the unpredictability of LLM outputs with the need for deterministic DOM restoration. This design adopts a "strict generator / tolerant parser" strategy combined with a deterministic validation model to provide entropy-scoped escaping.

## Goals / Non-Goals

**Goals:**
- Implement a tolerant parser for marker metadata (spacing, casing, noise).
- Enforce strict deterministic validation (matching session, entropy, and expected IDs).
- Use entropy-scoped escaping (`@@TI_ESC_<entropy>@@`) to prevent delimiter collisions.
- Ensure structural validation (monotonicity, uniqueness, completeness).
- Refactor Bidi caching to be transaction-scoped for fresh state.

**Non-Goals:**
- Using heuristics to "guess" if a marker is inside a URL or code block.
- Implementing a symmetric escaping protocol without entropy-scoped escaping.
- Incremental/streaming parsing logic within the reconstructor.

## Decisions

### 1. Deterministic Validation Model
Instead of contextual heuristics (URLs, code blocks), the parser uses a deterministic matching model.
- **Match Criteria**: A sequence is only a marker if it matches the active `sessionId`, the current `entropy` prefix, and one of the `segmentIds` expected for the current block group.
- **Literal Fallback**: Any sequence that "looks like" a marker but fails any of the match criteria is automatically treated as literal text. This provides strong isolation without complex guessing.

### 2. Entropy-Scoped Escaping
To prevent literal `@@` in content from being confused with markers, they are escaped using entropy-scoped escaping.
- **Format**: `@@TI_ESC_<entropy>@@`.
- **Rationale**: Since the entropy is randomly generated per session, there is a statistically negligible collision probability for user content to collide with this specific escape token.

### 3. Strict Generator / Tolerant Parser
The parser regex/tokenizer allows metadata mutations but requires strict ID/Session/Entropy values.
- **Tolerated**: Optional whitespace around delimiters and underscores, case-insensitivity for `TI_SEG`.
- **Strict**: `sessionId`, `entropy`, and `segmentId` tokens must be exact matches.
- **Sanitization**: Zero-width characters (ZWSP, ZWNJ) are stripped from tokens before matching.

### 4. Transaction-Scoped Bidi Cache
The `directionCache` (WeakMap) is created fresh at the start of every `apply()` call.
- **Rationale**: Ensures Bidi lookups are fresh for each pass and prevents stale state issues in dynamic applications.

## Risks / Trade-offs

- **[Risk] Tolerance vs. Over-matching** → Increased metadata tolerance might match things that look like markers.
  - *Mitigation*: The deterministic validation model (matching entropy + session + expected IDs) makes accidental matches highly unlikely.
- **[Trade-off] Escaping Overhead** → Escaping `@@` adds a small amount of token overhead.
  - *Mitigation*: Entropy-scoped escaping provides a practically collision-resistant mechanism that justifies the minimal overhead.

## Migration Plan

1. Update `DomTranslatorAdapter` to generate entropy and handle escaping.
2. Implement hardened reconstruction protocol and structural validation in `BlockGroupReconstructor`.
3. Update unit tests to verify deterministic behavior rejection and entropy-scoped escaping.
