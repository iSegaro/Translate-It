/**
 * Stage 1 live-dubbing control-plane constants.
 *
 * Audio transport and provider execution deliberately do not belong here.
 */
export const LIVE_DUBBING_OWNER = 'live-dubbing';
export const LIVE_DUBBING_STORAGE_KEY = '__translateItLiveDubbingSession';

export const LIVE_DUBBING_LEASE_REASONS = Object.freeze([
  'USER_MEDIA',
  'AUDIO_PLAYBACK',
]);

export const LIVE_DUBBING_CAPTURE_STAGES = Object.freeze({
  OFFSCREEN_PREPARE: 'OFFSCREEN_PREPARE',
  GET_MEDIA_STREAM_ID: 'GET_MEDIA_STREAM_ID',
  OFFSCREEN_GET_USER_MEDIA: 'OFFSCREEN_GET_USER_MEDIA',
});

export const LIVE_DUBBING_STORAGE_STATE = Object.freeze({
  ABSENT: 'ABSENT',
  PRESENT: 'PRESENT',
  UNREADABLE: 'UNREADABLE',
});

export const LIVE_DUBBING_STATUS = Object.freeze({
  PREPARING_CAPTURE: 'PREPARING_CAPTURE',
  CAPTURING: 'CAPTURING',
  STOPPING: 'STOPPING',
  ERROR: 'ERROR',
});

export const LIVE_DUBBING_ACTIONS = Object.freeze({
  START: 'START_LIVE_DUBBING',
  STOP: 'STOP_LIVE_DUBBING',
  GET_STATUS: 'GET_LIVE_DUBBING_STATUS',
  START_ALIAS: 'LIVE_DUBBING_START',
  STOP_ALIAS: 'LIVE_DUBBING_STOP',
  GET_STATUS_ALIAS: 'LIVE_DUBBING_GET_STATUS',
  PREPARE: 'LIVE_DUBBING_PREPARE',
  CONSUME: 'LIVE_DUBBING_CONSUME',
  DISPOSE: 'LIVE_DUBBING_DISPOSE',
  STATUS: 'LIVE_DUBBING_STATUS',
  TERMINAL: 'LIVE_DUBBING_TERMINAL',
});

export const LIVE_DUBBING_OFFSCREEN_ACKS = Object.freeze({
  READY: 'READY',
  MEDIA_ACQUIRED: 'MEDIA_ACQUIRED',
  DISPOSED: 'DISPOSED',
});

export const LIVE_DUBBING_DESCRIPTOR_FIELDS = Object.freeze([
  'sessionId',
  'tabId',
  'targetLanguage',
  'status',
  'startedAt',
  'lastError',
  'eventSequence',
]);
