/**
 * Centralized MessageId Generation Utility
 * Provides consistent messageId generation across all messaging components
 */

/**
 * Generate a unique messageId
 * @param {string} context - Context identifier (e.g., 'content', 'background', 'popup')
 * @returns {string} Unique messageId in format: context-timestamp-random
 */
export function generateMessageId(context = 'unknown') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${context}-${timestamp}-${random}`;
}

/**
 * Generate messageId with custom prefix for specific operations
 * @param {string} context - Context identifier
 * @param {string} operation - Operation type (e.g., 'translate', 'revert', 'capture')
 * @returns {string} Unique messageId in format: context-operation-timestamp-random
 */
export function generateOperationMessageId(context, operation) {
  return `${context}-${operation}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generate messageId for content script operations
 * @param {string} operation - Operation type (default: 'action')
 * @returns {string} Unique messageId for content script context
 */
export function generateContentMessageId(operation = 'action') {
  return generateOperationMessageId('content', operation);
}

/**
 * Generate messageId for background operations
 * @param {string} operation - Operation type (default: 'action')
 * @returns {string} Unique messageId for background context
 */
export function generateBackgroundMessageId(operation = 'action') {
  return generateOperationMessageId('background', operation);
}

/**
 * Generate messageId for translation operations
 * @param {string} context - Context identifier
 * @returns {string} Unique messageId for translation operations
 */
export function generateTranslationMessageId(context = 'content') {
  return generateOperationMessageId(context, 'translate');
}

/**
 * Generate messageId for revert operations
 * @param {string} context - Context identifier (default: 'background')
 * @returns {string} Unique messageId for revert operations
 */
export function generateRevertMessageId(context = 'background') {
  return generateOperationMessageId(context, 'revert');
}

/**
 * Validate messageId format
 * @param {string} messageId - MessageId to validate
 * @returns {boolean} True if messageId has valid format
 */
export function validateMessageId(messageId) {
  if (!messageId || typeof messageId !== 'string') {
    return false;
  }
  
  // Basic format check: should have at least context-timestamp-random
  const parts = messageId.split('-');
  return parts.length >= 3;
}

/**
 * Extract context from messageId
 * @param {string} messageId - MessageId to parse
 * @returns {string|null} Context or null if invalid format
 */
export function extractContextFromMessageId(messageId) {
  if (!validateMessageId(messageId)) {
    return null;
  }
  
  const parts = messageId.split('-');
  return parts[0];
}

export default {
  generateMessageId,
  generateOperationMessageId,
  generateContentMessageId,
  generateBackgroundMessageId,
  generateTranslationMessageId,
  generateRevertMessageId,
  validateMessageId,
  extractContextFromMessageId
};