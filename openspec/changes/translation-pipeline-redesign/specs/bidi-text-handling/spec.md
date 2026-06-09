## ADDED Requirements

### Requirement: Text direction must be captured at extraction time, not inferred post-translation
The extraction layer SHALL record the computed text direction (`ltr`, `rtl`, or `auto`) of each DOM node into the `TranslationUnit` IR at the time of extraction. Direction SHALL NOT be inferred from the translated output.

#### Scenario: RTL node direction captured
- **WHEN** a DOM element with `dir="rtl"` or inherited RTL direction is extracted
- **THEN** the resulting `TranslationUnit` has `direction: 'rtl'` set in its metadata

#### Scenario: LTR node direction captured in RTL context
- **WHEN** an inline code element (`<code>`) appears inside an RTL paragraph
- **THEN** the `TranslationUnit` for the code element records `direction: 'ltr'` based on its computed style

---

### Requirement: Reconstruction must apply correct directionality when injecting translated text
The reconstruction engine SHALL apply the `direction` from the `TranslationUnit` metadata when injecting translated content, using CSS `dir` attribute or equivalent mechanism, without relying on the browser's bidirectional algorithm alone.

#### Scenario: RTL translated text rendered correctly
- **WHEN** a Persian translation is injected into a previously LTR text node
- **THEN** the reconstructed node has `dir="rtl"` applied so text renders right-to-left

#### Scenario: Inline code preserves LTR in RTL paragraph
- **WHEN** an English code snippet inside an RTL paragraph is translated (or left untranslated)
- **THEN** the code node retains `dir="ltr"` after reconstruction

---

### Requirement: Mixed-direction content must not corrupt surrounding text layout
The reconstruction engine SHALL ensure that injecting translated text into mixed-direction contexts does not cause surrounding text nodes to reflow incorrectly.

#### Scenario: Mixed Persian/English paragraph reconstructed safely
- **WHEN** a paragraph containing both Persian and English text is reconstructed after translation
- **THEN** each text segment renders in its correct direction without causing bidirectional isolation issues in adjacent segments

#### Scenario: Punctuation placement is not altered by reconstruction
- **WHEN** a translated segment ends with a period or comma
- **THEN** the punctuation is placed at the logically correct end of the text in its direction context, not forcibly moved
