## ADDED Requirements

> **Status**: LOCKED. Decisions D1, D3, D4 are confirmed by Phase 0 analysis. The provisional warning is removed.

---

### Requirement: TranslationUnit IR must use an enriched tuple schema

The `TranslationUnit` IR SHALL conform to the following locked schema. All fields are set at extraction time and are immutable during translation.

```js
/**
 * @typedef {Object} TranslationUnit
 * @property {string}   id              - Node UID. Format: "nN" (e.g. "n1", "n42"). Position-derived, not random.
 * @property {string}   blockId         - Block group ID. Shared among all nodes in the same block ancestor.
 * @property {string}   text            - Trimmed text content. This is what the LLM translates.
 * @property {string}   leadingWS       - Original leading whitespace. Pipeline-owned; not sent to LLM; re-applied post-reconstruction.
 * @property {string}   trailingWS      - Original trailing whitespace. Pipeline-owned; not sent to LLM; re-applied post-reconstruction.
 * @property {boolean}  preWhitespace   - true if parent has white-space: pre/pre-wrap/pre-line or tag is PRE/CODE/TEXTAREA/SAMP/KBD.
 *                                        Nodes with preWhitespace=true are always routed to V2_PASSTHROUGH, never block-grouped.
 * @property {'rtl'|'ltr'|null} directionHint - Detected script direction of text content. Captured at extraction. null = undetermined.
 * @property {string[]} inlineParentTags - Ordered list of inline ancestor tag names between text node and block ancestor. e.g. ["b", "i"]
 * @property {'standard'|'V2_PASSTHROUGH'} mode - Routing mode. V2_PASSTHROUGH nodes skip the new pipeline entirely.
 */
```

#### Scenario: Schema fully populated at extraction time
- **WHEN** `collectBlockGroups(element)` processes a text node
- **THEN** all fields are set before the function returns; no field is left undefined

#### Scenario: preWhitespace=true triggers V2 passthrough
- **WHEN** a text node's parent element has tag `PRE`, `CODE`, `TEXTAREA`, `SAMP`, or `KBD`
- **OR WHEN** the parent's computed `white-space` property is `pre`, `pre-wrap`, or `pre-line`
- **THEN** the node's `mode` is set to `V2_PASSTHROUGH` and it is NOT included in any block group

---

### Requirement: Extractor must enforce reversible escaping for marker collision safety

The extraction layer MUST guarantee absolute collision safety against the printable marker pattern `[--SEG:nN--]` using a fully reversible escaping protocol to prevent content corruption.

#### Scenario: Delimiter occurrences escaped reversibly
- **WHEN** a text node contains the literal sequence `"Check [--SEG:n4--] values"`
- **THEN** the extractor replaces `"[--SEG:"` with the escape pattern `"[--ESCAPED_SEG:"`, producing `text: "Check [--ESCAPED_SEG:n4--] values"`
- **AND** the payload is sent to the LLM with the escaped version, preventing any tokenizer splitting or marker confusion
- **AND** the reconstruction engine reverses this sequence back to the original content post-translation, ensuring zero text loss or corruption

---

### Requirement: TranslationUnit IR must encode whitespace ownership — boundary-strip model

The `TranslationUnit` IR encodes whitespace using the **boundary-strip-and-restore** model. Leading and trailing whitespace is pipeline-owned; internal whitespace is LLM-owned.

**Rule**:
- `text` = `originalContent.trim()` — the trimmed string sent to the LLM
- `leadingWS` = match of `/^(\s*)/` on `originalContent`
- `trailingWS` = match of `/(\s*)$/` on `originalContent`
- Reconstruction assembles: `leadingWS + translatedText.trim() + trailingWS`

**CSS `white-space` interaction**: Nodes with `white-space: pre`/`pre-wrap`/`pre-line` are excluded from block grouping (Decision D4) and routed via V2 passthrough. This exclusion means the strip-and-restore model is never applied to content where internal whitespace is semantically significant — that is Phase 1's scope boundary.

#### Scenario: Leading/trailing whitespace preserved across translation
- **WHEN** a text node contains `"  Hello world  "` and is translated to `"مرحبا بالعالم"`
- **THEN** the DOM node value after reconstruction is `"  مرحبا بالعالم  "` — original boundary whitespace restored

#### Scenario: pre/code node excluded, not stripped
- **WHEN** a text node inside `<code>` is encountered
- **THEN** it is given `mode: V2_PASSTHROUGH` and processed by the V2 per-node path without whitespace stripping

---

### Requirement: TranslationUnit IR must encode punctuation ownership

The `TranslationUnit` IR uses the **LLM-owned punctuation** model — all punctuation within a segment's `text` field is sent to the LLM and owned by the LLM's output. The pipeline does not strip, normalize, or re-apply punctuation.

**Rule**: Punctuation is part of the `text` field. No punctuation pre-processing is applied by the extractor. Post-reconstruction, punctuation placement is handled by the Unicode bidi algorithm and browser rendering — not by the pipeline.

**RTL punctuation mirroring**: Deferred to browser bidi algorithm. The pipeline injects RLM/LRM marks at segment boundaries to signal direction to the bidi algorithm; parentheses, quotation marks, and similar mirrored characters are positioned by the browser, not by the pipeline.

#### Scenario: Sentence-final punctuation is part of the adjacent text node's unit
- **WHEN** a text node contains `"Hello"` and an adjacent sibling text node contains `"."` following a `</strong>` tag
- **THEN** each is its own `TranslationUnit` with `text: "Hello"` and `text: "."` respectively. No punctuation is moved between units. Block grouping joins them as a logical unit for the LLM (see reconstruction contract).

---

### Requirement: TranslationUnit IR must encode bidi isolation boundaries as structural metadata

The `TranslationUnit` IR captures bidi isolation context in `directionHint` and `inlineParentTags`. Explicit Unicode bidi control characters in source text are stripped from `text` and NOT passed to the LLM — they are restored by reconstruction.

**Rule**:
- `directionHint`: set from detected script direction of `text` content (statistical detection)
- If a parent element has an explicit `dir="rtl"` or `dir="ltr"` attribute, `directionHint` is set from the attribute (takes precedence over statistical detection)
- Explicit bidi control characters (U+2066–U+2069, U+202A–U+202E) are stripped from `text` before LLM dispatch and recorded in IR metadata for re-application

> **Phase 1 scope**: `<bdi>` element injection and `unicode-bidi: isolate` CSS wrapping are Phase 5/6 scope. Phase 1 captures direction metadata for post-reconstruction `dir` attribute propagation only.

#### Scenario: dir attribute captured as directionHint
- **WHEN** a text node is inside `<span dir="rtl">`
- **THEN** `directionHint` is `"rtl"` regardless of the text content's statistical direction

#### Scenario: Bidi control characters stripped from LLM text
- **WHEN** a text node contains `"Hello\u202Aworld\u202C"` (LRE + PDF)
- **THEN** `text` = `"Hello world"` and the bidi characters are stored separately for re-application

---

### Requirement: TranslationUnit IR must formally model nested inline semantic ownership — flat model

The IR uses a **flat model** for nested inline elements. Each text node is a separate `TranslationUnit`. The `inlineParentTags` field records ancestor inline tags for context — it is not used for reconstruction splitting; it is informational metadata.

**Rule**: Block grouping provides the grammatical context that nested inline isolation previously lacked. A group containing `["Hello ", "world", "."]` from `<p>Hello <b>world</b>.</p>` is sent as one logical block to the LLM. Reconstruction splits at whitespace markers (see reconstruction spec). The `inlineParentTags` records `["b"]` for the `"world"` node — for future Phase 5/6 bidi handling, not for Phase 1 reconstruction.

#### Scenario: Nested inline text captured as flat unit with parent tag metadata
- **WHEN** a text node `"text"` inside `<b><i>text</i></b>` is extracted
- **THEN** `inlineParentTags: ["b", "i"]`, `text: "text"`, `blockId` = nearest block ancestor's ID

---

### Requirement: TranslationUnit IR must define handling for preformatted nodes — V2 passthrough

Preformatted nodes (`pre`/`code`/`white-space: pre`) are excluded from block grouping and processed via the V2 per-node path. This is the Phase 1 scope boundary (Decision D4).

#### Scenario: PRE node passes through to V2
- **WHEN** a text node inside `<pre>` is encountered during extraction
- **THEN** it is extracted with `mode: 'V2_PASSTHROUGH'`, not added to any block group, and processed by the V2 `_applyTranslationToNode()` directly

---

### Requirement: IR must use session-scoped WeakMap for block group membership — no DOM writes

Block group membership (`blockId` assignment) MUST be tracked using a session-scoped `WeakMap<Element, string>` held by the extraction context. The live DOM MUST NOT be modified during extraction. `dataset.blockId` or any equivalent DOM attribute MUST NOT be written. (Decision D3)

#### Scenario: Extraction leaves DOM unmodified
- **WHEN** `collectBlockGroups(element)` runs
- **THEN** no `element.dataset.*` attribute is written, no `element.setAttribute()` is called, and no DOM mutation events fire

#### Scenario: WeakMap is GC-eligible after session ends
- **WHEN** the extraction context is released at the end of a translation session
- **THEN** the WeakMap and all referenced entries become GC-eligible with no memory leak

---

### Requirement: IR identity keys must be stable, unique, and position-derived

Each `TranslationUnit` SHALL have an `id` that is:
- **Unique** within its extraction session (format: `"nN"` where N is the sequential node counter)
- **Position-derived**: generated from the order of TreeWalker traversal, not from random values
- **Never sourced from LLM output**

Block group IDs (`blockId`) are generated once per block ancestor element: format `"gN"` where N is a session-scoped counter. Stored only in the WeakMap — never in the DOM.

#### Scenario: Duplicate IDs never generated in one session
- **WHEN** `collectBlockGroups(element)` processes 500 text nodes
- **THEN** all 500 `id` values are unique strings

#### Scenario: blockId never appears in DOM after extraction
- **WHEN** extraction is complete
- **THEN** `document.querySelector('[data-block-id]')` returns null within the translated element's subtree
