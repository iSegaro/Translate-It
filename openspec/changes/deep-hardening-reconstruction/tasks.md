## 1. Marker Protocol & Infrastructure

- [x] 1.1 Update `DomTranslatorAdapter` to generate randomized entropy-scoped escaping.
- [x] 1.2 Implement entropy-scoped escaping of `@@` -> `@@TI_ESC_<entropy>@@` during marker injection.
- [x] 1.3 Update `injectMarkers()` to emit canonical markers: `@@TI_SEG_<entropy>_<sessionId>_<id>@@`.

## 2. Hardened Deterministic Parser

- [x] 2.1 Develop a strict generator / tolerant parser that accepts metadata mutations (spacing, case-insensitive `TI_SEG`) while enforcing strict matching for `sessionId`, entropy-scoped escaping, and `segmentId`.
- [x] 2.2 Implement pre-parsing sanitization to strip zero-width characters from marker tokens.
- [x] 2.3 Refactor `splitTranslatedBlock()` to use the deterministic validation model and implement entropy-scoped escaping unescaping.

## 3. Structural Validation & Integrity

- [x] 3.1 Implement structural validation (monotonicity, uniqueness, completeness).
- [x] 3.2 Ensure deterministic behavior rejection (literal fallback) for any marker-like sequence that fails validation criteria.
- [x] 3.3 Ensure the all-or-nothing rollback is triggered on any structural or metadata violation.

## 4. Cache & Bidi Hardening

- [x] 4.1 Refactor `BlockGroupReconstructor` to use a transaction-scoped Bidi cache (WeakMap) per `apply()` call.
- [x] 4.2 Ensure Bidi heuristics remain lightweight and performant within the transaction scope.

## 5. Verification & Testing

- [x] 5.1 Migrate unit tests to the hardened reconstruction protocol.
- [x] 5.2 Add "fuzzy" test cases verifying metadata tolerance with strict value matching.
- [x] 5.3 Add tests for deterministic behavior rejection of foreign markers and entropy-scoped escaping mechanism.
- [x] 5.4 Add adversarial tests for structural validation (reordered, missing, duplicate).
