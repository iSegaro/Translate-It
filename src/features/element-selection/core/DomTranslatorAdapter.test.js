import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
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
  getFeatureSemanticBlockGroupingAsync: vi.fn(() => Promise.resolve(false))
}));

vi.mock('@/shared/config/constants.js', () => ({
  AUTO_DETECT_VALUE: 'auto',
  TRANSLATION_STATUS: {
    TRANSLATING: 'translating',
    COMPLETED: 'completed',
    ERROR: 'error'
  }
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

// Re-export mocked functions for easy access in tests
const { registerTranslation, contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
const { sendRegularMessage } = await import('@/shared/messaging/core/UnifiedMessaging.js');

vi.mock('@/shared/error-management/ErrorHandler.js');
vi.mock('@/shared/error-management/ErrorMatcher.js');
vi.mock('@/shared/error-management/ErrorTypes.js');

import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
const errorHandlerMock = ErrorHandler.getInstance();

vi.mock('@/utils/dom/DomDirectionManager.js', () => ({
  detectDirectionFromContent: vi.fn(() => 'rtl'),
  applyNodeDirection: vi.fn(),
  captureNodeDirectionState: vi.fn(() => []),
  restoreNodeDirectionState: vi.fn(() => []),
  applyElementDirection: vi.fn(),
  BIDI_MARKS: { RLM: '\u200f', LRM: '\u200e' }
}));

vi.mock('./DomTranslatorUtils.js', () => ({
  collectTextNodes: vi.fn((el) => [
    { node: el.firstChild, text: 'Hello', uid: 'n1', blockId: 'b1', role: 'div' }
  ]),
  collectBlockGroups: vi.fn((el) => [
    { id: 'n1', blockId: 'g1', text: 'Hello', leadingWS: '', trailingWS: '', preWhitespace: false, directionHint: 'ltr', inlineParentTags: ['div'], mode: 'standard', node: el.firstChild }
  ]),
  generateElementId: vi.fn(() => 'test-el-id'),
  extractContextMetadata: vi.fn(() => ({ contextSummary: 'test context' }))
}));

vi.mock('./DomTranslatorState.js', async () => {
  const actual = await vi.importActual('./DomTranslatorState.js');
  return {
    ...actual,
    revertSelectElementTranslation: vi.fn(actual.revertSelectElementTranslation),
    getSelectElementTranslationState: vi.fn(actual.getSelectElementTranslationState)
  };
});

import { 
  globalSelectElementState 
} from './DomTranslatorState.js';

vi.mock('@/features/shared/hover-preview/HoverPreviewLookup.js', () => ({
  hoverPreviewLookup: {
    add: vi.fn(),
    get: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('@/features/page-translation/PageTranslationConstants.js', () => ({
  PAGE_TRANSLATION_ATTRIBUTES: {
    HAS_ORIGINAL: 'data-has-original'
  }
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class ResourceTracker {
    constructor() {
      this.resources = new Set();
    }
    trackResource() {}
    cleanup() {}
  }
}));

import { DomTranslatorAdapter } from './DomTranslatorAdapter.js';
import { hoverPreviewLookup } from '@/features/shared/hover-preview/HoverPreviewLookup.js';

describe('DomTranslatorAdapter', () => {
  let adapter;
  let testElement;

  beforeEach(() => {
    vi.clearAllMocks();
    globalSelectElementState.translationHistory = [];
    adapter = new DomTranslatorAdapter();
    testElement = document.createElement('div');    testElement.textContent = 'Hello';
    document.body.appendChild(testElement);
  });

  it('should initialize and load original settings', async () => {
    await adapter.initialize();
    expect(adapter.originalSettings).toEqual({ source: 'en', target: 'fa' });
  });

  describe('translateElement', () => {
    it('should initiate a translation request', async () => {
      const onProgress = vi.fn();
      
      let streamCallbacks;
      registerTranslation.mockImplementation((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        // Simulate stream update after a short delay
        setTimeout(() => {
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: 'سلام', i: 'n1' }]
          });
          streamCallbacks.onStreamEnd({ success: true });
        }, 10);
        return { success: true, streaming: true };
      });

      const result = await adapter.translateElement(testElement, { onProgress });

      expect(result.success).toBe(true);
      expect(testElement.textContent).toContain('سلام');
      expect(contentScriptIntegration.sendTranslationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceLanguage: 'auto'
          })
        })
      );
    });

    it('should create one conversation parent and ACK once for shared blockId units', async () => {
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);

      let streamCallbacks;
      registerTranslation.mockImplementationOnce((_id, callbacks) => { streamCallbacks = callbacks; });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({ success: true, streaming: true });

      const translation = adapter.translateElement(testElement);
      await vi.waitFor(() => expect(streamCallbacks).toBeDefined());
      const request = contentScriptIntegration.sendTranslationRequest.mock.calls[0][0];
      expect(request.data.conversationParents).toEqual([{ parentId: 'b1', cleanSource: 'AB' }]);

      streamCallbacks.onStreamUpdate({ success: true, data: [{ t: 'Uno', i: 'n1' }] });
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'b1', accepted: true })
      }), { silent: true });
      streamCallbacks.onStreamUpdate({ success: true, data: [{ t: 'Dos', i: 'n2' }] });
      streamCallbacks.onStreamEnd({ success: true });
      await translation;

      const accepted = sendRegularMessage.mock.calls.filter(([message, options]) => (
        options?.silent === true && message?.data?.parentId === 'b1' && message?.data?.accepted === true
      ));
      expect(accepted).toHaveLength(1);
    });

    it('should reject a direct parent when an earlier pending node drifts', async () => {
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);
      let streamCallbacks;
      registerTranslation.mockImplementationOnce((_id, callbacks) => { streamCallbacks = callbacks; });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({ success: true, streaming: true });

      const translation = adapter.translateElement(testElement);
      await vi.waitFor(() => expect(streamCallbacks).toBeDefined());
      streamCallbacks.onStreamUpdate({ success: true, data: [{ t: 'Uno', i: 'n1' }] });
      expect(first.nodeValue).toBe('A');
      first.nodeValue = 'Changed A';
      streamCallbacks.onStreamUpdate({ success: true, data: [{ t: 'Dos', i: 'n2' }] });
      streamCallbacks.onStreamEnd({ success: true });
      await translation;

      expect(first.nodeValue).toBe('Changed A');
      expect(second.nodeValue).toBe('B');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'b1', accepted: true })
      }), { silent: true });
    });

    it('should order unique conversation parents by earliest source unit', async () => {
      const nodes = ['A', 'B', 'C'].map(text => document.createTextNode(text));
      testElement.replaceChildren(...nodes);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: nodes[0], text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: nodes[1], text: 'B', uid: 'n2', blockId: 'b1', role: 'div' },
        { node: nodes[2], text: 'C', uid: 'n3', blockId: 'b2', role: 'div' }
      ]);
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({ success: true, streaming: false, translatedText: 'invalid' });

      await adapter.translateElement(testElement);

      const request = contentScriptIntegration.sendTranslationRequest.mock.calls[0][0];
      expect(request.data.conversationParents).toEqual([
        { parentId: 'b1', cleanSource: 'AB' },
        { parentId: 'b2', cleanSource: 'C' }
      ]);
    });

    it('should ACK complete independent direct parents separately', async () => {
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b2', role: 'div' }
      ]);

      let streamCallbacks;
      registerTranslation.mockImplementationOnce((_id, callbacks) => { streamCallbacks = callbacks; });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({ success: true, streaming: true });

      const translation = adapter.translateElement(testElement);
      await vi.waitFor(() => expect(streamCallbacks).toBeDefined());
      streamCallbacks.onStreamUpdate({ success: true, data: [{ t: 'Uno', i: 'n1' }] });
      streamCallbacks.onStreamUpdate({ success: true, data: [{ t: 'Dos', i: 'n2' }] });
      streamCallbacks.onStreamEnd({ success: true });
      await translation;

      const acceptedParents = sendRegularMessage.mock.calls
        .filter(([message, options]) => options?.silent === true && message?.data?.accepted === true)
        .map(([message]) => message.data.parentId);
      expect(acceptedParents).toEqual(['b1', 'b2']);
    });

    it('should apply complete direct parent only after all units pass preflight', async () => {
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }, { t: 'Dos', i: 'n2' }]
      });

      await adapter.translateElement(testElement);

      expect(first.nodeValue).toContain('Uno');
      expect(second.nodeValue).toContain('Dos');
      expect(sendRegularMessage.mock.calls.filter(([message]) => message.data?.accepted === true)).toHaveLength(1);
    });

    it('should isolate invalid direct parent from valid parent in same response', async () => {
      const nodes = ['A', 'B', 'C'].map(text => document.createTextNode(text));
      testElement.replaceChildren(...nodes);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: nodes[0], text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: nodes[1], text: 'B', uid: 'n2', blockId: 'b1', role: 'div' },
        { node: nodes[2], text: 'C', uid: 'n3', blockId: 'b2', role: 'div' }
      ]);
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [
          { t: 'Uno', i: 'n1' },
          { t: '', i: 'n2' },
          { t: 'Tres', i: 'n3' }
        ]
      });

      await adapter.translateElement(testElement);

      expect(nodes[0].nodeValue).toBe('A');
      expect(nodes[1].nodeValue).toBe('B');
      expect(nodes[2].nodeValue).toContain('Tres');
      expect(sendRegularMessage.mock.calls.filter(([message]) => message.data?.accepted === true)
        .map(([message]) => message.data.parentId)).toEqual(['b2']);
    });

    it('should reject duplicate UID before applying its parent', async () => {
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [
          { t: 'Uno', i: 'n1' },
          { t: 'Un autre', i: 'n1' },
          { t: 'Dos', i: 'n2' }
        ]
      });

      await adapter.translateElement(testElement);

      expect(first.nodeValue).toBe('A');
      expect(second.nodeValue).toBe('B');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'b1', accepted: true })
      }), { silent: true });
    });

    it('should reject conflicting identity aliases without mutation', async () => {
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: testElement.firstChild, text: 'Hello', uid: 'n1', blockId: 'b1', role: 'div' }
      ]);
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Unsafe', i: 'n1', uid: 'n2' }]
      });

      await adapter.translateElement(testElement);

      expect(testElement.textContent).toBe('Hello');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accepted: true })
      }), expect.anything());
    });

    it('should accept equal identity aliases through parent lifecycle', async () => {
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: testElement.firstChild, text: 'Hello', uid: 'n1', blockId: 'b1', role: 'div' }
      ]);
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'سلام', i: 'n1', uid: 'n1', id: 'n1' }]
      });

      await adapter.translateElement(testElement);

      expect(testElement.textContent).toContain('سلام');
    });

    it('should ignore unknown identity without mutating another node', async () => {
      const nodes = [document.createTextNode('Hello'), document.createTextNode('World')];
      testElement.replaceChildren(...nodes);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: nodes[0], text: 'Hello', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: nodes[1], text: 'World', uid: 'n2', blockId: 'b2', role: 'div' }
      ]);
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Unknown', i: 'missing' }, { t: 'First', i: 'n1' }]
      });

      await adapter.translateElement(testElement);

      expect(nodes[0].nodeValue).toContain('First');
      expect(nodes[1].nodeValue).toBe('World');
    });

    it('should apply reordered exact IDs to matching nodes', async () => {
      const nodes = [document.createTextNode('Hello'), document.createTextNode('World')];
      testElement.replaceChildren(...nodes);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: nodes[0], text: 'Hello', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: nodes[1], text: 'World', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Second', i: 'n2' }, { t: 'First', i: 'n1' }]
      });

      await adapter.translateElement(testElement);

      expect(nodes[0].nodeValue).toContain('First');
      expect(nodes[1].nodeValue).toContain('Second');
    });

    it.each([
      [{ t: '' }, 'empty canonical field'],
      [{ t: '', text: 'Unsafe fallback' }, 'invalid canonical field'],
      [{ t: '   ' }, 'whitespace'],
      [{ t: null }, 'null'],
      [{ t: undefined }, 'undefined'],
      [{ t: 42 }, 'numeric'],
      [{}, 'missing translation']
    ])('should reject %s content without mutating parent', async (item) => {
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: testElement.firstChild, text: 'Hello', uid: 'n1', blockId: 'b1', role: 'div' }
      ]);
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ ...item, i: 'n1' }]
      });

      await adapter.translateElement(testElement);

      expect(testElement.textContent).toBe('Hello');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accepted: true })
      }), expect.anything());
    });

    it('should fallback to V2 node-by-node extraction for traditional providers even if Block Grouping is globally enabled', async () => {
      const { getFeatureSemanticBlockGroupingAsync, getEffectiveProviderAsync } = await import('@/config.js');
      const { collectTextNodes, collectBlockGroups } = await import('./DomTranslatorUtils.js');

      // Enable Block Grouping globally but use a traditional provider (google)
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);
      getEffectiveProviderAsync.mockResolvedValueOnce('google');
      
      collectBlockGroups.mockClear();
      collectTextNodes.mockClear();

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'سلام', i: 'n1' }])
      });

      const result = await adapter.translateElement(testElement);

      expect(result.success).toBe(true);
      // Should NOT use Block Grouping (V3)
      expect(collectBlockGroups).not.toHaveBeenCalled();
      // Should use traditional node extraction (V2)
      expect(collectTextNodes).toHaveBeenCalledTimes(1);
    });

    it('should preserve literal whitespace on revert when using Block Grouping', async () => {
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      const { collectBlockGroups } = await import('./DomTranslatorUtils.js');
      const { revertSelectElementTranslation } = await import('./DomTranslatorState.js');

      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);

      const div = document.createElement('div');
      const textNode = document.createTextNode('Welcome to '); // Trailing space
      div.appendChild(textNode);
      document.body.appendChild(div);

      collectBlockGroups.mockReturnValueOnce([{
        id: 'n1',
        blockId: 'g1',
        text: 'Welcome to',
        leadingWS: '',
        trailingWS: ' ',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['div'],
        mode: 'standard',
        node: textNode
      }]);

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'خوش آمدید', i: 'n1' }])
      });

      // Translate
      await adapter.translateElement(div);
      
      // Verify translation applied (contains the translated text and the trailing space)
      expect(textNode.nodeValue).toContain('خوش آمدید');
      expect(textNode.nodeValue.endsWith(' ')).toBe(true);

      // Revert
      await revertSelectElementTranslation();

      // Verify original literal text restored (including trailing space)
      expect(textNode.nodeValue).toBe('Welcome to ');
      
      document.body.removeChild(div);
    });

    it('should route through collectBlockGroups when FEATURE_SEMANTIC_BLOCK_GROUPING is true', async () => {
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      const { collectTextNodes, collectBlockGroups } = await import('./DomTranslatorUtils.js');
      
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);
      collectBlockGroups.mockClear();
      collectTextNodes.mockClear();

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'سلام', i: 'n1' }])
      });

      const result = await adapter.translateElement(testElement);

      expect(result.success).toBe(true);
      expect(collectBlockGroups).toHaveBeenCalledTimes(1);
      expect(collectTextNodes).not.toHaveBeenCalledWith(testElement);
      expect(testElement.textContent).toContain('سلام');
    });

    it('should handle direct (non-streaming) response', async () => {
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'سلام', i: 'n1' }])
      });

      const result = await adapter.translateElement(testElement);

      expect(result.success).toBe(true);
      expect(testElement.textContent).toContain('سلام');
    });

    it('should ACK non-fragmented parent after direct node acceptance', async () => {
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'سلام', i: 'n1' }])
      });

      await adapter.translateElement(testElement);

      expect(sendRegularMessage).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'b1', cleanResult: 'سلام', accepted: true })
      }), { silent: true });
    });

    it('should not ACK a parent when blockId is missing', async () => {
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: testElement.firstChild, text: 'Hello', uid: 'node-only', role: 'div' }
      ]);
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'سلام', i: 'node-only' }])
      });

      await adapter.translateElement(testElement);

      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'node-only' })
      }), { silent: true });
    });

    it('should suppress a raw V2 fragment without mutating its node', async () => {
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'Partial translation', i: 'n1', isSplitFragment: true }])
      });

      await adapter.translateElement(testElement);

      expect(testElement.textContent).toContain('Hello');
      expect(testElement.textContent).not.toContain('Partial translation');
    });

    it('should keep traditional Select Element payload 1:1 for a paragraph-bearing node', async () => {
      testElement.textContent = 'Paragraph one\n\nParagraph two';
      const textNode = testElement.firstChild;

      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: textNode, text: textNode.nodeValue, uid: 'n1', blockId: 'b1', role: 'div' }
      ]);

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'Translated paragraph one\n\nTranslated paragraph two', i: 'n1' }])
      });

      const result = await adapter.translateElement(testElement, { provider: 'googlev2' });
      const payload = JSON.parse(contentScriptIntegration.sendTranslationRequest.mock.calls[0][0].data.text);

      expect(result.success).toBe(true);
      expect(payload).toHaveLength(1);
      expect(payload[0]).toMatchObject({
        t: 'Paragraph one\n\nParagraph two',
        i: 'n1',
        b: 'b1',
        r: 'div'
      });
      expect(payload[0]).not.toHaveProperty('parentUid');
      expect(payload[0]).not.toHaveProperty('partIndex');
      expect(payload[0]).not.toHaveProperty('partCount');
      expect(textNode.nodeValue).toContain('Translated paragraph one\n\nTranslated paragraph two');
    });

    it('should keep a three-paragraph node as a single provider payload item', async () => {
      testElement.textContent = 'One\n\nTwo\n\nThree';
      const textNode = testElement.firstChild;

      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: textNode, text: textNode.nodeValue, uid: 'n1', blockId: 'b1', role: 'div' }
      ]);

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'Translated one\n\nTranslated two\n\nTranslated three', i: 'n1' }])
      });

      const result = await adapter.translateElement(testElement, { provider: 'googlev2' });
      const payload = JSON.parse(contentScriptIntegration.sendTranslationRequest.mock.calls[0][0].data.text);

      expect(result.success).toBe(true);
      expect(payload).toHaveLength(1);
      expect(payload[0].t).toBe('One\n\nTwo\n\nThree');
      expect(textNode.nodeValue).toContain('Translated one\n\nTranslated two\n\nTranslated three');
    });

    it('should leave text without internal paragraph breaks unchanged in payload shape', async () => {
      testElement.textContent = 'Hello world';
      const textNode = testElement.firstChild;

      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: textNode, text: textNode.nodeValue, uid: 'n1', blockId: 'b1', role: 'div' }
      ]);

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'Hello translated', i: 'n1' }])
      });

      const result = await adapter.translateElement(testElement, { provider: 'googlev2' });
      const payload = JSON.parse(contentScriptIntegration.sendTranslationRequest.mock.calls[0][0].data.text);

      expect(result.success).toBe(true);
      expect(payload).toHaveLength(1);
      expect(payload[0]).toMatchObject({ i: 'n1', t: 'Hello world', b: 'b1', r: 'div' });
      expect(textNode.nodeValue).toContain('Hello translated');
    });

    it('should keep multiple Select Element nodes in original 1:1 mapping even when one has paragraphs', async () => {
      const firstNode = document.createTextNode('First paragraph\n\nSecond line');
      const secondNode = document.createTextNode('Another segment');
      testElement.replaceChildren(firstNode, secondNode);

      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: firstNode, text: firstNode.nodeValue, uid: 'n1', blockId: 'b1', role: 'div' },
        { node: secondNode, text: secondNode.nodeValue, uid: 'n2', blockId: 'b2', role: 'div' }
      ]);

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([
          { t: 'First translated\n\nSecond paragraph translated', i: 'n1' },
          { t: 'Second translated', i: 'n2' }
        ])
      });

      const result = await adapter.translateElement(testElement, { provider: 'googlev2' });
      const payload = JSON.parse(contentScriptIntegration.sendTranslationRequest.mock.calls[0][0].data.text);

      expect(result.success).toBe(true);
      expect(payload).toHaveLength(2);
      expect(payload[0]).toMatchObject({ i: 'n1', t: 'First paragraph\n\nSecond line' });
      expect(payload[1]).toMatchObject({ i: 'n2', t: 'Another segment' });
      expect(payload[0]).not.toHaveProperty('parentUid');
      expect(payload[1]).not.toHaveProperty('parentUid');
      expect(firstNode.nodeValue).toContain('First translated\n\nSecond paragraph translated');
      expect(secondNode.nodeValue).toContain('Second translated');
    });

    it('should not split AI provider payloads', async () => {
      const { getEffectiveProviderAsync } = await import('@/config.js');
      getEffectiveProviderAsync.mockResolvedValueOnce('gemini');

      testElement.textContent = 'Paragraph one\n\nParagraph two';
      const textNode = testElement.firstChild;

      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: textNode, text: textNode.nodeValue, uid: 'n1', blockId: 'b1', role: 'div' }
      ]);

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'Translated text', i: 'n1' }])
      });

      await adapter.translateElement(testElement);
      const payload = JSON.parse(contentScriptIntegration.sendTranslationRequest.mock.calls[0][0].data.text);

      expect(payload).toHaveLength(1);
      expect(payload[0].t).toBe('Paragraph one\n\nParagraph two');
      expect(textNode.nodeValue).toContain('Translated text');
    });

    it('should handle translation errors', async () => {
      contentScriptIntegration.sendTranslationRequest.mockRejectedValue(new Error('Network error'));

      await expect(adapter.translateElement(testElement)).rejects.toThrow('Network error');
      
      // ErrorHandler should NOT be called in this layer (Single Red Log Policy)
      expect(errorHandlerMock.handle).not.toHaveBeenCalled();
    });

    it('should throw error if no translatable text found', async () => {
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([]);

      await expect(adapter.translateElement(testElement)).rejects.toThrow('No translatable text found');
    });

    it('should handle fatal stream errors', async () => {
      let streamCallbacks;
      registerTranslation.mockImplementation((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      const { isFatalError } = await import('@/shared/error-management/ErrorMatcher.js');
      isFatalError.mockReturnValueOnce(true);

      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        setTimeout(() => {
          streamCallbacks.onStreamUpdate({
            success: false,
            error: { message: 'Fatal API Error', type: 'API_ERROR' }
          });
        }, 10);
        return { success: true, streaming: true };
      });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('Fatal API Error');
    });

    it('should handle stream cancellation', async () => {
      let streamCallbacks;
      registerTranslation.mockImplementation((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        setTimeout(() => {
          streamCallbacks.onStreamEnd({ cancelled: true });
        }, 10);
        return { success: true, streaming: true };
      });

      const result = await adapter.translateElement(testElement);
      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
    });

    it('should update effective target language if provided in stream', async () => {
      let streamCallbacks;
      registerTranslation.mockImplementation((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        setTimeout(() => {
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: 'こんにちは', i: 'n1' }],
            targetLanguage: 'ja'
          });
          streamCallbacks.onStreamEnd({ success: true, targetLanguage: 'ja' });
        }, 10);
        return { success: true, streaming: true };
      });

      const { applyElementDirection } = await import('@/utils/dom/DomDirectionManager.js');

      await adapter.translateElement(testElement);
      
      // Verify finalization used the detected language
      expect(applyElementDirection).toHaveBeenCalledWith(testElement, 'ja');
    });

    it('should retain successful batches and report failure when the stream ends with an error', async () => {
      let streamCallbacks;
      registerTranslation.mockImplementation((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        setTimeout(() => {
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: 'سلام', i: 'n1' }]
          });
          streamCallbacks.onStreamEnd({
            success: false,
            error: { message: 'Batch failed', type: 'TRANSLATION_FAILED' }
          });
        }, 10);
        return { success: true, streaming: true };
      });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('Batch failed');
      expect(testElement.textContent).toContain('سلام');
    });

    it.each([
      ['text drift', () => { testElement.firstChild.nodeValue = 'Changed'; }],
      ['whitespace drift', () => { testElement.firstChild.nodeValue = 'Hello '; }],
      ['detached node', () => { testElement.firstChild.remove(); }],
      ['replaced node', () => { testElement.replaceChildren(document.createTextNode('Hello')); }],
    ])('rejects direct result after %s without mutation or accepted ACK', async (_caseName, mutateSource) => {
      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        mutateSource();
        return {
          success: true,
          streaming: false,
          translatedText: JSON.stringify([{ t: 'سلام', i: 'n1' }])
        };
      });

      await adapter.translateElement(testElement);

      expect(testElement.textContent).toBe(testElement.firstChild?.nodeValue || '');
      expect(testElement.textContent).not.toContain('سلام');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accepted: true })
      }), expect.anything());
    });

    it('rejects direct result when token is current but source changed', async () => {
      const originalNode = testElement.firstChild;
      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        originalNode.nodeValue = 'Changed';
        return {
          success: true,
          streaming: false,
          translatedText: JSON.stringify([{ t: 'سلام', i: 'n1' }])
        };
      });

      await adapter.translateElement(testElement);

      expect(originalNode.nodeValue).toBe('Changed');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accepted: true })
      }), expect.anything());
    });

    it('rejects stale token with unchanged source through existing guard', async () => {
      let streamCallbacks;
      registerTranslation.mockImplementation((_id, callbacks) => { streamCallbacks = callbacks; });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({ success: true, streaming: true });

      const translation = adapter.translateElement(testElement);
      await vi.waitFor(() => expect(streamCallbacks).toBeDefined());
      await adapter.cancelTranslation({ silent: true });
      streamCallbacks.onStreamUpdate({ success: true, data: [{ t: 'سلام', i: 'n1' }] });
      streamCallbacks.onStreamEnd({ success: true });
      await translation;

      expect(testElement.textContent).toBe('Hello');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accepted: true })
      }), expect.anything());
    });

    it('rejects direct streaming result after source drift without mutation or ACK', async () => {
      let streamCallbacks;
      registerTranslation.mockImplementation((_id, callbacks) => { streamCallbacks = callbacks; });
      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        testElement.firstChild.nodeValue = 'Changed';
        setTimeout(() => {
          streamCallbacks.onStreamUpdate({ success: true, data: [{ t: 'سلام', i: 'n1' }] });
          streamCallbacks.onStreamEnd({ success: true });
        }, 0);
        return { success: true, streaming: true };
      });

      await adapter.translateElement(testElement);

      expect(testElement.textContent).toBe('Changed');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accepted: true })
      }), expect.anything());
    });

    it('requires canonical lifecycle for direct handler callers', async () => {
      const staleNode = document.createTextNode('A');
      const validNode = document.createTextNode('B');
      testElement.replaceChildren(staleNode, validNode);
      staleNode.nodeValue = 'Changed A';
      adapter.currentMessageId = 'mixed-direct';

      await expect(adapter._handleDirectResponse({
        success: true,
        translatedText: [
          { t: 'Translated A', i: 'n1' },
          { t: 'Translated B', i: 'n2' }
        ],
        targetLanguage: 'fa'
      }, [], new Map([
        ['n1', { node: staleNode, text: 'A', uid: 'n1', blockId: 'b1' }],
        ['n2', { node: validNode, text: 'B', uid: 'n2', blockId: 'b2' }]
      ]), 'fa', testElement)).rejects.toThrow('canonical parent lifecycle callbacks');

      expect(staleNode.nodeValue).toBe('Changed A');
      expect(validNode.nodeValue).toBe('B');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'b2', accepted: true })
      }), { silent: true });
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'b1', accepted: true })
      }), { silent: true });
    });

    it('skips stale streaming unit while applying later valid unit', async () => {
      const staleNode = document.createTextNode('A');
      const validNode = document.createTextNode('B');
      testElement.replaceChildren(staleNode, validNode);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: staleNode, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: validNode, text: 'B', uid: 'n2', blockId: 'b2', role: 'div' }
      ]);

      let streamCallbacks;
      registerTranslation.mockImplementationOnce((_id, callbacks) => { streamCallbacks = callbacks; });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({ success: true, streaming: true });

      const translation = adapter.translateElement(testElement);
      await vi.waitFor(() => expect(streamCallbacks).toBeDefined());
      staleNode.nodeValue = 'Changed A';
      streamCallbacks.onStreamUpdate({
        success: true,
        data: [
          { t: 'Translated A', i: 'n1' },
          { t: 'Translated B', i: 'n2' }
        ]
      });
      streamCallbacks.onStreamEnd({ success: true });
      await translation;

      expect(staleNode.nodeValue).toBe('Changed A');
      expect(validNode.nodeValue).toContain('Translated B');
      expect(sendRegularMessage).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'b2', accepted: true })
      }), { silent: true });
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'b1', accepted: true })
      }), { silent: true });
    });

    it('should keep all units original while fragmented parent stream fails', async () => {
      const nodeA = document.createTextNode('Original A');
      const nodeB = document.createTextNode('Original B');
      const nodeC = document.createTextNode('Original C');
      testElement.replaceChildren(nodeA, nodeB, nodeC);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: nodeA, text: nodeA.nodeValue, uid: 'n1', blockId: 'b1', role: 'div' },
        { node: nodeB, text: nodeB.nodeValue, uid: 'n2', blockId: 'b1', role: 'div' },
        { node: nodeC, text: nodeC.nodeValue, uid: 'n3', blockId: 'b1', role: 'div' }
      ]);
      let streamCallbacks;
      registerTranslation.mockImplementation((_id, callbacks) => {
        streamCallbacks = callbacks;
      });
      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        setTimeout(() => {
          streamCallbacks.onStreamUpdate({ success: true, data: [{ i: 'n1', t: 'Translated A' }] });
          streamCallbacks.onStreamUpdate({ success: true, data: [{ i: 'n3', t: 'Translated C' }] });
          streamCallbacks.onStreamEnd({ success: false, error: { message: 'B failed', type: 'TRANSLATION_FAILED' } });
        }, 10);
        return { success: true, streaming: true };
      });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('B failed');

      expect(nodeA.nodeValue).toBe('Original A');
      expect(nodeB.nodeValue).toBe('Original B');
      expect(nodeC.nodeValue).toBe('Original C');
    });

    it('should ignore missing UID in stream without mutating or ACKing', async () => {
      let streamCallbacks;
      registerTranslation.mockImplementation((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        setTimeout(() => {
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: 'سلام' }] // No UID
          });
          streamCallbacks.onStreamEnd({ success: true });
        }, 10);
        return { success: true, streaming: true };
      });

      await adapter.translateElement(testElement);
      expect(testElement.textContent).toContain('Hello');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accepted: true })
      }), expect.anything());
    });

    it('should ignore ambiguous aliases in stream without mutating or ACKing', async () => {
      let streamCallbacks;
      registerTranslation.mockImplementation((_id, callbacks) => {
        streamCallbacks = callbacks;
      });
      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        setTimeout(() => {
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: 'سلام', i: 'n1', uid: 'n2' }]
          });
          streamCallbacks.onStreamEnd({ success: true });
        }, 10);
        return { success: true, streaming: true };
      });

      await adapter.translateElement(testElement);

      expect(testElement.textContent).toContain('Hello');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accepted: true })
      }), expect.anything());
    });

    it('should send AI context when enabled', async () => {
      const { getAIContextTranslationEnabledAsync } = await import('@/config.js');
      getAIContextTranslationEnabledAsync.mockResolvedValue(true);

      await adapter.translateElement(testElement);

      expect(contentScriptIntegration.sendTranslationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contextMetadata: expect.any(Object),
            contextSummary: 'test context'
          })
        })
      );
    });

    it('should handle multiple stream updates with deduplication', async () => {
      let streamCallbacks;
      registerTranslation.mockImplementation((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        setTimeout(() => {
          // Batch 1
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: 'سلام', i: 'n1' }]
          });
          // Batch 2 (Redundant update for n1, should be ignored)
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: 'ignored', i: 'n1' }]
          });
          streamCallbacks.onStreamEnd({ success: true });
        }, 10);
        return { success: true, streaming: true };
      });

      await adapter.translateElement(testElement);
      expect(testElement.textContent).toContain('سلام');
      expect(testElement.textContent).not.toContain('ignored');
    });

    it('should cleanup session even if translation fails', async () => {
      const cleanupSpy = vi.spyOn(adapter, '_cleanupCurrentSession');
      contentScriptIntegration.sendTranslationRequest.mockRejectedValue(new Error('Fail'));

      try {
        await adapter.translateElement(testElement);
      } catch {
        // Expected
      }

      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should preserve original text when direct response has no identity', async () => {
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: 'Plain text translation' // Not JSON
      });

      const result = await adapter.translateElement(testElement);
      expect(result.success).toBe(true);
      expect(testElement.textContent).toContain('Hello');
    });

    it('should handle error in onStreamEnd', async () => {
      let streamCallbacks;
      registerTranslation.mockImplementation((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      contentScriptIntegration.sendTranslationRequest.mockImplementation(async () => {
        setTimeout(() => {
          streamCallbacks.onStreamEnd({ success: false, error: 'Final stream error' });
        }, 10);
        return { success: true, streaming: true };
      });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('Final stream error');
    });

    it('should not apply empty translation', () => {
      const textNode = testElement.firstChild;
      const originalValue = textNode.nodeValue;
      
      adapter._applyTranslationToNode(textNode, '   ', 'fa', testElement);
      
      expect(textNode.nodeValue).toBe(originalValue);
    });

    it('should throw error if direct response handling fails', async () => {
      // Mock error during node application
      const mutationError = new Error('Apply failed');
      vi.spyOn(adapter, '_applyTranslationToNode').mockImplementation(() => {
        throw mutationError;
      });

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'Test', i: 'n1' }])
      });

      await expect(adapter.translateElement(testElement)).rejects.toBe(mutationError);
    });

    it('rolls back earlier direct unit writes when a later unit fails', async () => {
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);
      const apply = vi.spyOn(adapter, '_applyTranslationToNode');
      apply.mockImplementationOnce((...args) => DomTranslatorAdapter.prototype._applyTranslationToNode.call(adapter, ...args));
      apply.mockImplementationOnce(() => { throw new Error('second write failed'); });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }, { t: 'Dos', i: 'n2' }]
      });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('second write failed');
      expect(first.nodeValue).toBe('A');
      expect(second.nodeValue).toBe('B');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accepted: true })
      }), expect.anything());
      apply.mockRestore();
    });

    it('preserves primitive mutation failures after rollback', async () => {
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);
      const apply = vi.spyOn(adapter, '_applyTranslationToNode');
      apply.mockImplementationOnce((...args) => DomTranslatorAdapter.prototype._applyTranslationToNode.call(adapter, ...args));
      apply.mockImplementationOnce(() => { throw 'mutation-failure'; });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }, { t: 'Dos', i: 'n2' }]
      });

      await expect(adapter.translateElement(testElement)).rejects.toBe('mutation-failure');
      expect(first.nodeValue).toBe('A');
      expect(second.nodeValue).toBe('B');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'b1', accepted: true })
      }), { silent: true });
      apply.mockRestore();
    });

    it('preserves streaming mutation failures after rollback', async () => {
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);
      let callbacks;
      registerTranslation.mockImplementationOnce((_id, registered) => { callbacks = registered; });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({ success: true, streaming: true });
      const apply = vi.spyOn(adapter, '_applyTranslationToNode');
      apply.mockImplementationOnce((...args) => DomTranslatorAdapter.prototype._applyTranslationToNode.call(adapter, ...args));
      apply.mockImplementationOnce(() => { throw 'stream-mutation-failure'; });

      const translation = adapter.translateElement(testElement);
      await vi.waitFor(() => expect(callbacks).toBeDefined());
      callbacks.onStreamUpdate({ success: true, data: [{ t: 'Uno', i: 'n1' }, { t: 'Dos', i: 'n2' }] });

      await expect(translation).rejects.toBe('stream-mutation-failure');
      expect(first.nodeValue).toBe('A');
      expect(second.nodeValue).toBe('B');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'b1', accepted: true })
      }), { silent: true });
      apply.mockRestore();
    });

    it('does not leak streaming mutation classification to the next request', async () => {
      let callbacks;
      registerTranslation.mockImplementationOnce((_id, registered) => { callbacks = registered; });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({ success: true, streaming: true });
      const apply = vi.spyOn(adapter, '_applyTranslationToNode').mockImplementationOnce(() => { throw 'stream failure'; });

      const firstTranslation = adapter.translateElement(testElement);
      await vi.waitFor(() => expect(callbacks).toBeDefined());
      callbacks.onStreamUpdate({ success: true, data: [{ t: 'Uno', i: 'n1' }] });
      await expect(firstTranslation).rejects.toBe('stream failure');

      apply.mockRestore();
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }]
      });
      vi.spyOn(adapter, '_getResultIdentity').mockImplementationOnce(() => { throw new Error('ordinary parse failure'); });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('Invalid translation format');
    });

    it('restores shared parent marker after direct rollback', async () => {
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);
      vi.spyOn(adapter, '_applyTranslationToNode')
        .mockImplementationOnce((...args) => DomTranslatorAdapter.prototype._applyTranslationToNode.call(adapter, ...args))
        .mockImplementationOnce(() => { throw new Error('marker failure'); });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }, { t: 'Dos', i: 'n2' }]
      });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('marker failure');
      expect(testElement.hasAttribute('data-has-original')).toBe(false);
    });

    it('preserves existing shared parent marker after direct rollback', async () => {
      testElement.setAttribute('data-has-original', 'custom');
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);
      vi.spyOn(adapter, '_applyTranslationToNode')
        .mockImplementationOnce((...args) => DomTranslatorAdapter.prototype._applyTranslationToNode.call(adapter, ...args))
        .mockImplementationOnce(() => { throw new Error('existing marker failure'); });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }, { t: 'Dos', i: 'n2' }]
      });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('existing marker failure');
      expect(testElement.getAttribute('data-has-original')).toBe('custom');
    });

    it('restores text when direction mutation fails after an earlier parent was accepted', async () => {
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b2', role: 'div' }
      ]);
      const { applyNodeDirection } = await import('@/utils/dom/DomDirectionManager.js');
      applyNodeDirection
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => { throw new Error('direction failed'); });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }, { t: 'Dos', i: 'n2' }]
      });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('direction failed');
      expect(first.nodeValue).toContain('Uno');
      expect(second.nodeValue).toBe('B');
      expect(sendRegularMessage.mock.calls.filter(([message]) => message.data?.accepted === true)
        .map(([message]) => message.data.parentId)).toEqual(['b1']);
    });

    it('restores all units when direction mutation fails within one parent', async () => {
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);
      const { applyNodeDirection, restoreNodeDirectionState } = await import('@/utils/dom/DomDirectionManager.js');
      applyNodeDirection
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => { throw new Error('same parent direction failed'); });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }, { t: 'Dos', i: 'n2' }]
      });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('same parent direction failed');
      expect(first.nodeValue).toBe('A');
      expect(second.nodeValue).toBe('B');
      expect(restoreNodeDirectionState).toHaveBeenCalled();
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'b1', accepted: true })
      }), { silent: true });
    });

    it('logs direction rollback failures while preserving mutation error', async () => {
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: testElement.firstChild, text: 'Hello', uid: 'n1', blockId: 'b1', role: 'div' }
      ]);
      const { applyNodeDirection, restoreNodeDirectionState } = await import('@/utils/dom/DomDirectionManager.js');
      applyNodeDirection.mockImplementationOnce(() => { throw new Error('mutation error'); });
      restoreNodeDirectionState.mockReturnValueOnce([
        { kind: 'style', name: 'direction', error: new Error('rollback error') }
      ]);
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }]
      });
      const errorSpy = vi.spyOn(adapter.logger, 'error');

      await expect(adapter.translateElement(testElement)).rejects.toThrow('mutation error');
      expect(errorSpy).toHaveBeenCalledWith(
        '[DomTranslatorAdapter] Direct direction rollback failed',
        expect.objectContaining({ name: 'direction' })
      );
    });

    it('removes transaction-only hover state after direct rollback', async () => {
      const lookup = new Map();
      hoverPreviewLookup.get.mockImplementation(node => lookup.get(node));
      hoverPreviewLookup.add.mockImplementation((node, value) => lookup.set(node, value));
      hoverPreviewLookup.delete.mockImplementation(node => lookup.delete(node));
      const first = document.createTextNode('A');
      const second = document.createTextNode('B');
      testElement.replaceChildren(first, second);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockReturnValueOnce([
        { node: first, text: 'A', uid: 'n1', blockId: 'b1', role: 'div' },
        { node: second, text: 'B', uid: 'n2', blockId: 'b1', role: 'div' }
      ]);
      vi.spyOn(adapter, '_applyTranslationToNode')
        .mockImplementationOnce((...args) => DomTranslatorAdapter.prototype._applyTranslationToNode.call(adapter, ...args))
        .mockImplementationOnce(() => { throw new Error('hover rollback failure'); });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }, { t: 'Dos', i: 'n2' }]
      });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('hover rollback failure');
      expect(lookup.has(first)).toBe(false);
      expect(lookup.has(second)).toBe(false);
    });

    it.each([
      ['authentication', 'API_KEY_INVALID'],
      ['network', 'NETWORK_ERROR'],
      ['rate limit', 'RATE_LIMIT_REACHED'],
      ['timeout', 'TRANSLATION_TIMEOUT'],
      ['cancellation', 'USER_CANCELLED'],
    ])('preserves typed %s errors during direct response handling', async (_label, type) => {
      vi.spyOn(adapter, '_applyTranslationToNode').mockImplementation(() => {
        const error = new Error(`${type} failure`);
        error.type = type;
        if (type === 'USER_CANCELLED') error.isCancelled = true;
        throw error;
      });

      const response = {
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'Translated', i: 'n1' }]),
      };
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue(response);

      await expect(adapter.translateElement(testElement)).rejects.toMatchObject({
        message: `${type} failure`,
        type,
      });
    });
  });

  describe('cancelTranslation', () => {
    it('should cancel an ongoing translation', async () => {
      adapter.isTranslating = true;
      adapter.currentMessageId = 'test-msg-id';
      
      const cancelSpy = contentScriptIntegration.cancelTranslationRequest;
      
      await adapter.cancelTranslation();
      
      expect(cancelSpy).toHaveBeenCalledWith('test-msg-id', expect.anything());
      expect(adapter.isTranslating).toBe(false);
      expect(adapter.currentMessageId).toBeNull();
    });

    it('should not do anything if not translating', async () => {
      const cancelSpy = contentScriptIntegration.cancelTranslationRequest;
      await adapter.cancelTranslation();
      expect(cancelSpy).not.toHaveBeenCalled();
    });

    it('clears temporary translated segment state after session cleanup', () => {
      adapter.translatedSegmentMap.set('n1', 'translated');
      adapter.currentTranslationToken = { messageId: 'cleanup' };
      adapter.currentMessageId = 'cleanup';
      adapter.isTranslating = true;

      adapter._cleanupCurrentSession(false, adapter.currentTranslationToken);

      expect(adapter.translatedSegmentMap.size).toBe(0);
    });

    it('ignores late stream updates after cancellation without DOM mutation or ACK', async () => {
      let streamCallbacks;
      registerTranslation.mockImplementation((_id, callbacks) => {
        streamCallbacks = callbacks;
      });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({ success: true, streaming: true });

      const translation = adapter.translateElement(testElement);
      await vi.waitFor(() => expect(streamCallbacks).toBeDefined());
      await adapter.cancelTranslation({ silent: true });

      streamCallbacks.onStreamUpdate({ success: true, data: [{ t: 'late', i: 'n1' }] });
      expect(testElement.textContent).toBe('Hello');
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ accepted: true })
      }), expect.anything());

      streamCallbacks.onStreamEnd({ success: true });
      await expect(translation).resolves.toMatchObject({ success: false, cancelled: true });
    });

    it('ignores callbacks from previous session after a new translation starts', async () => {
      const firstElement = testElement;
      const secondElement = document.createElement('div');
      secondElement.textContent = 'Hello';
      document.body.appendChild(secondElement);

      const callbacks = [];
      registerTranslation.mockImplementation((_id, registered) => {
        callbacks.push(registered);
      });
      contentScriptIntegration.sendTranslationRequest
        .mockResolvedValueOnce({ success: true, streaming: true })
        .mockResolvedValueOnce({
          success: true,
          streaming: true
        });

      const firstTranslation = adapter.translateElement(firstElement);
      await vi.waitFor(() => expect(callbacks).toHaveLength(1));
      await adapter.cancelTranslation({ silent: true });

      const secondTranslation = adapter.translateElement(secondElement);
      await vi.waitFor(() => expect(callbacks).toHaveLength(2));
      callbacks[1].onStreamUpdate({ success: true, data: [{ t: 'active', i: 'n1' }] });
      callbacks[1].onStreamEnd({ success: true });
      await secondTranslation;

      callbacks[0].onStreamUpdate({ success: true, data: [{ t: 'stale', i: 'n1' }] });
      expect(firstElement.textContent).toBe('Hello');
      expect(secondElement.textContent).toContain('active');

      callbacks[0].onStreamEnd({ success: true });
      await firstTranslation;
    });

    it('keeps newer session state when stale session cleanup runs', async () => {
      const firstCallbacks = [];
      registerTranslation.mockImplementation((_id, callbacks) => {
        firstCallbacks.push(callbacks);
      });
      contentScriptIntegration.sendTranslationRequest
        .mockResolvedValueOnce({ success: true, streaming: true })
        .mockResolvedValueOnce({
          success: true,
          streaming: true
        });

      const firstTranslation = adapter.translateElement(testElement);
      await vi.waitFor(() => expect(firstCallbacks).toHaveLength(1));
      const firstToken = adapter.currentTranslationToken;
      await adapter.cancelTranslation({ silent: true });

      const secondElement = document.createElement('div');
      secondElement.textContent = 'Hello';
      document.body.appendChild(secondElement);
      const secondTranslation = adapter.translateElement(secondElement);
      await vi.waitFor(() => expect(firstCallbacks).toHaveLength(2));
      firstCallbacks[1].onStreamUpdate({ success: true, data: [{ t: 'active', i: 'n1' }] });
      const secondMessageId = adapter.currentMessageId;
      const secondToken = adapter.currentTranslationToken;

      adapter._cleanupCurrentSession(true, firstToken);

      expect(adapter.currentMessageId).toBe(secondMessageId);
      expect(adapter.currentTranslationToken).toBe(secondToken);
      expect(adapter.isTranslating).toBe(true);
      expect(secondElement.textContent).toContain('active');

      firstCallbacks[0].onStreamEnd({ success: true });
      await firstTranslation;
      firstCallbacks[1].onStreamEnd({ success: true });
      await secondTranslation;
      adapter._cleanupCurrentSession(false, secondToken);
      expect(adapter.isTranslating).toBe(false);
    });
  });

  it('creates one distinct revert session per translated element', async () => {
    const secondElement = document.createElement('div');
    secondElement.textContent = 'World';
    document.body.appendChild(secondElement);
    contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
      success: true,
      streaming: false,
      translatedText: JSON.stringify([{ t: 'Translated', i: 'n1' }])
    });

    await adapter.translateElement(testElement);
    await adapter.translateElement(secondElement);

    const entries = globalSelectElementState.translationHistory.slice(-2);
    expect(entries).toHaveLength(2);
    expect(entries[0].element).toBe(testElement);
    expect(entries[1].element).toBe(secondElement);
    expect(entries[0].sessionId).toBeTruthy();
    expect(entries[1].sessionId).toBeTruthy();
    expect(entries[0].sessionId).not.toBe(entries[1].sessionId);

    document.body.removeChild(secondElement);
  });

  describe('revertTranslation', () => {
    it('should call revertSelectElementTranslation', async () => {
      const { revertSelectElementTranslation } = await import('./DomTranslatorState.js');
      revertSelectElementTranslation.mockResolvedValue(5);
      
      const count = await adapter.revertTranslation();
      
      expect(count).toBe(5);
      expect(revertSelectElementTranslation).toHaveBeenCalled();
    });
  });

  describe('_handleDirectResponse', () => {
    it('requires canonical parent lifecycle callbacks for direct responses', async () => {
      await expect(adapter._handleDirectResponse(
        {
          success: true,
          translatedText: [{ t: 'Unsafe', i: 'n1' }],
          targetLanguage: 'fa'
        },
        [],
        new Map([['n1', { node: testElement.firstChild, text: 'Hello', uid: 'n1' }]]),
        'fa',
        testElement,
        null,
        null,
        null
      )).rejects.toThrow('canonical parent lifecycle callbacks');
      expect(testElement.textContent).toBe('Hello');
    });
  });

  describe('_commitBlockGroup', () => {
    it('rolls back DOM and exact adapter state when bookkeeping fails before ACK', async () => {
      const { BlockGroupReconstructor } = await import('./BlockGroupReconstructor.js');
      const node = testElement.firstChild;
      const unit = { id: 'n1', blockId: 'g1', text: 'Hello', leadingWS: '', trailingWS: '', node };
      const group = { blockId: 'g1', units: [unit] };
      const reconstruction = BlockGroupReconstructor.apply([unit], 'Translated', 'fa', testElement);
      const rollback = vi.spyOn(reconstruction.transaction, 'rollback');
      const finalize = vi.spyOn(reconstruction.transaction, 'finalize');
      adapter.translatedSegmentMap.set('n1', 'Previous');
      const processedUids = new Set();
      vi.spyOn(processedUids, 'add').mockImplementationOnce(() => {
        throw new Error('bookkeeping failed');
      });

      let failure;
      try {
        adapter._commitBlockGroup(group, reconstruction, 'Translated', processedUids, null);
      } catch (error) {
        failure = error;
      }

      expect(failure.cause).toMatchObject({ message: 'bookkeeping failed' });
      expect(rollback).toHaveBeenCalledOnce();
      expect(finalize).not.toHaveBeenCalled();
      expect(node.nodeValue).toBe('Hello');
      expect(adapter.translatedSegmentMap.get('n1')).toBe('Previous');
      expect(processedUids.has('n1')).toBe(false);
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'g1', accepted: true })
      }), { silent: true });
    });

    it('accepts canonical grouped result when optional shadow refinement fails', async () => {
      const { BlockGroupReconstructor } = await import('./BlockGroupReconstructor.js');
      const node = testElement.firstChild;
      const unit = { id: 'n1', blockId: 'g1', text: 'Hello', leadingWS: '', trailingWS: '', node };
      const group = { blockId: 'g1', isV2Passthrough: false, units: [unit] };
      const reconstruction = BlockGroupReconstructor.apply([unit], 'Translated', 'fa', testElement);
      const rollback = vi.spyOn(reconstruction.transaction, 'rollback');
      const finalize = vi.spyOn(reconstruction.transaction, 'finalize');
      const processedUids = new Set();
      adapter.currentMessageId = 'grouped-refinement';
      vi.spyOn(BlockGroupReconstructor, 'splitTranslatedBlock').mockImplementationOnce(() => {
        throw new Error('optional refinement failed');
      });

      adapter._commitBlockGroup(group, reconstruction, 'Translated', processedUids, null);

      expect(node.nodeValue).toContain('Translated');
      expect(adapter.translatedSegmentMap.get('n1')).toBe('Translated');
      expect(processedUids.has('n1')).toBe(true);
      expect(rollback).not.toHaveBeenCalled();
      expect(finalize).toHaveBeenCalledOnce();
      expect(sendRegularMessage).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'g1', accepted: true })
      }), { silent: true });
    });

    it('skips optional shadow refinement for V2 passthrough groups', async () => {
      const { BlockGroupReconstructor } = await import('./BlockGroupReconstructor.js');
      const node = testElement.firstChild;
      const unit = { id: 'n1', blockId: 'g1', text: 'Hello', leadingWS: '', trailingWS: '', node };
      const group = { blockId: 'g1', isV2Passthrough: true, units: [unit] };
      const reconstruction = BlockGroupReconstructor.apply([unit], 'Translated', 'fa', testElement);
      const split = vi.spyOn(BlockGroupReconstructor, 'splitTranslatedBlock');
      split.mockClear();
      const processedUids = new Set();
      adapter.currentMessageId = 'v2-passthrough';

      adapter._commitBlockGroup(group, reconstruction, 'Translated', processedUids, null);

      expect(split).not.toHaveBeenCalled();
      expect(node.nodeValue).toContain('Translated');
      expect(adapter.translatedSegmentMap.get('n1')).toBe('Translated');
    });
  });

  describe('_applyTranslationToNode', () => {
    it('should apply translation with BIDI marks and register for hover preview', () => {
      const textNode = testElement.firstChild;
      const originalText = textNode.textContent;
      
      adapter._applyTranslationToNode(textNode, 'سلام', 'fa', testElement);

      // RTL mark (\u200f) should be present
      expect(textNode.nodeValue).toContain('\u200fسلام\u200f');
      expect(hoverPreviewLookup.add).toHaveBeenCalledWith(textNode, originalText);
      expect(testElement.getAttribute('data-has-original')).toBe('true');
    });

    it('should apply LRM mark for LTR detection', async () => {
      const { detectDirectionFromContent } = await import('@/utils/dom/DomDirectionManager.js');
      detectDirectionFromContent.mockReturnValue('ltr');

      testElement.setAttribute('dir', 'rtl');

      const textNode = testElement.firstChild;
      adapter._applyTranslationToNode(textNode, 'Hello', 'en', testElement);

      // LRM mark (\u200e) should be present
      expect(textNode.nodeValue).toContain('\u200eHello\u200e');

      testElement.removeAttribute('dir');
      detectDirectionFromContent.mockReturnValue('rtl');
    });

    it('should reject object formatted translated text', () => {
      const textNode = testElement.firstChild;
      adapter._applyTranslationToNode(textNode, { text: 'سلام' }, 'fa', testElement);
      expect(textNode.nodeValue).toBe('Hello');
    });

    it('should preserve original ZWNJ if translation is functionally identical (cleaned ZWNJ)', () => {
      const textNode = testElement.firstChild;
      const originalWithZWNJ = 'می\u200cروم';
      textNode.nodeValue = originalWithZWNJ;
      
      const cleanedFromProvider = 'میروم';
      
      adapter._applyTranslationToNode(textNode, cleanedFromProvider, 'fa', testElement);
      
      // Should return the original text with ZWNJ, and BiDi marks (because it still applies markers)
      // Wait, let's check the code: it re-adds bidiMark
      expect(textNode.nodeValue).toContain(originalWithZWNJ);
      expect(textNode.nodeValue).toContain('\u200c');
    });
  });

  describe('Strategy X Subtree Exclusion and V3 Rollback integration tests', () => {
    it('aggregates shared-block V2 passthrough units into one parent and ACK', async () => {
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      const { collectBlockGroups } = await import('./DomTranslatorUtils.js');
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);
      const nodes = [document.createTextNode('A'), document.createTextNode('B')];
      testElement.replaceChildren(...nodes);
      collectBlockGroups.mockReturnValueOnce(nodes.map((node, index) => ({
        id: `n${index + 1}`,
        blockId: 'g1',
        text: node.nodeValue,
        leadingWS: '',
        trailingWS: '',
        inlineParentTags: ['pre'],
        mode: 'V2_PASSTHROUGH',
        node,
      })));
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }, { t: 'Dos', i: 'n2' }]
      });

      await adapter.translateElement(testElement);

      const request = contentScriptIntegration.sendTranslationRequest.mock.calls[0][0].data;
      expect(JSON.parse(request.text).map(item => item.i)).toEqual(['n1', 'n2']);
      expect(request.conversationParents).toEqual([{ parentId: 'g1', cleanSource: 'AB' }]);
      expect(nodes[0].nodeValue).toContain('Uno');
      expect(nodes[1].nodeValue).toContain('Dos');
      expect(sendRegularMessage.mock.calls.filter(([message]) => (
        message.data?.parentId === 'g1' && message.data?.accepted === true
      ))).toHaveLength(1);
    });

    it('keeps shared-block V2 passthrough parent original when one result is invalid', async () => {
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      const { collectBlockGroups } = await import('./DomTranslatorUtils.js');
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);
      const nodes = [document.createTextNode('A'), document.createTextNode('B')];
      testElement.replaceChildren(...nodes);
      collectBlockGroups.mockReturnValueOnce(nodes.map((node, index) => ({
        id: `n${index + 1}`,
        blockId: 'g1',
        text: node.nodeValue,
        leadingWS: '',
        trailingWS: '',
        inlineParentTags: ['pre'],
        mode: 'V2_PASSTHROUGH',
        node,
      })));
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }, { t: '', i: 'n2' }]
      });

      await adapter.translateElement(testElement);

      expect(nodes.map(node => node.nodeValue)).toEqual(['A', 'B']);
      expect(sendRegularMessage).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ parentId: 'g1', accepted: true })
      }), { silent: true });
    });

    it('accepts distinct V2 passthrough block parents independently', async () => {
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      const { collectBlockGroups } = await import('./DomTranslatorUtils.js');
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);
      const nodes = [document.createTextNode('A'), document.createTextNode('B')];
      testElement.replaceChildren(...nodes);
      collectBlockGroups.mockReturnValueOnce(nodes.map((node, index) => ({
        id: `n${index + 1}`,
        blockId: `g${index + 1}`,
        text: node.nodeValue,
        leadingWS: '',
        trailingWS: '',
        inlineParentTags: ['pre'],
        mode: 'V2_PASSTHROUGH',
        node,
      })));
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({
        success: true,
        streaming: false,
        translatedText: [{ t: 'Uno', i: 'n1' }, { t: 'Dos', i: 'n2' }]
      });

      await adapter.translateElement(testElement);

      expect(sendRegularMessage.mock.calls.filter(([message]) => message.data?.accepted === true)
        .map(([message]) => message.data.parentId)).toEqual(['g1', 'g2']);
    });

    it('waits for all streamed V2 passthrough units in one block before applying', async () => {
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      const { collectBlockGroups } = await import('./DomTranslatorUtils.js');
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);
      const nodes = [document.createTextNode('A'), document.createTextNode('B')];
      testElement.replaceChildren(...nodes);
      collectBlockGroups.mockReturnValueOnce(nodes.map((node, index) => ({
        id: `n${index + 1}`,
        blockId: 'g1',
        text: node.nodeValue,
        leadingWS: '',
        trailingWS: '',
        inlineParentTags: ['pre'],
        mode: 'V2_PASSTHROUGH',
        node,
      })));
      let callbacks;
      registerTranslation.mockImplementationOnce((_id, registered) => { callbacks = registered; });
      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({ success: true, streaming: true });

      const translation = adapter.translateElement(testElement);
      await vi.waitFor(() => expect(callbacks).toBeDefined());
      callbacks.onStreamUpdate({ success: true, data: [{ t: 'Uno', i: 'n1' }] });
      expect(nodes.map(node => node.nodeValue)).toEqual(['A', 'B']);
      callbacks.onStreamUpdate({ success: true, data: [{ t: 'Dos', i: 'n2' }] });
      callbacks.onStreamEnd({ success: true });
      await translation;

      expect(nodes[0].nodeValue).toContain('Uno');
      expect(nodes[1].nodeValue).toContain('Dos');
      expect(sendRegularMessage.mock.calls.filter(([message]) => message.data?.accepted === true)).toHaveLength(1);
    });

    it('should reject overlapping concurrent translation requests (Strategy X)', async () => {
      let resolveFirst;
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      contentScriptIntegration.sendTranslationRequest.mockImplementationOnce(() => firstPromise);

      const firstCall = adapter.translateElement(testElement);

      const childElement = document.createElement('span');
      testElement.appendChild(childElement);

      await expect(adapter.translateElement(childElement)).rejects.toThrow(
        'Translation already in progress for this element'
      );

      resolveFirst({ success: true, streaming: false });
      await firstCall;
    });

    it('should rollback to original immutable values if pre-apply connection validation fails', async () => {
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      const { collectBlockGroups } = await import('./DomTranslatorUtils.js');
      
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);

      const div = document.createElement('div');
      const span1 = document.createElement('span');
      span1.textContent = 'Hello ';
      const span2 = document.createElement('span');
      span2.textContent = 'world';
      div.appendChild(span1);
      div.appendChild(span2);
      document.body.appendChild(div);

      const unit1 = {
        id: 'n1',
        blockId: 'g1',
        text: 'Hello',
        leadingWS: '',
        trailingWS: ' ',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['span'],
        mode: 'standard',
        node: span1.firstChild
      };
      const unit2 = {
        id: 'n2',
        blockId: 'g1',
        text: 'world',
        leadingWS: '',
        trailingWS: '',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['span'],
        mode: 'standard',
        node: span2.firstChild
      };

      collectBlockGroups.mockReturnValueOnce([unit1, unit2]);

      const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      
      let streamCallbacks;
      const { registerTranslation } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      registerTranslation.mockImplementationOnce((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      contentScriptIntegration.sendTranslationRequest.mockImplementationOnce(async () => {
        setTimeout(() => {
          // Detach one node before applying translation
          span2.firstChild.remove();

          const sessionId = adapter.currentSessionId;
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: `مرحبا @@TI_SEG_${adapter.currentEntropy}_${sessionId}_n2@@بالعالم`, i: 'g1' }]
          });
          streamCallbacks.onStreamEnd({ success: true });
        }, 10);
        return { success: true, streaming: true };
      });

      await expect(adapter.translateElement(div)).rejects.toThrow(
        /Stale or detached DOM node reference/
      );

      expect(span1.firstChild.nodeValue).toBe('Hello ');
    });

    it('should abort and rollback to original immutable values if marker corruption is detected', async () => {
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      const { collectBlockGroups } = await import('./DomTranslatorUtils.js');
      
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);

      const div = document.createElement('div');
      const span1 = document.createElement('span');
      span1.textContent = 'Hello ';
      const span2 = document.createElement('span');
      span2.textContent = 'world';
      div.appendChild(span1);
      div.appendChild(span2);
      document.body.appendChild(div);

      const unit1 = {
        id: 'n1',
        blockId: 'g1',
        text: 'Hello',
        leadingWS: '',
        trailingWS: ' ',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['span'],
        mode: 'standard',
        node: span1.firstChild
      };
      const unit2 = {
        id: 'n2',
        blockId: 'g1',
        text: 'world',
        leadingWS: '',
        trailingWS: '',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['span'],
        mode: 'standard',
        node: span2.firstChild
      };

      collectBlockGroups.mockReturnValueOnce([unit1, unit2]);

      const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      
      let streamCallbacks;
      const { registerTranslation } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      registerTranslation.mockImplementationOnce((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      contentScriptIntegration.sendTranslationRequest.mockImplementationOnce(async () => {
        setTimeout(() => {
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: 'مرحبا بالعالم', i: 'g1' }]
          });
          streamCallbacks.onStreamEnd({ success: true });
        }, 10);
        return { success: true, streaming: true };
      });

      await expect(adapter.translateElement(div)).rejects.toThrow(
        /Segment count mismatch/
      );

      expect(span1.firstChild.nodeValue).toBe('Hello ');
      expect(span2.firstChild.nodeValue).toBe('world');
    });

    it('should run Shadow Mode validation and log debug on perfect equivalence', async () => {
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      const { collectBlockGroups } = await import('./DomTranslatorUtils.js');
      
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);

      const div = document.createElement('div');
      const span1 = document.createElement('span');
      span1.textContent = 'Hello ';
      const span2 = document.createElement('span');
      span2.textContent = 'world';
      div.appendChild(span1);
      div.appendChild(span2);
      document.body.appendChild(div);

      const unit1 = {
        id: 'n1',
        blockId: 'g1',
        text: 'Hello',
        leadingWS: '',
        trailingWS: ' ',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['span'],
        mode: 'standard',
        node: span1.firstChild
      };
      const unit2 = {
        id: 'n2',
        blockId: 'g1',
        text: 'world',
        leadingWS: '',
        trailingWS: '',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['span'],
        mode: 'standard',
        node: span2.firstChild
      };

      collectBlockGroups.mockReturnValueOnce([unit1, unit2]);
      const { collectTextNodes } = await import('./DomTranslatorUtils.js');
      collectTextNodes.mockImplementationOnce((el) => [
        { node: el.firstChild.firstChild, text: 'Hello', uid: 'n1' },
        { node: el.lastChild.firstChild, text: 'world', uid: 'n2' }
      ]);

      const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      
      let streamCallbacks;
      const { registerTranslation } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      registerTranslation.mockImplementationOnce((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      contentScriptIntegration.sendTranslationRequest.mockImplementationOnce(async () => {
        setTimeout(() => {
          const sessionId = adapter.currentSessionId;
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: `مرحبا @@TI_SEG_${adapter.currentEntropy}_${sessionId}_n2@@بالعالم`, i: 'g1' }]
          });
          streamCallbacks.onStreamEnd({ success: true });
        }, 10);
        return { success: true, streaming: true };
      });

      const debugSpy = vi.spyOn(adapter.logger, 'debug');

      const result = await adapter.translateElement(div);

      expect(result.success).toBe(true);
      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Reconstruction perfectly validated'));
    });

    it('should run Shadow Mode validation and log error on reconstruction anomaly', async () => {
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      const { collectBlockGroups } = await import('./DomTranslatorUtils.js');
      const { ShadowComparisonEngine } = await import('./ShadowComparisonEngine.js');
      
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);
      vi.spyOn(ShadowComparisonEngine, 'compare').mockReturnValueOnce({ equivalent: false, reason: 'Mocked anomaly' });

      const div = document.createElement('div');
      const span1 = document.createElement('span');
      span1.textContent = 'Hello ';
      const span2 = document.createElement('span');
      span2.textContent = 'world';
      div.appendChild(span1);
      div.appendChild(span2);
      document.body.appendChild(div);

      const unit1 = {
        id: 'n1',
        blockId: 'g1',
        text: 'Hello',
        leadingWS: '',
        trailingWS: ' ',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['span'],
        mode: 'standard',
        node: span1.firstChild
      };
      const unit2 = {
        id: 'n2',
        blockId: 'g1',
        text: 'world',
        leadingWS: '',
        trailingWS: '',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['span'],
        mode: 'standard',
        node: span2.firstChild
      };

      collectBlockGroups.mockReturnValueOnce([unit1, unit2]);

      const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      
      let streamCallbacks;
      const { registerTranslation } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      registerTranslation.mockImplementationOnce((id, callbacks) => {
        streamCallbacks = callbacks;
      });

      contentScriptIntegration.sendTranslationRequest.mockImplementationOnce(async () => {
        setTimeout(() => {
          const sessionId = adapter.currentSessionId;
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: `مرحبا @@TI_SEG_${adapter.currentEntropy}_${sessionId}_n2@@بالعالم`, i: 'g1' }]
          });
          streamCallbacks.onStreamEnd({ success: true });
        }, 10);
        return { success: true, streaming: true };
      });

      const errorSpy = vi.spyOn(adapter.logger, 'error');

      const resultPromise = adapter.translateElement(div);
      
      await new Promise(resolve => setTimeout(resolve, 5));
      adapter.translatedSegmentMap.set('n1', 'مختلف');

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Reconstruction anomaly detected'));
    });

    it('should log debug message on non-fatal attribute anomaly', async () => {
      const { getFeatureSemanticBlockGroupingAsync } = await import('@/config.js');
      const { collectBlockGroups } = await import('./DomTranslatorUtils.js');
      const { ShadowComparisonEngine } = await import('./ShadowComparisonEngine.js');
      
      getFeatureSemanticBlockGroupingAsync.mockResolvedValueOnce(true);
      // Mock equivalent: true but with warnings
      vi.spyOn(ShadowComparisonEngine, 'compare').mockReturnValueOnce({ 
        equivalent: true, 
        reason: null, 
        warnings: ['Mocked attribute mismatch'] 
      });

      const div = document.createElement('div');
      const span1 = document.createElement('span');
      span1.textContent = 'Hello';
      div.appendChild(span1);
      document.body.appendChild(div);

      const unit1 = {
        id: 'n1',
        blockId: 'g1',
        text: 'Hello',
        node: span1.firstChild,
        inlineParentTags: ['span']
      };

      collectBlockGroups.mockReturnValueOnce([unit1]);

      const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      const { registerTranslation } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      
      registerTranslation.mockImplementationOnce((id, callbacks) => {
        setTimeout(() => {
          callbacks.onStreamEnd({ success: true });
        }, 10);
      });

      contentScriptIntegration.sendTranslationRequest.mockResolvedValueOnce({ success: true, streaming: true });

      const debugSpy = vi.spyOn(adapter.logger, 'debug');
      const errorSpy = vi.spyOn(adapter.logger, 'error');

      adapter.translatedSegmentMap.set('n1', 'مرحبا');
      await adapter.translateElement(div);

      expect(errorSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('non-fatal attribute changes'));
    });
  });

  describe('Interactive Tag Exclusions', () => {
    it('should reject interactive elements in isValidTextElement', async () => {
      const { isValidTextElement } = await import('@/features/element-selection/utils/elementHelpers.js');
      
      const p = document.createElement('p');
      p.textContent = 'This is valid translatable text.';
      
      const textarea = document.createElement('textarea');
      textarea.value = 'Form input text area.';
      
      const input = document.createElement('input');
      input.value = 'Form input text.';
      
      const select = document.createElement('select');
      const option = document.createElement('option');
      option.textContent = 'Option text';
      select.appendChild(option);
      
      const button = document.createElement('button');
      button.textContent = 'Click me';

      // Mock getComputedStyle for valid check
      const originalGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = vi.fn().mockReturnValue({
        display: 'block',
        visibility: 'visible',
        opacity: '1'
      });

      try {
        expect(isValidTextElement(p)).toBe(true);
        expect(isValidTextElement(textarea)).toBe(false);
        expect(isValidTextElement(input)).toBe(false);
        expect(isValidTextElement(select)).toBe(true);
        expect(isValidTextElement(button)).toBe(true);
      } finally {
        window.getComputedStyle = originalGetComputedStyle;
      }
    });

    it('suppresses raw V3 fragment events without DOM mutation', async () => {
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: JSON.stringify([{ t: 'Translated fragment', i: 'n1', blockId: 'g1', isV3Fragment: true, parentId: 'g1', fragmentIndex: 0, fragmentCount: 2 }])
      });

      await adapter.translateElement(testElement);

      expect(testElement.textContent).toContain('Hello');
      expect(testElement.textContent).not.toContain('Translated fragment');
    });
  });
});
