import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      sendMessage: vi.fn().mockResolvedValue(true)
    }
  }
}));

import { AIStreamManager } from './AIStreamManager.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';

// 2. Mock Logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

// 3. Mock MessageFormat to return predictable objects
vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessageFormat: {
    create: vi.fn((action, data, sender, messageId) => ({
      action, data, sender, messageId
    }))
  }
}));

describe('AIStreamManager', () => {
  let mockEngine;
  const messageId = 'test-msg-123';
  const tabId = 99;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock Engine with streaming sender info
    mockEngine = {
      getStreamingSender: vi.fn().mockReturnValue({
        tab: { id: tabId }
      })
    };
  });

  describe('streamBatchResults', () => {
    it('should send a TRANSLATION_STREAM_UPDATE message to the correct tab', async () => {
      const batchResults = ['Translated text'];
      const originalBatch = ['Original text'];

      await AIStreamManager.streamBatchResults(
        'Gemini', batchResults, originalBatch, 0, messageId, mockEngine, 'en', 'fa'
      );

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        tabId,
        expect.objectContaining({
          action: MessageActions.TRANSLATION_STREAM_UPDATE,
          messageId: messageId,
          data: expect.objectContaining({
            success: true,
            data: batchResults,
            batchIndex: 0
          })
        })
      );
    });

    it('should not crash if engine is missing', async () => {
      await expect(AIStreamManager.streamBatchResults('Gemini', [], [], 0, null, null))
        .resolves.not.toThrow();
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('sendStreamEnd', () => {
    it('should send TRANSLATION_STREAM_END when translation completes', async () => {
      await AIStreamManager.sendStreamEnd('Gemini', messageId, mockEngine, { targetLanguage: 'fa' });

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        tabId,
        expect.objectContaining({
          action: MessageActions.TRANSLATION_STREAM_END,
          data: expect.objectContaining({
            success: true,
            completed: true,
            targetLanguage: 'fa'
          })
        })
      );
    });

    it('should send failure status in stream end if error is provided', async () => {
      const error = new Error('Quota Exceeded');
      error.type = 'RATE_LIMIT';

      await AIStreamManager.sendStreamEnd('Gemini', messageId, mockEngine, { error });

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        tabId,
        expect.objectContaining({
          data: expect.objectContaining({
            success: false,
            error: expect.objectContaining({
              type: 'RATE_LIMIT'
            })
          })
        })
      );
    });
  });

  describe('streamErrorResults', () => {
    it('should send an error update for a specific batch', async () => {
      const error = new Error('Partial failure');
      
      await AIStreamManager.streamErrorResults('Gemini', error, 2, messageId, mockEngine);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        tabId,
        expect.objectContaining({
          action: MessageActions.TRANSLATION_STREAM_UPDATE,
          data: expect.objectContaining({
            success: false,
            batchIndex: 2,
            error: expect.any(Object)
          })
        })
      );
    });
  });
});
