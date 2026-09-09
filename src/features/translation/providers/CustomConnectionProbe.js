/**
 * CustomConnectionProbe - Explicit Test Connection probe for Custom endpoints.
 *
 * Isolated transport: proxy-aware via proxyManager.fetch with a fresh proxy
 * snapshot (same boundary as ApiKeyManager key testing). NEVER native fetch.
 * Does NOT touch UnifiedTranslationService, QueueManager, ProviderCoordinator,
 * BaseAIProvider execution, history/conversation, stats, rate-limit, retry, or
 * key-reorder paths. No persistence; explicit click only (called by UI).
 *
 * Sequence for a snapshotted { apiUrl, apiModel, apiKey }:
 *   Probe A (no response_format, tiny prompt demanding exactly
 *     {"probe":"ok"}). Transport/completion success is separated from fallback
 *     semantic validity: envelope-ok but JSON-contract-fail records
 *     fallbackStructured 'unsupported' and CONTINUES to Probe B. Only missing
 *     config, unreachable, auth failure, model unavailability, request
 *     failure, and missing completion envelopes stop before Probe B.
 *     "Semantically valid" means parser-accepted under the single runtime
 *     policy (AIResponseParser.cleanAIResponse, JSON_OBJECT contract) plus
 *     probe === "ok"; there is exactly one parsing policy, owned by the
 *     parser, with no probe-local healer rules.
 *   Probe B (same + response_format json_object) classifies the protocol
 *     independently: 200 with a recognizable completion envelope →
 *     'supported'; 200 with an error envelope or no usable envelope →
 *     'unknown'; classified 400/422 → 'unsupported'; anything else →
 *     'unknown' (inconclusive outcomes never write or overwrite the cache).
 *     On a successful envelope the content is additionally validated against
 *     the {"probe":"ok"} contract WITHOUT changing responseFormat: usable
 *     requires a proven structured path, so an accepted parameter with
 *     contract-failing content is degraded, never fully usable.
 * Usable matrix: B-supported+B-valid → true; B-supported+B-invalid → false;
 *   B-unsupported+A-supported → true (fallback); both unsupported → false;
 *   B-unknown+A-supported → true with the inconclusive reason; A-unsupported
 *   +B-supported+B-valid → true; A-unsupported with no proven B path → false.
 * A 404 means model_unavailable only with explicit model evidence
 * (model_not_found code, a message naming the configured model as
 * missing/unknown/not found, or /models evidence). Bare/endpoint 404s are
 * endpoint/request failures; /models only disambiguates and never fails the
 * overall result alone.
 *
 * Effective-model tracking: body.model is captured from successful
 * recognizable completion envelopes only (never from failures, never via
 * extra network). Normalization is conservative: trim only, case preserved.
 * Probe A is the primary evidence; Probe B only fills the gap when A is
 * silent. If both name models and disagree, that inconsistency is itself a
 * mismatch (documented conservative choice: a stable endpoint names one
 * model; disagreement implies aliasing/proxying), and the reported effective
 * model is the side evidencing the mismatch (A when it differs, else B),
 * so requested and effective never read identically on a mismatch.
 * Missing/empty model names yield 'unknown', never a failure. Mismatch is
 * warning-level only: it never
 * forces usable=false (aliases may resolve) and never alters cache writes or
 * keys (always the configured URL + requested model). The pre-existing
 * model_not_found / explicit-message / /models error path is unchanged;
 * mismatch is additional evidence on success only.
 *
 * Results are semantic ({ state, messageKey, params }) with responseFormat,
 * fallbackStructured, and model identity (modelStatus matched|mismatch|
 * unknown, requestedModel, effectiveModel) kept separate. No hard-coded
 * English here; the UI renders localized text from messageKey/params. There
 * is no connection flag: state ('success' vs failure states) is the single
 * primary signal and every consumer branches on state/usable instead.
 *
 * Cancellation: probeCustomConnection accepts an optional AbortSignal that
 * is threaded into Probe A, the optional /models lookup, and Probe B.
 * Aborted checks resolve to a dedicated 'timed_out' outcome — never
 * unreachable/auth/request_failed/unsupported/invalid, never a cache write,
 * never a raw AbortError. Guards before /models and Probe B ensure neither
 * starts after cancel.
 */

import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ResponseFormat } from '@/shared/config/translationConstants.js';
import { AIResponseParser } from './utils/AIResponseParser.js';
import {
  CUSTOM_RESPONSE_FORMAT_SUPPORT,
  setCustomResponseFormatSupport,
  isUnsupportedResponseFormatError,
} from './CustomResponseFormatCapability.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'CustomProbe');

const PROBE_MAX_TOKENS = 32;
const PROBE_DETAIL_MAX_LENGTH = 200;
const PROBE_MODEL_NAME_MAX_LENGTH = 80;
const PROBE_PROMPT = 'Reply with exactly {"probe":"ok"} and nothing else.';

const MODEL_MISSING_CODES = new Set(['model_not_found']);
const MODEL_MISSING_MESSAGE_PATTERN = /\bmodel\b.{0,40}\b(?:not\s+found|does\s+not\s+exist|unknown|invalid|missing)\b/i;

/**
 * First non-empty key line, or '' when keyless. Keyless endpoints are valid.
 * @param {string} apiKey - Raw key field value (possibly multi-line).
 * @returns {string}
 */
export function firstCustomProbeKey(apiKey) {
  if (typeof apiKey !== 'string') return '';
  return apiKey.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
}

function toBoundedDetail(value, fallback) {
  if (typeof value === 'string' && value.trim().length > 0) {
    const trimmed = value.trim();
    return trimmed.length > PROBE_DETAIL_MAX_LENGTH
      ? trimmed.slice(0, PROBE_DETAIL_MAX_LENGTH)
      : trimmed;
  }
  return fallback;
}

function toBoundedModelName(value) {
  const text = String(value ?? '').trim();
  if (text.length <= PROBE_MODEL_NAME_MAX_LENGTH) return text;
  // Head+tail instead of a prefix-only slice: two long names sharing a
  // prefix but differing later (e.g. version suffixes) still display
  // differently on a mismatch, while never exceeding the bound.
  const tailLength = 15;
  const headLength = PROBE_MODEL_NAME_MAX_LENGTH - tailLength - 1;
  return `${text.slice(0, headLength)}…${text.slice(-tailLength)}`;
}

/**
 * Same proxy boundary as ApiKeyManager key testing: fresh proxy snapshot per
 * physical attempt, proxyManager.fetch transport. Never native fetch. An
 * optional AbortSignal is forwarded in the fetch options so cancellation
 * propagates through the proxy strategies to the underlying request.
 */
async function fetchWithCurrentProxy(url, options = {}, signal = null) {
  const proxyConfig = await resolveProxyConfig();
  return proxyManager.fetch(url, signal ? { ...options, signal } : options, proxyConfig);
}

/**
 * True only when the caller-supplied probe signal was aborted. Transport
 * rejections are classified as cancellation solely on this basis, so
 * unrelated AbortErrors can never masquerade as a cancelled check.
 */
function isProbeAbort(signal) {
  return signal?.aborted === true;
}

function buildHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function buildChatBody(apiModel, withResponseFormat) {
  return JSON.stringify({
    model: apiModel,
    messages: [{ role: 'user', content: PROBE_PROMPT }],
    max_tokens: PROBE_MAX_TOKENS,
    ...(withResponseFormat && { response_format: { type: 'json_object' } }),
  });
}

async function readJsonBody(response) {
  try {
    const payload = await response.json();
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Mirrors the engine's bounded precedence (detail > nested message >
 * top-level string error > top-level message) without importing it.
 */
function extractProbeErrorMessage(body) {
  const candidates = [
    body?.detail,
    body?.error?.message,
    typeof body?.error === 'string' ? body.error : undefined,
    body?.message,
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
}

function extractAssistantContent(body) {
  const content = body?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : null;
}

/**
 * Effective model served, from a successful envelope's top-level model
 * field. Conservative: trim only, case preserved; missing/empty → null
 * (unknown, never a failure signal).
 */
function extractEffectiveModel(body) {
  const raw = body?.model;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolves served-model identity against the requested model. Probe A is
 * primary; Probe B only fills the gap when A is silent. Both naming
 * different models is itself a mismatch (see header); the effective side is
 * then whichever evidences the mismatch against the request (A first — it
 * proves mismatch on its own; B only when A alone cannot), so a mismatch
 * never reports identical requested and effective names. Final fallback is
 * A, keeping the choice deterministic.
 * @returns {{ modelStatus, requestedModel, effectiveModel }} Display names
 *   are bounded; matching always uses full trimmed values, case preserved.
 */
function resolveModelIdentity(requestedModel, modelA, modelB) {
  const requested = String(requestedModel ?? '').trim();
  const build = (effective) => ({
    requestedModel: requested ? toBoundedModelName(requested) : null,
    effectiveModel: effective != null ? toBoundedModelName(effective) : null,
  });
  if (modelA == null && modelB == null) return { modelStatus: 'unknown', ...build(null) };
  if (modelA != null && modelB != null && modelA !== modelB) {
    let effective = modelA;
    if (effective === requested && modelB !== requested) effective = modelB;
    return { modelStatus: 'mismatch', ...build(effective) };
  }
  const effective = modelA ?? modelB;
  return { modelStatus: effective === requested ? 'matched' : 'mismatch', ...build(effective) };
}

function mismatchParams(identity) {
  return { requestedModel: identity.requestedModel, effectiveModel: identity.effectiveModel };
}

/**
 * Structured probe validation under the single runtime parsing policy:
 * AIResponseParser.cleanAIResponse with the JSON_OBJECT contract (fence
 * stripping, boundary extraction, and healer repairs included), then require
 * a non-array object with probe === "ok". Exported for runtime/probe parity
 * testing. No execution context is passed, so no diagnostics, history,
 * stats, sessions, retries, or persistence can occur; unparseable content
 * yields false via the parser's throw path.
 */
export function isValidProbeCompletion(content) {
  if (typeof content !== 'string') return false;
  let parsed;
  try {
    parsed = AIResponseParser.cleanAIResponse(content, ResponseFormat.JSON_OBJECT);
  } catch {
    return false;
  }
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.probe === 'ok';
}

/**
 * Recognizable completion envelope for protocol acceptance: an object
 * without an error envelope whose first choice carries message content.
 * No semantic validation here — malformed JSON content still counts, because
 * accepting the parameter is what proves support.
 */
function hasCompletionEnvelope(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.error != null) return false;
  const content = body?.choices?.[0]?.message?.content;
  return typeof content === 'string' && content.trim().length > 0;
}

/**
 * Explicit model evidence only: a model_not_found code, or a message that
 * names the configured model as missing/unknown/not found. A bare 404 is
 * endpoint ambiguity, never model evidence by itself.
 */
function isExplicitModelEvidence(body, message, model) {
  if (MODEL_MISSING_CODES.has(body?.code) || MODEL_MISSING_CODES.has(body?.error?.code)) return true;
  if (typeof message !== 'string' || message.trim().length === 0) return false;
  const name = String(model ?? '').trim();
  if (!name) return false;
  return message.toLowerCase().includes(name.toLowerCase())
    && MODEL_MISSING_MESSAGE_PATTERN.test(message);
}

function deriveModelsUrl(apiUrl) {
  if (typeof apiUrl !== 'string') return null;
  if (apiUrl.endsWith('/v1/chat/completions')) {
    return apiUrl.replace('/v1/chat/completions', '/v1/models');
  }
  if (apiUrl.endsWith('/chat/completions')) {
    return apiUrl.replace('/chat/completions', '/models');
  }
  return null;
}

/**
 * Optional disambiguation only: refines an unclear model failure, never fails
 * the overall result alone (any problem here returns 'inconclusive').
 */
async function checkModelMembership(modelsUrl, headers, apiModel, signal = null) {
  try {
    const response = await fetchWithCurrentProxy(modelsUrl, { method: 'GET', headers }, signal);
    if (response.status === 401 || response.status === 403) return 'authentication';
    if (!response.ok) return 'inconclusive';
    const payload = await readJsonBody(response);
    const modelIds = Array.isArray(payload?.data)
      && payload.data.every((model) => model && typeof model.id === 'string')
      ? payload.data.map((model) => model.id)
      : null;
    if (!modelIds) return 'inconclusive';
    return modelIds.includes(apiModel) ? 'found' : 'missing';
  } catch {
    return 'inconclusive';
  }
}

function failedResult(state, messageKey, params = null, fallbackStructured = 'unknown', requested = null) {
  const name = String(requested ?? '').trim();
  return {
    fallbackStructured,
    responseFormat: 'unknown',
    usable: false,
    state,
    messageKey,
    params,
    modelStatus: 'unknown',
    requestedModel: name ? toBoundedModelName(name) : null,
    effectiveModel: null,
  };
}

function usableResult(fallbackStructured, responseFormat, messageKey, modelIdentity, params = null) {
  return {
    fallbackStructured,
    responseFormat,
    usable: true,
    state: 'success',
    messageKey,
    params,
    ...modelIdentity,
  };
}

/**
 * Degraded but connected: transport and completion worked, yet no structured
 * path is proven (accepted parameter with contract-failing content, or no
 * usable path on either side). Never presented as fully usable.
 */
function degradedStructuredResult(
  fallbackStructured,
  responseFormat,
  modelIdentity,
  messageKey = 'custom_api_connection_structured_invalid',
  params = null,
) {
  return {
    fallbackStructured,
    responseFormat,
    usable: false,
    state: 'success',
    messageKey,
    params,
    ...modelIdentity,
  };
}

/**
 * Usability when Probe B yields no definitive protocol signal: only a proven
 * Probe A fallback keeps the endpoint usable, with the inconclusive reason.
 * A proven mismatch is still surfaced in the reason and the identity fields.
 */
function inconclusiveResult(fallbackStructured, modelIdentity) {
  if (fallbackStructured === 'supported') {
    if (modelIdentity.modelStatus === 'mismatch') {
      return usableResult(
        fallbackStructured,
        'unknown',
        'custom_api_connection_model_mismatch_inconclusive',
        modelIdentity,
        mismatchParams(modelIdentity),
      );
    }
    return usableResult(
      fallbackStructured,
      'unknown',
      'custom_api_connection_inconclusive',
      modelIdentity,
    );
  }
  if (modelIdentity.modelStatus === 'mismatch') {
    return degradedStructuredResult(
      fallbackStructured,
      'unknown',
      modelIdentity,
      'custom_api_connection_model_mismatch_unusable',
      mismatchParams(modelIdentity),
    );
  }
  return degradedStructuredResult(fallbackStructured, 'unknown', modelIdentity);
}

function modelUnavailableResult(model) {
  return failedResult(
    'model_unavailable',
    'api_test_custom_model_not_found',
    { model: toBoundedModelName(model) },
    'unknown',
    model,
  );
}

/**
 * Dedicated cancellation outcome (deadline expiry or supersession). Distinct
 * from every transport/protocol failure, writes nothing, and carries no
 * AbortError state — only the already-bounded requested model name.
 */
function timedOutResult(requested) {
  return failedResult('timed_out', 'custom_api_connection_timed_out', null, 'unknown', requested);
}

/**
 * Runs the two-probe Test Connection sequence for a snapshotted config.
 * Writes the capability cache only on definitive Probe B outcomes
 * (supported/unsupported with a recognizable envelope or classified
 * rejection); inconclusive results never write, overwrite, or delete.
 * @param {Object} config - Snapshotted { apiUrl, apiModel, apiKey }.
 * @param {AbortSignal} [config.signal] - Optional cancellation signal,
 *   threaded into Probe A, the optional /models lookup, and Probe B.
 *   An aborted check resolves to the dedicated 'timed_out' outcome.
 * @returns {Promise<Object>} Semantic { state, messageKey, params } plus
 *   tri-state fallbackStructured, responseFormat, usable flag, and model
 *   identity (modelStatus matched|mismatch|unknown, requestedModel,
 *   effectiveModel).
 */
export async function probeCustomConnection({ apiUrl, apiModel, apiKey, signal } = {}) {
  const url = String(apiUrl ?? '').trim();
  const model = String(apiModel ?? '').trim();
  const key = firstCustomProbeKey(apiKey);

  if (!url || !model) {
    return failedResult('missing_config', 'api_test_custom_config_missing');
  }

  const headers = buildHeaders(key);

  // Probe A: baseline completion without response_format.
  let probeAResponse;
  try {
    probeAResponse = await fetchWithCurrentProxy(url, {
      method: 'POST',
      headers,
      body: buildChatBody(model, false),
    }, signal);
  } catch (error) {
    if (isProbeAbort(signal)) return timedOutResult(model);
    logger.warn('[Custom] Connection probe unreachable:', error?.message);
    return failedResult('unreachable', 'custom_api_connection_unreachable', null, 'unknown', model);
  }

  if (probeAResponse.status === 401 || probeAResponse.status === 403) {
    return failedResult('auth_failed', 'custom_api_connection_auth_failed', null, 'unknown', model);
  }

  if (!probeAResponse.ok) {
    const body = await readJsonBody(probeAResponse);
    const serverMessage = extractProbeErrorMessage(body);
    // Explicit model evidence decides directly; a bare 404 is endpoint
    // ambiguity and goes through /models disambiguation below.
    if (isExplicitModelEvidence(body, serverMessage, model)) {
      return modelUnavailableResult(model);
    }
    if (Number(probeAResponse.status) === 404) {
      // Never start the disambiguation lookup after cancel.
      if (isProbeAbort(signal)) return timedOutResult(model);
      const modelsUrl = deriveModelsUrl(url);
      const membership = modelsUrl
        ? await checkModelMembership(modelsUrl, headers, model, signal)
        : 'inconclusive';
      // An abort that lands during the lookup is cancellation, not an
      // endpoint failure.
      if (isProbeAbort(signal)) return timedOutResult(model);
      if (membership === 'authentication') {
        return failedResult('auth_failed', 'custom_api_connection_auth_failed', null, 'unknown', model);
      }
      if (membership === 'missing') {
        return modelUnavailableResult(model);
      }
      // 'found' or 'inconclusive': endpoint/request failure, not model evidence.
    } else {
      logger.debug('[Custom] Connection probe request failed:', {
        status: probeAResponse.status,
        serverMessage: toBoundedDetail(serverMessage, null),
      });
    }
    return failedResult(
      'request_failed',
      'custom_api_connection_request_failed',
      { status: probeAResponse.status },
      'unknown',
      model,
    );
  }

  const probeABody = await readJsonBody(probeAResponse);
  const probeAContent = extractAssistantContent(probeABody);
  if (probeABody?.error != null || probeAContent == null || probeAContent.trim().length === 0) {
    // No completion at all: stop before Probe B, capability unproven.
    return failedResult(
      'completion_failed',
      'custom_api_connection_completion_failed',
      null,
      'unknown',
      model,
    );
  }
  // Envelope-ok: record fallback semantic validity, then CONTINUE to Probe B.
  // Primary model evidence comes from this unadorned baseline envelope.
  const fallbackStructured = isValidProbeCompletion(probeAContent) ? 'supported' : 'unsupported';
  const modelA = extractEffectiveModel(probeABody);

  // Probe B: same request with response_format json_object. Protocol
  // classification (responseFormat + cache, always keyed by configured URL +
  // requested model) is independent of structured content validity and of
  // served-model identity; usability requires a proven structured path.
  // Never start Probe B after cancel.
  if (isProbeAbort(signal)) return timedOutResult(model);
  let probeBResponse;
  try {
    probeBResponse = await fetchWithCurrentProxy(url, {
      method: 'POST',
      headers,
      body: buildChatBody(model, true),
    }, signal);
  } catch {
    if (isProbeAbort(signal)) return timedOutResult(model);
    return inconclusiveResult(fallbackStructured, resolveModelIdentity(model, modelA, null));
  }

  if (probeBResponse.ok) {
    const probeBBody = await readJsonBody(probeBResponse);
    if (!hasCompletionEnvelope(probeBBody)) {
      // No protocol evidence: usability follows Probe A alone, no write.
      return inconclusiveResult(fallbackStructured, resolveModelIdentity(model, modelA, null));
    }
    // Gap-fill evidence only: B names the model solely when A was silent.
    const identity = resolveModelIdentity(model, modelA, extractEffectiveModel(probeBBody));
    // Publication race: an abort landing after the body read must not
    // publish a verdict for a cancelled check.
    if (isProbeAbort(signal)) return timedOutResult(model);
    // Protocol acceptance: the cache write is protocol-only, even when the
    // content itself fails the structured contract (validated below without
    // changing responseFormat).
    setCustomResponseFormatSupport(url, model, CUSTOM_RESPONSE_FORMAT_SUPPORT.SUPPORTED);
    if (!isValidProbeCompletion(extractAssistantContent(probeBBody))) {
      // Accepted but contract-failed: never claim fully usable.
      if (identity.modelStatus === 'mismatch') {
        return degradedStructuredResult(
          fallbackStructured,
          'supported',
          identity,
          'custom_api_connection_model_mismatch_unusable',
          mismatchParams(identity),
        );
      }
      return degradedStructuredResult(fallbackStructured, 'supported', identity);
    }
    if (identity.modelStatus === 'mismatch') {
      return usableResult(
        fallbackStructured,
        'supported',
        'custom_api_connection_model_mismatch',
        identity,
        mismatchParams(identity),
      );
    }
    return usableResult(fallbackStructured, 'supported', 'custom_api_connection_success', identity);
  }

  const probeBBody = await readJsonBody(probeBResponse);
  const probeBMessage = extractProbeErrorMessage(probeBBody);
  if (isUnsupportedResponseFormatError({ statusCode: probeBResponse.status, message: probeBMessage })) {
    // Publication race: same guard as the SUPPORTED path — a cancelled check
    // must not publish, even after classification ran.
    if (isProbeAbort(signal)) return timedOutResult(model);
    setCustomResponseFormatSupport(url, model, CUSTOM_RESPONSE_FORMAT_SUPPORT.UNSUPPORTED);
    const identity = resolveModelIdentity(model, modelA, null);
    if (fallbackStructured !== 'supported') {
      if (identity.modelStatus === 'mismatch') {
        return degradedStructuredResult(
          fallbackStructured,
          'unsupported',
          identity,
          'custom_api_connection_model_mismatch_unusable',
          mismatchParams(identity),
        );
      }
      return degradedStructuredResult(fallbackStructured, 'unsupported', identity);
    }
    if (identity.modelStatus === 'mismatch') {
      return usableResult(
        fallbackStructured,
        'unsupported',
        'custom_api_connection_model_mismatch_fallback',
        identity,
        mismatchParams(identity),
      );
    }
    return usableResult(fallbackStructured, 'unsupported', 'custom_api_connection_fallback', identity);
  }

  return inconclusiveResult(fallbackStructured, resolveModelIdentity(model, modelA, null));
}
