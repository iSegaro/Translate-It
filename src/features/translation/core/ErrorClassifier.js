/**
 * Error Classifier - Categorizes errors for fast-fail vs rate-limiting decisions
 * Integrates with the existing Error Management System
 */

import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'ErrorClassifier');

/**
 * ErrorClassifier - Determines if errors should bypass rate limiting
 */
export class ErrorClassifier {
  
  /**
   * Deterministic errors that should fail immediately without rate limiting
   * These are configuration, validation, or permanent errors that won't be resolved by retrying
   */
  static DETERMINISTIC_ERROR_TYPES = [
    // API Configuration Errors - These won't resolve without user intervention
    ErrorTypes.API_KEY_MISSING,
    ErrorTypes.API_KEY_INVALID,
    ErrorTypes.API_URL_MISSING,
    ErrorTypes.MODEL_MISSING,
    ErrorTypes.AI_MODEL_MISSING,
    
    // Validation Errors - Input validation failures
    ErrorTypes.TEXT_EMPTY,
    ErrorTypes.TEXT_TOO_LONG,
    ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED,
    
    // Extension Context Errors - These are handled silently anyway
    ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
    ErrorTypes.CONTEXT,
    
    // Permanent API Errors
    ErrorTypes.API_ENDPOINT_NOT_FOUND,
    ErrorTypes.UNSUPPORTED_OPERATION
  ];

  /**
   * Retryable errors that should go through rate limiting
   * These are temporary network, service, or rate-limiting errors
   */
  static RETRYABLE_ERROR_TYPES = [
    // Network & Service Errors - These might resolve with retry
    ErrorTypes.NETWORK_ERROR,
    ErrorTypes.HTTP_ERROR,
    ErrorTypes.RATE_LIMIT_REACHED,
    ErrorTypes.QUOTA_EXCEEDED,
    ErrorTypes.SERVICE_UNAVAILABLE,
    
    // Translation Processing Errors - These might be temporary
    ErrorTypes.TRANSLATION_FAILED,
    ErrorTypes.API // Generic API errors that might be temporary
  ];

  /**
   * Check if an error is deterministic (should fail immediately)
   * @param {Error|string} error - Error object or error message/type
   * @returns {boolean} - True if error should bypass rate limiting
   */
  static isDeterministicError(error) {
    if (!error) return false;
    
    // Check error.type property first (most reliable)
    if (error.type && this.DETERMINISTIC_ERROR_TYPES.includes(error.type)) {
      logger.debug(`Deterministic error detected by type: ${error.type}`);
      return true;
    }
    
    // Check error message for error type constants
    const errorMessage = error.message || error.toString();
    const isDeterministic = this.DETERMINISTIC_ERROR_TYPES.some(errorType => 
      errorMessage === errorType || errorMessage.includes(errorType)
    );
    
    if (isDeterministic) {
      logger.debug(`Deterministic error detected by message: ${errorMessage}`);
      return true;
    }
    
    // Additional pattern-based detection for common deterministic errors
    if (this._matchesDeterministicPattern(errorMessage)) {
      logger.debug(`Deterministic error detected by pattern: ${errorMessage}`);
      return true;
    }
    
    return false;
  }

  /**
   * Check if an error is retryable (should go through rate limiting)
   * @param {Error|string} error - Error object or error message/type
   * @returns {boolean} - True if error should be rate limited
   */
  static isRetryableError(error) {
    if (!error) return false;
    
    // Check error.type property first
    if (error.type && this.RETRYABLE_ERROR_TYPES.includes(error.type)) {
      return true;
    }
    
    // Check error message for error type constants
    const errorMessage = error.message || error.toString();
    const isRetryable = this.RETRYABLE_ERROR_TYPES.some(errorType => 
      errorMessage === errorType || errorMessage.includes(errorType)
    );
    
    if (isRetryable) {
      return true;
    }
    
    // Additional pattern-based detection for retryable errors
    return this._matchesRetryablePattern(errorMessage);
  }

  /**
   * Get recommended action for an error
   * @param {Error|string} error - Error object or error message/type
   * @returns {string} - 'fast-fail', 'rate-limit', or 'unknown'
   */
  static getRecommendedAction(error) {
    if (this.isDeterministicError(error)) {
      return 'fast-fail';
    }
    
    if (this.isRetryableError(error)) {
      return 'rate-limit';
    }
    
    // For unknown errors, default to rate limiting for safety
    logger.debug(`Unknown error type, defaulting to rate-limit: ${error?.message || error}`);
    return 'rate-limit';
  }

  /**
   * Pattern matching for deterministic errors
   * @private
   */
  static _matchesDeterministicPattern(errorMessage) {
    const patterns = [
      /api[_\s]*key[_\s]*(missing|not[_\s]*found|invalid|empty)/i,
      /api[_\s]*url[_\s]*(missing|not[_\s]*found|invalid|empty)/i,
      /model[_\s]*(missing|not[_\s]*found|invalid|empty)/i,
      /configuration[_\s]*(missing|invalid|error)/i,
      /text[_\s]*(empty|too[_\s]*long|invalid)/i,
      /language[_\s]*(not[_\s]*supported|invalid|pair)/i,
      /extension[_\s]*context[_\s]*(invalid|lost)/i,
      /authentication[_\s]*(failed|invalid|missing)/i,
      /unauthorized/i,
      /forbidden/i,
      /400/i, // Bad Request - usually configuration issues
      /401/i, // Unauthorized - authentication issues
      /403/i  // Forbidden - permission issues
    ];
    
    return patterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Pattern matching for retryable errors
   * @private
   */
  static _matchesRetryablePattern(errorMessage) {
    const patterns = [
      /network[_\s]*error/i,
      /connection[_\s]*(failed|timeout|refused)/i,
      /timeout/i,
      /rate[_\s]*limit/i,
      /quota[_\s]*exceeded/i,
      /service[_\s]*unavailable/i,
      /server[_\s]*error/i,
      /502|503|504/i, // Server errors
      /429/i, // Too Many Requests
      /5\d{2}/i // 5xx server errors
    ];
    
    return patterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Get error statistics for debugging
   * @param {Error[]} errors - Array of errors to analyze
   * @returns {Object} - Statistics about error classification
   */
  static analyzeErrors(errors) {
    const stats = {
      total: errors.length,
      deterministic: 0,
      retryable: 0,
      unknown: 0,
      breakdown: {}
    };
    
    errors.forEach(error => {
      const action = this.getRecommendedAction(error);
      const errorType = error.type || error.message || 'unknown';
      
      stats[action === 'fast-fail' ? 'deterministic' : action === 'rate-limit' ? 'retryable' : 'unknown']++;
      
      if (!stats.breakdown[errorType]) {
        stats.breakdown[errorType] = { count: 0, action };
      }
      stats.breakdown[errorType].count++;
    });
    
    return stats;
  }
}

export default ErrorClassifier;