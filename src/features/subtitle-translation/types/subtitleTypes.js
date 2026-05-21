/**
 * Subtitle Translation Types and Constants
 */

/**
 * Possible statuses for a subtitle cue during translation
 */
export const CueStatus = {
  PENDING: 'pending',
  TRANSLATING: 'translating',
  TRANSLATED: 'translated',
  SKIPPED: 'skipped',
  RECOVERED: 'recovered',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Supported subtitle formats
 */
export const SubtitleFormat = {
  SRT: 'srt',
  VTT: 'vtt',
  ASS: 'ass'
};

/**
 * Job status for the overall subtitle translation process
 */
export const SubtitleJobStatus = {
  IDLE: 'idle',
  PARSING: 'parsing',
  VALIDATING: 'validating',
  PLANNING: 'planning',
  TRANSLATING: 'translating',
  RATE_LIMITED_WAITING: 'rate_limited_waiting',
  PAUSED: 'paused',
  RECONNECTING: 'reconnecting',
  RETRYING_BATCH: 'retrying_batch',
  RECOVERING_BATCH: 'recovering_batch',
  COMPLETED: 'completed',
  COMPLETED_WITH_WARNINGS: 'completed_with_warnings',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
};

/**
 * Validation severity levels
 */
export const ValidationSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  RECOVERABLE_ERROR: 'recoverable-error',
  FATAL_ERROR: 'fatal-error'
};
