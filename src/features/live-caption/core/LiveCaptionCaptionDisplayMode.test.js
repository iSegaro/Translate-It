import { describe, it, expect } from 'vitest';
import {
  LIVE_CAPTION_CAPTION_DISPLAY_MODES,
  LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT,
  normalizeLiveCaptionCaptionDisplayMode,
  resolveLiveCaptionCaptionLineDisplay,
  selectLiveCaptionCaptionLines
} from './LiveCaptionCaptionDisplayMode.js';

describe('live-caption caption display mode', () => {
  it('defaults to translated-only mode', () => {
    expect(LIVE_CAPTION_CAPTION_DISPLAY_MODE_DEFAULT).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY);
    expect(normalizeLiveCaptionCaptionDisplayMode()).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY);
  });

  it('renders translated-only rows by default', () => {
    const display = resolveLiveCaptionCaptionLineDisplay({
      originalText: 'Hello',
      translatedText: 'سلام'
    });

    expect(display.mode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSLATED_ONLY);
    expect(display.rows).toHaveLength(1);
    expect(display.rows[0]).toMatchObject({
      kind: 'translated',
      text: 'سلام'
    });
  });

  it('renders transcript-only rows', () => {
    const display = resolveLiveCaptionCaptionLineDisplay({
      originalText: 'Hello',
      translatedText: 'سلام'
    }, LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSCRIPT_ONLY);

    expect(display.mode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.TRANSCRIPT_ONLY);
    expect(display.rows).toHaveLength(1);
    expect(display.rows[0]).toMatchObject({
      kind: 'original',
      text: 'Hello'
    });
  });

  it('renders bilingual rows', () => {
    const display = resolveLiveCaptionCaptionLineDisplay({
      originalText: 'Hello',
      translatedText: 'سلام'
    }, LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL);

    expect(display.mode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL);
    expect(display.rows).toHaveLength(2);
    expect(display.rows[0]).toMatchObject({
      kind: 'original',
      text: 'Hello'
    });
    expect(display.rows[1]).toMatchObject({
      kind: 'translated',
      text: 'سلام'
    });
  });

  it('maps display mode across caption line collections', () => {
    const lines = selectLiveCaptionCaptionLines([
      {
        originalText: 'Hello',
        translatedText: 'سلام'
      }
    ], LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL);

    expect(lines[0].display.rows).toHaveLength(2);
    expect(lines[0].display.mode).toBe(LIVE_CAPTION_CAPTION_DISPLAY_MODES.BILINGUAL);
  });
});
