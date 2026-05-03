import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMessage, sendRegularMessage } from './UnifiedMessaging.js';
import browser from 'webextension-polyfill';
import ExtensionContextManager from '@/core/extensionContext.js';

// Mock dependencies
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      sendMessage: vi.fn(),
      getURL: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue({})
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    }
  }
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isValidSync: vi.fn().mockReturnValue(true),
    isContextError: vi.fn().mockReturnValue(false),
    handleContextError: vi.fn()
  }
}));

vi.mock('./UnifiedTranslationCoordinator.js', () => ({
  unifiedTranslationCoordinator: {
    coordinateTranslation: vi.fn()
  }
}));

vi.mock('./StreamingTimeoutManager.js', () => ({
  streamingTimeoutManager: {
    shouldContinue: vi.fn().mockReturnValue(true)
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  })
}));

describe('UnifiedMessaging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    ExtensionContextManager.isValidSync.mockReturnValue(true);
  });

  describe('sendRegularMessage', () => {
    it('should send a message and return the response on success', async () => {
      const message = { action: 'PING', messageId: '1' };
      const expectedResponse = { success: true, data: 'pong' };
      browser.runtime.sendMessage.mockResolvedValue(expectedResponse);

      const promise = sendRegularMessage(message);
      const response = await promise;

      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(message);
      expect(response).toEqual(expectedResponse);
    });

    it('should throw an error if the operation times out', async () => {
      const message = { action: 'PING', messageId: 'timeout-test' };
      browser.runtime.sendMessage.mockReturnValue(new Promise(() => {})); // Never resolves

      const promise = sendRegularMessage(message, { timeout: 100 });
      
      vi.advanceTimersByTime(150);
      
      await expect(promise).rejects.toThrow(/timed out/);
    });

    it('should throw an error if response.success is false', async () => {
      const message = { action: 'FAIL', messageId: '2' };
      browser.runtime.sendMessage.mockResolvedValue({ 
        success: false, 
        error: { message: 'Something went wrong', type: 'API_ERROR' } 
      });

      await expect(sendRegularMessage(message)).rejects.toThrow('Something went wrong');
    });

    it('should throw if extension context is invalidated', async () => {
      ExtensionContextManager.isValidSync.mockReturnValue(false);
      const message = { action: 'PING' };

      await expect(sendRegularMessage(message)).rejects.toThrow('Extension context invalidated');
    });
  });

  describe('sendMessage (Unified Routing)', () => {
    it('should route non-translation actions directly to sendRegularMessage', async () => {
      const message = { action: 'GET_SETTINGS' };
      browser.runtime.sendMessage.mockResolvedValue({ success: true });

      await sendMessage(message);

      expect(browser.runtime.sendMessage).toHaveBeenCalled();
    });

    // Translation routing and coordinator tests would go here, 
    // but they require mocking unifiedTranslationCoordinator behavior
  });
});
