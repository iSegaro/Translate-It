## ADDED Requirements

> **Status**: LOCKED. Decision D5 (structural segment count enforcement) and H4 verdict (prompt simplification is safe) are confirmed by Phase 0 analysis.

---

## What Changes in the Prompt

### Before (current — `PROMPT_BASE_AI_BATCH`)

The current prompt contains two categories of instructions that must be handled differently:

**Dead instructions (removed in Phase 4)**:
- `"If you see markers like <n1/> or <n2/> treat them as literal line break markers..."` — dead code; no markers are injected
- `"If the text contains placeholders like [[AIWC-0]], copy them exactly as is."` — dead code; no placeholders are injected
- These contradict the actual payload format (UID-tagged JSON) and must be removed

**Live instructions (preserved)**:
- `"You are an expert translation service. Translate...from $_{SOURCE} to $_{TARGET}."` — retained
- `"$_{PROMPT_INSTRUCTIONS}"` — retained (user-configurable linguistic guidance; this is where RTL-specific guidance lives)
- Segment count constraint — restructured from advisory ("MUST") to structurally-enforced (see below)

**New Active Marker Instruction (added in Phase 4)**:
- `"If the text contains segment boundaries in the format [--SEG:nN--] (where nN is a alphanumeric node ID), you MUST preserve these markers exactly as-is. Do not modify, translate, rearrange, or delete these markers."` — This ensures the LLM handles the printable markers stably.

### After (simplified — `PROMPT_BASE_AI_BATCH` Phase 4+)

```
You are an expert translation service. Translate the following JSON from $_{SOURCE} to $_{TARGET}.

$_{PROMPT_INSTRUCTIONS}

Rules:
- Return a valid JSON object with a "translations" array containing exactly $_{N} items.
- Each item must have "id" (same as input) and "text" (translated).
- Preserve all internal whitespace exactly.
- If the translated text contains segment markers like [--SEG:nN--], you MUST preserve them exactly as-is. Do not translate, modify, rearrange, or remove these markers.

$_{TEXT}
```

- `$_{N}` = the exact count of segments sent — makes the count a concrete, visible constraint for the LLM
- `$_{PROMPT_INSTRUCTIONS}` = user-configurable; currently contains user's linguistic preferences including any RTL-specific guidance
- No dead marker references (`[[AIWC-0]]`, `<n1/>`), no positional constraints, no structural formatting instructions

---

### Requirement: LLM prompts must not contain dead marker instructions

The prompt builder SHALL NOT include `[[AIWC-0]]`, `<n1/>`, `<n2/>`, or equivalent dead placeholder/marker references in any LLM-visible prompt string. (Phase 4)

#### Scenario: No dead marker references in constructed prompt
- **WHEN** `buildBlockGroupPrompt(units, sourceLang, targetLang, instructions)` constructs a translation request
- **THEN** the resulting prompt string contains no `[[`, `]]`, `<n`, or `/>` marker patterns

#### Scenario: V2 prompt path preserved under feature flag false
- **WHEN** `FEATURE_SEMANTIC_BLOCK_GROUPING` is `false`
- **THEN** the existing `buildPrompt()` function is used unchanged — old marker references remain in the V2 path until cutover (Phase 7)

---

### Requirement: Prompts must stably instruct LLM to preserve active printable segment markers

The prompt SHALL include clear, explicit rules instructing the LLM to preserve active printable segment markers (`[--SEG:nN--]`) exactly as-is without any modifications.

#### Scenario: Prompt instructs LLM to copy markers verbatim
- **WHEN** translating grouped text containing `[--SEG:n2--]`
- **THEN** the prompt contains: `"If the translated text contains segment markers like [--SEG:nN--], you MUST preserve them exactly as-is. Do not translate, modify, rearrange, or remove these markers."`

---

### Requirement: Segment count must be stated explicitly in the prompt as a concrete number

The prompt SHALL include the exact number of segments (`$_{N}`) as a visible integer in the segment count rule. This makes the count constraint actionable for the LLM, not just advisory.

#### Scenario: Prompt states exact segment count
- **WHEN** 7 block groups are being translated
- **THEN** the prompt reads `"...containing exactly 7 items..."` — not `"the exact same number of items as the input"`

---

### Requirement: Segment count enforcement must be structural, not advisory

The pipeline SHALL validate that the LLM response contains exactly N items for N sent segments. Mismatches are structural errors triggering all-or-nothing rollback. (Decision D5)

**Enforcement location**: `_validateSegmentCount(expected, actual, context)` in `OptimizedJsonHandler._mapResults()` — called after each batch response is parsed.

**New behavior (Phase 4+)**: Count mismatch produces `logger.error()` with block group attribution, aborts the entire block group, and rolls it back atomically to original text node values.

#### Scenario: Count mismatch aborts and rolls back
- **WHEN** 5 block groups are sent and 3 results are received
- **THEN**:
  1. `logger.error('[OptimizedJsonHandler] Structural segment count mismatch: expected 5, received 3. Context: ${messageId}')` is called
  2. The entire block group translation is aborted
  3. All touch nodes in this session are rolled back to their original values (all-or-nothing semantics)
  4. No partial translations are written to the live DOM

---

### Requirement: $_{PROMPT_INSTRUCTIONS} injection must be preserved

The simplified prompt MUST retain the `$_{PROMPT_INSTRUCTIONS}` injection point. This is where user-configurable linguistic guidance lives — including any RTL-specific instructions the user has added.

#### Scenario: User RTL instructions passed through to simplified prompt
- **WHEN** the user has configured `PROMPT_INSTRUCTIONS` with Persian-specific guidance (e.g., "تمام جملات را به صورت روان و طبیعی ترجمه کن")
- **THEN** that guidance appears in the simplified prompt under `$_{PROMPT_INSTRUCTIONS}` exactly as configured

---

### Requirement: LLM responses must remain structured JSON (not plain text)

**This requirement supersedes the previous provisional spec** which proposed plain-text responses. Phase 0 analysis confirmed that the existing UID-tagged JSON response format (`{"translations":[{"id":"0","text":"..."}]}`) is sound. The response format is retained — only the prompt instructions change.

**Rationale**: Moving to plain-text responses would break the UID-based result mapping and introduce positional ordering dependencies. The JSON response format with `id` fields is the correct contract and is not changed.

#### Scenario: Response parsed as JSON translations array
- **WHEN** an LLM provider returns a translation response
- **THEN** the response is parsed as `{"translations":[{"id":"...", "text":"..."}]}` and results are matched to block groups by `id`

#### Scenario: Response with extra whitespace in translated text handled gracefully
- **WHEN** an LLM returns `{"id":"0","text":"  مرحبا  "}` with extra whitespace
- **THEN** the pipeline trims the `text` value and reconstruction re-applies the original `leadingWS`/`trailingWS` from the IR — not the LLM's whitespace
