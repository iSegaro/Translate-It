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
  getTranslationApiAsync: vi.fn(() => Promise.resolve('google')),
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('google')),
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
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('google')),
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

vi.mock('@/shared/error-management/ErrorHandler.js');
vi.mock('@/shared/error-management/ErrorMatcher.js');
vi.mock('@/shared/error-management/ErrorTypes.js');

import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
const errorHandlerMock = ErrorHandler.getInstance();

vi.mock('@/utils/dom/DomDirectionManager.js', () => ({
  detectDirectionFromContent: vi.fn(() => 'rtl'),
  applyNodeDirection: vi.fn(),
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

vi.mock('./DomTranslatorState.js', () => ({
  globalSelectElementState: {
    translationHistory: [],
    currentTranslation: null
  },
  revertSelectElementTranslation: vi.fn(),
  getSelectElementTranslationState: vi.fn()
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
    adapter = new DomTranslatorAdapter();
    testElement = document.createElement('div');
    testElement.textContent = 'Hello';
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

    it('should fallback to sequential mapping if UID is missing in stream', async () => {
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
      expect(testElement.textContent).toContain('سلام');
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

    it('should handle sequential fallback if direct response is not an array', async () => {
      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: 'Plain text translation' // Not JSON
      });

      const result = await adapter.translateElement(testElement);
      expect(result.success).toBe(true);
      expect(testElement.textContent).toContain('Plain text translation');
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
      vi.spyOn(adapter, '_applyTranslationToNode').mockImplementation(() => {
        throw new Error('Apply failed');
      });

      contentScriptIntegration.sendTranslationRequest.mockResolvedValue({
        success: true,
        streaming: false,
        translatedText: 'Test'
      });

      await expect(adapter.translateElement(testElement)).rejects.toThrow('Invalid translation format');
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
    it('should handle JSON string response', async () => {
      const response = {
        success: true,
        translatedText: JSON.stringify([{ t: 'سلام', i: 'n1' }]),
        targetLanguage: 'fa'
      };
      const nodeMap = new Map([['n1', { node: testElement.firstChild, uid: 'n1' }]]);
      
      const result = await adapter._handleDirectResponse(response, [], nodeMap, 'fa', testElement);
      
      expect(result.success).toBe(true);
      expect(testElement.textContent).toContain('سلام');
    });

    it('should handle array response', async () => {
      const response = {
        success: true,
        translatedText: [{ t: 'سلام', i: 'n1' }],
        targetLanguage: 'fa'
      };
      const nodeMap = new Map([['n1', { node: testElement.firstChild, uid: 'n1' }]]);
      
      const result = await adapter._handleDirectResponse(response, [], nodeMap, 'fa', testElement);
      
      expect(result.success).toBe(true);
      expect(testElement.textContent).toContain('سلام');
    });

    it('should fallback to sequential mapping if UID is missing', async () => {
      const response = {
        success: true,
        translatedText: [{ t: 'سلام' }],
        targetLanguage: 'fa'
      };
      const textNodesData = [{ node: testElement.firstChild, uid: 'n1' }];
      
      const result = await adapter._handleDirectResponse(response, textNodesData, new Map(), 'fa', testElement);
      
      expect(result.success).toBe(true);
      expect(testElement.textContent).toContain('سلام');
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

    it('should handle object formatted translated text', () => {
      const textNode = testElement.firstChild;
      adapter._applyTranslationToNode(textNode, { text: 'سلام' }, 'fa', testElement);
      expect(textNode.nodeValue).toContain('سلام');
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
            data: [{ t: `مرحبا @@TI_SEG_${sessionId}_n2@@بالعالم`, i: 'g1' }]
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
            data: [{ t: `مرحبا @@TI_SEG_${sessionId}_n2@@بالعالم`, i: 'g1' }]
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
          const sessionId = adapter.currentSessionId;
          streamCallbacks.onStreamUpdate({
            success: true,
            data: [{ t: `مرحبا @@TI_SEG_${sessionId}_n2@@بالعالم`, i: 'g1' }]
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
  });
});
