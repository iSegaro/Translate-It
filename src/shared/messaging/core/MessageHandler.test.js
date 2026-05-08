import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandler } from './MessageHandler.js';
import browser from 'webextension-polyfill';

// Mock browser
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    }
  }
}));

describe('MessageHandler', () => {
  let handler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new MessageHandler();
  });

  describe('Registration', () => {
    it('should register and retrieve handlers', () => {
      const mockHandler = vi.fn();
      handler.registerHandler('TEST_ACTION', mockHandler);
      
      expect(handler.getHandlerForMessage('TEST_ACTION')).toBe(mockHandler);
    });

    it('should unregister handlers', () => {
      const mockHandler = vi.fn();
      handler.registerHandler('TEST_ACTION', mockHandler);
      handler.unregisterHandler('TEST_ACTION');
      
      expect(handler.getHandlerForMessage('TEST_ACTION')).toBeNull();
    });
  });

  describe('Message Routing', () => {
    it('should route message to correct synchronous handler', () => {
      const mockHandler = vi.fn().mockReturnValue({ success: true });
      const sendResponse = vi.fn();
      handler.registerHandler('SYNC_ACTION', mockHandler);
      
      const result = handler._handleMessage(
        { action: 'SYNC_ACTION', messageId: '123' },
        { id: 'sender' },
        sendResponse
      );

      expect(mockHandler).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
      expect(result).toBe(false); // Synchronous
    });

    it('should handle promise-based async handlers', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true, data: 'async' });
      const sendResponse = vi.fn();
      handler.registerHandler('ASYNC_ACTION', mockHandler);
      
      const result = handler._handleMessage(
        { action: 'ASYNC_ACTION', messageId: 'msg-async' },
        { id: 'sender' },
        sendResponse
      );

      expect(result).toBe(true); // Indicates async response
      
      // Wait for the promise in handler to resolve
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(sendResponse).toHaveBeenCalledWith({ success: true, data: 'async' });
    });

    it('should handle handlers that return true for manual async response', () => {
      const mockHandler = vi.fn().mockReturnValue(true);
      handler.registerHandler('MANUAL_ASYNC', mockHandler);
      const result = handler._handleMessage(
        { action: 'MANUAL_ASYNC', messageId: '123' },
        {},
        vi.fn()
      );

      expect(result).toBe(true);
    });

    it('should return false if no handler is registered', () => {
      const result = handler._handleMessage({ action: 'UNKNOWN' }, {}, vi.fn());
      expect(result).toBe(false);
    });
  });

  describe('Lifecycle', () => {
    it('should add listener on listen()', () => {
      handler.listen();
      expect(browser.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(handler.isListenerActive).toBe(true);
    });

    it('should remove listener on stopListening()', () => {
      handler.listen();
      handler.stopListening();
      expect(browser.runtime.onMessage.removeListener).toHaveBeenCalled();
      expect(handler.isListenerActive).toBe(false);
    });
  });
});
