# Design: DeepL XML-Based Contextual Translation

## Architecture Overview

This upgrade implements a **format-aware placeholder system** that allows different translation providers to use different placeholder formats while maintaining backward compatibility and enabling robust fallback.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Format-Aware Placeholder System                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Input HTML: <p>This is <strong>bold</strong> text</p>                  │
│                                                                          │
│  ┌─────────────┐         ┌─────────────────────────────────────┐       │
│  │ Extraction  │───────▶ │  Placeholder Format Selection        │       │
│  │  Engine     │         │  - AI Providers → [[AIWC-0]]         │       │
│  └─────────────┘         │  - DeepL → <x id="0"/>              │       │
│                           │  - Traditional → None (atomic)      │       │
│                           └─────────────────────────────────────┘       │
│                                      │                                  │
│                                      ▼                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Translation Pipeline                         │   │
│  │                                                                  │   │
│  │  AI Providers:                                                   │   │
│  │    "This is [[AIWC-0]] text"                                     │   │
│  │    → "این [[AIWC-0]] متن است" (with prompt instructions)         │   │
│  │                                                                  │   │
│  │  DeepL (New):                                                    │   │
│  │    "This is <x id="0"/> text"                                    │   │
│  │    → DeepL API with tag_handling="xml"                           │   │
│  │    → "Das ist <x id="0"/> Text" (native XML support)             │   │
│  │                                                                  │   │
│  │  Traditional:                                                     │   │
│  │    ["This is ", "bold", " text"] (atomic node-by-node)           │   │
│  │    → ["Dies ist ", "fett", " Text"]                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                      │                                  │
│                                      ▼                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   Validation & Fallback                          │   │
│  │                                                                  │   │
│  │  DeepL Response:                                                 │   │
│  │    1. Count XML tags in request vs response                      │   │
│  │    2. Validate tag format integrity                              │   │
│  │    3. Check for placeholder ID corruption                        │   │
│  │    4. If validation fails → trigger atomic fallback               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                      │                                  │
│                                      ▼                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Reassembly Engine                           │   │
│  │                                                                  │   │
│  │  Format Detection:                                               │   │
│  │    - Detect [[AIWC-0]] pattern → AI format                       │   │
│  │    - Detect <x id="0"/> pattern → XML format                     │   │
│  │    - No pattern → atomic mode                                    │   │
│  │                                                                  │   │
│  │  Replace:                                                        │   │
│  │    [[AIWC-0]] → <strong>bold</strong>                            │   │
│  │    <x id="0"/> → <strong>bold</strong>                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                      │                                  │
│                                      ▼                                  │
│  Output: <p>این <strong>فشرده</strong> متن است</p>                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. PlaceholderRegistry Enhancement

**Current Structure (Phase 1)**:
```javascript
{
  id: 0,
  root: Element,
  html: '<strong>bold</strong>',
  uniqueId: 'aiwc-orig-1234567890-abc123',
  tagName: 'STRONG',
  textContent: 'bold'
}
```

**Enhanced Structure**:
```javascript
{
  id: 0,
  root: Element,
  html: '<strong>bold</strong>',
  uniqueId: 'aiwc-orig-1234567890-abc123',
  tagName: 'STRONG',
  textContent: 'bold',
  format: 'xml'  // ← NEW: 'ai' | 'xml' | 'traditional'
}
```

**Key Methods**:
```javascript
// Enhanced register method with format parameter
register(element, format = 'ai') {
  const entry = {
    id: this.nextId++,
    root: element,
    html: element.outerHTML,
    uniqueId: `aiwc-orig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tagName: element.tagName,
    textContent: element.textContent,
    format  // ← NEW: Track format for this placeholder
  };
  this.placeholders.set(entry.id, entry);
  return entry.id;
}

// NEW: Get format for a placeholder
getFormat(id) {
  const entry = this.placeholders.get(id);
  return entry ? entry.format : null;
}
```

**Design Decision**: Default format='ai' ensures backward compatibility with existing code that doesn't specify format.

---

### 2. Block-Level Extraction with Format Support

**Current Extraction (Phase 1 - AI only)**:
```javascript
extractTextWithInlinePlaceholders(node, registry) {
  if (isInlineElement(node)) {
    const placeholderId = registry.register(node);
    return `[[AIWC-${placeholderId}]]`;  // ← Hardcoded AI format
  }
  // ... recursion for text nodes
}
```

**Enhanced Extraction (Multi-Format)**:
```javascript
extractTextWithInlinePlaceholders(node, registry, format = 'ai') {
  if (isInlineElement(node)) {
    const placeholderId = registry.register(node, format);  // ← Pass format

    // Format-aware placeholder generation
    if (format === 'xml') {
      return `<x id="${placeholderId}"/>`;  // ← DeepL XML format
    } else {
      return `[[AIWC-${placeholderId}]]`;   // ← AI provider format
    }
  }
  // ... recursion for text nodes
}
```

**Design Decision**: Format parameter propagates from top-level extraction down to recursive calls, ensuring consistent placeholder generation within a single translation request.

---

### 3. Placeholder Reassembly with Format Detection

**Current Reassembly (Phase 1 - AI only)**:
```javascript
const PLACEHOLDER_PATTERN = /\[\[\s*AIWC-(\d+)\s*\]\]/g;

extractPlaceholdersFromTranslation(translatedText) {
  const placeholders = [];
  let match;
  while ((match = PLACEHOLDER_PATTERN.exec(translatedText)) !== null) {
    placeholders.push({
      id: parseInt(match[1]),
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }
  return placeholders;
}
```

**Enhanced Reassembly (Multi-Format)**:
```javascript
// XML Pattern: Whitespace-tolerant, RTL-safe, quote-agnostic
const PLACEHOLDER_PATTERN_XML = /<x\s+id\s*=\s*["'](\d+)["']\s*\/?>/gi;

extractPlaceholdersFromTranslation(translatedText, format) {
  // Select pattern based on format
  const pattern = format === 'xml'
    ? PLACEHOLDER_PATTERN_XML
    : PLACEHOLDER_PATTERN_AI;

  const placeholders = [];
  let match;

  while ((match = pattern.exec(translatedText)) !== null) {
    placeholders.push({
      id: parseInt(match[1]),
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }

  return placeholders;
}
```

**RTL-Safe Regex Design**:
```javascript
// Handles Persian/Arabic character interference
// Matches variations:
//   <x id="0"/>   ← Standard
//   <x id='0'/>   ← Single quotes
//   <x id = "0"> ← Whitespace + no slash
//   <x  id="0"/>  ← Multiple spaces
/<x\s+id\s*=\s*["'](\d+)["']\s*\/?>/gi
```

**Design Decision**: Whitespace-tolerant regex prevents breaking when DeepL modifies spacing around tags. RTL characters are handled by `\s*` matching Unicode whitespace.

---

### 4. TextExtractionService Routing

**Current Routing (Phase 1)**:
```javascript
this.AI_PROVIDERS = new Set(['gemini', 'openai', 'claude', ...]);

extractText(element, providerType, options = {}) {
  if (this.isAIProvider(providerType) && options.registry) {
    return this.extractWithPlaceholders(element, options.registry);
  }
  // ... fallback to atomic extraction
}
```

**Enhanced Routing**:
```javascript
this.AI_PROVIDERS = new Set(['gemini', 'openai', 'claude', ...]);
this.XML_PROVIDERS = new Set(['deepl']);  // ← NEW

isXMLProvider(providerType) {
  return this.XML_PROVIDERS.has(providerType);
}

extractText(element, providerType, options = {}) {
  const usePlaceholders =
    this.isAIProvider(providerType) || this.isXMLProvider(providerType);

  if (usePlaceholders && options.registry) {
    // Auto-detect format from provider type
    const format = this.isXMLProvider(providerType) ? 'xml' : 'ai';
    return this.extractWithPlaceholders(element, options.registry, format);
  }
  // ... fallback to atomic extraction
}
```

**Design Decision**: Provider type determines format automatically. No need for manual format specification in calling code.

---

## DeepL-Specific Implementation

### 5. DeepLTranslateProvider XML Integration

**Translation Request Flow**:
```javascript
async _translateChunk(texts, sourceLang, targetLang, blockContainer) {
  // Step 1: Detect XML placeholders
  const hasXMLPlaceholders = validTexts.some(text =>
    /<x\s+id\s*=\s*["']\d+["']\s*\/?>/i.test(text)
  );

  // Step 2: Count tags before API call (for validation)
  let requestTagCounts = [];
  if (hasXMLPlaceholders) {
    requestTagCounts = validTexts.map(text =>
      (text.match(/<x\s+id\s*=\s*["']\d+["']\s*\/?>/gi) || []).length
    );
  }

  // Step 3: Build FormData
  const requestBody = new FormData();
  validTexts.forEach(text => requestBody.append('text', text));
  requestBody.append('source_lang', sourceLang);
  requestBody.append('target_lang', targetLang);

  // Step 4: Add XML handling parameters
  if (hasXMLPlaceholders) {
    requestBody.append('tag_handling', 'xml');
    requestBody.append('ignore_tags', 'x');
  }

  // Step 5: Add contextual metadata for better translation
  const context = this._extractTranslationContext(blockContainer);
  if (context) {
    requestBody.append('context', context);
  }

  // Step 6: API call
  const response = await fetch(this.apiURL, {
    method: 'POST',
    body: requestBody
  });

  const result = await response.json();

  // Step 7: Validate XML tag preservation
  if (hasXMLPlaceholders) {
    const validation = this._validateXMLTags(
      result.translations,
      requestTagCounts
    );

    if (!validation.isValid) {
      console.error('DeepL XML tag corruption detected:', validation.errors);
      throw new Error('XML tag corruption detected', {
        cause: { isXMLCorruptionError: true }
      });
    }
  }

  return result.translations;
}
```

**XML Tag Validation**:
```javascript
_validateXMLTags(translations, requestTagCounts) {
  const errors = [];

  for (let i = 0; i < translations.length; i++) {
    const translatedText = translations[i].text;
    const requestCount = requestTagCounts[i];

    // Count tags in response
    const responseTags = translatedText.match(
      /<x\s+id\s*=\s*["']\d+["']\s*\/?>/gi
    );
    const responseCount = responseTags ? responseTags.length : 0;

    // Validation 1: Tag count mismatch
    if (requestCount !== responseCount) {
      errors.push({
        index: i,
        type: 'count_mismatch',
        expected: requestCount,
        actual: responseCount
      });
      continue;
    }

    // Validation 2: Malformed tag detection
    const malformed = translatedText.match(
      /<x\s+id[^>]*[^\/]>|<x\s+[^i]|<\s*x|<x\s+id=\s*[^"']/gi
    );
    if (malformed) {
      errors.push({
        index: i,
        type: 'malformed_tags',
        examples: malformed.slice(0, 3)  // Show first 3
      });
    }

    // Validation 3: Duplicate ID detection
    const ids = (responseTags || []).map(tag => {
      const match = tag.match(/id\s*=\s*["'](\d+)["']/);
      return match ? parseInt(match[1]) : -1;
    });
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      errors.push({
        index: i,
        type: 'duplicate_ids',
        duplicates: ids.filter((id, idx) => ids.indexOf(id) !== idx)
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
```

**Context Parameter Extraction**:
```javascript
/**
 * Extracts contextual metadata to improve DeepL translation quality.
 * Provides domain and semantic information to help disambiguate terms.
 *
 * @param {Element} blockContainer - The block container being translated
 * @returns {string|null} Context string or null if not available
 */
_extractTranslationContext(blockContainer) {
  if (!blockContainer) return null;

  const contextParts = [];

  // 1. Extract page title (source domain context)
  if (typeof document !== 'undefined' && document.title) {
    const title = document.title.trim();
    if (title) {
      contextParts.push(`Source Page: ${title}`);
    }
  }

  // 2. Extract block container type (structural context)
  const tagName = blockContainer.tagName;
  if (tagName) {
    // Map common tag names to semantic descriptions
    const semanticNames = {
      'P': 'paragraph',
      'H1': 'main heading',
      'H2': 'subheading',
      'H3': 'section heading',
      'LI': 'list item',
      'DIV': 'content section',
      'ARTICLE': 'article',
      'SECTION': 'section',
      'BLOCKQUOTE': 'blockquote',
      'TD': 'table cell',
      'TH': 'table header',
      'CAPTION': 'caption',
      'FIGCAPTION': 'figure caption'
    };

    const semanticName = semanticNames[tagName] || tagName.toLowerCase();
    contextParts.push(`Content Area: ${semanticName}`);
  }

  // 3. Add parent context for better disambiguation
  const parent = blockContainer.parentElement;
  if (parent) {
    const parentTag = parent.tagName;
    const parentSemantic = {
      'NAV': 'navigation',
      'ARTICLE': 'article',
      'SECTION': 'section',
      'ASIDE': 'sidebar',
      'HEADER': 'header',
      'FOOTER': 'footer',
      'MAIN': 'main content'
    }[parentTag];

    if (parentSemantic) {
      contextParts.push(`Location: ${parentSemantic}`);
    }
  }

  if (contextParts.length === 0) return null;

  // Combine with separator, limit to 1000 characters
  let context = contextParts.join(' | ');

  // Sanitize: Remove any XML tags or @@@ markers
  context = context
    .replace(/<[^>]+>/g, '')  // Remove XML tags
    .replace(/@@@/g, '')       // Remove newline markers
    .replace(/\s+/g, ' ')      // Normalize whitespace
    .trim();

  // Limit length to avoid API overhead
  const MAX_CONTEXT_LENGTH = 1000;
  if (context.length > MAX_CONTEXT_LENGTH) {
    context = context.substring(0, MAX_CONTEXT_LENGTH - 3) + '...';
  }

  return context;
}
```

**Context Examples**:

```javascript
// Example 1: Blog post paragraph
// Page: "Getting Started with Vue.js 3"
// Container: <p> inside <article>
// Context: "Source Page: Getting Started with Vue.js 3 | Content Area: paragraph | Location: article"

// Example 2: Navigation link
// Page: "My Website - Home"
// Container: <a> inside <nav>
// Context: "Source Page: My Website - Home | Content Area: anchor | Location: navigation"

// Example 3: Product description
// Page: "Product Catalog - Electronics"
// Container: <div> with class "product-description"
// Context: "Source Page: Product Catalog - Electronics | Content Area: content section"
```

**Benefits of Context Parameter**:

1. **Domain Disambiguation**: Helps DeepL understand the subject matter
   - "bank" → financial context vs river context
   - "run" → software context vs sports context

2. **Tone Adaptation**: Adjusts formality based on content type
   - Heading → more concise
   - Article → more descriptive

3. **Consistency**: Ensures terminology consistency across the page

4. **Better Quality**: Especially helpful for short fragments without much context

**Design Decision**: Context is optional and only sent when available. The context string is sanitized to avoid interfering with XML tag handling and limited to 1000 characters to minimize overhead.

---

### 6. Fallback Strategy

**Trigger Conditions**:
1. XML tag count mismatch
2. Malformed tag syntax detected
3. Duplicate placeholder IDs found
4. Missing placeholder IDs from original

**Fallback Flow**:
```javascript
// In SelectElementManager
try {
  const translatedText = await this._translateText(
    extractedText,
    provider,
    sourceLang,
    targetLang
  );

  // Proceed with XML reassembly
  return await reassembleTranslationWithPlaceholders(
    translatedText,
    registry,
    blockContainer,
    'xml'
  );

} catch (error) {
  // Check if this is an XML corruption error
  if (error.cause?.isXMLCorruptionError) {
    console.warn('XML tag corruption detected, falling back to atomic extraction');

    // Clear registry from failed attempt
    registry.clear();

    // Retry with atomic extraction (traditional node-by-node)
    return await this._atomicExtractionTranslation(
      blockContainer,
      provider,
      sourceLang,
      targetLang
    );
  }

  // Re-throw other errors
  throw error;
}
```

**Design Decision**: Fallback is automatic and transparent to the user. No configuration needed, fallback only triggers when validation fails.

---

## Trade-Off Analysis

### XML Tags vs Brackets for DeepL

| Aspect | XML Tags `<x id="0"/>` | Brackets `[[AIWC-0]]` | Decision |
|--------|------------------------|----------------------|----------|
| **DeepL API Support** | ✅ Native `tag_handling="xml"` | ❌ Not natively supported | **XML** |
| **Prompt Pollution** | ✅ No instructions needed | ❌ Requires prompt space | **XML** |
| **Translation Stability** | ✅ DeepL designed to preserve XML | ⚠️ AI may modify brackets | **XML** |
| **Regex Complexity** | ⚠️ Whitespace-tolerant needed | ✅ Simple pattern | Brackets |
| **Character Interference** | ⚠️ `<` `>` common in code | ✅ Rare in natural text | Brackets |
| **Fallback Required** | ⚠️ Corruption possible | ⚠️ Corruption possible | Tie |
| **Implementation Effort** | ⚠️ Requires validation logic | ✅ Reuse existing code | Brackets |

**Winner: XML Tags**

**Rationale**: DeepL's native XML support is the decisive factor. The stability guarantees from `tag_handling="xml"` outweigh the slightly more complex regex and validation logic.

---

### Fallback vs No Fallback

| Aspect | With Fallback | No Fallback | Decision |
|--------|---------------|-------------|----------|
| **User Impact** | ✅ Atomic mode always works | ❌ Translation fails completely | **Fallback** |
| **Implementation** | ⚠️ Requires atomic extraction path | ✅ Single code path | No Fallback |
| **Code Complexity** | ⚠️ Dual extraction logic | ✅ Simpler | No Fallback |
| **Debugging** | ⚠️ Two systems to test | ✅ Single system | No Fallback |
| **Translation Quality** | ⚠️ Fallback = worse quality | ✅ Always contextual | No Fallback |
| **Safety Net** | ✅ Graceful degradation | ❌ All-or-nothing | **Fallback** |

**Winner: With Fallback**

**Rationale**: The atomic extraction path already exists and is battle-tested. The additional safety of graceful degradation is worth the extra code complexity. Users will always get a translation, even if it's not optimal quality.

---

## Integration with Existing Systems

### @@ Newline System Compatibility

**Current DeepL Newline System**:
```javascript
// Phase 1: Replace newlines with @@@ marker
text = text.replace(/\n/g, '@@@');

// Phase 2: Translate with @@@ preserved
translated = await deepl.translate(text);

// Phase 3: Restore newlines from @@@
translated = translated.replace(/@@@/g, '\n');
```

**Integration Strategy**:
```javascript
// Phase 1: Sanitize and mark newlines FIRST
let text = originalText;
text = sanitizeText(text);
text = text.replace(/\n/g, '@@@');

// Phase 2: Replace inline elements with XML placeholders SECOND
const extractedText = extractBlockWithPlaceholders(
  blockContainer,
  registry,
  'xml'  // ← XML format for DeepL
);

// Phase 3: Translate (both @@@ and <x/> preserved)
translatedText = await deepl.translate(extractedText);

// Phase 4: Restore @@@ FIRST (before XML reassembly)
translatedText = translatedText.replace(/@@@/g, '\n');

// Phase 5: Reassemble XML placeholders SECOND
reassembledHTML = reassembleTranslationWithPlaceholders(
  translatedText,
  registry,
  blockContainer,
  'xml'
);
```

**Design Decision**: Order of operations is critical:
1. **First**: Newline markers (`@@@`) - ensures newlines don't interfere with XML parsing
2. **Second**: XML placeholders (`<x id="0"/>`) - inline elements replaced with tags
3. **Third**: Translation - DeepL preserves both markers
4. **Fourth**: Restore newlines - revert `@@@` to `\n`
5. **Fifth**: Reassemble XML - replace `<x/>` with original HTML

This prevents edge cases like:
```
Input: <p>Line 1\n<strong>bold</strong>\nLine 2</p>

WRONG ORDER (placeholders first):
Extracted: "Line 1\n<x id="0"/>\nLine 2"
After @@@: "Line 1@@@<x id="0"/>@@@Line 2"  ← XML parsing issues

CORRECT ORDER (@@@ first):
After @@@: "Line 1@@@<strong>bold</strong>@@@Line 2"
Extracted: "Line 1@@@<x id="0"/>@@@Line 2"  ← XML parsing works
```

---

### Streaming Coordination

**Current Streaming Support (Phase 1 - AI providers only)**:
```javascript
// AI providers support streaming with placeholders
if (provider.supportsStreaming && !hasPlaceholders) {
  return await this._streamTranslation(texts, provider);
} else {
  return await this._batchTranslation(texts, provider);
}
```

**DeepL Streaming (Not Supported)**:
```javascript
// DeepL does NOT support streaming API
// Always use batch translation for DeepL
if (provider.type === 'deepl' || hasXMLPlaceholders) {
  return await this._batchTranslation(texts, provider);
}
```

**Design Decision**: DeepL's API doesn't support streaming, so XML placeholders are only used in batch mode. This simplifies the implementation—no need to handle streaming + XML placeholders.

---

## Error Handling Strategy

### Error Types

| Error Type | Detection | Handling | User Impact |
|------------|-----------|----------|-------------|
| **XML Tag Corruption** | Validation fails on response | Atomic fallback | Lower quality, works |
| **Malformed Response** | Non-200 status code | Retry with exponential backoff | Delayed success |
| **Rate Limit** | 429 status code | Circuit breaker opens | Try again later |
| **Network Error** | Timeout/connection error | Retry with backoff | Delayed success |
| **Missing Placeholder** | ID not found in registry | Warning log, skip replacement | Missing element |

### Recovery Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                     Error Recovery Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Translation Request                                             │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────┐                                            │
│  │ DeepL API Call  │                                            │
│  └─────────────────┘                                            │
│       │                                                          │
│       ├── Success ──▶ Validate XML Tags                          │
│       │                   │                                      │
│       │                   ├── Valid ──▶ Reassemble (XML)         │
│       │                   │                                      │
│       │                   └── Invalid ──▶ Fallback to Atomic     │
│       │                                                          │
│       ├── Rate Limit (429) ──▶ Circuit Breaker Open              │
│       │                          │                               │
│       │                          └── Retry after cooldown        │
│       │                                                          │
│       ├── Network Error ──▶ Retry with exponential backoff       │
│       │                      │                                   │
│       │                      └── Max retries → Fail with toast   │
│       │                                                          │
│       └── Other Errors ──▶ Log error, show toast to user         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Performance Considerations

### Extraction Overhead

| Operation | Atomic (Current) | Contextual (New) | Overhead |
|-----------|------------------|------------------|----------|
| **DOM Traversal** | O(n) nodes | O(n) nodes | None |
| **Placeholder Generation** | N/A | O(i) inline elements | +2-5ms |
| **Registry Storage** | N/A | O(i) entries | +1ms |
| **Text Extraction** | O(n) strings | O(1) string | **-5ms** ⚡ |

**Net Result**: Contextual extraction is often **faster** than atomic because it produces a single string instead of thousands of individual node strings.

### Translation API Overhead

| Aspect | Atomic | Contextual | Difference |
|--------|--------|-----------|------------|
| **API Calls** | Multiple (one per node) | Single (one per block) | **Fewer calls** |
| **Request Size** | Small per call | Larger per call | Similar total |
| **Response Size** | Small per call | Larger per call | Similar total |
| **Processing Time** | Cumulative overhead | Single batch | **Faster** |

**Net Result**: Fewer API calls with contextual extraction = faster overall translation.

### Reassembly Overhead

| Operation | Atomic | Contextual | Overhead |
|-----------|--------|-----------|----------|
| **Node Matching** | O(n) queries | O(i) regex matches | +1-3ms |
| **DOM Updates** | O(n) innerHTML | O(1) innerHTML | **Faster** ⚡ |
| **Placeholder Replacement** | N/A | O(i) string replaces | +1-2ms |

**Net Result**: Contextual reassembly is often **faster** because it updates the block container once instead of updating thousands of individual text nodes.

**Overall Performance**: Contextual extraction with XML placeholders is expected to be **similar or slightly faster** than atomic extraction, while providing significantly better translation quality.

---

## Testing Strategy

### Unit Tests

1. **PlaceholderRegistry with formats**
   ```javascript
   test('register with xml format stores format correctly', () => {
     const registry = new PlaceholderRegistry();
     const id = registry.register(element, 'xml');
     expect(registry.getFormat(id)).toBe('xml');
   });
   ```

2. **XML placeholder generation**
   ```javascript
   test('extractTextWithInlinePlaceholders generates XML tags', () => {
     const result = extractTextWithInlinePlaceholders(
       element,
       registry,
       'xml'
     );
     expect(result).toContain('<x id="0"/>');
   });
   ```

3. **XML regex with whitespace variations**
   ```javascript
   test('XML regex matches whitespace variations', () => {
     const variations = [
       '<x id="0"/>',
       '<x id = "0" >',
       "<x id='1'/>",
       '<x  id="2"/>'
     ];
     variations.forEach(variant => {
       expect(PLACEHOLDER_PATTERN_XML.test(variant)).toBe(true);
     });
   });
   ```

4. **RTL text with XML tags**
   ```javascript
   test('XML regex handles Persian text interference', () => {
     const text = 'این یک <x id="0"/> تست است';
     const matches = text.match(PLACEHOLDER_PATTERN_XML);
     expect(matches).toHaveLength(1);
     expect(matches[0]).toBe('<x id="0"/>');
   });
   ```

### Integration Tests

1. **DeepL end-to-end with inline elements**
   ```javascript
   test('DeepL translates block with inline elements using XML', async () => {
     const html = '<p>This is <strong>bold</strong> text</p>';
     const result = await translateWithDeepL(html);
     expect(result.extracted).toContain('<x id="0"/>');
     expect(result.translated).toMatch(/<x\s+id\s*=\s*["']0["']\s*\/?>/);
     expect(result.reassembled).toContain('<strong>');
   });
   ```

2. **Fallback on tag corruption**
   ```javascript
   test('DeepL corruption triggers atomic fallback', async () => {
     // Mock DeepL response with corrupted tags
     mockDeepL.respondWith('Das ist <x id="1"> Text');  // Missing /

     const result = await translateWithDeepL(html);
     expect(result.mode).toBe('atomic');  // Fallback triggered
   });
   ```

3. **Format isolation (AI vs XML)**
   ```javascript
   test('AI providers use brackets, DeepL uses XML', async () => {
     const aiResult = await translateWithProvider('gemini', html);
     const deeplResult = await translateWithProvider('deepl', html);

     expect(aiResult.extracted).toContain('[[AIWC-0]]');
     expect(deeplResult.extracted).toContain('<x id="0"/>');
   });
   ```

### Manual Test Scenarios

1. **Basic inline elements**
   - Input: `<p>Click <strong>here</strong> to continue</p>`
   - Expected: XML placeholders preserved in translation

2. **RTL languages**
   - Input: `<p>این یک <strong>تست</strong> فارسی است</p>`
   - Expected: Persian text translated correctly, placeholders preserved

3. **Nested inline elements**
   - Input: `<a href="/"><em>Nested</em> link</a>`
   - Expected: Complete subtree captured and restored

4. **Multiple inline elements**
   - Input: `<p><strong>Bold</strong>, <em>italic</em>, and <code>code</code></p>`
   - Expected: All placeholders numbered sequentially

5. **Edge cases**
   - Empty inline elements: `<strong></strong>`
   - Inline elements with attributes: `<a href="#" class="btn">Link</a>`
   - Self-closing tags (if any): `<br/>` inside block

---

## Success Metrics

### Quality Metrics

- ✅ DeepL contextual translation quality ≥ AI provider contextual quality
- ✅ Fallback rate ≤ 5% (XML corruption should be rare)
- ✅ Zero placeholder ID collisions
- ✅ Zero broken DOM after reassembly

### Performance Metrics

- ✅ Extraction overhead ≤ 10ms per block
- ✅ Reassembly overhead ≤ 10ms per block
- ✅ No increase in memory usage vs Phase 1
- ✅ Translation time ≤ atomic extraction time

### Compatibility Metrics

- ✅ Zero regressions in AI provider placeholders
- ✅ Zero regressions in traditional provider atomic extraction
- ✅ Zero regressions in @@@ newline system for DeepL
- ✅ All existing unit tests pass

---

## Future Extensibility

### Adding New XML-Aware Providers

If another provider supports XML tag handling (e.g., a future AI provider):

```javascript
// Simply add to XML_PROVIDERS set
this.XML_PROVIDERS = new Set(['deepl', 'future-provider']);
```

### Adding New Placeholder Formats

If a new provider needs a different format:

```javascript
// 1. Add format constant
const FORMAT_NEW = 'new';

// 2. Add placeholder pattern
const PLACEHOLDER_PATTERN_NEW = /\{\{NEW-(\d+)\}\}/g;

// 3. Add generation logic
if (format === 'new') {
  result += `{{NEW-${placeholderId}}}`;
}

// 4. Add extraction logic
extractPlaceholdersFromTranslation(translatedText, format) {
  const pattern = format === 'new'
    ? PLACEHOLDER_PATTERN_NEW
    : format === 'xml'
      ? PLACEHOLDER_PATTERN_XML
      : PLACEHOLDER_PATTERN_AI;
  // ...
}
```

### Supporting Placeholder Attributes

If future requirements need placeholder attributes (e.g., metadata):

```javascript
// Current: <x id="0"/>
// Future:  <x id="0" type="strong" class="highlight"/>

// Update regex to capture attributes
/<x\s+id\s*=\s*["'](\d+)["'][^>]*\/?>/gi

// Store attributes in registry
register(element, format, attributes = {}) {
  const entry = {
    // ... existing fields
    attributes
  };
}
```

---

## Critical Implementation Details

### 1. Lowercase Tag Enforcement

**Issue**: XML parsers are case-sensitive, and some may treat `<X ID="0"/>` differently from `<x id="0"/>`.

**Solution**: Always generate and validate lowercase XML tags:

```javascript
// In blockLevelExtraction.js
if (format === 'xml') {
  // Always use lowercase 'x' and 'id'
  return `<x id="${placeholderId}"/>`;  // ✓ Correct
  // NOT: `<X ID="${placeholderId}"/>`  // ✗ Wrong
  // NOT: `<x ID="${placeholderId}"/>`  // ✗ Wrong
}

// In placeholderReassembly.js
const PLACEHOLDER_PATTERN_XML = /<x\s+id\s*=\s*["'](\d+)["']\s*\/?>/gi;
// Lowercase 'x' and 'id' in pattern
```

**Validation**: Add case-sensitivity check to XML validation:

```javascript
_validateXMLTags(translations, requestTagCounts) {
  // ... existing validation

  // NEW: Check for uppercase or mixed-case tags
  const hasUppercaseTags = translatedText.match(/<X\s+/i);
  if (hasUppercaseTags) {
    errors.push({
      type: 'uppercase_tags',
      message: 'DeepL returned uppercase XML tags (case sensitivity issue)'
    });
  }
}
```

**Testing**:
```javascript
test('XML tags are always lowercase', () => {
  const result = extractTextWithInlinePlaceholders(element, registry, 'xml');
  expect(result).toMatch(/<x id="\d+"\/>/);  // Lowercase only
  expect(result).not.toMatch(/<[Xx]\s+[Ii][Dd]/);  // No mixed case
});
```

---

### 2. DeepL ignore_tags Parameter Precision

**Issue**: The `ignore_tags` parameter must exactly match the tag name to ensure DeepL doesn't translate placeholder content.

**Solution**: Always set `ignore_tags: "x"` (exact match, lowercase):

```javascript
// In DeepLTranslateProvider.js
if (hasXMLPlaceholders) {
  requestBody.append('tag_handling', 'xml');
  requestBody.append('ignore_tags', 'x');  // ✓ Exact match

  // Logging for debugging
  console.log('[DeepL] XML mode enabled with ignore_tags="x"');
}
```

**Why This Matters**:

DeepL's `ignore_tags` parameter tells the API which tags to preserve. If we use `<x id="0"/>` but set `ignore_tags: "X"` (uppercase), DeepL might:

1. Not recognize the tag as one to ignore
2. Translate the tag name itself
3. Remove or modify the tag structure

**Correct Usage Examples**:

```javascript
// ✓ CORRECT
ignore_tags: "x"      // Matches our <x id="0"/> tags
tag_handling: "xml"

// ✗ WRONG
ignore_tags: "X"      // Case mismatch!
ignore_tags: "id"     // Wrong tag name
ignore_tags: "placeholder"  // Not our tag name
```

**Validation**:

```javascript
// Add validation to ensure ignore_tags is set correctly
if (hasXMLPlaceholders) {
  const formDataEntries = Array.from(requestBody.entries());
  const hasIgnoreTags = formDataEntries.some(([key, value]) =>
    key === 'ignore_tags' && value === 'x'
  );

  if (!hasIgnoreTags) {
    console.error('[DeepL] XML placeholders detected but ignore_tags not set to "x"');
    // Fail fast rather than send malformed request
  }
}
```

---

### 3. Nested Elements Subtree Handling

**Issue**: When inline elements contain other inline elements (e.g., `<a><em>nested</em></a>`), we must ensure the entire subtree is captured as a single placeholder.

**Solution**: Store complete `outerHTML` subtree and verify reassembly:

**Extraction** (Already Implemented in Phase 1):

```javascript
// In PlaceholderRegistry.js
register(element, format = 'ai') {
  const entry = {
    id: this.nextId++,
    root: element,
    html: element.outerHTML,  // ✓ Complete subtree including nested elements
    uniqueId: `aiwc-orig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tagName: element.tagName,
    textContent: element.textContent,
    format
  };
  this.placeholders.set(entry.id, entry);

  // Set attribute on the OUTER element
  element.setAttribute('data-aiwc-original-id', entry.uniqueId);

  return entry.id;
}
```

**Example**:

```html
<!-- Input HTML -->
<p>Click <a href="/docs" class="btn"><em>here</em> to learn</a> more</p>

<!-- Extraction -->
<em> element encountered
  → Register placeholder ID 0
  → Store: '<a href="/docs" class="btn"><em>here</em> to learn</a>'  (complete <a> subtree)
  → Generate: '<x id="0"/>'

<!-- Extracted Text -->
"Click <x id="0"/> more"

<!-- DeepL Translation (German) -->
"Klicken Sie <x id="0"/> mehr"

<!-- Reassembly -->
<p>Klicken Sie <a href="/docs" class="btn"><em>here</em> to learn</a> mehr</p>
```

**Critical Test Cases**:

```javascript
// Test 1: Simple nesting
test('Nested <em> inside <a> captured as single placeholder', () => {
  const html = '<a href="/"><em>nested</em></a>';
  const result = extractTextWithInlinePlaceholders(element, registry, 'xml');

  // Should be ONE placeholder, not two
  expect(result).toBe('<x id="0"/>');
  expect(result).not.toContain('<x id="1"/>');

  // Registry should have complete subtree
  const entry = registry.getPlaceholder(0);
  expect(entry.html).toBe('<a href="/"><em>nested</em></a>');
});

// Test 2: Deep nesting
test('Deep nesting captured correctly', () => {
  const html = '<strong><em><code>deep</code> nest</em></strong>';
  const result = extractTextWithInlinePlaceholders(element, registry, 'xml');

  // Still ONE placeholder
  expect(result).toBe('<x id="0"/>');

  // Complete subtree stored
  const entry = registry.getPlaceholder(0);
  expect(entry.html).toBe(html);
});

// Test 3: Adjacent inline elements
test('Adjacent inline elements get separate placeholders', () => {
  const html = '<p><strong>bold</strong> and <em>italic</em></p>';
  const result = extractTextWithInlinePlaceholders(block, registry, 'xml');

  // TWO placeholders for TWO separate inline elements
  expect(result).toMatch(/<x id="0"/>.*<x id="1"/>/);
});

// Test 4: Sibling inline elements (not nested)
test('Sibling inline elements inside same parent', () => {
  const html = '<p><strong>Bold</strong> <em>Italic</em> <code>Code</code></p>';
  const result = extractTextWithInlinePlaceholders(block, registry, 'xml');

  // THREE separate placeholders
  const placeholders = result.match(/<x id="\d+"\/>/g);
  expect(placeholders).toHaveLength(3);
  expect(placeholders[0]).toBe('<x id="0"/>');
  expect(placeholders[1]).toBe('<x id="1"/>');
  expect(placeholders[2]).toBe('<x id="2"/>');
});
```

**Reassembly Verification**:

```javascript
// Test that nested structure is preserved
test('Nested structure preserved after reassembly', () => {
  const original = '<a href="/docs"><em>click here</em></a>';

  // Extract
  const extracted = '<x id="0"/>';
  registry.register(linkElement, 'xml');

  // Mock DeepL translation
  const translated = '<x id="0"/>';  // Placeholder preserved

  // Reassemble
  const reassembled = reassembleTranslationWithPlaceholders(
    translated,
    registry,
    blockContainer,
    'xml'
  );

  // Verify complete subtree restored
  expect(reassembled).toContain('<a href="/docs">');
  expect(reassembled).toContain('<em>');
  expect(reassembled).toContain('click here');
  expect(reassembled).toContain('</em>');
  expect(reassembled).toContain('</a>');
});
```

**Debugging Nested Elements**:

```javascript
// Add debug logging for nested elements
extractTextWithInlinePlaceholders(node, registry, format) {
  if (isInlineElement(node)) {
    const placeholderId = registry.register(node, format);
    const placeholder = format === 'xml'
      ? `<x id="${placeholderId}"/>`
      : `[[AIWC-${placeholderId}]]`;

    // Debug: Log nested structure
    if (node.children.length > 0) {
      console.log(`[Extraction] Nested inline element (${node.tagName}):`, {
        placeholderId,
        hasChildren: node.children.length,
        outerHTML: node.outerHTML,
        placeholder
      });
    }

    return placeholder;
  }
  // ... rest of function
}
```

---

### Summary of Critical Requirements

| Requirement | Implementation | Validation |
|-------------|----------------|------------|
| **Lowercase tags** | Always generate `<x id="N"/>` (lowercase) | Regex checks for uppercase variants |
| **Exact ignore_tags** | Always set `ignore_tags: "x"` | Validate before API call |
| **Subtree capture** | Store `element.outerHTML` (complete) | Unit tests for nested structures |
| **Single placeholder** | One placeholder per outermost inline element | Count placeholders vs elements |

---

## Conclusion

This design implements a **robust, extensible placeholder system** that:

1. **Leverages DeepL's native XML support** for maximum stability
2. **Maintains backward compatibility** with existing AI and traditional providers
3. **Provides graceful fallback** when XML tags are corrupted
4. **Integrates seamlessly** with existing @@@ newline system
5. **Handles RTL languages** with whitespace-tolerant regex patterns
6. **Enables future extensibility** for new providers and formats

The format-aware architecture ensures that each provider uses the optimal placeholder strategy for its capabilities, while unified validation and reassembly logic keeps the system maintainable and testable.
