export const LIVE_CAPTION_CAPTION_DISPLAY_MODES = Object.freeze({
  TRANSLATED_ONLY: 'translated_only',
  TRANSCRIPT_ONLY: 'transcript_only',
  BILINGUAL: 'bilingual'
});

export const LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT = LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY;

function normalizeTextValue(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

export function normalizeLiveCaptionCaptionDisplayMode(mode) {
  const normalizedMode = typeof mode === 'string' ? mode.trim() : '';

  if (Object.values(LIVE_CAPTION_CAPTION_DISPLAY_MODES).includes(normalizedMode)) {
    return normalizedMode;
  }

  return LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT;
}

export function resolveLiveCaptionCaptionLineDisplay(line = {}, displayMode = LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT) {
  const normalizedMode = normalizeLiveCaptionCaptionDisplayMode(displayMode);
  const originalText = normalizeTextValue(line?.originalText);
  const translatedText = normalizeTextValue(line?.translatedText);
  const rows = [];

  if (normalizedMode === LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY) {
    rows.push({
      key: 'translated',
      kind: 'translated',
      label: 'Translated',
      text: translatedText || originalText
    });
  } else if (normalizedMode === LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSCRIPT_ONLY) {
    rows.push({
      key: 'original',
      kind: 'original',
      label: 'Transcript',
      text: originalText || translatedText
    });
  } else if (normalizedMode === LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL) {
    rows.push({
      key: 'original',
      kind: 'original',
      label: 'Transcript',
      text: originalText || translatedText
    });
    rows.push({
      key: 'translated',
      kind: 'translated',
      label: 'Translation',
      text: translatedText || originalText
    });
  }

  return Object.freeze({
    mode: normalizedMode,
    originalText,
    translatedText,
    rows: Object.freeze(
      rows
        .map((row) => Object.freeze(row))
        .filter((row) => row.text !== '')
    )
  });
}

export function selectLiveCaptionCaptionLines(lines = [], displayMode = LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT) {
  if (!Array.isArray(lines)) {
    return [];
  }

  const normalizedMode = normalizeLiveCaptionCaptionDisplayMode(displayMode);
  return lines.map((line) => ({
    ...line,
    display: resolveLiveCaptionCaptionLineDisplay(line, normalizedMode)
  }));
}

export default {
  LIVE_CAPTION_CAPTION_DISPLAY_MODES,
  LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT,
  normalizeLiveCaptionCaptionDisplayMode,
  resolveLiveCaptionCaptionLineDisplay,
  selectLiveCaptionCaptionLines
};
