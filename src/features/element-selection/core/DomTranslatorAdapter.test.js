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

    it('should handle object formatted translated text', () => {
      const textNode = testElement.firstChild;
      adapter._applyTranslationToNode(textNode, { text: 'سلام' }, 'fa', testElement);
      expect(textNode.nodeValue).toContain('سلام');
    });
  });
});
