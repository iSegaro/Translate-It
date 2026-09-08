import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { EdgeTTSClient } from '@/features/tts/services/EdgeTTSClient.js';
import { TTSLanguageService } from '@/features/tts/services/TTSLanguageService.js';
import { isChromium } from '@/core/browserHandlers.js';
import { initializebrowserAPI } from '@/features/tts/core/useBrowserAPI.js';
import { ttsStateManager } from '@/features/tts/services/TTSStateManager.js';
import { TTS_ENGINES } from '@/shared/constants/tts.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'EdgeTTSHandler');

const resolveEdgeTTSSpeak = async ({
  sender,
  text,
  language,
  ttsId,
  preferredVoices,
  previousRequest,
}) => {
  let playbackToken = null;

  try {
    // Interrupt previous request without changing active playback metadata.
    if (previousRequest) {
      await ttsStateManager.notifyTTSEnded('interrupted');
      try { await previousRequest; } catch { /* ignore */ }
    }

    if (!text || !text.trim()) {
      throw new Error('No valid text provided for Edge TTS');
    }

    const voiceName = await TTSLanguageService.getEdgeVoiceForLanguage(language, preferredVoices) || 
                      await TTSLanguageService.getEdgeVoiceForLanguage('en', preferredVoices) || 
                      undefined;

    const audioBlob = await EdgeTTSClient.synthesize(text, voiceName);
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioData = Array.from(new Uint8Array(arrayBuffer));

    const isChromiumBrowser = isChromium();
    const browserAPI = await initializebrowserAPI();

    if (isChromiumBrowser) {
      const playbackMetadata = {
        sender,
        ttsId,
        language,
        text
      };
      playbackToken = await ttsStateManager.acquirePlaybackLease(playbackMetadata);

      // Play via offscreen document.
      const response = await browserAPI.runtime.sendMessage({
        action: 'playCachedAudio',
        audioData,
        playbackToken,
        target: 'offscreen'
      });

      if (response && response.success === false) {
        throw new Error(response.error || 'Offscreen cached playback failed');
      }

      if (!await ttsStateManager.commitPlaybackLease(playbackToken, playbackMetadata)) {
        throw new Error('Offscreen playback handoff was superseded');
      }
    } else {
      // Play directly in Firefox using the unified state manager.
      await ttsStateManager.playFirefoxAudio(audioBlob, {
        sender,
        ttsId,
        language,
        text
      });
    }

    return { success: true, processedVia: 'edge-tts' };
  } catch (error) {
    logger.warn('Edge TTS failed:', error);
    await ttsStateManager.failPlaybackHandoff(playbackToken, { error: error.message });
    return {
      success: false,
      error: error.message || 'Background Edge TTS failed',
      errorType: error.errorType
    };
  }
};

export const handleEdgeTTSSpeak = (message, sender, overrideLanguage = null) => {
  const { text, language: originalLanguage, preferredVoices } = message?.data || {};
  const language = overrideLanguage || originalLanguage;
  const ttsId = message?.data?.ttsId || null;
  const requestKey = ttsStateManager.createPendingRequestKey({
    engine: TTS_ENGINES.EDGE,
    text,
    language,
    ttsId
  });
  const pendingRequest = ttsStateManager.getPendingRequest(requestKey);
  if (pendingRequest) return pendingRequest;

  const previousRequest = ttsStateManager.currentTTSRequest;
  let request;
  request = resolveEdgeTTSSpeak({
    sender,
    text,
    language,
    ttsId,
    preferredVoices,
    previousRequest
  }).finally(() => {
    ttsStateManager.clearPendingRequest(requestKey, request);
  });
  ttsStateManager.setPendingRequest(requestKey, request);
  return request;
};

/**
 * Handle TTS Stop request for Edge TTS
 */
export const handleEdgeTTSStopAll = async (message, sender) => {
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
          logger.debug('[EdgeTTS] Ignoring stop request: sender is not the owner');
          return { success: true, skipped: true, reason: 'not_owner' };
        }
      } else {
        if (ttsStateManager.currentTTSId !== ttsId) {
          return { success: true, skipped: true };
        }

        if (stopOnlyIfOwner && !ttsStateManager.isCurrentOwner(sender)) {
          logger.debug('[EdgeTTS] Ignoring stop request: sender is not the owner');
          return { success: true, skipped: true, reason: 'not_owner' };
        }
      }
    } else if (stopOnlyIfOwner && !ttsStateManager.isCurrentOwner(
      sender,
      hasPendingPlayback ? pendingPlaybackMetadata?.sender ?? null : undefined,
    )) {
      // Stop-all requests validate pending owner during handoff.
      logger.debug('[EdgeTTS] Ignoring stop request: sender is not the owner');
      return { success: true, skipped: true, reason: 'not_owner' };
    }
    
    await ttsStateManager.stopPlayback();
    
    return { success: true, action: 'stopped' };
  } catch (error) {
    logger.warn('[EdgeTTS] Stop failed:', error);
    return { success: false, error: error.message };
  }
};
