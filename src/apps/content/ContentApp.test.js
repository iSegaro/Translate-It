import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('ContentApp transcript preference gate', () => {
  it('does not mount the async transcript renderer when both displays are disabled', () => {
    const source = readFileSync('src/apps/content/ContentApp.vue', 'utf8');

    expect(source).toContain('v-if="isTopFrame && (showTranslatedTranscript || showOriginalTranscript)"');
    expect(source).toContain(':show-translated-transcript="showTranslatedTranscript"');
    expect(source).toContain(':show-original-transcript="showOriginalTranscript"');
  });
});
