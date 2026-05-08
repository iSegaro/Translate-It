import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSelectElementTranslationState, revertSelectElementTranslation, globalSelectElementState } from './DomTranslatorState.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: vi.fn()
  }
}));

vi.mock('@/utils/dom/DomDirectionManager.js', () => ({
  restoreElementDirection: vi.fn()
}));

vi.mock('@/features/page-translation/PageTranslationConstants.js', () => ({
  PAGE_TRANSLATION_ATTRIBUTES: {
    HAS_ORIGINAL: 'data-ti-has-original'
  }
}));

describe('DomTranslatorState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global state
    globalSelectElementState.translationHistory = [];
    globalSelectElementState.isTranslating = false;
    globalSelectElementState.currentTranslation = null;
  });

  describe('getSelectElementTranslationState', () => {
    it('should return the global state object', () => {
      const state = getSelectElementTranslationState();
      expect(state).toBeDefined();
      expect(state.translationHistory).toBeInstanceOf(Array);
    });
  });

  describe('revertSelectElementTranslation', () => {
    it('should return 0 if history is empty', async () => {
      const count = await revertSelectElementTranslation();
      expect(count).toBe(0);
    });

    it('should revert translations and restore text nodes', async () => {
      const container = document.createElement('div');
      const textNode = document.createTextNode('Translated Text');
      container.appendChild(textNode);
      document.body.appendChild(container);

      // Setup translation history
      globalSelectElementState.translationHistory = [{
        element: container,
        originalTextNodesData: [
          { node: textNode, originalText: 'Original Text' }
        ]
      }];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(textNode.nodeValue).toBe('Original Text');
      expect(globalSelectElementState.translationHistory).toHaveLength(0);
      
      // Cleanup
      document.body.removeChild(container);
    });

    it('should skip elements no longer in DOM', async () => {
      const detachedEl = document.createElement('div');
      const textNode = document.createTextNode('Translated Text');
      detachedEl.appendChild(textNode);

      globalSelectElementState.translationHistory = [{
        element: detachedEl,
        originalTextNodesData: [
          { node: textNode, originalText: 'Original Text' }
        ]
      }];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(0);
      expect(textNode.nodeValue).toBe('Translated Text'); // No change
    });

    it('should emit hide-translation event', async () => {
      const { pageEventBus } = await import('@/core/PageEventBus.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      globalSelectElementState.translationHistory = [{
        element: container,
        originalTextNodesData: []
      }];

      await revertSelectElementTranslation();

      expect(pageEventBus.emit).toHaveBeenCalledWith('hide-translation', { element: container });
      
      document.body.removeChild(container);
    });
  });
});
