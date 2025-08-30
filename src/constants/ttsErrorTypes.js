// TTS Error Types Constants
// These constants provide standardized error classification for consistent handling across the TTS system

export const ERROR_TYPES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUDIO_CONTEXT_ERROR: 'AUDIO_CONTEXT_ERROR', 
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INVALID_TEXT: 'INVALID_TEXT',
  LANGUAGE_NOT_SUPPORTED: 'LANGUAGE_NOT_SUPPORTED',
  PLAYBACK_FAILED: 'PLAYBACK_FAILED',
  OFFSCREEN_ERROR: 'OFFSCREEN_ERROR'
};

export const ERROR_MESSAGES = {
  [ERROR_TYPES.NETWORK_ERROR]: 'Network connection failed',
  [ERROR_TYPES.AUDIO_CONTEXT_ERROR]: 'Audio system error',
  [ERROR_TYPES.PERMISSION_DENIED]: 'Audio permission denied',
  [ERROR_TYPES.TIMEOUT_ERROR]: 'Request timed out',
  [ERROR_TYPES.SERVICE_UNAVAILABLE]: 'TTS service unavailable',
  [ERROR_TYPES.INVALID_TEXT]: 'Invalid text provided',
  [ERROR_TYPES.LANGUAGE_NOT_SUPPORTED]: 'Language not supported',
  [ERROR_TYPES.PLAYBACK_FAILED]: 'Audio playback failed',
  [ERROR_TYPES.OFFSCREEN_ERROR]: 'Offscreen document error'
};

// Recovery strategies for different error types
export const RECOVERY_STRATEGIES = {
  [ERROR_TYPES.NETWORK_ERROR]: { 
    canRetry: true, 
    retryDelay: 1000,
    maxRetries: 2,
    userAction: 'Check your internet connection'
  },
  [ERROR_TYPES.AUDIO_CONTEXT_ERROR]: { 
    canRetry: true, 
    retryDelay: 500,
    maxRetries: 1,
    userAction: 'Try again - audio system may need to restart'
  },
  [ERROR_TYPES.PERMISSION_DENIED]: { 
    canRetry: false,
    retryDelay: 0,
    maxRetries: 0,
    userAction: 'Please allow audio permissions in your browser'
  },
  [ERROR_TYPES.TIMEOUT_ERROR]: { 
    canRetry: true,
    retryDelay: 2000,
    maxRetries: 1,
    userAction: 'Request timed out - try again'
  },
  [ERROR_TYPES.SERVICE_UNAVAILABLE]: { 
    canRetry: true,
    retryDelay: 3000,
    maxRetries: 2,
    userAction: 'TTS service temporarily unavailable'
  },
  [ERROR_TYPES.INVALID_TEXT]: { 
    canRetry: false,
    retryDelay: 0,
    maxRetries: 0,
    userAction: 'Please provide valid text to speak'
  },
  [ERROR_TYPES.LANGUAGE_NOT_SUPPORTED]: { 
    canRetry: true,
    retryDelay: 0,
    maxRetries: 1,
    userAction: 'Language not supported - trying English fallback'
  },
  [ERROR_TYPES.PLAYBACK_FAILED]: { 
    canRetry: true,
    retryDelay: 1000,
    maxRetries: 1,
    userAction: 'Audio playback failed - try again'
  },
  [ERROR_TYPES.OFFSCREEN_ERROR]: { 
    canRetry: true,
    retryDelay: 1500,
    maxRetries: 1,
    userAction: 'Background audio system error'
  }
};