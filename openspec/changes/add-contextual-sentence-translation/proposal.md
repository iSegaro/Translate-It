# Change: Add Contextual Sentence Translation for AI Providers

## Why

The Select Element system currently extracts text at the node level (atomic extraction), breaking sentences into fragments when inline elements are present. For example, `Agent <em>Zero</em> AI` is extracted as three separate fragments: `["Agent ", "Zero", " AI"]`.

This causes poor translation quality for RTL languages (Persian) because:
1. Translation providers receive fragments without grammatical context
2. Word order and verb conjugation depend on full sentence structure
3. Inline tags (<em>, <strong>, <a>, <code>) break technical sentences into 10+ fragments on sites like GitHub

**Goal**: Transition from "Atomic Node Translation" to "Contextual Sentence Translation" for AI providers while preserving existing behavior for traditional providers.

## What Changes

- **ADDED**: Placeholder-based text extraction system for AI providers
- **MODIFIED**: Text extraction to use block-level grouping with inline element placeholders
- **MODIFIED**: AI provider prompts to include placeholder preservation instructions
- **MODIFIED**: Reassembly logic to replace placeholders with original DOM nodes

### Key Features

1. **Block-Level Extraction**: Group text by block-level containers (P, DIV, LI, H1-H6)
2. **Placeholder System**: Replace inline elements with `[0]`, `[1]`, `[2]` markers
3. **Provider-Aware Routing**: AI providers use placeholders; traditional providers use atomic extraction
4. **Robust Reassembly**: Parse translated text and reinsert original DOM nodes at placeholder positions

### Example Transformation

```
Original: <p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>
Extracted: "Agent [0] AI [1]!"
Mapping: [0] → <em>Zero</em>, [1] → <strong>rocks</strong>
Translated: "عامل [0] هوش مصنوعی [1] عالی است!"
Reassembled: <p>عامل <em>Zero</em> هوش مصنوعی <strong>rocks</strong> عالی است!</p>
```

## Impact

### Affected Specs
- `specs/element-selection/spec.md` - MODIFIED "Text Extraction" and "Translation Application" requirements

### Affected Code

**New Files** (3):
- `src/features/element-selection/utils/PlaceholderRegistry.js` - Placeholder mapping system
- `src/features/element-selection/utils/blockLevelExtraction.js` - Block-level container detection
- `src/features/element-selection/utils/placeholderReassembly.js` - Reassembly logic

**Modified Files** (5):
- `src/features/element-selection/utils/domManipulation.js` - Add placeholder-based extraction routing
- `src/features/element-selection/managers/services/TextExtractionService.js` - Provider detection and placeholder flag
- `src/features/element-selection/managers/services/DOMNodeMatcher.js` - Placeholder-aware reassembly
- `src/features/element-selection/utils/textProcessing.js` - Preserve placeholders during processing
- `src/features/translation/providers/BaseAIProvider.js` - Batching protection and placeholder prompts

### Scope Limitations

- **Target**: AI providers only (Gemini, OpenAI, Claude, DeepL)
- **Mode**: Select Element only (not selection, field, or popup modes)
- **Traditional Providers**: Google, Yandex, Bing remain unchanged (atomic extraction)
- **Backward Compatibility**: Fallback to atomic extraction if placeholder system fails

### Expected Outcomes

- 90%+ reduction in sentence fragmentation for AI providers
- 80%+ improvement in Persian translation quality (user surveys)
- 95%+ placeholder preservation rate
- <5% increase in translation time
- No regression for traditional providers
