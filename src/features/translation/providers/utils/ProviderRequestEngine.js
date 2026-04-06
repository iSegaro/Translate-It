/**
 * Provider Request Engine - Centralized logic for executing API requests
 * Handles headers, proxy, error normalization, and failover with API keys
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getBrowserInfoSync } from "@/utils/browser/compatibility.js";
import { proxyManager } from "@/shared/proxy/ProxyManager.js";
import { statsManager } from '../../core/TranslationStatsManager.js';
import { ApiKeyManager } from "@/features/translation/providers/ApiKeyManager.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { matchErrorToType } from "@/shared/error-management/ErrorMatcher.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'ProviderRequestEngine');

export const ProviderRequestEngine = {
  /**
   * Internal helper to adapt request headers based on the environment (Browser/Platform)
   */
  prepareHeaders(headers = {}, providerName = "") {
    const info = getBrowserInfoSync();
    const finalHeaders = { ...headers };

    // 1. Remove Chrome-only sensitive headers if not in a Chromium-based browser
    if (info.isFirefox || info.isMobile) {
      delete finalHeaders['Sec-Fetch-Dest'];
      delete finalHeaders['Sec-Fetch-Mode'];
      delete finalHeaders['Sec-Fetch-Site'];
      delete finalHeaders['Sec-Fetch-User'];
      delete finalHeaders['Sec-Fetch-Storage-Access'];
      
      if (info.isFirefox) {
        delete finalHeaders['Referer'];
      }
    }

    // 2. Identity Spoofing for specific providers in non-native environments
    if (providerName === ProviderNames.MICROSOFT_EDGE && (info.isFirefox || info.isMobile)) {
      finalHeaders['User-Agent'] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
    }

    return finalHeaders;
  },

  /**
   * UNIFIED API REQUEST HANDLER
   */
  async executeRequest(provider, { url, fetchOptions, extractResponse, context, abortController, updateApiKey, charCount, originalCharCount, sessionId }) {
    // 1. Determine how many attempts we should make based on available keys
    let availableKeysCount = 1;
    if (provider.providerSettingKey && updateApiKey) {
      try {
        const keys = await ApiKeyManager.getKeys(provider.providerSettingKey);
        availableKeysCount = Math.min(Math.max(1, keys.length), 10);
      } catch (e) {
        logger.warn(`[${provider.providerName}] Failed to count keys for failover:`, e);
      }
    }

    let lastError = null;
    let currentUrl = url;

    for (let attempt = 0; attempt < availableKeysCount; attempt++) {
      try {
        // 2. Perform actual API call
        const result = await this.executeApiCall(provider, { 
          url: currentUrl, 
          fetchOptions, 
          extractResponse, 
          context, 
          abortController,
          sessionId: sessionId || null,
          charCount: charCount !== undefined ? charCount : 0,
          originalCharCount: originalCharCount || 0
        });

        // 3. Success! Promote the working key
        if (attempt > 0 && provider.providerSettingKey) {
          const authHeader = fetchOptions.headers?.Authorization || fetchOptions.headers?.authorization;
          const currentKey = authHeader ? authHeader.replace(/^(Bearer |DeepL-Auth-Key )/i, '') : 
                           (new URL(currentUrl).searchParams.get('key'));
          
          if (currentKey) {
            await ApiKeyManager.promoteKey(provider.providerSettingKey, currentKey);
            logger.info(`[${provider.providerName}] Failover successful on attempt ${attempt + 1}, key promoted.`);
          }
        }

        return result;

      } catch (error) {
        lastError = error;

        const errorType = error.type || matchErrorToType(error);
        if (errorType === ErrorTypes.USER_CANCELLED || errorType === ErrorTypes.TRANSLATION_CANCELLED) {
          throw error;
        }

        // 5. Handle Failover
        if (attempt < availableKeysCount - 1 && ApiKeyManager.shouldFailover(error)) {
          const keys = await ApiKeyManager.getKeys(provider.providerSettingKey);
          if (keys.length > attempt + 1) {
            logger.warn(`[${provider.providerName}] Key error, attempting failover (${attempt + 1}/${availableKeysCount})`);
            const nextKey = keys[attempt + 1];
            await updateApiKey(nextKey, fetchOptions);
            
            if (fetchOptions.url && fetchOptions.url !== currentUrl) {
              currentUrl = fetchOptions.url;
            } else if (provider.providerName === ProviderNames.GEMINI) {
              const urlObj = new URL(currentUrl);
              urlObj.searchParams.set('key', nextKey);
              currentUrl = urlObj.toString();
            }
            continue; 
          }
        }

        if (!error.type) error.type = errorType;
        throw error;
      }
    }
    throw lastError;
  },

  /**
   * Executes a fetch call and normalizes errors
   */
  async executeApiCall(provider, { url, fetchOptions, extractResponse, context, abortController, sessionId, charCount, originalCharCount }) {
    const finalSessionId = sessionId || abortController?.sessionId || null;
    const finalCharCount = charCount || 0;
    const finalOriginalCharCount = originalCharCount || 0;

    const { globalCallId, sessionCallId } = statsManager.recordRequest(provider.providerName, finalSessionId, finalCharCount, finalOriginalCharCount);
    const sessionTag = finalSessionId ? ` [Session: ${finalSessionId}${sessionCallId > 0 ? ` #${sessionCallId}` : ''}]` : '';
    logger.debug(`[Call #${globalCallId}]${sessionTag} executeApiCall starting for context: ${context} (${finalCharCount} chars)`);
    
    const startTime = Date.now();

    try {
      const finalFetchOptions = { ...fetchOptions };
      if (abortController) {
        finalFetchOptions.signal = abortController.signal;
      }

      if (finalFetchOptions.headers) {
        finalFetchOptions.headers = this.prepareHeaders(finalFetchOptions.headers, provider.providerName);
      }

      // Ensure proxy is initialized
      await provider._initializeProxy();

      const response = await proxyManager.fetch(url, finalFetchOptions);
      const duration = Date.now() - startTime;
      logger.debug(`[Call #${globalCallId}] executeApiCall response status: ${response.status} (${duration}ms)`);

      if (!response.ok) {
        statsManager.recordError(provider.providerName, finalSessionId);
        
        let body = {};
        try {
          body = await response.json();
        } catch { /* ignore */ }
        
        const msg = body.detail || body.error?.message || response.statusText || `HTTP ${response.status}`;
        const isDeepL400 = provider.providerName === ProviderNames.DEEPL_TRANSLATE && response.status === 400;
        const isServerError = response.status >= 500 && response.status < 600;
        const logLevel = (isDeepL400 || !isServerError) ? 'warn' : 'error';
        
        let sanitizedUrl = url;
        try {
          const urlObj = new URL(url);
          if (urlObj.searchParams.has('key')) urlObj.searchParams.set('key', '***');
          if (urlObj.searchParams.has('api_key')) urlObj.searchParams.set('api_key', '***');
          sanitizedUrl = urlObj.toString();
        } catch { /* fallback */ }

        logger[logLevel](`[${provider.providerName}] executeApiCall HTTP error (${response.status})`, {
          status: response.status,
          message: msg,
          url: sanitizedUrl,
          ...(isDeepL400 && { errorBody: body })
        });

        const errorType = matchErrorToType({ 
          statusCode: response.status, 
          message: msg, 
          providerType: provider.constructor.type,
          ...body 
        });

        const err = new Error(msg);
        err.type = errorType;
        err.statusCode = response.status;
        err.context = context;
        err.providerName = provider.providerName;
        throw err;
      }

      const contentType = response.headers.get('content-type');
      const isAsyncHandler = extractResponse.constructor.name === 'AsyncFunction';
      const wantsRawResponse = extractResponse.length > 2;

      if (isAsyncHandler || wantsRawResponse) {
        return await extractResponse(response, response.status, response);
      }

      const isJson = contentType && contentType.includes('application/json');
      if (isJson) {
        try {
          const data = await response.json();
          const result = await extractResponse(data, response.status);
          
          if (result === undefined) {
            const err = new Error(ErrorTypes.API_RESPONSE_INVALID);
            err.type = ErrorTypes.API_RESPONSE_INVALID;
            err.statusCode = response.status;
            err.context = context;
            throw err;
          }
          return result;
        } catch (jsonErr) {
          if (jsonErr.type === ErrorTypes.API_RESPONSE_INVALID) throw jsonErr;
          logger.debug(`[${provider.providerName}] Failed to parse JSON even though content-type was JSON`, jsonErr);
        }
      }

      const responseText = await response.text();
      if (!isJson) {
        const err = new Error('API returned non-JSON response.');
        err.type = ErrorTypes.API_RESPONSE_INVALID;
        err.statusCode = response.status;
        err.context = context;
        throw err;
      }

      return await extractResponse(responseText, response.status);
    } catch (err) {
      if (err.name === 'AbortError') {
        const abortErr = new Error('Translation cancelled by user');
        abortErr.type = ErrorTypes.USER_CANCELLED;
        abortErr.context = context;
        throw abortErr;
      }
      
      if (err instanceof TypeError && /NetworkError/.test(err.message)) {
        const networkErr = new Error(err.message);
        networkErr.type = ErrorTypes.NETWORK_ERROR;
        networkErr.context = context;
        throw networkErr;
      }
      throw err;
    }
  }
};
