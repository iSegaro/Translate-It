import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getApiKeyAsync } from '@/shared/config/config.js';
import {
  GEMINI_LIVE_AUTH_TOKEN_ENDPOINT,
  GEMINI_LIVE_MODEL,
} from '../providers/GeminiLiveProviderAdapter.js';
import { LIVE_DUBBING_PROVIDER_ID } from '../constants.js';
import { normalizeProviderTargetLanguage } from '../contracts.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_DUBBING, 'GeminiLiveBootstrapService');
const GEMINI_KEYS_SETTING = 'GEMINI_API_KEY';
const KEY_INVALID_MESSAGE_PATTERN = /api[ -_]?key[^a-z0-9]{0,24}(not valid|invalid|expired|unauthorized)|invalid[^a-z0-9]{0,24}api[ -_]?key/i;
const PERMISSION_DENIED_MESSAGE_PATTERN = /permission[ -_]?denied/i;
const QUOTA_MESSAGE_PATTERN = /quota|resource[^a-z0-9]{0,24}exhausted|exhausted/i;
const RATE_LIMIT_MESSAGE_PATTERN = /rate[ -_]?limit|too many requests/i;

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
 * Best-effort read of Google error metadata for failover classification only.
 * Bodies are never logged, thrown, or returned; only the coarse reason/status
 * signals below leave this function.
 */
async function readMintErrorMetadata(response) {
  try {
    const body = await response.json();
    const error = body && typeof body === 'object' && !Array.isArray(body) ? body.error : null;
    if (!error || typeof error !== 'object' || Array.isArray(error)) return null;
    const reasons = [];
    const details = Array.isArray(error.details) ? error.details.slice(0, 8) : [];
    for (const detail of details) {
      const reason = detail && typeof detail === 'object' ? safeText(detail.reason, 80) : null;
      if (reason) reasons.push(reason);
    }
    return {
      status: safeText(error.status, 80),
      message: safeText(error.message, 200),
      reasons,
    };
  } catch {
    return null;
  }
}

function hasKeyInvalidSignal(metadata) {
  if (!metadata) return false;
  if (metadata.status === 'UNAUTHENTICATED') return true;
  if (metadata.reasons.includes('API_KEY_INVALID')) return true;
  return typeof metadata.message === 'string' && KEY_INVALID_MESSAGE_PATTERN.test(metadata.message);
}

function hasPermissionDeniedSignal(metadata) {
  if (!metadata) return false;
  if (metadata.status === 'PERMISSION_DENIED') return true;
  if (metadata.reasons.includes('PERMISSION_DENIED')) return true;
  return typeof metadata.message === 'string' && PERMISSION_DENIED_MESSAGE_PATTERN.test(metadata.message);
}

function hasQuotaSignal(metadata) {
  if (!metadata) return false;
  if (metadata.reasons.includes('QUOTA_EXCEEDED')) return true;
  return typeof metadata.message === 'string' && QUOTA_MESSAGE_PATTERN.test(metadata.message);
}

function hasRateLimitSignal(metadata) {
  if (!metadata) return false;
  if (metadata.reasons.includes('RATE_LIMIT_EXCEEDED')) return true;
  if (metadata.status === 'RESOURCE_EXHAUSTED') return true;
  return typeof metadata.message === 'string' && RATE_LIMIT_MESSAGE_PATTERN.test(metadata.message);
}

/**
 * Map a mint failure to the shared translation error taxonomy so the next-key
 * decision reuses `ApiKeyManager.shouldFailover` semantics: invalid or
 * unauthorized key (including explicit PERMISSION_DENIED metadata),
 * balance/quota exhaustion, and rate limiting advance; serving, transport,
 * and request-shape failures stop.
 */
function classifyMintFailure(status, metadata) {
  if (status === 429) {
    return hasQuotaSignal(metadata) ? ErrorTypes.QUOTA_EXCEEDED : ErrorTypes.RATE_LIMIT_REACHED;
  }
  if (status === 401) return ErrorTypes.API_KEY_INVALID;
  if (status === 402) return ErrorTypes.INSUFFICIENT_BALANCE;
  if (Number.isInteger(status) && status >= 500 && status <= 599) return ErrorTypes.SERVER_ERROR;
  if (hasKeyInvalidSignal(metadata)) return ErrorTypes.API_KEY_INVALID;
  if (hasPermissionDeniedSignal(metadata)) return ErrorTypes.API_KEY_INVALID;
  if (hasQuotaSignal(metadata)) return ErrorTypes.QUOTA_EXCEEDED;
  if (hasRateLimitSignal(metadata)) return ErrorTypes.RATE_LIMIT_REACHED;
  return ErrorTypes.HTTP_ERROR;
}

function buildMintBody(targetLanguage) {
  return {
    uses: 1,
    liveConnectConstraints: {
      model: GEMINI_LIVE_MODEL,
      config: {
        responseModalities: ['AUDIO'],
        translationConfig: {
          targetLanguageCode: targetLanguage,
          echoTargetLanguage: false,
        },
      },
    },
  };
}

/**
 * Background-only minter for constrained, single-use Gemini Live tokens.
 *
 * Long-lived API keys are read via the existing key facilities and used here
 * to call the `auth_tokens` endpoint; only the ephemeral `name` token is ever
 * returned. Keys and tokens never enter logs, errors, storage, or descriptors.
 *
 * Failover is mint-time only with classified advance: the next key is tried
 * only for key/project-plausible failures (invalid key, quota exhaustion,
 * rate limiting, per `ApiKeyManager.shouldFailover`); network/proxy, serving
 * (5xx), malformed payload, and request-shape failures stop with no next key.
 * There is no running-session failover or reconnect, and text-translation
 * failover state (key ordering/promotion) is never mutated.
 */
export class GeminiLiveBootstrapService {
  constructor(options = {}) {
    this.fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : null;
    this.getKeysImpl = typeof options.getKeysImpl === 'function'
      ? options.getKeysImpl
      : () => ApiKeyManager.getKeys(GEMINI_KEYS_SETTING);
    this.getLegacyKeyImpl = typeof options.getLegacyKeyImpl === 'function'
      ? options.getLegacyKeyImpl
      : () => getApiKeyAsync();
    this.authTokenEndpoint = typeof options.authTokenEndpoint === 'string' && options.authTokenEndpoint
      ? options.authTokenEndpoint
      : GEMINI_LIVE_AUTH_TOKEN_ENDPOINT;
    this.log = options.logger || logger;
  }

  /**
   * Mint one ephemeral token for the normalized target language.
   * @param {unknown} targetLanguage
   * @returns {Promise<string|null>} The token `name`, or null when unavailable.
   */
  async mintEphemeralToken(targetLanguage) {
    let normalized;
    try {
      normalized = normalizeProviderTargetLanguage(LIVE_DUBBING_PROVIDER_ID, targetLanguage);
    } catch {
      return null;
    }

    const keys = await this._eligibleKeys();
    if (keys.length === 0) return null;

    for (let index = 0; index < keys.length; index += 1) {
      const outcome = await this._attemptMint(keys[index], normalized);
      if (outcome.ok) return outcome.token;
      if (!outcome.tryNext) {
        this.log.debug('[GeminiLiveBootstrapService] Ephemeral mint failed without failover');
        return null;
      }
      this.log.debug('[GeminiLiveBootstrapService] Ephemeral mint failed, trying next key');
    }
    return null;
  }

  /**
   * Configured keys in priority order: the stored multi-key list first, with
   * the legacy single key as a fallback only when that list is empty. This
   * preserves the previous primary-or-legacy policy without reordering it.
   * @returns {Promise<string[]>}
   */
  async _eligibleKeys() {
    try {
      const primary = toEligibleKeys(await this.getKeysImpl());
      if (primary.length > 0) return primary;
    } catch {
      // A key-store read failure still allows the legacy fallback below.
    }

    try {
      const legacy = await this.getLegacyKeyImpl();
      return toEligibleKeys(
        typeof legacy === 'string' ? ApiKeyManager.parseKeys(legacy) : legacy,
      );
    } catch {
      return [];
    }
  }

  /**
   * One classified mint attempt. Transport throws, malformed success
   * payloads, and non-key failures resolve to stop; only key/project-plausible
   * failures resolve to try the next key. Never throws and never surfaces
   * keys, tokens, or provider bodies.
   * @returns {Promise<{ok: boolean, token?: string, tryNext?: boolean}>}
   */
  async _attemptMint(apiKey, targetLanguage) {
    let response;
    try {
      response = await this._fetch(this.authTokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
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

    const token = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload.name
      : null;
    if (typeof token !== 'string' || !token) {
      return { ok: false, tryNext: false };
    }
    return { ok: true, token };
  }

  async _isKeySpecificFailure(response) {
    const status = Number.isInteger(response?.status) ? response.status : 0;
    const metadata = await readMintErrorMetadata(response);
    return ApiKeyManager.shouldFailover({ type: classifyMintFailure(status, metadata) }) === true;
  }

  /**
   * Production minting goes through the existing proxy infrastructure on a
   * single path. Proxy, config, and network failures reject here and stop the
   * mint; there is deliberately no silent direct `fetch` retry.
   */
  async _fetch(url, options) {
    if (this.fetchImpl) return this.fetchImpl(url, options);

    const { resolveProxyConfig } = await import('@/shared/proxy/ProxySettings.js');
    const { proxyManager } = await import('@/shared/proxy/ProxyManager.js');
    return proxyManager.fetch(url, options, await resolveProxyConfig());
  }
}

export const geminiLiveBootstrapService = new GeminiLiveBootstrapService();
