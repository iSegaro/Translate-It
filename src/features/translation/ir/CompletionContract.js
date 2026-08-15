/**
 * Provider Completion Contract - ADR-016 normalized completion foundation.
 *
 * Provider-neutral vocabulary, factories, and normalizers for completion
 * metadata. Provider adapters translate raw response facts into this
 * vocabulary at the provider-adapter boundary; downstream layers must never
 * observe raw provider schemas.
 *
 * P1 introduces infrastructure only: no runtime layer consumes these records
 * yet. Parser, validator, recovery, streaming, and stats behavior is
 * unchanged. Absent facts stay null; nothing is fabricated or derived.
 */

export const CompletionTermination = Object.freeze({
  NORMAL: 'NORMAL',
  TRUNCATED: 'TRUNCATED',
  POLICY: 'POLICY',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  UNKNOWN: 'UNKNOWN',
})

const TERMINATION_VALUES = new Set(Object.values(CompletionTermination))

/**
 * Validates an already-normalized termination value. Anything that is not a
 * known CompletionTermination value collapses to UNKNOWN, so raw provider
 * strings can never pass as a semantic termination. This is the single source
 * of truth for normalized-value membership.
 *
 * @param {string|null} value A CompletionTermination value.
 * @returns {string} A CompletionTermination value.
 */
export function normalizeCompletionTermination(value) {
  return TERMINATION_VALUES.has(value) ? value : CompletionTermination.UNKNOWN
}

/**
 * Provider families sharing a native response contract. A family is a lookup
 * key for the generic normalizer, never a downstream-visible value.
 */
export const CompletionProviderFamily = Object.freeze({
  GEMINI: 'GEMINI',
  OPENAI_COMPATIBLE: 'OPENAI_COMPATIBLE',
})

const GEMINI_TERMINATION_MAP = Object.freeze({
  STOP: CompletionTermination.NORMAL,
  MAX_TOKENS: CompletionTermination.TRUNCATED,
  SAFETY: CompletionTermination.POLICY,
})

const OPENAI_COMPATIBLE_TERMINATION_MAP = Object.freeze({
  stop: CompletionTermination.NORMAL,
  length: CompletionTermination.TRUNCATED,
  max_tokens: CompletionTermination.TRUNCATED,
  content_filter: CompletionTermination.POLICY,
})

const FAMILY_TERMINATION_MAPS = Object.freeze({
  [CompletionProviderFamily.GEMINI]: GEMINI_TERMINATION_MAP,
  [CompletionProviderFamily.OPENAI_COMPATIBLE]: OPENAI_COMPATIBLE_TERMINATION_MAP,
})

/**
 * Maps a provider-native termination value into the normalized vocabulary.
 * Unrecognized families and values collapse to UNKNOWN so provider-native
 * strings never surface downstream as a semantic termination.
 *
 * @param {string} family A CompletionProviderFamily key.
 * @param {string|null} nativeValue The raw provider termination value.
 * @returns {string} A CompletionTermination value.
 */
export function normalizeTermination(family, nativeValue) {
  const map = FAMILY_TERMINATION_MAPS[family]
  if (!map || typeof nativeValue !== 'string') return CompletionTermination.UNKNOWN
  return map[nativeValue] ?? CompletionTermination.UNKNOWN
}

function sanitizeTokenCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * Creates an immutable normalized usage record. Absent or invalid counts stay
 * null; missing counts are never derived from other counts.
 *
 * @param {object} [input]
 * @param {number|null} [input.inputTokens] Prompt/input tokens.
 * @param {number|null} [input.outputTokens] Completion/output tokens.
 * @param {number|null} [input.reasoningTokens] Reasoning/thinking tokens.
 * @param {number|null} [input.totalTokens] Total tokens.
 * @returns {object|null} Frozen usage record, or null when every count is absent.
 */
export function createUsageRecord({ inputTokens = null, outputTokens = null, reasoningTokens = null, totalTokens = null } = {}) {
  const usage = Object.freeze({
    inputTokens: sanitizeTokenCount(inputTokens),
    outputTokens: sanitizeTokenCount(outputTokens),
    reasoningTokens: sanitizeTokenCount(reasoningTokens),
    totalTokens: sanitizeTokenCount(totalTokens),
  })
  return usage.inputTokens === null
    && usage.outputTokens === null
    && usage.reasoningTokens === null
    && usage.totalTokens === null
    ? null
    : usage
}

function sanitizeString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Creates an immutable minimal completion record from normalized facts.
 * Unavailable facts stay null; nothing is fabricated. Records never carry
 * source/translated text, prompts, response bodies, provider-native objects,
 * or credentials.
 *
 * @param {object} [input]
 * @param {string|null} [input.provider] Provider identity.
 * @param {string|null} [input.model] Model identity when available.
 * @param {string} [input.termination] A CompletionTermination value.
 * @param {string|null} [input.responseId] Response identity when available.
 * @param {object|null} [input.usage] A normalized usage record.
 * @returns {object} Frozen completion record.
 */
export function createCompletionRecord({ provider = null, model = null, termination = CompletionTermination.UNKNOWN, responseId = null, usage = null } = {}) {
  const normalizedUsage = usage && typeof usage === 'object'
    ? createUsageRecord({
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      totalTokens: usage.totalTokens,
    })
    : null
  return Object.freeze({
    provider: sanitizeString(provider),
    model: sanitizeString(model),
    termination: normalizeCompletionTermination(termination),
    responseId: sanitizeString(responseId),
    usage: normalizedUsage,
  })
}
