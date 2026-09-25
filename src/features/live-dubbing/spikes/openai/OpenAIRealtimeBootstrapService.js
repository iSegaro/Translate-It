import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js';
import { normalizeSpikeTargetLanguage } from './spikeTargetLanguage.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_DUBBING, 'OpenAIRealtimeBootstrapService(SPIKE)');

/** Verbatim mint endpoint for the Phase D feasibility spike. Background-only. */
export const OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT =
  'https://api.openai.com/v1/realtime/translations/client_secrets';
/** Fixed session model required by the spike mint body. */
export const OPENAI_REALTIME_TRANSLATE_MODEL = 'gpt-realtime-translate';
/** Fixed input transcription model required by the spike mint body. */
export const OPENAI_REALTIME_WHISPER_MODEL = 'gpt-realtime-whisper';
/** Existing storage setting reused for keys. No new storage is introduced. */
export const OPENAI_REALTIME_SPIKE_KEYS_SETTING = 'OPENAI_API_KEY';
/** Minted secrets arrive with this prefix; used only for a coarse shape check. */
export const OPENAI_REALTIME_SPIKE_SECRET_PREFIX = 'ek_';

function buildMintBody(targetLanguage) {
  return {
    expires_after: { anchor: 'created_at', seconds: 600 },
    session: {
      model: OPENAI_REALTIME_TRANSLATE_MODEL,
      audio: {
        input: {
          transcription: { model: OPENAI_REALTIME_WHISPER_MODEL },
          noise_reduction: null,
        },
        output: { language: targetLanguage },
      },
    },
  };
}

function safeExpiresAt(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Background-only minter for OpenAI Realtime translation client secrets.
 *
 * SPIKE ONLY. Reads the existing `OPENAI_API_KEY` list via `ApiKeyManager`
 * and mints exactly one client secret per call. Single-key reuse: only the
 * first eligible key is ever used and no rotation/failover system exists;
 * any failure resolves to null. Only the secret `value` is extracted from
 * the mint response; the scalar `expires_at` may be reported as a
 * diagnostic, and the secret itself is never persisted, logged, or thrown.
 */
export class OpenAIRealtimeBootstrapService {
  constructor(options = {}) {
    this.fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : null;
    this.getKeysImpl = typeof options.getKeysImpl === 'function'
      ? options.getKeysImpl
      : () => ApiKeyManager.getKeys(OPENAI_REALTIME_SPIKE_KEYS_SETTING);
    this.log = options.logger || logger;
  }

  /**
   * Mint one secret-only bootstrap for the target language.
   * @param {unknown} targetLanguage
   * @returns {Promise<{secret: string, targetLanguage: string, model: string, expiresAt: number|null}|null>}
   */
  async mintClientSecret(targetLanguage) {
    const normalized = normalizeSpikeTargetLanguage(targetLanguage);
    if (!normalized) return null;

    const apiKey = await this._readPrimaryKey();
    if (!apiKey) return null;

    let response;
    try {
      response = await this._fetch(OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildMintBody(normalized)),
      });
    } catch {
      return null;
    }

    if (!response || response.ok !== true) return null;

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      return null;
    }

    const secret = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload.value
      : null;
    if (typeof secret !== 'string' || !secret) return null;

    return {
      secret,
      targetLanguage: normalized,
      model: OPENAI_REALTIME_TRANSLATE_MODEL,
      expiresAt: safeExpiresAt(payload.expires_at),
    };
  }

  /**
   * Single-key reuse: the first eligible key wins. There is deliberately no
   * legacy fallback, promotion, or next-key rotation in the spike.
   * @returns {Promise<string|null>}
   */
  async _readPrimaryKey() {
    try {
      const keys = await this.getKeysImpl();
      if (!Array.isArray(keys)) return null;
      for (const key of keys) {
        if (typeof key === 'string' && key.trim()) return key.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Spike minting goes through the existing proxy infrastructure on a single
   * path, mirroring `GeminiLiveBootstrapService._fetch`. Proxy, config, and
   * network failures reject here and resolve the mint to null; there is
   * deliberately no silent direct `fetch` retry.
   */
  async _fetch(url, options) {
    if (this.fetchImpl) return this.fetchImpl(url, options);

    const { resolveProxyConfig } = await import('@/shared/proxy/ProxySettings.js');
    const { proxyManager } = await import('@/shared/proxy/ProxyManager.js');
    return proxyManager.fetch(url, options, await resolveProxyConfig());
  }
}

export const openAIRealtimeBootstrapService = new OpenAIRealtimeBootstrapService();
