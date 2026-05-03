import { describe, it, expect } from 'vitest';
import { MessageFormat, generateMessageId } from './MessagingCore.js';
import { MessageActions } from './MessageActions.js';
import { MessageContexts } from './MessagingConstants.js';

describe('MessagingCore', () => {
  describe('MessageFormat.create', () => {
    it('should create a standard message with default context', () => {
      const action = MessageActions.TRANSLATE;
      const data = { text: 'hello' };
      const message = MessageFormat.create(action, data);

      expect(message.action).toBe(action);
      expect(message.data).toEqual(data);
      expect(message.context).toBe(MessageContexts.CONTENT);
      expect(message.messageId).toMatch(/^msg-\d+-\d+$/);
      expect(message.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should use provided context and messageId', () => {
      const action = MessageActions.GET_SETTINGS;
      const context = MessageContexts.POPUP;
      const messageId = 'custom-id';
      const message = MessageFormat.create(action, {}, context, messageId);

      expect(message.context).toBe(context);
      expect(message.messageId).toBe(messageId);
    });
  });

  describe('MessageFormat.validate', () => {
    it('should return true for valid messages', () => {
      const validMessage = { action: 'TEST_ACTION', data: {} };
      expect(MessageFormat.validate(validMessage)).toBe(true);
    });

    it('should return false for invalid messages', () => {
      expect(MessageFormat.validate(null)).toBe(false);
      expect(MessageFormat.validate({})).toBe(false);
      expect(MessageFormat.validate({ data: {} })).toBe(false);
    });
  });

  describe('MessageFormat.createErrorResponse', () => {
    it('should format Error objects correctly', () => {
      const error = new Error('Test error');
      error.type = 'CUSTOM_TYPE';
      error.statusCode = 500;
      const messageId = 'msg-123';
      
      const response = MessageFormat.createErrorResponse(error, messageId);

      expect(response.success).toBe(false);
      expect(response.messageId).toBe(messageId);
      expect(response.error.message).toBe('Test error');
      expect(response.error.type).toBe('CUSTOM_TYPE');
      expect(response.error.statusCode).toBe(500);
    });

    it('should format string errors correctly', () => {
      const response = MessageFormat.createErrorResponse('Simple error string');
      expect(response.error.message).toBe('Simple error string');
    });

    it('should include additional options in error data', () => {
      const response = MessageFormat.createErrorResponse('Error', null, { detail: 'extra' });
      expect(response.error.detail).toBe('extra');
    });
  });

  describe('generateMessageId', () => {
    it('should generate unique IDs with correct format', () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();
      
      expect(id1).toMatch(/^msg-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });
});
