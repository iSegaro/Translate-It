// src/components/core/__tests__/MessagingStandards.test.js
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  MessagingStandards, 
  MessagingContexts, 
  MessageActions, 
  MessageFormat 
} from '@/core/MessagingStandards.js';

// Mock EnhancedUnifiedMessenger
vi.mock('@/core/EnhancedUnifiedMessenger.js', () => ({
  EnhancedUnifiedMessenger: vi.fn().mockImplementation((context) => ({
    context,
    getInfo: () => ({ context, version: '2.0', enhanced: true }),
    testSpecializedMessengers: vi.fn().mockResolvedValue({ success: true, context })
  }))
}));

describe('MessagingStandards', () => {
  beforeEach(() => {
    // Clear instances before each test
    MessagingStandards.clearInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    MessagingStandards.clearInstances();
  });

  describe('Messenger Factory', () => {
    test('should create messenger instance for valid context', () => {
      const messenger = MessagingStandards.getMessenger('popup');
      
      expect(messenger).toBeDefined();
      expect(messenger.context).toBe('popup');
    });

    test('should return same instance for same context (singleton)', () => {
      const messenger1 = MessagingStandards.getMessenger('popup');
      const messenger2 = MessagingStandards.getMessenger('popup');
      
      expect(messenger1).toBe(messenger2);
    });

    test('should create different instances for different contexts', () => {
      const popupMessenger = MessagingStandards.getMessenger('popup');
      const sidepanelMessenger = MessagingStandards.getMessenger('sidepanel');
      
      expect(popupMessenger).not.toBe(sidepanelMessenger);
      expect(popupMessenger.context).toBe('popup');
      expect(sidepanelMessenger.context).toBe('sidepanel');
    });

    test('should warn for unknown context but still create messenger', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const messenger = MessagingStandards.getMessenger('unknown-context');
      
      expect(messenger).toBeDefined();
      expect(messenger.context).toBe('unknown-context');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown context: unknown-context')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Message Format', () => {
    test('should create standardized message format', () => {
      const message = MessagingStandards.standardMessageFormat(
        'TEST_ACTION',
        { test: 'data' },
        'popup',
        { customOption: 'value' }
      );

      expect(message).toEqual({
        action: 'TEST_ACTION',
        data: { test: 'data' },
        context: 'popup',
        messageId: expect.any(String),
        timestamp: expect.any(Number),
        version: '2.0',
        customOption: 'value'
      });
    });

    test('should throw error for missing action', () => {
      expect(() => {
        MessagingStandards.standardMessageFormat('', { test: 'data' }, 'popup');
      }).toThrow('Action is required and must be a string');
    });

    test('should throw error for missing context', () => {
      expect(() => {
        MessagingStandards.standardMessageFormat('TEST_ACTION', { test: 'data' }, '');
      }).toThrow('Context is required and must be a string');
    });

    test('should generate unique message IDs', () => {
      const id1 = MessagingStandards.generateMessageId('popup');
      const id2 = MessagingStandards.generateMessageId('popup');
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^popup-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^popup-\d+-[a-z0-9]+$/);
    });
  });

  describe('Statistics and Management', () => {
    test('should track active contexts', () => {
      MessagingStandards.getMessenger('popup');
      MessagingStandards.getMessenger('sidepanel');
      MessagingStandards.getMessenger('content');

      const activeContexts = MessagingStandards.getActiveContexts();
      
      expect(activeContexts).toHaveLength(3);
      expect(activeContexts).toContain('popup');
      expect(activeContexts).toContain('sidepanel');
      expect(activeContexts).toContain('content');
    });

    test('should provide statistics', () => {
      MessagingStandards.getMessenger('popup');
      MessagingStandards.getMessenger('sidepanel');

      const stats = MessagingStandards.getStatistics();
      
      expect(stats.totalInstances).toBe(2);
      expect(stats.activeContexts).toEqual(['popup', 'sidepanel']);
      expect(stats.requestInterceptors).toBe(0);
      expect(stats.responseInterceptors).toBe(0);
      expect(stats.messengers).toHaveProperty('popup');
      expect(stats.messengers).toHaveProperty('sidepanel');
    });

    test('should clear all instances', () => {
      MessagingStandards.getMessenger('popup');
      MessagingStandards.getMessenger('sidepanel');
      
      expect(MessagingStandards.getActiveContexts()).toHaveLength(2);
      
      MessagingStandards.clearInstances();
      
      expect(MessagingStandards.getActiveContexts()).toHaveLength(0);
    });
  });

  describe('Common Messengers', () => {
    test('should create pre-configured common messengers', () => {
      const messengers = MessagingStandards.createCommonMessengers();
      
      expect(messengers).toHaveProperty('popup');
      expect(messengers).toHaveProperty('sidepanel');
      expect(messengers).toHaveProperty('options');
      expect(messengers).toHaveProperty('content');
      expect(messengers).toHaveProperty('background');
      expect(messengers).toHaveProperty('eventHandler');
      
      expect(messengers.popup.context).toBe('popup');
      expect(messengers.sidepanel.context).toBe('sidepanel');
      expect(messengers.eventHandler.context).toBe('event-handler');
    });
  });

  describe('Interceptors', () => {
    test('should add request interceptors', () => {
      const interceptor = vi.fn();
      
      MessagingStandards.addRequestInterceptor(interceptor);
      
      const stats = MessagingStandards.getStatistics();
      expect(stats.requestInterceptors).toBe(1);
    });

    test('should add response interceptors', () => {
      const interceptor = vi.fn();
      
      MessagingStandards.addResponseInterceptor(interceptor);
      
      const stats = MessagingStandards.getStatistics();
      expect(stats.responseInterceptors).toBe(1);
    });

    test('should ignore non-function interceptors', () => {
      MessagingStandards.addRequestInterceptor('not a function');
      MessagingStandards.addResponseInterceptor(null);
      
      const stats = MessagingStandards.getStatistics();
      expect(stats.requestInterceptors).toBe(0);
      expect(stats.responseInterceptors).toBe(0);
    });
  });

  describe('Messenger Testing', () => {
    test('should test all messengers successfully', async () => {
      MessagingStandards.getMessenger('popup');
      MessagingStandards.getMessenger('sidepanel');

      const results = await MessagingStandards.testAllMessengers();
      
      expect(results.success).toBe(true);
      expect(results.results).toHaveProperty('popup');
      expect(results.results).toHaveProperty('sidepanel');
      expect(results.results.popup.success).toBe(true);
      expect(results.results.sidepanel.success).toBe(true);
    });

    test('should handle messenger test failures', async () => {
      // Mock a failing messenger
      const failingMessenger = {
        context: 'failing',
        testSpecializedMessengers: vi.fn().mockRejectedValue(new Error('Test failed'))
      };
      
      MessagingStandards.instances.set('failing', failingMessenger);

      const results = await MessagingStandards.testAllMessengers();
      
      expect(results.success).toBe(false);
      expect(results.results.failing.success).toBe(false);
      expect(results.results.failing.error).toBe('Test failed');
    });
  });

  describe('Development Logging', () => {
    test('should setup development logging interceptors', () => {
      // Mock process.env.NODE_ENV
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      MessagingStandards.setupDevelopmentLogging();
      
      const stats = MessagingStandards.getStatistics();
      expect(stats.requestInterceptors).toBe(1);
      expect(stats.responseInterceptors).toBe(1);
      
      // Restore original environment
      process.env.NODE_ENV = originalEnv;
    });

    test('should not setup logging in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      MessagingStandards.setupDevelopmentLogging();
      
      const stats = MessagingStandards.getStatistics();
      expect(stats.requestInterceptors).toBe(0);
      expect(stats.responseInterceptors).toBe(0);
      
      process.env.NODE_ENV = originalEnv;
    });
  });
});

describe('MessagingContexts', () => {
  test('should have all required contexts defined', () => {
    expect(MessagingContexts.POPUP).toBe('popup');
    expect(MessagingContexts.SIDEPANEL).toBe('sidepanel');
    expect(MessagingContexts.OPTIONS).toBe('options');
    expect(MessagingContexts.BACKGROUND).toBe('background');
    expect(MessagingContexts.CONTENT).toBe('content');
    expect(MessagingContexts.OFFSCREEN).toBe('offscreen');
    expect(MessagingContexts.EVENT_HANDLER).toBe('event-handler');
  });

  test('should return all contexts', () => {
    const contexts = MessagingContexts.getAllContexts();
    
    expect(contexts).toContain('popup');
    expect(contexts).toContain('sidepanel');
    expect(contexts).toContain('content');
    expect(contexts).toContain('background');
    expect(contexts.length).toBeGreaterThan(5);
  });

  test('should validate contexts correctly', () => {
    expect(MessagingContexts.isValidContext('popup')).toBe(true);
    expect(MessagingContexts.isValidContext('invalid-context')).toBe(false);
    expect(MessagingContexts.isValidContext('')).toBe(false);
    expect(MessagingContexts.isValidContext(null)).toBe(false);
  });
});

describe('MessageActions', () => {
  test('should have all required actions defined', () => {
    expect(MessageActions.PING).toBe('ping');
    expect(MessageActions.TRANSLATE).toBe('TRANSLATE');
    expect(MessageActions.TTS_SPEAK).toBe('TTS_SPEAK');
    expect(MessageActions.SCREEN_CAPTURE).toBe('SCREEN_CAPTURE');
    expect(MessageActions.GET_HISTORY).toBe('GET_HISTORY');
  });

  test('should return all actions', () => {
    const actions = MessageActions.getAllActions();
    
    expect(actions).toContain('ping');
    expect(actions).toContain('TRANSLATE');
    expect(actions).toContain('TTS_SPEAK');
    expect(actions).toContain('SCREEN_CAPTURE');
    expect(actions.length).toBeGreaterThan(10);
  });

  test('should validate actions correctly', () => {
    expect(MessageActions.isValidAction('ping')).toBe(true);
    expect(MessageActions.isValidAction('TRANSLATE')).toBe(true);  
    expect(MessageActions.isValidAction('INVALID_ACTION')).toBe(false);
    expect(MessageActions.isValidAction('')).toBe(false);
  });
});

describe('MessageFormat', () => {
  test('should create message format correctly', () => {
    const message = MessageFormat.create('TEST_ACTION', { test: 'data' }, 'popup');
    
    expect(message).toEqual({
      action: 'TEST_ACTION',
      data: { test: 'data' },
      context: 'popup',
      messageId: expect.any(String),
      timestamp: expect.any(Number),
      version: '2.0'
    });
  });

  test('should create message with custom options', () => {
    const message = MessageFormat.create('TEST_ACTION', { test: 'data' }, 'popup', {
      messageId: 'custom-id',
      customField: 'custom-value'
    });
    
    expect(message.messageId).toBe('custom-id');
    expect(message.customField).toBe('custom-value');
  });

  test('should validate message format correctly', () => {
    const validMessage = {
      action: 'TEST_ACTION',
      context: 'popup',
      messageId: 'test-id',
      timestamp: Date.now()
    };
    
    expect(MessageFormat.validate(validMessage)).toBe(true);
    
    const invalidMessages = [
      null,
      {},
      { action: 'TEST' }, // missing context
      { context: 'popup' }, // missing action
      { action: 'TEST', context: 'popup' }, // missing messageId and timestamp
    ];
    
    invalidMessages.forEach(message => {
      expect(MessageFormat.validate(message)).toBe(false);
    });
  });

  test('should create success response format', () => {
    const response = MessageFormat.createSuccessResponse(
      { result: 'success' },
      'original-message-id',
      { customField: 'value' }
    );
    
    expect(response).toEqual({
      success: true,
      data: { result: 'success' },
      messageId: 'original-message-id',
      timestamp: expect.any(Number),
      customField: 'value'
    });
  });

  test('should create error response format', () => {
    const error = new Error('Test error');
    error.type = 'TEST_ERROR';
    error.statusCode = 400;
    
    const response = MessageFormat.createErrorResponse(error, 'original-message-id');
    
    expect(response).toEqual({
      success: false,
      error: {
        message: 'Test error',
        type: 'TEST_ERROR',
        statusCode: 400
      },
      messageId: 'original-message-id',
      timestamp: expect.any(Number)
    });
  });

  test('should create error response from string', () => {
    const response = MessageFormat.createErrorResponse('String error', 'msg-id');
    
    expect(response.success).toBe(false);
    expect(response.error.message).toBe('String error');
    expect(response.error.type).toBe('UNKNOWN_ERROR');
    expect(response.error.statusCode).toBe(500);
  });
});