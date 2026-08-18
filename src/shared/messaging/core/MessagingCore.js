/**
 * MessagingCore - Simplified messaging utilities
 * Provides standardized message formats and utilities for browser extension messaging
 * Refactored to use direct browser.runtime.sendMessage pattern
 */

import { MessageActions } from './MessageActions.js';
import { MessageContexts, ActionReasons } from './MessagingConstants.js';
import { ErrorMatcher } from '@/shared/error-management/ErrorMatcher.js';

const TRANSLATION_ERROR_FIELDS = [
  'type',
  'originalType',
  'statusCode',
  'context',
  'providerName',
  'providerId',
  'code',
  'errorCode',
  'translationOutcome',
];

const LEGACY_ERROR_OPTION_FIELDS = new Set([
  'success',
  'error',
  ...TRANSLATION_ERROR_FIELDS,
  'cause',
  'originalError',
  'stack',
]);

const UNSUPPORTED_VALUE = Symbol('unsupported-transport-value');
const CIRCULAR_VALUE = Symbol('circular-transport-value');

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;

  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function cloneSafeValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : UNSUPPORTED_VALUE;
  if (!Array.isArray(value) && !isPlainObject(value)) return UNSUPPORTED_VALUE;
  if (seen.has(value)) return CIRCULAR_VALUE;

  seen.add(value);

  if (Array.isArray(value)) {
    const result = [];
    for (const item of value) {
      if (item === value) return CIRCULAR_VALUE;
      const cloned = cloneSafeValue(item, seen);
      if (cloned !== UNSUPPORTED_VALUE && cloned !== CIRCULAR_VALUE) result.push(cloned);
    }
    seen.delete(value);
    return result;
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === value) return CIRCULAR_VALUE;
    const cloned = cloneSafeValue(item, seen);
    if (cloned !== UNSUPPORTED_VALUE && cloned !== CIRCULAR_VALUE) result[key] = cloned;
  }

  seen.delete(value);
  return result;
}

function hasValue(object, field) {
  return object && typeof object === 'object'
    && Object.prototype.hasOwnProperty.call(object, field)
    && object[field] !== undefined;
}

function getFieldValue(error, options, field) {
  if (hasValue(options, field)) return options[field];
  if (hasValue(error, field)) return error[field];
  return undefined;
}

function copyScalar(target, field, value, acceptedTypes) {
  if (acceptedTypes.includes(typeof value)) target[field] = value;
}

function copyLegacyOptions(target, options) {
  if (!options || typeof options !== 'object') return;

  for (const [key, value] of Object.entries(options)) {
    if (LEGACY_ERROR_OPTION_FIELDS.has(key)) continue;

    const cloned = cloneSafeValue(value);
    if (cloned !== UNSUPPORTED_VALUE) target[key] = cloned;
  }
}

/**
 * Message Format Utility
 * Provides methods for creating and validating message objects
 */
export const MessageFormat = {
  /**
   * Create a standard message object
   * @param {string} action - Message action from MessageActions
   * @param {Object} data - Payload data
   * @param {string} context - Execution context from MessageContexts
   * @param {string|null} messageId - Optional message ID
   * @returns {Object} Formatted message object
   */
  create(action, data = {}, context = MessageContexts.CONTENT, messageId = null) {
    return {
      action,
      data,
      context,
      messageId: messageId || `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now()
    };
  },

  /**
   * Serialize translation error identity into an explicit, messaging-safe DTO.
   * Native Error internals and arbitrary properties never cross the boundary.
   *
   * @param {Error|Object|string} error - Error object, DTO, or message
   * @param {Object} options - Explicit canonical field overrides
   * @returns {Object} Plain translation error DTO
   */
  serializeTranslationError(error, options = {}) {
    const serialized = {};
    const isObjectError = error && typeof error === 'object';
    const rawMessage = hasValue(options, 'message')
      ? options.message
      : error instanceof Error
        ? error.message
        : isObjectError
          ? (error.message ?? error.error ?? 'Unknown error')
          : String(error);

    serialized.message = typeof rawMessage === 'string' ? rawMessage : String(rawMessage);

    const explicitType = getFieldValue(error, options, 'type');
    const errorType = explicitType === undefined
      ? ErrorMatcher.matchErrorToType(error)
      : explicitType;
    copyScalar(serialized, 'type', errorType, ['string']);
    copyScalar(serialized, 'originalType', getFieldValue(error, options, 'originalType'), ['string']);

    const statusCode = getFieldValue(error, options, 'statusCode');
    if (typeof statusCode === 'number' && Number.isFinite(statusCode)) {
      serialized.statusCode = statusCode;
    }

    copyScalar(serialized, 'context', getFieldValue(error, options, 'context'), ['string']);
    copyScalar(serialized, 'providerName', getFieldValue(error, options, 'providerName'), ['string']);
    copyScalar(serialized, 'providerId', getFieldValue(error, options, 'providerId'), ['string', 'number']);
    copyScalar(serialized, 'code', getFieldValue(error, options, 'code'), ['string', 'number']);
    copyScalar(serialized, 'errorCode', getFieldValue(error, options, 'errorCode'), ['string', 'number']);

    const translationOutcome = cloneSafeValue(getFieldValue(error, options, 'translationOutcome'));
    if (translationOutcome !== UNSUPPORTED_VALUE) serialized.translationOutcome = translationOutcome;

    return serialized;
  },

  /**
   * Create a standard error response
   * @param {Error|Object|string} error - Error object or message
   * @param {string|null} messageId - Original message ID
   * @param {Object} options - Additional context/data to include
   * @returns {Object} Error response object
   */
  createErrorResponse(error, messageId = null, options = {}) {
    // Keep legacy non-error options for compatibility, but never recursively
    // spread error objects or duplicate the outer failure envelope.
    const errorData = this.serializeTranslationError(error, options);
    copyLegacyOptions(errorData, options);

    return {
      success: false,
      error: errorData,
      messageId,
      timestamp: Date.now()
    };
  },

  /**
   * Validate a message object
   * @param {Object} message - Message to validate
   * @returns {boolean} True if message is valid
   */
  validate(message) {
    if (!message || typeof message !== 'object') return false;
    if (!message.action) return false;
    return true;
  }
};

/**
 * Unique ID generator for messages
 * @returns {string} Unique message ID
 */
export function generateMessageId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `msg-${timestamp}-${random}`;
}

// Export constants for easy access
export { MessageContexts, ActionReasons };
export { MessageContexts as Contexts };
export { MessageActions as Actions };
export { MessageActions };

// Maintain backward compatibility
export const MessagingContexts = MessageContexts;
