/**
 * Provider-neutral recovery classification - ADR-016 recovery-input stage.
 *
 * P4 introduces ONLY an observational classifier for structured responses that
 * enter recovery. It combines normalized completion metadata with parser/
 * validator facts to describe WHY the response failed. It does NOT classify
 * accepted responses or change recovery policy, retry, streaming, failover,
 * or provider behavior. The result feeds P5 (policy) decisions.
 *
 * Classification inputs are strictly normalized:
 *   - CompletionTermination values (never raw provider strings such as
 *     MAX_TOKENS/STOP/SAFETY/finishReason/usageMetadata).
 *   - boolean parse/contract flags.
 *   - string violation codes already emitted by the validator.
 *
 * Precedence picks the most causal known fact, not the last layer to notice:
 * provider termination is more causal than content symptoms, and a truncated
 * generation that yields invalid JSON is classified as truncation because the
 * invalid JSON is a consequence of truncation, not an independent cause.
 */

import { CompletionTermination } from './CompletionContract.js'

/**
 * Normalized, provider-neutral recovery classification vocabulary.
 *
 * Categories map to conceptual failure classes (ADR-016 recovery decision model:
 * completion metadata + parser result + validator result together).
 */
export const RecoveryClassification = Object.freeze({
  /** Output-limit termination (TRUNCATED). Dominates content symptoms. */
  TRUNCATED_RESPONSE: 'TRUNCATED_RESPONSE',
  /** Parser could not decode the payload into a structured candidate. */
  PARSE_FAILURE: 'PARSE_FAILURE',
  /** Payload parsed but the mapped result violated the response contract. */
  CONTRACT_VIOLATION: 'CONTRACT_VIOLATION',
  /** Provider safety/policy termination (POLICY). */
  POLICY_TERMINATION: 'POLICY_TERMINATION',
  /** Provider-level error response (PROVIDER_ERROR). */
  PROVIDER_ERROR_TERMINATION: 'PROVIDER_ERROR_TERMINATION',
})

function collectCodes(violationCodes) {
  const deduped = new Set(
    Array.isArray(violationCodes)
      ? violationCodes.filter((code) => typeof code === 'string')
      : []
  )
  return Object.freeze([...deduped])
}

function createClassification(classification, secondary) {
  return Object.freeze({
    classification,
    ...secondary,
  })
}

/**
 * Classifies a structured-response failure from normalized facts only.
 *
 * Provider-neutral: reads only normalized CompletionTermination values and
 * parsed/validated booleans. Never inspects raw provider strings.
 *
 * Precedence (most causal first):
 *   1. Explicit provider-level terminations (POLICY, PROVIDER_ERROR).
 *   2. Truncation (provider ended on output limit; any content symptom is
 *      treated as a downstream consequence).
 *   3. Parser failure (payload undecodable).
 *   4. Semantic contract violation (payload decoded but rejected by validator).
 *
 * Absence of completion metadata is preserved as `null` — it is never
 * fabricated as UNKNOWN. A response with no failure signal classifies as
 * `null` (no recovery classification), so successful responses are not mislabeled.
 *
 * @param {object} [input]
 * @param {object|null} [input.completion] Frozen normalized completion record
 *   (or null when the provider is unmigrated / absent).
 * @param {boolean} [input.parseFailed] True when the parser could not decode the
 *   payload into a structured candidate (true parse failure, not a semantic
 *   violation).
 * @param {boolean} [input.contractViolation] True when the response violated the
 *   structured contract.
 * @param {string[]} [input.violationCodes] Secondary validator violation codes
 *   attached for diagnostic context (not used in precedence).
 * @returns {object|null} Frozen classification record, or null when response
 *   does not enter structured recovery.
 */
export function classifyRecoveryFailure({
  completion = null,
  parseFailed = false,
  contractViolation = false,
  violationCodes = [],
} = {}) {
  const termination = completion?.termination ?? null
  const secondary = {
    termination,
    parseFailed: parseFailed === true,
    contractViolation: contractViolation === true,
    violationCodes: collectCodes(violationCodes),
  }

  // (1) Explicit non-completion terminations requiring special handling.
  if (termination === CompletionTermination.POLICY) {
    return createClassification(RecoveryClassification.POLICY_TERMINATION, secondary)
  }
  if (termination === CompletionTermination.PROVIDER_ERROR) {
    return createClassification(RecoveryClassification.PROVIDER_ERROR_TERMINATION, secondary)
  }
  // (2) Truncation dominates: invalid JSON from truncation is a symptom.
  if (termination === CompletionTermination.TRUNCATED) {
    return createClassification(RecoveryClassification.TRUNCATED_RESPONSE, secondary)
  }
  // (3) Parser outcome.
  if (parseFailed === true) {
    return createClassification(RecoveryClassification.PARSE_FAILURE, secondary)
  }
  // (4) Semantic contract violation.
  if (contractViolation === true) {
    return createClassification(RecoveryClassification.CONTRACT_VIOLATION, secondary)
  }
  // (5) No failure signal -> no recovery classification.
  return null
}
