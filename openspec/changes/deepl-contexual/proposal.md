# Change: Upgrade DeepL Provider to XML-Based Contextual Translation

## Why

DeepL is currently excluded from the contextual sentence translation system implemented in Phase 1 (`add-contextual-sentence-translation`). While AI providers (Gemini, OpenAI, Claude) benefit from block-level extraction with placeholder markers, DeepL still uses atomic node-by-node extraction.

### Current Limitations

1. **Fragmented Translation**: DeepL extracts text node-by-node, breaking sentences:
   ```
   Input: <p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>
   DeepL Current: ["Agent ", "Zero", " AI ", "rocks", "!"] (5 fragments)
   Contextual: "Agent [[AIWC-0]] AI [[AIWC-1]]!" (1 sentence)
   ```

2. **Poor Grammar Context**: Without complete sentence context, DeepL produces inferior translations for:
   - **RTL Languages** (Persian, Arabic, Hebrew): Word order reversal
   - **Inflected Languages** (German, Russian, Latin): Case endings, gender agreement
   - **Agglutinative Languages** (Turkish, Finnish): Morpheme boundaries

3. **Inconsistent Experience**: Users get better translation quality with AI providers than DeepL, even though DeepL may be preferred for certain language pairs.

### Why XML Tags Instead of Brackets?

DeepL has native support for XML tag handling through `tag_handling="xml"` and `ignore_tags` parameters. Using XML tags provides:

1. **Native Provider Support**: DeepL is designed to preserve XML tags natively
2. **Maximum Stability**: Prevents AI from translating/losing markers (e.g., `[0]` → `]0[` or `0]`)
3. **No Prompt Pollution**: No need to add placeholder instructions to DeepL prompts
4. **Proper Escaping**: DeepL's XML parser handles edge cases automatically

## What Changes

This change upgrades DeepL from atomic extraction to XML-based contextual translation while maintaining full backward compatibility:

- **MODIFIED**: PlaceholderRegistry to support XML format (`<x id="0"/>`)
- **MODIFIED**: blockLevelExtraction to generate XML placeholders for DeepL
- **MODIFIED**: placeholderReassembly to extract and reassemble XML tags
- **MODIFIED**: TextExtractionService to route DeepL to contextual extraction
- **MODIFIED**: DeepLTranslateProvider to use XML tag handling API
- **ADDED**: XML tag validation and automatic fallback to atomic extraction

## Key Features

1. **Format-Aware Placeholder System**:
   - AI providers: `[[AIWC-0]]`, `[[AIWC-1]]` (existing)
   - DeepL: `<x id="0"/>`, `<x id="1"/>` (new)

2. **Robust Fallback Logic**:
   - Validates XML tag preservation in DeepL response
   - Detects corrupted/missing tags
   - Automatically falls back to atomic extraction on failure

3. **RTL-Safe Regex**:
   - Whitespace-tolerant: `<x id = "0" >`
   - Handles Persian/Arabic character interference
   - Single/double quote support

4. **Backward Compatibility**:
   - AI providers continue using `[[AIWC-0]]` format
   - Traditional providers (Google, Yandex) stay atomic
   - DeepL @@@ newline system preserved

## User Impact

- **Better Translation Quality**: DeepL users get complete sentence context
- **Consistent Experience**: All AI providers (including DeepL) use contextual extraction
- **Automatic Fallback**: If XML fails, system gracefully degrades to atomic extraction
- **No Configuration Required**: Feature works automatically when DeepL is selected

## Technical Approach

### Placeholder Format Comparison

| Provider | Format | Example | API Support |
|----------|--------|---------|-------------|
| AI Providers | `[[AIWC-0]]` | `Click [[AIWC-0]] to learn` | Prompt instructions |
| DeepL (New) | `<x id="0"/>` | `Click <x id="0"/> to learn` | Native XML handling |
| Traditional | None (atomic) | Node-by-node extraction | N/A |

### Implementation Strategy

1. **Hybrid Architecture**: DeepL extends BaseTranslateProvider but implements block-level extraction
2. **Format Parameter**: All placeholder functions accept `format` parameter ('ai', 'xml', 'traditional')
3. **Automatic Detection**: System detects placeholder format from text pattern
4. **Validation First**: XML tags validated before reassembly, fallback on corruption

### DeepL API Integration

```javascript
// Request
tag_handling: "xml"
ignore_tags: "x"

// Input text
"Click <x id="0"/> to learn more"

// Output (tags preserved)
"Klicken Sie <x id="0"/>, um mehr zu erfahren"
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|-------|--------|------------|
| DeepL corrupts XML tags | Translation fails | Validation + atomic fallback |
| RTL character interference | Regex fails | Whitespace-tolerant patterns |
| @@@ newline conflicts | Structure breaks | Apply markers before placeholders |
| Performance overhead | Slower extraction | Minimal overhead measured |
| Breaking existing DeepL | User impact | Full backward compatibility |

## Dependencies

- **Prerequisite**: Phase 1 contextual sentence translation implementation
- **Related Changes**: `add-contextual-sentence-translation` (12/22 tasks completed)
- **Spec Updates**: Will modify `element-selection` spec to include DeepL in contextual extraction
