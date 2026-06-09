## ADDED Requirements

### Requirement: Pipeline audit must cover streaming behavior end-to-end
The analysis SHALL trace how streaming translation responses are received, buffered, and applied to the DOM — including what DOM state exists during an in-flight stream before the full response is complete.

#### Scenario: Streaming chunk application traced
- **WHEN** the analyst traces the streaming path in `src/features/translation/`
- **THEN** every point where a partial streaming chunk triggers a DOM write is identified and documented

#### Scenario: Mid-stream cancellation behavior documented
- **WHEN** the analyst traces cancellation during an active streaming session
- **THEN** the exact DOM state resulting from cancellation at any point in the stream is documented — including whether partial writes are rolled back, preserved, or left in an inconsistent state

---

### Requirement: Pipeline audit must document all concurrency ordering behavior
The analysis SHALL identify all paths where two or more translation sessions can be active simultaneously, and document how DOM write ordering is currently controlled (or not controlled) between them.

#### Scenario: Concurrent session paths identified
- **WHEN** the analyst reviews the translation coordinator and request tracker
- **THEN** all conditions under which concurrent sessions can operate on overlapping DOM subtrees are documented

#### Scenario: Write ordering guarantees documented
- **WHEN** the analyst traces DOM mutation sites
- **THEN** the presence or absence of write locks, queues, or subtree exclusion mechanisms is explicitly documented — not assumed

---

### Requirement: Pipeline audit must document incremental DOM mutation safety
The analysis SHALL determine whether current DOM writes are frame-batched, atomic per-batch, or incremental per-segment — and whether this causes observable flicker or visual instability.

#### Scenario: DOM write batching behavior documented
- **WHEN** the analyst traces reconstruction DOM writes
- **THEN** it is documented whether writes happen synchronously, in a single rAF callback, via document fragment, or per-segment incrementally

#### Scenario: Flicker risk identified
- **WHEN** the analyst reviews DOM mutation frequency relative to frame boundaries
- **THEN** any conditions that produce intermediate visible states (partial translations, mismatched inline elements) are documented as flicker risks

---

### Requirement: Pipeline audit must fully inventory marker-based logic
The analysis SHALL identify every location where markers are inserted, transmitted, parsed, or depended upon for reconstruction — including any implicit assumptions about marker ordering, uniqueness, or survival through the LLM.

#### Scenario: Marker insertion points identified
- **WHEN** the analyst searches `src/features/translation/` and `promptBuilder.js`
- **THEN** all marker insertion sites are listed with file paths and line references

#### Scenario: Marker survival assumptions documented
- **WHEN** the analyst traces the marker contract through the LLM prompt and response
- **THEN** all assumptions about marker ordering, uniqueness, and verbatim reproduction by the LLM are explicitly stated — and each assumption is flagged as confirmed or unverified

---

### Requirement: Pipeline audit must produce explicit hypothesis verdicts
The analysis report SHALL include an explicit verdict (confirmed / refuted / partially confirmed) for each of the five architectural hypotheses H1–H5 defined in `design.md`, supported by codebase evidence.

#### Scenario: H1 verdict with evidence
- **WHEN** the analysis of marker behavior is complete
- **THEN** the report states definitively whether marker corruption/misapplication is the root failure cause, with specific file/line evidence

#### Scenario: H3 streaming invariants assessed
- **WHEN** the streaming and concurrency analysis is complete
- **THEN** the report states whether the deterministic reconstruction streaming safety invariant (H3) is achievable without a scheduler redesign

#### Scenario: H4 RTL quality assessed
- **WHEN** the RTL semantic analysis is complete
- **THEN** the report states whether prompt simplification would preserve or degrade RTL linguistic quality, with evidence from `log.txt` or codebase inspection

---

### Requirement: Pipeline audit must formally resolve semantic ownership rules
The analysis SHALL produce an explicit, binding resolution of the following ownership questions before any IR design can be finalized:

1. **Whitespace ownership**: Which `TranslationUnit` owns leading/trailing whitespace when a text node is adjacent to an inline element? How does CSS `white-space: pre`, `nowrap`, `pre-wrap` change this?
2. **Punctuation ownership**: Which `TranslationUnit` owns punctuation characters that appear between inline elements or at sentence boundaries? How does this change for RTL content where punctuation mirroring applies?
3. **Bidi isolation boundaries**: Where exactly do Unicode bidi isolation scope boundaries fall in the IR? Are `dir` attributes, `unicode-bidi: isolate` CSS, and explicit `U+2066`/`U+2069` characters modeled as text content, element metadata, or separate structural units?
4. **Nested inline semantic ownership**: How is `<b><i>text</i></b>` modeled — are `<b>` and `<i>` nested IR units, sibling formatting annotations, or a flat sequence? What happens when translation requires reordering words across a tag boundary?
5. **Overlapping formatting semantics**: When a logical sentence spans multiple sibling text nodes with different inline tags, how are segment translation boundaries defined? Can a single `TranslationUnit` span multiple DOM nodes?

#### Scenario: Whitespace ownership resolved with examples
- **WHEN** the analysis phase produces its ownership resolution
- **THEN** each of the five ownership questions is answered with at least one concrete DOM example drawn from the actual pages the extension targets

#### Scenario: RTL punctuation ownership confirmed
- **WHEN** the analysis reviews Persian and Arabic content handling
- **THEN** the ownership rule for punctuation in RTL contexts (period, comma, quotation marks) is explicitly stated — including whether the current pipeline handles it correctly or not

---

### Requirement: No code must be modified during the analysis phase
The analysis phase SHALL be strictly read-only. No source files, configuration, or documentation may be altered during analysis.

#### Scenario: Analysis phase is read-only
- **WHEN** the analysis phase is active
- **THEN** zero files in `src/` are modified, created, or deleted

---

### Requirement: Architectural analysis report must be produced before implementation
The analysis SHALL result in a formal technical report covering all five Plan.md sections (A–E), all five hypothesis verdicts, streaming/concurrency/flicker/cancellation findings, and the five resolved semantic ownership rules.

#### Scenario: Report covers all required sections
- **WHEN** the analysis phase concludes
- **THEN** a written report exists with sections A through E, all hypothesis verdicts with evidence, streaming/concurrency findings, and formal ownership rule resolutions

#### Scenario: Report is sufficient to finalize specs
- **WHEN** the report is reviewed at the approval gate
- **THEN** every spec in this change can be confirmed, rejected, or revised based solely on report evidence — no additional codebase investigation is needed
