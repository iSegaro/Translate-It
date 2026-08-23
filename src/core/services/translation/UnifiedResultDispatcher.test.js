import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedResultDispatcher } from './UnifiedResultDispatcher.js';
import { TranslationMode } from '@/shared/config/config.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
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
    browser.tabs.sendMessage.mockResolvedValue(true);
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

    it('keeps duplicate-result tracking isolated per dispatcher instance', async () => {
      const secondDispatcher = new UnifiedResultDispatcher();
      const request = { mode: TranslationMode.Selection, sender: { tab: { id: 123 } } };
      const result = { success: true, translatedText: 'hi' };

      await dispatcher.dispatchResult({ messageId: 'shared-id', result, request });
      await secondDispatcher.dispatchResult({ messageId: 'shared-id', result, request });

      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(dispatcher.processedResults).not.toBe(secondDispatcher.processedResults);
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
    const request = { mode: TranslationMode.Select_Element, sender: { tab: { id: 1 }, frameId: 0 } };

    it('retains processed marker after confirmed recipient handoff', async () => {
      await dispatcher.dispatchResult({ messageId: 'm-success', result: { success: true }, request });

      expect(dispatcher.processedResults.has('m-success')).toBe(true);
    });

    it('keeps ambiguous false recipient response non-terminal', async () => {
      browser.tabs.sendMessage.mockResolvedValueOnce(false);

      await expect(dispatcher.dispatchResult({
        messageId: 'm-rejected',
        result: { success: true },
        request,
      })).resolves.toBeUndefined();

      expect(dispatcher.processedResults.has('m-rejected')).toBe(true);
    });

    it('normalizes transport rejection and rolls back processed marker', async () => {
      browser.tabs.sendMessage.mockRejectedValueOnce(new Error('Socket handoff failed'));

      await expect(dispatcher.dispatchResult({
        messageId: 'm-transport-failure',
        result: { success: true },
        request,
      })).rejects.toMatchObject({ type: ErrorTypes.CONNECTION_LOST });

      expect(dispatcher.processedResults.has('m-transport-failure')).toBe(false);
    });

    it('allows explicit redispatch after failed delivery', async () => {
      browser.tabs.sendMessage
        .mockRejectedValueOnce(new Error('Socket handoff failed'))
        .mockResolvedValueOnce(true);

      await expect(dispatcher.dispatchResult({
        messageId: 'm-redispatch',
        result: { success: true },
        request,
      })).rejects.toMatchObject({ type: ErrorTypes.CONNECTION_LOST });

      await expect(dispatcher.dispatchResult({
        messageId: 'm-redispatch',
        result: { success: true },
        request,
      })).resolves.toBeUndefined();

      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(dispatcher.processedResults.has('m-redispatch')).toBe(true);
    });

    it('preserves context-invalidated classification', async () => {
      browser.tabs.sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated'));

      await expect(dispatcher.dispatchResult({
        messageId: 'm-context-failure',
        result: { success: true },
        request,
      })).rejects.toMatchObject({ type: ErrorTypes.EXTENSION_CONTEXT_INVALIDATED });

      expect(dispatcher.processedResults.has('m-context-failure')).toBe(false);
    });

    it('should send direct result to originating top frame', async () => {
      await dispatcher.dispatchSelectElementResult({ messageId: 'm1', result: { success: true }, request });
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, expect.objectContaining({
        data: expect.objectContaining({ context: 'select-element-direct' })
      }), { frameId: 0 });
    });

    it('should send direct result only to originating iframe', async () => {
      const request = { mode: TranslationMode.Select_Element, sender: { tab: { id: 1 }, frameId: 7 } };
      await dispatcher.dispatchSelectElementResult({ messageId: 'm-frame', result: { success: true }, request });
      expect(browser.tabs.query).not.toHaveBeenCalled();
      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(1);
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(1, expect.anything(), { frameId: 7 });
    });

    it('rejects when frame identity is missing', async () => {
      const request = { mode: TranslationMode.Select_Element, sender: { tab: { id: 1 } } };
      await expect(dispatcher.dispatchSelectElementResult({
        messageId: 'm-missing-frame',
        result: { success: true },
        request,
      })).rejects.toMatchObject({ type: ErrorTypes.CONNECTION_LOST });
      expect(browser.tabs.query).not.toHaveBeenCalled();
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('rejects when tab identity is missing', async () => {
      const request = { mode: TranslationMode.Select_Element, sender: { frameId: 0 } };
      await expect(dispatcher.dispatchSelectElementResult({
        messageId: 'm-missing-tab',
        result: { success: true },
        request,
      })).rejects.toMatchObject({ type: ErrorTypes.CONNECTION_LOST });
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
    it('should send Select Element updates only to originating tab', async () => {
      const request = {
        status: 'processing',
        mode: TranslationMode.Select_Element,
        sender: { tab: { id: 456 }, frameId: 7 }
      };

      await dispatcher.dispatchStreamingUpdate({ messageId: 'm-select', data: { chunk: '..' }, request });

      expect(browser.tabs.query).not.toHaveBeenCalled();
      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(1);
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(456, expect.objectContaining({
        data: expect.objectContaining({
          translationMode: TranslationMode.Select_Element,
          context: 'select-element-streaming',
          isBroadcast: false
        })
      }), { frameId: 7 });
    });

    it('should not fall back to tab broadcast when targeted frame disappears', async () => {
      browser.tabs.sendMessage.mockRejectedValueOnce(new Error('Could not establish connection'));
      const request = {
        status: 'processing',
        mode: TranslationMode.Select_Element,
        sender: { tab: { id: 456 }, frameId: 7 }
      };

      await expect(dispatcher.dispatchStreamingUpdate({
        messageId: 'm-gone',
        data: { chunk: '..' },
        request,
      })).rejects.toMatchObject({ type: ErrorTypes.EXTENSION_CONTEXT_INVALIDATED });

      expect(browser.tabs.query).not.toHaveBeenCalled();
      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(1);
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(456, expect.anything(), { frameId: 7 });
    });

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
