# Change: Add Contextual Sentence Translation with Streaming Support

## Why

The Select Element system currently extracts text at the node level (atomic extraction), breaking sentences into fragments when inline elements are present. For example, `Agent <em>Zero</em> AI` is extracted as three separate fragments: `["Agent ", "Zero", " AI"]`.

This causes poor translation quality for RTL languages (Persian) because:
1. Translation providers receive fragments without grammatical context
2. Word order and verb conjugation depend on full sentence structure
3. Inline tags (<em>, <strong>, <a>, <code>) break technical sentences into 10+ fragments on sites like GitHub

### The Streaming Problem

The initial placeholder implementation did not consider **streaming translation workflow**. When streaming was enabled:

**Symptoms:**
- **Sentence misplacement**: Translated sentences appeared in wrong positions
- **Page corruption**: DOM structure was broken during streaming updates
- **Placeholder loss**: Inline elements were lost before final reassembly

**Root Cause:**
The placeholder system and streaming system were fundamentally incompatible:
- **Placeholder system**: Expected to preserve original DOM structure until translation completed, then perform single reassembly
- **Streaming system**: Applied progressive updates to individual text nodes, destroying the placeholder registry references

**Current Workaround (Not Ideal):**
Recent commits detect placeholder translations and skip streaming for them, but this defeats the purpose of streaming by removing real-time feedback.

**Goal**: Transition from "Atomic Node Translation" to "Contextual Sentence Translation with Streaming Support" for **ALL providers** while maintaining real-time streaming feedback.

## What Changes

- **ADDED**: Placeholder-based text extraction system with streaming awareness
- **ADDED**: Streaming coordination layer for placeholder translations
- **MODIFIED**: Text extraction to use block-level grouping with inline element placeholders
- **MODIFIED**: Streaming update service to preserve placeholder structure during progressive updates
- **MODIFIED**: Reassembly logic to work with both streaming and non-streaming results
- **MODIFIED**: Provider prompts to include placeholder preservation instructions (AI providers)
- **ADDED**: Fallback mechanism for when placeholders cannot be preserved during streaming

### Key Features

1. **Block-Level Extraction**: Group text by block-level containers (P, DIV, LI, H1-H6)

2. **Placeholder System**: Replace inline elements with `[0]`, `[1]`, `[2]` markers

3. **Streaming-Aware Placeholders**: Real-time streaming updates that preserve placeholder structure:
   - During streaming: Apply text translations only, preserve placeholder markers
   - At completion: Perform final reassembly with original inline elements

4. **Provider-Aware Routing**:
   - **AI providers** (Gemini, OpenAI, Claude, DeepL): Use placeholders with prompt instructions
   - **Traditional providers** (Google, Yandex, Bing, DeepL-free): Use placeholders with literal text preservation

5. **Robust Reassembly**: Parse translated text and reinsert original DOM nodes at placeholder positions

6. **Fallback Mechanism**: Gracefully degrade to atomic extraction if streaming breaks placeholders

### Example Transformation

```
Original: <p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>
Extracted: "Agent [0] AI [1]!"
Mapping: [0] → <em>Zero</em>, [1] → <strong>rocks</strong>

Streaming Update 1: "عامل [0] هوش"
Streaming Update 2: "عامل [0] هوش مصنوعی [1]!"
Final Translated: "عامل [0] هوش مصنوعی [1] عالی است!"
Reassembled: <p>عامل <em>Zero</em> هوش مصنوعی <strong>rocks</strong> عالی است!</p>
```

### Streaming Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ EXTRACTION PHASE                                                │
├─────────────────────────────────────────────────────────────────┤
│ 1. Detect block container: <p>Agent <em>Zero</em> AI</p>       │
│ 2. Extract with placeholders: "Agent [0] AI"                   │
│ 3. Build registry: [0] → <em>Zero</em>                         │
│ 4. Mark request as placeholder-aware                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STREAMING PHASE (Preserves Placeholders)                       │
├─────────────────────────────────────────────────────────────────┤
│ Update 1: "عامل [0] هوش" → Apply text portions only            │
│ Update 2: "عامل [0] هوش مصنوعی" → Apply text portions only      │
│ Update 3: "عامل [0] هوش مصنوعی [1]" → Apply text portions only  │
│                                                                  │
│ CRITICAL: Inline elements [0], [1] preserved in registry       │
│ CRITICAL: Only text content between placeholders updated       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ REASSEMBLY PHASE (Stream Completion)                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. Parse final translation for placeholder markers             │
│ 2. Replace [0] with <em>Zero</em> from registry                │
│ 3. Replace [1] with original element from registry             │
│ 4. Apply complete HTML to block container                      │
└─────────────────────────────────────────────────────────────────┘
```

## Impact

### Affected Specs
- `specs/element-selection/spec.md` - MODIFIED "Text Extraction" and "Translation Application" requirements
- `specs/element-selection/streaming-placeholder-integration.md` - NEW spec for streaming + placeholder interaction

### Affected Code

**New Files** (4):
- `src/features/element-selection/utils/PlaceholderRegistry.js` - Placeholder mapping system with streaming state tracking
- `src/features/element-selection/utils/blockLevelExtraction.js` - Block-level container detection
- `src/features/element-selection/utils/placeholderReassembly.js` - Reassembly logic with streaming awareness
- `src/features/element-selection/utils/streamingPlaceholderHandler.js` - Streaming coordination for placeholders

**Modified Files** (9):
- `src/features/element-selection/utils/domManipulation.js` - Add placeholder-based extraction routing
- `src/features/element-selection/managers/services/TextExtractionService.js` - Provider detection and placeholder flag
- `src/features/element-selection/managers/services/DOMNodeMatcher.js` - Placeholder-aware reassembly
- `src/features/element-selection/utils/textProcessing.js` - Preserve placeholders during processing
- `src/features/element-selection/managers/services/StreamingUpdateService.js` - **NEW**: Placeholder-aware streaming application
- `src/features/element-selection/managers/services/StreamEndService.js` - **NEW**: Enhanced streaming-to-placeholder coordination
- `src/features/element-selection/managers/services/TranslationOrchestrator.js` - **NEW**: Route to placeholder streaming
- `src/shared/messaging/core/StreamingResponseHandler.js` - **NEW**: Streaming coordination for placeholder translations
- `src/features/translation/providers/BaseAIProvider.js` - Batching protection and placeholder prompts

### Scope Limitations

- **Target**: ALL providers (AI + Traditional)
  - **AI Providers**: Gemini, OpenAI, Claude, DeepL
  - **Traditional Providers**: Google, Yandex, Bing, DeepL-free
- **Mode**: Select Element only (not selection, field, or popup modes)
- **Streaming Compatibility**: Full integration with streaming translation workflow
  - Real-time progress feedback for placeholder translations
  - Progressive text updates with preserved inline elements
  - Fallback to atomic extraction if streaming breaks placeholders
- **Backward Compatibility**: Fallback to atomic extraction if placeholder system fails

### Key Discovery: Traditional Providers Support Placeholders Natively

Analysis revealed that traditional providers preserve placeholder markers `[0]`, `[1]`, `[2]` as literal text during translation:
- **Google Translate**: Treats placeholders as literal text, no modifications needed
- **DeepL**: `preserve_formatting=1` helps maintain structure
- **Yandex**: Simple API preserves literal text
- **Bing**: May need batching protection for long texts with placeholders

This eliminates the need for provider-specific prompt modifications for traditional providers.

### Expected Outcomes

**Translation Quality:**
- 90%+ reduction in sentence fragmentation for AI providers
- 80%+ improvement in Persian translation quality (user surveys)
- 95%+ placeholder preservation rate

**Streaming Performance:**
- Real-time streaming feedback for placeholder translations
- No page corruption or sentence misplacement during streaming
- Graceful fallback when placeholders cannot be preserved
- <10% increase in streaming processing time
- Progressive text updates showing translation in real-time

**Compatibility:**
- No regression for traditional providers
- Full support for all translation providers
- Backward compatibility with atomic extraction fallback

## Implementation Phases

### Phase 1: Streaming-Aware Placeholders (CRITICAL)

**Goal**: Make streaming updates work WITH placeholders instead of against them.

**Changes:**

1. **Modify `StreamingUpdateService`**:
   - Detect placeholder registry in request
   - Route to placeholder-aware streaming when detected
   - Apply translations to text portions only, preserve placeholder markers

2. **Add Placeholder-Aware Streaming Logic**:
   - Parse translated text for placeholders: "سلام [0] جهان [1]"
   - Apply translation to text portions while preserving placeholder markers
   - Don't modify DOM structure until stream completion

3. **Update `PlaceholderRegistry`**:
   - Track streaming state: `isStreaming = true/false`
   - Track which placeholders have been updated
   - Maintain mapping of placeholder IDs to DOM positions

### Phase 2: Hybrid Streaming (HIGH)

**Goal**: Show real-time progress while preserving placeholder structure.

**Approach:**

1. **During Streaming**:
   - Extract text portions between placeholders
   - Stream translation for text portions only
   - Update text nodes without touching inline elements
   - Show progress: "Translating segment 1/3..."

2. **At Stream Completion**:
   - Combine all streaming results
   - Perform final placeholder reassembly
   - Apply complete translation with original inline elements

### Phase 3: Fallback & Recovery (MEDIUM)

**Goal**: Handle edge cases where placeholders break during streaming.

**Mechanisms:**

1. **Placeholder Validation**:
   - Check if streaming preserved placeholder markers
   - Detect missing/modified placeholders: `[0]` → `[ 0 ]` or gone
   - Validate placeholder count matches expected

2. **Fallback Triggers**:
   - If placeholders are missing or modified
   - If provider stripped placeholders from translation
   - If registry references become invalid

3. **Atomic Extraction Fallback**:
   - Extract text at node level (original behavior)
   - Translate without placeholders
   - Accept sentence fragmentation as trade-off

## Critical Implementation Notes

1. **DOM Structure Preservation**: During streaming, NEVER replace the block container's innerHTML until stream completion.

2. **Text-Only Streaming**: When placeholders are present, only stream and update the text portions, not the entire DOM structure.

3. **Placeholder Marker Protection**: Ensure streaming doesn't modify placeholder markers (`[0]`, `[1]`) - only the text between them.

4. **Final Reassembly Authority**: The `_handlePlaceholderTranslation` method at stream end is the ONLY place that should modify DOM structure for placeholder translations.

5. **Fallback Detection**: If streaming produces results without placeholders (provider stripped them), immediately fall back to atomic extraction.

6. **Registry Lifecycle**: PlaceholderRegistry must be cleared after translation completion or cancellation to prevent memory leaks.

## Testing Strategy

### Test Cases

1. **Streaming with Placeholders (Success)**:
   - Input: `<p>Agent <em>Zero</em> AI <strong>rocks</strong>!</p>`
   - Streaming Update 1: "عامل [0] هوش"
   - Streaming Update 2: "عامل [0] هوش مصنوعی [1]"
   - Final: "عامل <em>Zero</em> هوش مصنوعی <strong>rocks</strong> عالی است!"
   - Verify: No page corruption, inline elements preserved

2. **Placeholder Loss Fallback**:
   - Input: `<p>Click <a href="#">here</a> to continue</p>`
   - Streaming: "اینجا کلیک کنید برای ادامه" (placeholders stripped)
   - Expected: Fall back to atomic extraction

3. **RTL Streaming with LTR**:
   - Input: `<p>Get <strong>40% off</strong> today</p>`
   - Streaming: "دریافت [0] تخفیف امروز"
   - Verify: LTR portions wrapped correctly, no repositioning

4. **Complex Nested Elements**:
   - Input: `<p>Text <a href="#">link <em>with</em> emphasis</a> more text</p>`
   - Verify: Nested inline elements preserved correctly

5. **Multiple Block Containers**:
   - Input: `<div><p>Para 1 with <strong>emphasis</strong></p><p>Para 2</p></div>`
   - Verify: Each paragraph processed independently

6. **Streaming Interruption**:
   - Scenario: User cancels during streaming
   - Verify: Cleanup happens, registry cleared, no DOM corruption
