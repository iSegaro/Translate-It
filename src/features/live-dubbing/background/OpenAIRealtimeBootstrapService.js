import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import {
  LIVE_DUBBING_OPENAI_PROVIDER_ID,
} from '../constants.js';
import { normalizeProviderTargetLanguage } from '../contracts.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_DUBBING, 'OpenAIRealtimeBootstrapService');

export const OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT =
  'https://api.openai.com/v1/realtime/translations/client_secrets';
export const OPENAI_REALTIME_TRANSLATE_MODEL = 'gpt-realtime-translate';
export const OPENAI_REALTIME_KEYS_SETTING = 'OPENAI_API_KEY';

const KEY_INVALID_CODE_PATTERN = /invalid[_ -]?api[_ -]?key|authentication/i;
const QUOTA_CODE_PATTERN = /insufficient[_ -]?quota|quota|billing[_ -]?hard[_ -]?limit/i;
const RATE_LIMIT_CODE_PATTERN = /rate[_ -]?limit|too[_ -]?many[_ -]?requests/i;

function toEligibleKeys(values) {
  const seen = new Set();
  const eligible = [];
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== 'string') continue;
    const key = value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    eligible.push(key);
  }
  return eligible;
}

function safeText(value, limit) {
  return typeof value === 'string' ? value.slice(0, limit) : null;
}

/**
 * Read only coarse OpenAI error metadata for key failover classification.
 * The response body is never logged, thrown, returned, or included in an
 * error; no provider metadata crosses the bootstrap boundary.
 */
async function readMintErrorMetadata(response) {
  try {
    const body = await response.json();
    const error = body && typeof body === 'object' && !Array.isArray(body) ? body.error : null;
    if (!error || typeof error !== 'object' || Array.isArray(error)) return null;
    return {
      type: safeText(error.type, 80),
      code: safeText(error.code, 80),
      message: safeText(error.message, 200),
    };
  } catch {
    return null;
  }
}

function hasKeyInvalidSignal(metadata) {
  if (!metadata) return false;
  return [metadata.type, metadata.code, metadata.message]
    .some(value => typeof value === 'string' && KEY_INVALID_CODE_PATTERN.test(value));
}

function hasQuotaSignal(metadata) {
  if (!metadata) return false;
  return [metadata.type, metadata.code, metadata.message]
    .some(value => typeof value === 'string' && QUOTA_CODE_PATTERN.test(value));
}

function hasRateLimitSignal(metadata) {
  if (!metadata) return false;
  return [metadata.type, metadata.code, metadata.message]
    .some(value => typeof value === 'string' && RATE_LIMIT_CODE_PATTERN.test(value));
}

/**
 * Map an OpenAI mint failure to the shared key failover taxonomy. Only
 * invalid credentials, quota/billing exhaustion, and rate limiting advance;
 * malformed requests, serving failures, and transport failures stop.
 */
function classifyMintFailure(status, metadata) {
  if (status === 429) {
    return hasQuotaSignal(metadata) ? ErrorTypes.QUOTA_EXCEEDED : ErrorTypes.RATE_LIMIT_REACHED;
  }
  if (status === 401) return ErrorTypes.API_KEY_INVALID;
  if (status === 402) return ErrorTypes.INSUFFICIENT_BALANCE;
  if (Number.isInteger(status) && status >= 500 && status <= 599) return ErrorTypes.SERVER_ERROR;
  if (hasKeyInvalidSignal(metadata)) return ErrorTypes.API_KEY_INVALID;
  if (hasQuotaSignal(metadata)) return ErrorTypes.QUOTA_EXCEEDED;
  if (hasRateLimitSignal(metadata)) return ErrorTypes.RATE_LIMIT_REACHED;
  return ErrorTypes.HTTP_ERROR;
}

function buildMintBody(targetLanguage) {
  return {
    session: {
      model: OPENAI_REALTIME_TRANSLATE_MODEL,
      audio: {
        output: { language: targetLanguage },
      },
    },
  };
}

/**
 * Background-only minter for OpenAI Realtime translation client secrets.
 *
 * Long-lived keys are read through `ApiKeyManager` and used only for the
 * provider request. The documented response `value` is the sole returned
 * bootstrap data; keys, headers, raw bodies, expiry, model, and language
 * metadata never enter logs, errors, storage, descriptors, or UI responses.
 * Failover is mint-time only and follows `ApiKeyManager.shouldFailover`.
 */
export class OpenAIRealtimeBootstrapService {
  constructor(options = {}) {
    this.fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : null;
    this.getKeysImpl = typeof options.getKeysImpl === 'function'
      ? options.getKeysImpl
      : () => ApiKeyManager.getKeys(OPENAI_REALTIME_KEYS_SETTING);
    this.authTokenEndpoint = typeof options.authTokenEndpoint === 'string' && options.authTokenEndpoint
      ? options.authTokenEndpoint
      : OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT;
    this.log = options.logger || logger;
  }

  /**
   * Mint one opaque client secret for the normalized target language.
   * @param {unknown} targetLanguage
   * @returns {Promise<string|null>} The documented response `value`, or null.
   */
  async mintClientSecret(targetLanguage) {
    let normalized;
    try {
      normalized = normalizeProviderTargetLanguage(LIVE_DUBBING_OPENAI_PROVIDER_ID, targetLanguage);
    } catch {
      return null;
    }

    const keys = await this._eligibleKeys();
    if (keys.length === 0) return null;

    for (let index = 0; index < keys.length; index += 1) {
      const outcome = await this._attemptMint(keys[index], normalized);
      if (outcome.ok) return outcome.secret;
      if (!outcome.tryNext) {
        this.log.debug('[OpenAIRealtimeBootstrapService] Client secret mint failed without failover');
        return null;
      }
      this.log.debug('[OpenAIRealtimeBootstrapService] Client secret mint failed, trying next key');
    }
    return null;
  }

  /**
   * Read configured keys in priority order without changing key-manager
   * ordering or persisting failover state.
   * @returns {Promise<string[]>}
   */
  async _eligibleKeys() {
    try {
      return toEligibleKeys(await this.getKeysImpl());
    } catch {
      return [];
    }
  }

  /**
   * One classified mint attempt. It never throws or surfaces provider data.
   * @returns {Promise<{ok: boolean, secret?: string, tryNext?: boolean}>}
   */
  async _attemptMint(apiKey, targetLanguage) {
    let response;
    try {
      response = await this._fetch(this.authTokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildMintBody(targetLanguage)),
      });
    } catch {
      return { ok: false, tryNext: false };
    }

    if (!response || response.ok !== true) {
      const failed = Boolean(response) && response.ok === false;
      return { ok: false, tryNext: failed ? await this._isKeySpecificFailure(response) : false };
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, tryNext: false };
    }

    const secret = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload.value
      : null;
    if (typeof secret !== 'string' || !secret) return { ok: false, tryNext: false };
    return { ok: true, secret };
  }

  async _isKeySpecificFailure(response) {
    const status = Number.isInteger(response?.status) ? response.status : 0;
    const metadata = await readMintErrorMetadata(response);
    return ApiKeyManager.shouldFailover({ type: classifyMintFailure(status, metadata) }) === true;
  }

  /**
   * Production minting uses the existing proxy infrastructure on one path.
   * Proxy, config, and network failures stop the mint without a direct-fetch
   * retry. The existing HTTPS proxy response has no trusted target-forwarding
   * marker or envelope, so 401/429 responses fail closed and do not advance
   * bootstrap keys.
   */
  async _fetch(url, options) {
    if (this.fetchImpl) return this.fetchImpl(url, options);

    const { resolveProxyConfig } = await import('@/shared/proxy/ProxySettings.js');
    const { proxyManager } = await import('@/shared/proxy/ProxyManager.js');
    return proxyManager.fetch(
      url,
      options,
      await resolveProxyConfig(),
    );
  }
}

export const openAIRealtimeBootstrapService = new OpenAIRealtimeBootstrapService();
