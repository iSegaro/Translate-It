import { describe, it, expect } from 'vitest';
import { MessageFormat, generateMessageId, reconstructTranslationError } from './MessagingCore.js';
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
      expect(response.errorDetails).toEqual(response.error);
    });

    it('serializes and reconstructs HTTP 402 without semantic downgrade', () => {
      const error = Object.assign(new Error('HTTP 402'), {
        type: 'INSUFFICIENT_BALANCE',
        statusCode: 402,
      });

      const response = MessageFormat.createErrorResponse(error, '402-message');
      const reconstructed = reconstructTranslationError(response.errorDetails);

      expect(response.errorDetails).toMatchObject({
        type: 'INSUFFICIENT_BALANCE',
        statusCode: 402,
      });
      expect(reconstructed).toMatchObject({
        type: 'INSUFFICIENT_BALANCE',
        statusCode: 402,
      });
    });

    it('should format string errors correctly', () => {
      const response = MessageFormat.createErrorResponse('Simple error string');
      expect(response.error.message).toBe('Simple error string');
      expect(response.errorDetails.message).toBe('Simple error string');
      expect(MessageFormat.serializeTranslationError('Simple error string')).toMatchObject({
        message: 'Simple error string',
      });
    });

    it('should include additional options in error data', () => {
      const response = MessageFormat.createErrorResponse('Error', null, { detail: 'extra' });
      expect(response.error.detail).toBe('extra');
    });

    it('serializes native Error identity without native or diagnostic internals', () => {
      const error = new Error('Provider failure');
      error.type = 'HTTP_ERROR';
      error.originalType = 'MODEL_MISSING';
      error.statusCode = 400;
      error.context = 'popup';
      error.providerName = 'WebAI';
      error.providerId = 'webai';
      error.code = 400;
      error.errorCode = 'MODEL_UNKNOWN';
      error.translationOutcome = { committedParentCount: 0, totalParentCount: 1 };
      error.transportFailure = 'socks-proxy-timeout';
      error.cause = new Error('private cause');

      const serialized = MessageFormat.serializeTranslationError(error);

      expect(serialized).toMatchObject({
        message: 'Provider failure',
        type: 'HTTP_ERROR',
        originalType: 'MODEL_MISSING',
        statusCode: 400,
        context: 'popup',
        providerName: 'WebAI',
        providerId: 'webai',
        code: 400,
        errorCode: 'MODEL_UNKNOWN',
        translationOutcome: { committedParentCount: 0, totalParentCount: 1 },
      });
      expect(serialized).not.toHaveProperty('transportFailure');
      expect(serialized).not.toHaveProperty('cause');
      expect(serialized).not.toHaveProperty('stack');
      expect(serialized).not.toBeInstanceOf(Error);
    });

    it('serializes plain DTOs and ignores unsupported metadata', () => {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const circular = {};
      circular.self = circular;

      const serialized = MessageFormat.serializeTranslationError({
        message: 'Plain failure',
        type: 'SERVER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'content',
        providerName: 'WebAI',
        providerId: 'webai',
        code: 503,
        errorCode: 'OVERLOADED',
        translationOutcome: {
          committedParentCount: 1,
          nestedError: new Error('unsupported'),
          controller,
          circular,
          callback: () => {},
        },
        arbitrary: { shouldNot: 'cross' },
      });

      expect(serialized).toMatchObject({
        message: 'Plain failure',
        type: 'SERVER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'content',
        providerName: 'WebAI',
        providerId: 'webai',
        code: 503,
        errorCode: 'OVERLOADED',
        translationOutcome: { committedParentCount: 1 },
      });
      expect(Object.keys(serialized)).toEqual([
        'message',
        'type',
        'originalType',
        'statusCode',
        'context',
        'providerName',
        'providerId',
        'code',
        'errorCode',
        'translationOutcome',
      ]);
      expect(serialized.translationOutcome).toEqual({ committedParentCount: 1 });
      expect(serialized).not.toHaveProperty('arbitrary');
    });

    it('omits a root circular translationOutcome', () => {
      const outcome = {};
      outcome.self = outcome;

      const serialized = MessageFormat.serializeTranslationError({
        message: 'Circular outcome',
        type: 'PROVIDER_ERROR',
        translationOutcome: outcome,
      });

      expect(serialized).not.toHaveProperty('translationOutcome');
      expect(Object.values(serialized).some(value => typeof value === 'symbol')).toBe(false);
    });

    it('preserves valid translationOutcome through reconstruction and re-serialization', () => {
      const serialized = MessageFormat.serializeTranslationError({
        message: 'Stable outcome',
        type: 'PROVIDER_ERROR',
        translationOutcome: {
          partial: true,
          committedParentCount: 1,
          metadata: { source: 'test' },
        },
      });

      const reconstructed = reconstructTranslationError(serialized);
      const roundTrip = MessageFormat.serializeTranslationError(reconstructed);

      expect(roundTrip).toEqual(serialized);
    });

    it('isolates reconstructed translationOutcome from its source DTO', () => {
      const sourceDto = {
        message: 'Source failure',
        type: 'PROVIDER_ERROR',
        translationOutcome: {
          partial: true,
          metadata: { committed: 1 },
          items: [{ id: 1, accepted: true }],
        },
      };

      const error = reconstructTranslationError(sourceDto);
      error.translationOutcome.metadata.committed = 2;
      error.translationOutcome.items[0].accepted = false;
      error.translationOutcome.items.push({ id: 2, accepted: true });

      expect(sourceDto.translationOutcome).toEqual({
        partial: true,
        metadata: { committed: 1 },
        items: [{ id: 1, accepted: true }],
      });
    });

    it('isolates serialized translationOutcome from its Error source', () => {
      const error = new Error('Provider failure');
      error.translationOutcome = {
        partial: true,
        metadata: { committed: 1 },
        items: [{ id: 1, accepted: true }],
      };

      const serialized = MessageFormat.serializeTranslationError(error);
      serialized.translationOutcome.metadata.committed = 2;
      serialized.translationOutcome.items[0].accepted = false;
      serialized.translationOutcome.items.push({ id: 2, accepted: true });

      expect(error.translationOutcome).toEqual({
        partial: true,
        metadata: { committed: 1 },
        items: [{ id: 1, accepted: true }],
      });

      error.translationOutcome.metadata.committed = 3;
      error.translationOutcome.items[0].accepted = false;

      expect(serialized.translationOutcome).toEqual({
        partial: true,
        metadata: { committed: 2 },
        items: [{ id: 1, accepted: false }, { id: 2, accepted: true }],
      });
    });

    it('keeps source DTO, reconstructed Error, and round-trip DTO independent', () => {
      const sourceDto = {
        message: 'Round-trip failure',
        type: 'PROVIDER_ERROR',
        translationOutcome: {
          partial: true,
          metadata: { committed: 1, batches: [[1, 2]] },
          items: [{ id: 1, accepted: true }],
        },
      };
      const reconstructedError = reconstructTranslationError(sourceDto);
      const roundTripDto = MessageFormat.serializeTranslationError(reconstructedError);

      expect(reconstructedError.translationOutcome).toEqual(sourceDto.translationOutcome);
      expect(roundTripDto.translationOutcome).toEqual(sourceDto.translationOutcome);

      sourceDto.translationOutcome.metadata.batches[0].push(3);
      reconstructedError.translationOutcome.items[0].accepted = false;
      roundTripDto.translationOutcome.metadata.committed = 2;

      expect(sourceDto.translationOutcome.metadata.batches).toEqual([[1, 2, 3]]);
      expect(sourceDto.translationOutcome.metadata.committed).toBe(1);
      expect(sourceDto.translationOutcome.items[0].accepted).toBe(true);
      expect(reconstructedError.translationOutcome.metadata.committed).toBe(1);
      expect(reconstructedError.translationOutcome.metadata.batches).toEqual([[1, 2]]);
      expect(reconstructedError.translationOutcome.items[0].accepted).toBe(false);
      expect(roundTripDto.translationOutcome.metadata.committed).toBe(2);
      expect(roundTripDto.translationOutcome.metadata.batches).toEqual([[1, 2]]);
    });

    it('isolates createErrorResponse source, canonical details, and legacy error', () => {
      const sourceError = new Error('Provider failure');
      sourceError.type = 'PROVIDER_ERROR';
      sourceError.translationOutcome = {
        partial: true,
        metadata: { committed: 1, batches: [[1, 2]] },
        items: [{ id: 1, accepted: true }],
      };

      const response = MessageFormat.createErrorResponse(sourceError);

      sourceError.translationOutcome.metadata.committed = 2;
      response.errorDetails.translationOutcome.metadata.batches[0].push(3);
      response.error.translationOutcome.items[0].accepted = false;

      expect(sourceError.translationOutcome).toEqual({
        partial: true,
        metadata: { committed: 2, batches: [[1, 2]] },
        items: [{ id: 1, accepted: true }],
      });
      expect(response.errorDetails.translationOutcome).toEqual({
        partial: true,
        metadata: { committed: 1, batches: [[1, 2, 3]] },
        items: [{ id: 1, accepted: true }],
      });
      expect(response.error.translationOutcome).toEqual({
        partial: true,
        metadata: { committed: 1, batches: [[1, 2]] },
        items: [{ id: 1, accepted: false }],
      });
    });

    it('does not classify an explicitly null type, but classifies an absent type', () => {
      const explicitNull = MessageFormat.serializeTranslationError({
        message: 'No type supplied intentionally',
        type: null,
      });
      const absentType = MessageFormat.serializeTranslationError({
        message: 'Server failed',
        statusCode: 500,
      });

      expect(explicitNull).not.toHaveProperty('type');
      expect(absentType.type).toBe('SERVER_ERROR');
    });

    it('produces equivalent nested identity for Error and serialized DTO inputs', () => {
      const error = new Error('Same failure');
      error.type = 'HTTP_ERROR';
      error.originalType = 'MODEL_MISSING';
      error.statusCode = 400;
      error.providerName = 'WebAI';

      const serialized = MessageFormat.serializeTranslationError(error);
      const fromError = MessageFormat.createErrorResponse(error, 'msg-1');
      const fromDto = MessageFormat.createErrorResponse(serialized, 'msg-2');

      expect(fromError.error).toEqual(serialized);
      expect(fromDto.error).toEqual(serialized);
      expect(fromError.messageId).toBe('msg-1');
      expect(fromDto.messageId).toBe('msg-2');
    });

    it('removes duplicate failure envelope options while preserving legacy metadata', () => {
      const response = MessageFormat.createErrorResponse(
        { message: 'Provider failure', type: 'HTTP_ERROR', statusCode: 400 },
        'msg-3',
        {
          success: false,
          error: { message: 'Provider failure', type: 'HTTP_ERROR' },
          context: 'popup',
          detail: 'legacy detail',
        }
      );

      expect(response.error).toMatchObject({
        message: 'Provider failure',
        type: 'HTTP_ERROR',
        statusCode: 400,
        context: 'popup',
        detail: 'legacy detail',
      });
      expect(response.error).not.toHaveProperty('error');
      expect(response.error).not.toHaveProperty('success');
    });

    it('keeps canonical details separate from legacy-enriched error data', () => {
      const error = new Error('Provider failure');
      Object.assign(error, {
        type: 'HTTP_ERROR',
        originalType: 'MODEL_MISSING',
        statusCode: 503,
        context: 'translation',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
        cause: new Error('private cause'),
        arbitrary: { private: true },
      });

      const circular = {};
      circular.self = circular;
      const response = MessageFormat.createErrorResponse(error, 'msg-4', {
        translatedText: 'partial',
        isFatal: true,
        batchMetadata: { batchIndex: 2 },
        arbitrary: circular,
        cause: new Error('private option cause'),
        stack: 'private stack',
      });

      expect(response.error).toMatchObject({
        message: 'Provider failure',
        type: 'HTTP_ERROR',
        originalType: 'MODEL_MISSING',
        statusCode: 503,
        context: 'translation',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
        translatedText: 'partial',
        isFatal: true,
        batchMetadata: { batchIndex: 2 },
      });
      expect(response.errorDetails).toEqual({
        message: 'Provider failure',
        type: 'HTTP_ERROR',
        originalType: 'MODEL_MISSING',
        statusCode: 503,
        context: 'translation',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
      });
      expect(response.error).not.toBe(response.errorDetails);
      expect(response.errorDetails).not.toHaveProperty('translatedText');
      expect(response.errorDetails).not.toHaveProperty('isFatal');
      expect(response.errorDetails).not.toHaveProperty('batchMetadata');
      expect(response.error).not.toHaveProperty('cause');
      expect(response.error).not.toHaveProperty('stack');
      expect(response.error).not.toHaveProperty('arbitrary');
      expect(response.errorDetails).not.toHaveProperty('cause');
      expect(response.errorDetails).not.toHaveProperty('stack');
      expect(response.errorDetails).not.toHaveProperty('arbitrary');

      response.error.message = 'legacy mutation';
      response.error.translationOutcome.partial = false;
      expect(response.errorDetails.message).toBe('Provider failure');
      expect(response.errorDetails.translationOutcome.partial).toBe(true);
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
