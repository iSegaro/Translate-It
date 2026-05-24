import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DomTranslatorAdapter } from './DomTranslatorAdapter.js';
import { BlockGroupReconstructor } from './BlockGroupReconstructor.js';
import { collectBlockGroups } from './DomTranslatorUtils.js';

// Clean mock setup for dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    operation: vi.fn()
  }))
}));

vi.mock('@/config.js', () => ({
  getTranslationApiAsync: vi.fn(() => Promise.resolve('gemini')),
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('gemini')),
  getTargetLanguageAsync: vi.fn(() => Promise.resolve('fa')),
  getAIContextTranslationEnabledAsync: vi.fn(() => Promise.resolve(true)),
  getSourceLanguageAsync: vi.fn(() => Promise.resolve('en')),
  getFeatureSemanticBlockGroupingAsync: vi.fn(() => Promise.resolve(true))
}));

vi.mock('@/shared/config/config.js', () => ({
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('gemini')),
  TranslationMode: {
    Select_Element: 'select-element'
  }
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: vi.fn(() => Promise.resolve())
}));

vi.mock('@/shared/messaging/core/ContentScriptIntegration.js', () => ({
  registerTranslation: vi.fn(),
  contentScriptIntegration: {
    initialize: vi.fn(() => Promise.resolve()),
    sendTranslationRequest: vi.fn(() => Promise.resolve({ success: true, streaming: true })),
    cancelTranslationRequest: vi.fn(),
    streamingHandler: {
      cancelHandler: vi.fn()
    }
  }
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => ({
      handle: vi.fn()
    }))
  }
}));
vi.mock('@/shared/error-management/ErrorMatcher.js', () => ({
  isCancellationError: vi.fn(() => false),
  matchErrorToType: vi.fn(() => 'UNKNOWN')
}));
vi.mock('@/shared/error-management/ErrorTypes.js', () => ({
  ErrorTypes: {
    VALIDATION_ERROR: 'VALIDATION_ERROR'
  }
}));

vi.mock('@/features/shared/hover-preview/HoverPreviewLookup.js', () => ({
  hoverPreviewLookup: {
    add: vi.fn()
  }
}));

vi.mock('@/features/page-translation/PageTranslationConstants.js', () => ({
  PAGE_TRANSLATION_ATTRIBUTES: {
    HAS_ORIGINAL: 'data-has-original'
  }
}));

describe('DomTranslatorAdapter Stress and Edge-Case Testing', () => {
  let adapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new DomTranslatorAdapter();
  });

  // ==========================================
  // STRESS TEST 1: Mixed RTL/LTR Inline Formatting
  // ==========================================
  describe('Mixed RTL/LTR Inline Formatting', () => {
    it('should correctly handle سلام <b>world</b> خوبه؟', async () => {
      const container = document.createElement('div');
      container.innerHTML = 'سلام <b>world</b> خوبه؟';
      document.body.appendChild(container);

      // Verify block collection groups them under a single block group
      const context = { blockMap: new WeakMap(), blockCounter: { value: 0 }, activeSessionId: 'test-session' };
      const units = collectBlockGroups(container, context);

      expect(units.length).toBe(3);
      // Sibling text nodes should share the same block parent ID
      expect(units[0].blockId).toBe(units[1].blockId);
      expect(units[1].blockId).toBe(units[2].blockId);

      // Inject markers for the group
      const assembled = BlockGroupReconstructor.injectMarkers(units);
      expect(assembled).toBe('سلام@@SEG_n2@@world@@SEG_n3@@خوبه؟');

      // Verify splitting and reconstructed layout (strict deterministic check)
      const mockTranslatedBlock = 'Hello @@SEG_n2@@world@@SEG_n3@@ is it good?';
      const parsed = BlockGroupReconstructor.splitTranslatedBlock(mockTranslatedBlock, units);
      
      expect(parsed[0].text.trim()).toBe('Hello');
      expect(parsed[1].text.trim()).toBe('world');
      expect(parsed[2].text.trim()).toBe('is it good?');

      document.body.removeChild(container);
    });

    it('should correctly handle mixed technical/brand LTR within LTR e.g. "قیمت iPhone 15 Pro Max کاهش یافت."', async () => {
      const container = document.createElement('div');
      container.innerHTML = 'قیمت <span>iPhone 15 Pro Max</span> کاهش یافت.';
      document.body.appendChild(container);

      const context = { blockMap: new WeakMap(), blockCounter: { value: 0 }, activeSessionId: 'test-session' };
      const units = collectBlockGroups(container, context);

      expect(units.length).toBe(3);
      const assembled = BlockGroupReconstructor.injectMarkers(units);
      expect(assembled).toBe('قیمت@@SEG_n2@@iPhone 15 Pro Max@@SEG_n3@@کاهش یافت.');

      const mockTranslatedBlock = 'Price @@SEG_n2@@iPhone 15 Pro Max@@SEG_n3@@ decreased.';
      const parsed = BlockGroupReconstructor.splitTranslatedBlock(mockTranslatedBlock, units);
      
      expect(parsed[0].text.trim()).toBe('Price');
      expect(parsed[1].text.trim()).toBe('iPhone 15 Pro Max');
      expect(parsed[2].text.trim()).toBe('decreased.');

      document.body.removeChild(container);
    });

    // ==========================================
    // STRESS TEST 1b: Nested Inline Complexity
    // ==========================================
    it('should correctly handle nested elements سلام <b><i>world</i></b> خوبه؟', () => {
      const container = document.createElement('div');
      container.innerHTML = 'سلام <b><i>world</i></b> خوبه؟';
      document.body.appendChild(container);

      const context = { blockMap: new WeakMap(), blockCounter: { value: 0 }, activeSessionId: 'test-session' };
      const units = collectBlockGroups(container, context);

      expect(units.length).toBe(3);
      expect(units[1].inlineParentTags).toEqual(['i', 'b']); // captures deep nesting stack

      const assembled = BlockGroupReconstructor.injectMarkers(units);
      expect(assembled).toBe('سلام@@SEG_n2@@world@@SEG_n3@@خوبه؟');

      const mockTranslatedBlock = 'Hello @@SEG_n2@@world@@SEG_n3@@ is good?';
      const parsed = BlockGroupReconstructor.splitTranslatedBlock(mockTranslatedBlock, units);
      
      expect(parsed[0].text.trim()).toBe('Hello');
      expect(parsed[1].text.trim()).toBe('world');
      expect(parsed[2].text.trim()).toBe('is good?');

      document.body.removeChild(container);
    });

    it('should correctly handle nested element tree: Hello <span>beautiful <b>world</b></span>!', () => {
      const container = document.createElement('div');
      container.innerHTML = 'Hello <span>beautiful <b>world</b></span>!';
      document.body.appendChild(container);

      const context = { blockMap: new WeakMap(), blockCounter: { value: 0 }, activeSessionId: 'test-session' };
      const units = collectBlockGroups(container, context);

      expect(units.length).toBe(4);
      expect(units[1].inlineParentTags).toEqual(['span']);
      expect(units[2].inlineParentTags).toEqual(['b', 'span']);
      expect(units[3].inlineParentTags).toEqual([]);

      const assembled = BlockGroupReconstructor.injectMarkers(units);
      expect(assembled).toBe('Hello@@SEG_n2@@beautiful@@SEG_n3@@world@@SEG_n4@@!');

      const mockTranslated = 'سلام@@SEG_n2@@زیبا@@SEG_n3@@جهان@@SEG_n4@@!';
      const parsed = BlockGroupReconstructor.splitTranslatedBlock(mockTranslated, units);
      expect(parsed[0].text.trim()).toBe('سلام');
      expect(parsed[1].text.trim()).toBe('زیبا');
      expect(parsed[2].text.trim()).toBe('جهان');
      expect(parsed[3].text.trim()).toBe('!');

      document.body.removeChild(container);
    });

    // ==========================================
    // STRESS TEST 1c: Whitespace Restoration & Boundary Preservation
    // ==========================================
    it('should perfectly preserve leading/trailing whitespaces during reconstruction', () => {
      const container = document.createElement('div');
      container.innerHTML = 'سلام <b>world</b> خوبه؟';
      document.body.appendChild(container);

      const context = { blockMap: new WeakMap(), blockCounter: { value: 0 }, activeSessionId: 'test-session' };
      const units = collectBlockGroups(container, context);

      expect(units[0].leadingWS).toBe('');
      expect(units[0].trailingWS).toBe(' ');
      expect(units[1].leadingWS).toBe('');
      expect(units[1].trailingWS).toBe('');
      expect(units[2].leadingWS).toBe(' ');
      expect(units[2].trailingWS).toBe('');

      // Mutate via apply
      const translation = 'Hello@@SEG_n2@@world@@SEG_n3@@is good?';
      BlockGroupReconstructor.apply(units, translation, 'fa', container);

      // Verify the text nodes contain exactly the reconstructed whitespace layout with bidi marks
      const textNodes = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        textNodes.push(n.textContent);
      }

      // The bidi mark is either \u200e (LRM) or \u200f (RLM)
      expect(textNodes[0]).toMatch(/^\u200e?Hello\u200e?\s+$/); // trailing space preserved
      expect(textNodes[1]).toMatch(/^\u200e?world\u200e?$/); // no trailing space
      expect(textNodes[2]).toMatch(/^\s+\u200e?is good\?\u200e?$/); // leading space preserved

      document.body.removeChild(container);
    });

    // ==========================================
    // STRESS TEST 1d: Delimiter Robustness & Case/Whitespace Fuzzing
    // ==========================================
    it('should robustly parse spacing/casing variations around segment delimiters (Fuzzing)', () => {
      const container = document.createElement('div');
      container.innerHTML = 'Part 1 <span>Part 2</span> Part 3';
      document.body.appendChild(container);

      const context = { blockMap: new WeakMap(), blockCounter: { value: 0 }, activeSessionId: 'test-session' };
      const units = collectBlockGroups(container, context);

      // 1. Spaced uppercase marker: "A @@  SEG_n2  @@ B @@  SEG_n3  @@ C"
      const spacedUpper = 'A @@  SEG_n2  @@ B @@  SEG_n3  @@ C';
      const parsed1 = BlockGroupReconstructor.splitTranslatedBlock(spacedUpper, units);
      expect(parsed1[0].text.trim()).toBe('A');
      expect(parsed1[1].text.trim()).toBe('B');
      expect(parsed1[2].text.trim()).toBe('C');

      // 2. Lowercase marker: "A @@seg_n2@@ B @@seg_n3@@ C"
      const lowercase = 'A @@seg_n2@@ B @@seg_n3@@ C';
      const parsed2 = BlockGroupReconstructor.splitTranslatedBlock(lowercase, units);
      expect(parsed2[0].text.trim()).toBe('A');
      expect(parsed2[1].text.trim()).toBe('B');
      expect(parsed2[2].text.trim()).toBe('C');

      // 3. Mixed case and spaces: "A @@ sEg _ n2 @@ B @@ SeG _ n3 @@ C"
      const mixedFuzz = 'A @@ sEg _ n2 @@ B @@ SeG _ n3 @@ C';
      const parsed3 = BlockGroupReconstructor.splitTranslatedBlock(mixedFuzz, units);
      expect(parsed3[0].text.trim()).toBe('A');
      expect(parsed3[1].text.trim()).toBe('B');
      expect(parsed3[2].text.trim()).toBe('C');

      document.body.removeChild(container);
    });
  });

  // ==========================================
  // STRESS TEST 2: Preformatted (Pre/Code) Exclusion
  // ==========================================
  describe('Preformatted (pre/code) Exclusion', () => {
    it('should exclude pre/code blocks from block-grouping and mark as V2_PASSTHROUGH', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        Normal Paragraph text
        <pre>class Test { constructor() {} }</pre>
        <code>console.log("hello");</code>
      `;
      document.body.appendChild(container);

      const context = { blockMap: new WeakMap(), blockCounter: { value: 0 }, activeSessionId: 'test-session' };
      const units = collectBlockGroups(container, context);

      // We expect 3 main text segments
      const normalUnit = units.find(u => u.text.includes('Normal'));
      const preUnit = units.find(u => u.text.includes('class Test'));
      const codeUnit = units.find(u => u.text.includes('console.log'));

      expect(normalUnit).toBeDefined();
      expect(preUnit).toBeDefined();
      expect(codeUnit).toBeDefined();

      // Normal text should be standard
      expect(normalUnit.mode).toBe('standard');

      // pre and code blocks must be excluded (marked as V2_PASSTHROUGH)
      expect(preUnit.mode).toBe('V2_PASSTHROUGH');
      expect(codeUnit.mode).toBe('V2_PASSTHROUGH');

      document.body.removeChild(container);
    });
  });

  // ==========================================
  // STRESS TEST 3: Rollback Path on Marker Corruption
  // ==========================================
  describe('Rollback Path on Marker Corruption', () => {
    it('should trigger all-or-nothing rollback when segment delimiters are corrupted by LLM', async () => {
      const container = document.createElement('div');
      const s1 = document.createElement('span');
      s1.textContent = 'Part A';
      const s2 = document.createElement('span');
      s2.textContent = 'Part B';
      container.appendChild(s1);
      container.appendChild(s2);
      document.body.appendChild(container);

      const context = { blockMap: new WeakMap(), blockCounter: { value: 0 }, activeSessionId: 'test-session' };
      const units = collectBlockGroups(container, context);

      // Verify initial texts
      expect(s1.textContent).toBe('Part A');
      expect(s2.textContent).toBe('Part B');

      // Simulate a corrupted translation returned by LLM (missing the segment marker @@SEG_n2@@)
      const corruptedResponse = 'Translated Part A and also Translated Part B without markers';

      expect(() => {
        BlockGroupReconstructor.apply(units, corruptedResponse, 'fa', container);
      }).toThrow('Segment count mismatch');

      // Verify that DOM was NOT mutated and remains completely intact (atomic transactional safety)
      expect(s1.textContent).toBe('Part A');
      expect(s2.textContent).toBe('Part B');

      document.body.removeChild(container);
    });
  });

  // ==========================================
  // STRESS TEST 4: Framework Mutation Safety (Mid-Flight Detach)
  // ==========================================
  describe('Framework Mutation Safety', () => {
    it('should abort and rollback before mutating if react/vue detaches nodes mid-flight', async () => {
      const container = document.createElement('div');
      const s1 = document.createElement('span');
      s1.textContent = 'Initial 1';
      const s2 = document.createElement('span');
      s2.textContent = 'Initial 2';
      container.appendChild(s1);
      container.appendChild(s2);
      document.body.appendChild(container);

      const context = { blockMap: new WeakMap(), blockCounter: { value: 0 }, activeSessionId: 'test-session' };
      const units = collectBlockGroups(container, context);

      // Simulate React/Vue mid-flight rerender detaching the second node from the active DOM
      s2.remove();

      // Attempt to apply translation
      const translation = 'Translated 1 @@SEG_n2@@Translated 2';

      expect(() => {
        BlockGroupReconstructor.apply(units, translation, 'fa', container);
      }).toThrow('Stale or detached DOM node reference for segment n2');

      // The active DOM nodes should remain safe and original
      expect(s1.textContent).toBe('Initial 1');

      document.body.removeChild(container);
    });
  });

  // ==========================================
  // STRESS TEST 5: Grouped Payload Verification (With Session-Scoped Markers)
  // ==========================================
  describe('Grouped Payload Verification', () => {
    it('should verify that multiple inline segments are sent as a grouped payload with session-scoped markers', async () => {
      const container = document.createElement('div');
      container.innerHTML = 'Hello <span>world</span>!';
      document.body.appendChild(container);

      const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);

      let sentPayload = null;
      contentScriptIntegration.sendTranslationRequest.mockImplementationOnce(async (message) => {
        sentPayload = JSON.parse(message.data.text);
        const sessionId = message.data.sessionId;
        const responseText = `سلام@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n2@@جهان@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n3@@!`;
        return { success: true, streaming: false, translatedText: JSON.stringify([{ t: responseText, i: 'g1' }]) };
      });

      await adapter.translateElement(container);

      // Inspect sent payload
      expect(sentPayload).toBeDefined();
      expect(sentPayload.length).toBe(1); // Single grouped block item, NOT 3 individual items!
      expect(sentPayload[0].i).toBe('g1'); // The block ID is g1
      
      const sessionId = adapter.currentSessionId;
      expect(sentPayload[0].t).toBe(`Hello@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n2@@world@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n3@@!`); // Contains session-scoped markers!

      document.body.removeChild(container);
    });
  });

  // ==========================================
  // STRESS TEST 6: Full Pipeline End-to-End Test
  // ==========================================
  describe('Full Pipeline End-to-End Test', () => {
    it('should execute the entire DOM extraction, grouping, serialization, LLM response, parsing, reconstruction, and final DOM equality pipeline cleanly', async () => {
      const container = document.createElement('div');
      container.innerHTML = 'Hello <span>beautiful <b>world</b></span>!';
      document.body.appendChild(container);

      const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);

      // 1. Mock the background LLM processing the grouped payload and returning a valid translated block with session-scoped markers
      contentScriptIntegration.sendTranslationRequest.mockImplementationOnce(async (message) => {
        const payload = JSON.parse(message.data.text);
        const sessionId = message.data.sessionId;
        
        expect(payload.length).toBe(1); // Grouped into 1 block
        expect(payload[0].t).toBe(`Hello@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n2@@beautiful@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n3@@world@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n4@@!`);

        // Translate the block keeping markers perfectly in place
        const translatedBlock = `درود@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n2@@زیبا@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n3@@جهان@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n4@@!`;
        return {
          success: true,
          streaming: false,
          translatedText: JSON.stringify([{ t: translatedBlock, i: 'g1' }])
        };
      });

      // 2. Run the adapter
      const result = await adapter.translateElement(container);
      expect(result.success).toBe(true);

      // 3. Verify final DOM structures and content
      const textNodes = [];
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        textNodes.push(n.textContent);
      }

      // Check exact values and whitespaces restored cleanly with bidi marks
      expect(textNodes[0]).toMatch(/^[\u200e\u200f]?درود[\u200e\u200f]?\s*$/);
      expect(textNodes[1]).toMatch(/^[\u200e\u200f]?زیبا[\u200e\u200f]?\s+$/);
      expect(textNodes[2]).toMatch(/^[\u200e\u200f]?جهان[\u200e\u200f]?$/);
      expect(textNodes[3]).toBe('!'); // exact punctuation adjacency preserved!

      document.body.removeChild(container);
    });
  });

  // ==========================================
  // STRESS TEST 7: Reorder Corruption Detection Test
  // ==========================================
  describe('Reorder Corruption Detection Test', () => {
    it('should throw an error and rollback if LLM attempts to reorder segment IDs inside a block group', async () => {
      const container = document.createElement('div');
      container.innerHTML = 'Hello <span>world</span>!';
      document.body.appendChild(container);

      const context = { blockMap: new WeakMap(), blockCounter: { value: 0 }, activeSessionId: 'test-session' };
      const units = collectBlockGroups(container, context);

      const sessionId = 's12345';
      const reorderedBlock = `جهان@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n3@@دنیا@@TI_SEG_${adapter.currentEntropy}_${sessionId}_n2@@سلام!`; // LLM swapped segment order!

      // units has n1, n2, n3. reorderedBlock has no n1, but n3 and n2.
      // splitTranslatedBlock will fail because segments.length (2) !== expectedUnits.length (3)
      
      expect(() => {
        BlockGroupReconstructor.apply(units, reorderedBlock, 'fa', container, sessionId, adapter.currentEntropy);
      }).toThrow(/Segment count mismatch/);

      // DOM remains original
      expect(container.innerHTML).toBe('Hello <span>world</span>!');

      document.body.removeChild(container);
    });
  });

  // ==========================================
  // STRESS TEST 8: Session-Scoped Randomized Marker Verification
  // ==========================================
  describe('Session-Scoped Randomized Marker Verification', () => {
    it('should completely ignore markers that do not belong to the active translation session ID', () => {
      const container = document.createElement('div');
      container.innerHTML = 'Hello <span>world</span>!';
      document.body.appendChild(container);

      const context = { blockMap: new WeakMap(), blockCounter: { value: 0 }, activeSessionId: 'test-session' };
      const units = collectBlockGroups(container, context);

      const activeSession = 'activeSession123';
      const foreignSession = 'foreignSession999';

      // Reconstructed translation with a FOREIGN session ID in the marker
      const foreignTranslatedBlock = `درود@@TI_SEG_${foreignSession}-n2@@جهان!`;

      // Applying with activeSession should reject it, because it is strictly scoped to activeSession123!
      expect(() => {
        BlockGroupReconstructor.apply(units, foreignTranslatedBlock, 'fa', container, activeSession);
      }).toThrow('Segment count mismatch'); // Rejects because the foreign marker was treated as plain text, yielding count 1 instead of 3

      // DOM remains unchanged
      expect(container.innerHTML).toBe('Hello <span>world</span>!');

      document.body.removeChild(container);
    });
  });
});
