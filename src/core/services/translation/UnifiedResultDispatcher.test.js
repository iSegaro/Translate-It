import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedResultDispatcher } from './UnifiedResultDispatcher.js';
import { TranslationMode } from '@/shared/config/config.js';
import browser from 'webextension-polyfill';

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      sendMessage: vi.fn(),
      query: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }])
    }
  }
}));

// Mock storageManager
vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    get: vi.fn().mockResolvedValue({ ENABLE_TRANSLATION_HISTORY: true })
  }
}));

describe('UnifiedResultDispatcher', () => {
  let dispatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatcher = new UnifiedResultDispatcher();
    
    // Mock backgroundService for history
    globalThis.backgroundService = {
      translationEngine: {
        addToHistory: vi.fn().mockResolvedValue(true)
      }
    };
  });

  describe('dispatchResult', () => {
    it('should prevent duplicate processing for same messageId', async () => {
      const messageId = 'm1';
      const request = { mode: TranslationMode.Selection, sender: { tab: { id: 123 } } };
      const result = { success: true, translatedText: 'hi' };

      await dispatcher.dispatchResult({ messageId, result, request });
      await dispatcher.dispatchResult({ messageId, result, request });

      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should record history if enabled and successful', async () => {
      const messageId = 'm1';
      const request = { 
        mode: TranslationMode.Selection, 
        data: { text: 'orig' },
        sender: { tab: { id: 123 } } 
      };
      const result = { success: true, translatedText: 'trans' };

      await dispatcher.dispatchResult({ messageId, result, request });

      // Need to wait a bit as history is async
      await new Promise(r => setTimeout(r, 10));

      expect(globalThis.backgroundService.translationEngine.addToHistory).toHaveBeenCalled();
    });

    it('should NOT record history for excluded modes like Page', async () => {
      const messageId = 'm-page';
      const request = { mode: TranslationMode.Page, sender: { tab: { id: 123 } } };
      const result = { success: true, translatedText: '...' };

      await dispatcher.dispatchResult({ messageId, result, request });
      
      await new Promise(r => setTimeout(r, 10));
      expect(globalThis.backgroundService.translationEngine.addToHistory).not.toHaveBeenCalled();
    });

    it('should respect ENABLE_TRANSLATION_HISTORY setting', async () => {
      const { storageManager } = await import('@/shared/storage/core/StorageCore.js');
      storageManager.get.mockResolvedValue({ ENABLE_TRANSLATION_HISTORY: false });

      const request = { mode: TranslationMode.Selection, data: { text: 'a' }, sender: { tab: { id: 1 } } };
      await dispatcher.dispatchResult({ messageId: 'm1', result: { success: true, translatedText: 'b' }, request });

      await new Promise(r => setTimeout(r, 10));
      expect(globalThis.backgroundService.translationEngine.addToHistory).not.toHaveBeenCalled();
    });

    it('should clean up processedResults when it exceeds 1000', async () => {
      for (let i = 0; i < 1001; i++) {
        dispatcher.processedResults.add(`m${i}`);
      }
      const request = { mode: TranslationMode.Selection, sender: { tab: { id: 1 } } };
      await dispatcher.dispatchResult({ messageId: 'm1001', result: { success: true }, request });
      
      expect(dispatcher.processedResults.size).toBe(1001);
      expect(dispatcher.processedResults.has('m0')).toBe(false);
    });
  });

  describe('dispatchFieldResult', () => {
    it('should send message to correct tab', async () => {
      const request = { mode: TranslationMode.Field, sender: { tab: { id: 456 } } };
      const result = { translatedText: 'replaced' };

      await dispatcher.dispatchFieldResult({ messageId: 'm1', result, request });

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(456, expect.objectContaining({
        data: expect.objectContaining({ translationMode: TranslationMode.Field })
      }));
    });
  });

  describe('dispatchSelectElementResult', () => {
    it('should send direct result to tab', async () => {
      const request = { mode: TranslationMode.Select_Element, sender: { tab: { id: 1 } } };
      await dispatcher.dispatchSelectElementResult({ messageId: 'm1', result: { success: true }, request });
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({
        data: expect.objectContaining({ context: 'select-element-direct' })
      }));
    });
  });

  describe('broadcastResult', () => {
    it('should send message to all tabs', async () => {
      const result = { text: 'update' };
      await dispatcher.broadcastResult({ messageId: 'm1', result, request: { mode: 'test' } });

      expect(browser.tabs.query).toHaveBeenCalled();
      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2); // Mocked 2 tabs
    });
  });

  describe('dispatchStreamingUpdate', () => {
    it('should broadcast if request is processing', async () => {
      const request = { status: 'processing', mode: 'test' };
      await dispatcher.dispatchStreamingUpdate({ messageId: 'm1', data: { chunk: '..' }, request });
      expect(browser.tabs.sendMessage).toHaveBeenCalled();
    });

    it('should NOT broadcast if request is not processing', async () => {
      const request = { status: 'completed' };
      await dispatcher.dispatchStreamingUpdate({ messageId: 'm1', data: {}, request });
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('dispatchCancellation', () => {
    it('should send cancellation message to original tab', async () => {
      const request = { sender: { tab: { id: 789 } } };
      await dispatcher.dispatchCancellation({ messageId: 'm-cancel', request });

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(789, {
        action: 'TRANSLATION_CANCELLED',
        messageId: 'm-cancel'
      });
    });
  });
});
