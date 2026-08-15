// src/shared/error-management/ValidationPolicy.js

import { ErrorTypes } from './ErrorTypes.js';

/**
 * Returns true only for explicitly classified local deterministic validation.
 *
 * Phase 1 intentionally recognizes only explicit TEXT_TOO_LONG.
 * It does not infer local provenance from messages or HTTP responses.
 *
 * INVARIANT: `type: TEXT_TOO_LONG` must only be assigned by local pre-network
 * validation producers. If a future provider-side response handler explicitly
 * sets this type on an HTTP error, it will be incorrectly excluded from retry
 * and health accounting.
 *  
 * Only pre-network validation may assign TEXT_TOO_LONG.
 * Provider-side HTTP errors (including 413 or equivalent responses)
 * must not reuse TEXT_TOO_LONG because QueueManager and
 * RateLimitManager intentionally treat it as a local deterministic
 * validation that neither retries nor affects provider health.
 *
 * @param {Error|Object|null|undefined} error
 * @returns {boolean}
 */
export function isLocalDeterministicValidationError(error) {
  return error?.type === ErrorTypes.TEXT_TOO_LONG;
}
