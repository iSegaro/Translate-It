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
  getTargetLanguageAsync: vi.fn(() => Promise.resolve('fa')),
  getAIContextTranslationEnabledAsync: vi.fn(() => Promise.resolve(true)),
  getSourceLanguageAsync: vi.fn(() => Promise.resolve('en'))
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

const errorHandlerMock = {
  handle: vi.fn()
};

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: vi.fn(() => errorHandlerMock)
  }
}));

vi.mock('@/shared/error-management/ErrorMatcher.js', () => ({
  isFatalError: vi.fn(() => false),
  matchErrorToType: vi.fn(() => 'UNKNOWN'),
  isCancellationError: vi.fn(() => false)
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({
  ErrorTypes: {
    USER_CANCELLED: 'USER_CANCELLED',
    TRANSLATION_CANCELLED: 'TRANSLATION_CANCELLED'
  }
}));

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
      
      expect(errorHandlerMock.handle).toHaveBeenCalled();
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
      } catch (e) {
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
      detectDirectionFromContent.mockReturnValueOnce('ltr');

      const textNode = testElement.firstChild;
      adapter._applyTranslationToNode(textNode, 'Hello', 'en', testElement);

      // LRM mark (\u200e) should be present
      expect(textNode.nodeValue).toContain('\u200eHello\u200e');
    });

    it('should handle object formatted translated text', () => {
      const textNode = testElement.firstChild;
      adapter._applyTranslationToNode(textNode, { text: 'سلام' }, 'fa', testElement);
      expect(textNode.nodeValue).toContain('سلام');
    });
  });
});
