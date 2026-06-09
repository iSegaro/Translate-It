export const LIVE_CAPTION_RUNTIME_STATES = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  DESTROYED: 'destroyed',
  ERROR: 'error'
});

export const LIVE_CAPTION_RUNTIME_STATE_DEFAULT = LIVE_CAPTION_RUNTIME_STATES.IDLE;

export function normalizeLiveCaptionRuntimeState(state) {
  const normalizedState = String(state || LIVE_CAPTION_RUNTIME_STATE_DEFAULT).trim().toLowerCase();

  return Object.values(LIVE_CAPTION_RUNTIME_STATES).includes(normalizedState)
    ? normalizedState
    : LIVE_CAPTION_RUNTIME_STATE_DEFAULT;
}

export default {
  LIVE_CAPTION_RUNTIME_STATES,
  LIVE_CAPTION_RUNTIME_STATE_DEFAULT,
  normalizeLiveCaptionRuntimeState
};
