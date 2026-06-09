## ADDED Requirements

### Requirement: Structural Validation
The reconstruction system SHALL verify the integrity of the segment sequence. It MUST ensure that all segments from the original block are present, appear in monotonic order, contain no duplicates, and share the exact same `sessionId` and entropy-scoped escaping.

#### Scenario: Detecting missing or out-of-order segments
- **WHEN** segments `n1` and `n3` are returned without `n2`, OR returned as `n2, n1, n3`
- **THEN** the system MUST detect the corruption and trigger a full rollback.

### Requirement: Deterministic Validation Model
The parser SHALL NOT use heuristics to detect context (like URLs or code blocks). Instead, it MUST treat any marker-like sequence as literal text unless it matches the active `sessionId`, active entropy-scoped escaping, and one of the expected `<segmentId>`s for the current transaction.

#### Scenario: Deterministic rejection of foreign markers
- **WHEN** text contains `@@TI_SEG_wrong_session_n1@@`
- **THEN** the parser MUST treat this as literal text without further analysis.

### Requirement: Transaction-Scoped Bidi Cache
The system SHALL use a direction cache (WeakMap) that is instantiated per reconstruction transaction. This ensures that Bidi lookups are fresh and prevents stale state issues from affecting dynamic content.

#### Scenario: Fresh Bidi state per pass
- **WHEN** a reconstruction starts
- **THEN** a new `directionCache` MUST be created and used for all Bidi lookups in that pass.
