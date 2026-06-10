import { STT_PROVIDER_ERROR_CODES } from '../stt/BaseSTTProvider.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

/**
 * Maps raw STT/Coordinator errors to user-friendly messages.
 * 
 * @param {Object} error The error object to map
 * @returns {string} A friendly error message
 */
export function getFriendlyLiveCaptionError(error) {
  if (!error) {
    return 'Live Caption transcription failed. Please try again.';
  }

  const code = error.code;
  const type = error.type;

  // OpenAI rate limit / quota
  if (type === ErrorTypes.RATE_LIMIT_REACHED || type === ErrorTypes.QUOTA_EXCEEDED) {
    return 'OpenAI Whisper rate limit or quota reached. Please check your OpenAI API key, billing, or try again later.';
  }

  // Missing API key
  if (code === STT_PROVIDER_ERROR_CODES.MISSING_API_KEY || type === ErrorTypes.API_KEY_MISSING) {
    return 'Live Caption requires an OpenAI API key for Whisper transcription.';
  }

  // Invalid API key
  if (code === STT_PROVIDER_ERROR_CODES.INVALID_API_KEY || type === ErrorTypes.API_KEY_INVALID) {
    return 'Invalid OpenAI API key. Please check your settings.';
  }

  // Invalid audio
  if (code === STT_PROVIDER_ERROR_CODES.INVALID_AUDIO_CHUNK) {
    return 'Live Caption could not process the captured audio.';
  }

  // Retry exhausted or generic transcription failure
  if (code === STT_PROVIDER_ERROR_CODES.RETRY_EXHAUSTED || code === STT_PROVIDER_ERROR_CODES.TRANSCRIPTION_FAILED) {
    return 'Live Caption transcription failed after multiple attempts. Please try again.';
  }

  // Default fallback
  return error.message || 'Live Caption transcription failed. Please try again.';
}

export default {
  getFriendlyLiveCaptionError
};
