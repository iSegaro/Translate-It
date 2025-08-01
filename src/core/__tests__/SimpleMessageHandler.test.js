// src/components/core/__tests__/SimpleMessageHandler.test.js
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { simpleMessageHandler } from '@/core/SimpleMessageHandler.js';

// Mock browser API
const mockBrowser = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  }
};

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: mockBrowser
}));

describe('SimpleMessageHandler', () => {
  let handler;
  let mockOnMessageListener;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create fresh handler instance
    handler = simpleMessageHandler;
    handler.clearHandlers();
    handler.initialized = false;
    
    // Capture the listener that gets registered
    mockBrowser.runtime.onMessage.addListener.mockImplementation((listener) => {
      mockOnMessageListener = listener;
    });
  });

  afterEach(() => {
    handler.clearHandlers();
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully', () => {
      handler.initialize();
      
      expect(handler.initialized).toBe(true);
      expect(mockBrowser.runtime.onMessage.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    test('should not initialize twice', () => {
      handler.initialize();
      handler.initialize();
      
      expect(mockBrowser.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    });

    test('should enable context routing by default', () => {
      expect(handler.routingEnabled).toBe(true);
    });
  });

  describe('Handler Registration', () => {
    test('should register action handler', () => {
      const testHandler = vi.fn();
      
      handler.registerHandler('TEST_ACTION', testHandler);
      
      expect(handler.handlers.has('TEST_ACTION')).toBe(true);
      expect(handler.handlers.get('TEST_ACTION')).toBe(testHandler);
    });

    test('should register context-specific handler', () => {
      const testHandler = vi.fn();
      
      handler.registerContextHandler('popup', 'TEST_ACTION', testHandler);
      
      expect(handler.contextHandlers.has('popup:TEST_ACTION')).toBe(true);
      expect(handler.contextHandlers.get('popup:TEST_ACTION')).toBe(testHandler);
    });

    test('should register context-generic handler', () => {
      const testHandler = vi.fn();
      
      handler.registerContextHandler('popup', '*', testHandler);
      
      expect(handler.contextHandlers.has('popup:*')).toBe(true);
    });

    test('should warn when overwriting handlers', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      handler.registerHandler('TEST_ACTION', handler1);
      handler.registerHandler('TEST_ACTION', handler2);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Overwriting handler for action: "TEST_ACTION"')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Context-Aware Routing', () => {
    beforeEach(() => {
      handler.initialize();
    });

    test('should route to context-specific handler', () => {
      const contextHandler = vi.fn().mockResolvedValue({ success: true });
      const genericHandler = vi.fn().mockResolvedValue({ success: false });
      
      handler.registerContextHandler('popup', 'TEST_ACTION', contextHandler);
      handler.registerHandler('TEST_ACTION', genericHandler);
      
      const handlerResult = handler.getHandlerForMessage('TEST_ACTION', 'popup');
      
      expect(handlerResult).toBe(contextHandler);
      expect(handlerResult).not.toBe(genericHandler);
    });

    test('should fallback to context-generic handler', () => {
      const contextGenericHandler = vi.fn().mockResolvedValue({ success: true });
      const genericHandler = vi.fn().mockResolvedValue({ success: false });
      
      handler.registerContextHandler('popup', '*', contextGenericHandler);
      handler.registerHandler('TEST_ACTION', genericHandler);
      
      const handlerResult = handler.getHandlerForMessage('TEST_ACTION', 'popup');
      
      expect(handlerResult).toBe(contextGenericHandler);
    });

    test('should fallback to generic handler when no context match', () => {
      const genericHandler = vi.fn().mockResolvedValue({ success: true });
      
      handler.registerHandler('TEST_ACTION', genericHandler);
      
      const handlerResult = handler.getHandlerForMessage('TEST_ACTION', 'popup');
      
      expect(handlerResult).toBe(genericHandler);
    });

    test('should use generic handler when context routing disabled', () => {
      const contextHandler = vi.fn();
      const genericHandler = vi.fn();
      
      handler.registerContextHandler('popup', 'TEST_ACTION', contextHandler);
      handler.registerHandler('TEST_ACTION', genericHandler);
      handler.setContextRouting(false);
      
      const handlerResult = handler.getHandlerForMessage('TEST_ACTION', 'popup');
      
      expect(handlerResult).toBe(genericHandler);
    });

    test('should use generic handler when no context provided', () => {
      const contextHandler = vi.fn();
      const genericHandler = vi.fn();
      
      handler.registerContextHandler('popup', 'TEST_ACTION', contextHandler);
      handler.registerHandler('TEST_ACTION', genericHandler);
      
      const handlerResult = handler.getHandlerForMessage('TEST_ACTION', null);
      
      expect(handlerResult).toBe(genericHandler);
    });
  });

  describe('Message Handling', () => {
    beforeEach(() => {
      handler.initialize();
    });

    test('should handle Promise-based handler successfully', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true, data: 'test' });
      const mockSendResponse = vi.fn();
      const mockSender = { tab: { id: 1 } };
      const message = { action: 'TEST_ACTION', data: 'test' };
      
      handler.registerHandler('TEST_ACTION', mockHandler);
      
      const result = mockOnMessageListener(message, mockSender, mockSendResponse);
      
      expect(result).toBe(true); // Should return true to keep channel open
      
      // Wait for Promise resolution
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockHandler).toHaveBeenCalledWith(message, mockSender);
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true, data: 'test' });
    });

    test('should handle Promise-based handler error', async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error('Test error'));
      const mockSendResponse = vi.fn();
      const mockSender = { tab: { id: 1 } };
      const message = { action: 'TEST_ACTION' };
      
      handler.registerHandler('TEST_ACTION', mockHandler);
      
      mockOnMessageListener(message, mockSender, mockSendResponse);
      
      // Wait for Promise rejection
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Test error'
      });
    });

    test('should handle callback-based handler (3+ parameters)', () => {
      const mockHandler = vi.fn((message, sender, sendResponse) => {
        sendResponse({ success: true, callback: true });
      });
      const mockSendResponse = vi.fn();
      const mockSender = { tab: { id: 1 } };
      const message = { action: 'TEST_ACTION' };
      
      handler.registerHandler('TEST_ACTION', mockHandler);
      
      const result = mockOnMessageListener(message, mockSender, mockSendResponse);
      
      expect(result).toBe(true);
      expect(mockHandler).toHaveBeenCalledWith(message, mockSender, mockSendResponse);
    });

    test('should handle context-aware message routing', async () => {
      const popupHandler = vi.fn().mockResolvedValue({ context: 'popup' });
      const sidepanelHandler = vi.fn().mockResolvedValue({ context: 'sidepanel' });
      const mockSendResponse = vi.fn();
      const mockSender = { tab: { id: 1 } };
      
      handler.registerContextHandler('popup', 'TEST_ACTION', popupHandler);
      handler.registerContextHandler('sidepanel', 'TEST_ACTION', sidepanelHandler);
      
      // Test popup context
      const popupMessage = { action: 'TEST_ACTION', context: 'popup' };
      mockOnMessageListener(popupMessage, mockSender, mockSendResponse);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(popupHandler).toHaveBeenCalledWith(popupMessage, mockSender);
      expect(sidepanelHandler).not.toHaveBeenCalled();
    });

    test('should return false for unknown action', () => {
      const mockSendResponse = vi.fn();
      const mockSender = { tab: { id: 1 } };
      const message = { action: 'UNKNOWN_ACTION' };
      
      const result = mockOnMessageListener(message, mockSender, mockSendResponse);
      
      expect(result).toBe(false);
      expect(mockSendResponse).not.toHaveBeenCalled();
    });

    test('should handle message without action', () => {
      const mockSendResponse = vi.fn();
      const mockSender = { tab: { id: 1 } };
      const message = { data: 'test' };
      
      const result = mockOnMessageListener(message, mockSender, mockSendResponse);
      
      expect(result).toBe(false);
    });

    test('should handle sendResponse errors gracefully', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      const mockSendResponse = vi.fn().mockImplementation(() => {
        throw new Error('SendResponse error');
      });
      const mockSender = { tab: { id: 1 } };
      const message = { action: 'TEST_ACTION' };
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      handler.registerHandler('TEST_ACTION', mockHandler);
      
      mockOnMessageListener(message, mockSender, mockSendResponse);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('sendResponse failed')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Context Routing Settings', () => {
    test('should enable context routing', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      handler.setContextRouting(true);
      
      expect(handler.routingEnabled).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Context routing enabled')
      );
      
      consoleSpy.mockRestore();
    });

    test('should disable context routing', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      handler.setContextRouting(false);
      
      expect(handler.routingEnabled).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Context routing disabled')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Statistics and Management', () => {
    test('should provide handler statistics', () => {
      handler.registerHandler('ACTION1', vi.fn());
      handler.registerHandler('ACTION2', vi.fn());
      handler.registerContextHandler('popup', 'ACTION3', vi.fn());
      
      const stats = handler.getStats();
      
      expect(stats.totalHandlers).toBe(2);
      expect(stats.contextHandlers).toBe(1);
      expect(stats.routingEnabled).toBe(true);
      expect(stats.handlers).toEqual(['ACTION1', 'ACTION2']);
      expect(stats.contextHandlers).toEqual(['popup:ACTION3']);
    });

    test('should clear all handlers', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      handler.registerHandler('ACTION1', vi.fn());
      handler.registerContextHandler('popup', 'ACTION2', vi.fn());
      
      expect(handler.handlers.size).toBe(1);
      expect(handler.contextHandlers.size).toBe(1);
      
      handler.clearHandlers();
      
      expect(handler.handlers.size).toBe(0);  
      expect(handler.contextHandlers.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[SimpleMessageHandler] All handlers cleared'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Context-Specific Message Handlers', () => {
    test('should route to popup message handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      handler.registerContextHandler('popup', 'TEST_ACTION', mockHandler);
      
      const result = await handler.handlePopupMessage({ action: 'TEST_ACTION' }, {});
      
      expect(result).toEqual({ success: true });
      expect(mockHandler).toHaveBeenCalled();
    });

    test('should throw error for missing popup handler', async () => {
      await expect(
        handler.handlePopupMessage({ action: 'MISSING_ACTION' }, {})
      ).rejects.toThrow('No handler for popup action: MISSING_ACTION');
    });

    test('should route to sidepanel message handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      handler.registerContextHandler('sidepanel', 'TEST_ACTION', mockHandler);
      
      const result = await handler.handleSidepanelMessage({ action: 'TEST_ACTION' }, {});
      
      expect(result).toEqual({ success: true });
    });

    test('should route to content message handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      handler.registerContextHandler('content', 'TEST_ACTION', mockHandler);
      
      const result = await handler.handleContentMessage({ action: 'TEST_ACTION' }, {});
      
      expect(result).toEqual({ success: true });
    });

    test('should route to offscreen message handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      handler.registerContextHandler('offscreen', 'TEST_ACTION', mockHandler);
      
      const result = await handler.handleOffscreenMessage({ action: 'TEST_ACTION' }, {});
      
      expect(result).toEqual({ success: true });
    });

    test('should route to options message handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      handler.registerContextHandler('options', 'TEST_ACTION', mockHandler);
      
      const result = await handler.handleOptionsMessage({ action: 'TEST_ACTION' }, {});
      
      expect(result).toEqual({ success: true });
    });

    test('should route to event handler message handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      handler.registerContextHandler('event-handler', 'TEST_ACTION', mockHandler);
      
      const result = await handler.handleEventHandlerMessage({ action: 'TEST_ACTION' }, {});
      
      expect(result).toEqual({ success: true });
    });

    test('should route to generic message handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true });
      handler.registerHandler('TEST_ACTION', mockHandler);
      
      const result = await handler.handleGenericMessage({ action: 'TEST_ACTION' }, {});
      
      expect(result).toEqual({ success: true });
    });

    test('should throw error for missing generic handler', async () => {
      await expect(
        handler.handleGenericMessage({ action: 'MISSING_ACTION' }, {})
      ).rejects.toThrow('No handler for generic action: MISSING_ACTION');
    });
  });

  describe('Route Message Method', () => {
    test('should route message to correct context handler', async () => {
      const popupHandler = vi.fn().mockResolvedValue({ context: 'popup' });
      handler.registerContextHandler('popup', 'TEST_ACTION', popupHandler);
      
      const result = await handler.routeMessage(
        { action: 'TEST_ACTION', context: 'popup' },
        { tab: { id: 1 } }
      );
      
      expect(result).toEqual({ context: 'popup' });
      expect(popupHandler).toHaveBeenCalled();
    });

    test('should route to generic handler for unknown context', async () => {
      const genericHandler = vi.fn().mockResolvedValue({ generic: true });
      handler.registerHandler('TEST_ACTION', genericHandler);
      
      const result = await handler.routeMessage(
        { action: 'TEST_ACTION', context: 'unknown' },
        { tab: { id: 1 } }
      );
      
      expect(result).toEqual({ generic: true });
      expect(genericHandler).toHaveBeenCalled();
    });
  });
});