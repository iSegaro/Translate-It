// Background Google TTS handler
// Optimized for new modular architecture and centralized PROVIDER_CONFIGS

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { initializebrowserAPI } from '@/features/tts/core/useBrowserAPI.js';
import { isChromium } from '@/core/browserHandlers.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ttsStateManager } from '@/features/tts/services/TTSStateManager.js';
import { TTS_ENGINES } from '@/shared/constants/tts.js';
import { PROVIDER_CONFIGS } from '@/features/tts/constants/ttsProviders.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'GoogleTTSHandler');

/**
 * Internal helper to generate Google TTS URL from central config
 */
const buildGoogleTTSUrl = (text, language) => {
  const config = PROVIDER_CONFIGS[TTS_ENGINES.GOOGLE];
  const url = new URL(config.baseUrl);
  url.searchParams.append('ie', config.encoding);
  url.searchParams.append('q', text);
  url.searchParams.append('tl', language);
  url.searchParams.append('client', config.clientParam);
  return url.toString();
};

/**
 * Resolve one Google TTS request. Pending-request identity is registered by
 * handleGoogleTTSSpeak before this async work can yield.
 */
const resolveGoogleTTSSpeak = async ({
  sender,
  text,
  language,
  ttsId,
  previousRequest,
}) => {
  const config = PROVIDER_CONFIGS[TTS_ENGINES.GOOGLE];
  let playbackToken = null;

  try {
    // Interrupt previous request without changing active playback metadata.
    if (previousRequest) {
      await ttsStateManager.notifyTTSEnded('interrupted');
      try { await previousRequest; } catch { /* ignore */ }
    }

    if (!text || !text.trim()) {
      throw new Error('No valid text provided for Google TTS');
    }

    // Validate language support via central config.
    const targetLanguage = language || config.defaultLanguage;
    const isSupported = config.supportedLanguages.has(targetLanguage.split('-')[0].toLowerCase()) || 
                        config.supportedLanguages.has(targetLanguage.toLowerCase());

    if (!isSupported) {
      logger.warn(`[GoogleTTS] Unsupported language: ${targetLanguage}`);
      return {
        success: false,
        error: `Language '${targetLanguage}' is not supported by Google TTS`,
        errorType: 'ERRORS_NOT_SUPPORTED',
        unsupportedLanguage: true
      };
    }
    
    // Text cleaning using central regex.
    let finalText = text.trim()
      .replace(/\*\*(.*?)\*\*/g, '$1') // remove markdown bold
      .replace(/\s+/g, ' ')
      .replace(config.cleaningRegex, '')
      .trim();
    
    if (finalText.length > config.maxTextLength) {
      finalText = finalText.substring(0, config.maxTextLength - 3) + '...';
    }
    
    const ttsUrl = buildGoogleTTSUrl(finalText, targetLanguage);
    
    const isChromiumBrowser = isChromium();
    const browserAPI = await initializebrowserAPI();

    if (isChromiumBrowser) {
      const playbackMetadata = {
        sender,
        ttsId,
        language: targetLanguage,
        text
      };
      playbackToken = await ttsStateManager.acquirePlaybackLease(playbackMetadata);

      const response = await browserAPI.runtime.sendMessage({
        action: MessageActions.PLAY_OFFSCREEN_AUDIO,
        url: ttsUrl,
        playbackToken,
        text: finalText,
        language: targetLanguage,
        target: 'offscreen'
      });

      if (response && response.success === false) {
        throw new Error(response.error || 'Offscreen playback failed');
      }

      if (!await ttsStateManager.commitPlaybackLease(playbackToken, playbackMetadata)) {
        throw new Error('Offscreen playback handoff was superseded');
      }
    } else {
      // Play directly in Firefox using the unified state manager.
      await ttsStateManager.playFirefoxAudio(ttsUrl, {
        sender,
        ttsId,
        language: targetLanguage,
        text
      });
    }

    return { success: true, processedVia: 'google-tts' };
  } catch (error) {
    logger.warn('[GoogleTTS] Request failed:', error);
    await ttsStateManager.failPlaybackHandoff(playbackToken, { error: error.message });
    
    const isUnsupported = error.message?.includes('400') || error.message?.includes('supported source');
    
    return { 
      success: false, 
      error: error.message,
      unsupportedLanguage: isUnsupported
    };
  }
};

/**
 * Handle Google TTS requests.
 * The pending key is independent from active playback metadata so resolving
 * successors cannot overwrite the currently committed request.
 */
export const handleGoogleTTSSpeak = (message, sender, overrideLanguage = null) => {
  const { text, language: originalLanguage } = message?.data || {};
  const language = overrideLanguage || originalLanguage;
  const ttsId = message?.data?.ttsId || null;
  const requestKey = ttsStateManager.createPendingRequestKey({
    engine: TTS_ENGINES.GOOGLE,
    text,
    language,
    ttsId
  });
  const pendingRequest = ttsStateManager.getPendingRequest(requestKey);
  if (pendingRequest) return pendingRequest;

  const previousRequest = ttsStateManager.currentTTSRequest;
  let request;
  request = resolveGoogleTTSSpeak({
    sender,
    text,
    language,
    ttsId,
    previousRequest
  }).finally(() => {
    ttsStateManager.clearPendingRequest(requestKey, request);
  });
  ttsStateManager.setPendingRequest(requestKey, request);
  return request;
};

/**
 * Handle TTS Stop request
 */
export const handleGoogleTTSStopAll = async (message, sender) => {
  try {
    const { ttsId, stopOnlyIfOwner } = message.data || {};
    const isSpecificStop = ttsId && ttsId !== 'all';
    const hasPendingPlayback = Boolean(ttsStateManager.pendingPlaybackToken);
    const pendingPlaybackMetadata = hasPendingPlayback
      ? ttsStateManager.pendingPlaybackMetadata
      : null;

    // Pending handoffs supersede predecessor identity for specific stops.
    if (isSpecificStop) {
      if (hasPendingPlayback) {
        if (pendingPlaybackMetadata?.ttsId !== ttsId) {
          return { success: true, skipped: true };
        }

        if (stopOnlyIfOwner && !ttsStateManager.isCurrentOwner(
          sender,
          pendingPlaybackMetadata?.sender ?? null,
        )) {
          logger.debug('[GoogleTTS] Ignoring stop request: sender is not the owner');
          return { success: true, skipped: true, reason: 'not_owner' };
        }
      } else {
        if (ttsStateManager.currentTTSId !== ttsId) {
          return { success: true, skipped: true };
        }

        if (stopOnlyIfOwner && !ttsStateManager.isCurrentOwner(sender)) {
          logger.debug('[GoogleTTS] Ignoring stop request: sender is not the owner');
          return { success: true, skipped: true, reason: 'not_owner' };
        }
      }
    } else if (stopOnlyIfOwner && !ttsStateManager.isCurrentOwner(
      sender,
      hasPendingPlayback ? pendingPlaybackMetadata?.sender ?? null : undefined,
    )) {
      // Stop-all requests validate pending owner during handoff.
      logger.debug('[GoogleTTS] Ignoring stop request: sender is not the owner');
      return { success: true, skipped: true, reason: 'not_owner' };
    }
    
    await ttsStateManager.stopPlayback();
    
    return { success: true, action: 'stopped' };
  } catch (error) {
    logger.warn('[GoogleTTS] Stop failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Handle TTS End notification from Offscreen
 */
export const handleGoogleTTSEnded = async (message) => {
  try {
    const reason = message?.reason || 'completed';
    const errorData = reason === 'error' && message?.error ? { error: message.error } : null;
    await ttsStateManager.notifyTTSEnded(reason, errorData, message?.playbackToken);
    return { success: true, action: 'cleared' };
  } catch (error) {
    logger.warn('[GoogleTTS] End handling failed:', error);
    return { success: false, error: error.message };
  }
};
