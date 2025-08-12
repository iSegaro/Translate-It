// src/messaging/__tests__/MessagingCore.test.js
import { describe, test, expect } from 'vitest';
import { 
  MessageFormat,
  MessageContexts,
  generateMessageId
} from '../core/MessagingCore.js';
import { MessageActions } from '../core/MessageActions.js';

describe('MessageFormat', () => {
  describe('create method', () => {
    test('should create valid message format', () => {
      const message = MessageFormat.create(
        MessageActions.TRANSLATE,
        { text: 'Hello' },
        MessageContexts.CONTENT
      );

      expect(message).toMatchObject({
        action: MessageActions.TRANSLATE,
        data: { text: 'Hello' },
        context: MessageContexts.CONTENT,
        version: '2.0'
      });
      expect(message.messageId).toBeDefined();
      expect(message.timestamp).toBeDefined();
    });

    test('should include custom messageId when provided', () => {
      const customId = 'custom-123';
      const message = MessageFormat.create(
        MessageActions.TRANSLATE,
        { text: 'Hello' },
        MessageContexts.CONTENT,
        { messageId: customId }
      );

      expect(message.messageId).toBe(customId);
    });
  });

  describe('validate method', () => {
    test('should validate correct message format', () => {
      const message = MessageFormat.create(
        MessageActions.TRANSLATE,
        { text: 'Hello' },
        MessageContexts.CONTENT
      );

      expect(MessageFormat.validate(message)).toBe(true);
    });

    test('should reject invalid message format', () => {
      expect(MessageFormat.validate(null)).toBe(false);
      expect(MessageFormat.validate({})).toBe(false);
      expect(MessageFormat.validate({ action: 'test' })).toBe(false);
    });
  });

  describe('response methods', () => {
    test('should create success response', () => {
      const response = MessageFormat.createSuccessResponse(
        { result: 'success' },
        'msg-123'
      );

      expect(response).toMatchObject({
        success: true,
        data: { result: 'success' },
        messageId: 'msg-123'
      });
      expect(response.timestamp).toBeDefined();
    });

    test('should create error response', () => {
      const response = MessageFormat.createErrorResponse(
        'Test error',
        'msg-123'
      );

      expect(response).toMatchObject({
        success: false,
        error: {
          message: 'Test error',
          type: 'UNKNOWN_ERROR',
          statusCode: 500
        },
        messageId: 'msg-123'
      });
      expect(response.timestamp).toBeDefined();
    });
  });
});

describe('generateMessageId', () => {
  test('should generate unique message IDs', () => {
    const id1 = generateMessageId('test');
    const id2 = generateMessageId('test');
    
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^test-\d+-[a-z0-9]+$/);
    expect(id2).toMatch(/^test-\d+-[a-z0-9]+$/);
  });
});

describe('MessageContexts', () => {
  test('should have all required contexts', () => {
    expect(MessageContexts.POPUP).toBe('popup');
    expect(MessageContexts.SIDEPANEL).toBe('sidepanel');
    expect(MessageContexts.CONTENT).toBe('content');
    expect(MessageContexts.BACKGROUND).toBe('background');
  });

  test('should validate contexts correctly', () => {
    expect(MessageContexts.isValidContext('popup')).toBe(true);
    expect(MessageContexts.isValidContext('invalid')).toBe(false);
  });
});