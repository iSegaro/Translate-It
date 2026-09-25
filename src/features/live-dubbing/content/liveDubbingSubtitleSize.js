export const LIVE_DUBBING_SUBTITLE_SIZE_PRESETS = Object.freeze({
  small: Object.freeze({
    original: 'clamp(14px, 1.3vw, 17px)',
    translated: 'clamp(18px, 1.7vw, 22px)',
  }),
  medium: Object.freeze({
    original: 'clamp(16px, 1.5vw, 19px)',
    translated: 'clamp(20px, 2vw, 26px)',
  }),
  large: Object.freeze({
    original: 'clamp(18px, 1.7vw, 22px)',
    translated: 'clamp(23px, 2.3vw, 30px)',
  }),
  xlarge: Object.freeze({
    original: 'clamp(20px, 1.9vw, 24px)',
    translated: 'clamp(26px, 2.6vw, 34px)',
  }),
});

export const LIVE_DUBBING_SUBTITLE_SIZE_DEFAULT = 'medium';

export function normalizeLiveDubbingSubtitleSize(value) {
  return Object.prototype.hasOwnProperty.call(LIVE_DUBBING_SUBTITLE_SIZE_PRESETS, value)
    ? value
    : LIVE_DUBBING_SUBTITLE_SIZE_DEFAULT;
}
