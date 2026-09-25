import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('AppearanceTab live dubbing font preference', () => {
  it('exposes the live dubbing translation-font toggle beside the existing font toggles', () => {
    const source = readFileSync('src/apps/options/tabs/AppearanceTab.vue', 'utf8');

    expect(source).toContain('id="LIVE_DUBBING_USE_TRANSLATION_FONT"');
    expect(source).toContain('v-model="liveDubbingUseTranslationFont"');
    expect(source).toContain("t('live_dubbing_use_translation_font_label')");
    expect(source).toContain("createSetting('LIVE_DUBBING_USE_TRANSLATION_FONT', false)");
    expect(source).toContain('class="ti-translation-font-toggle"');
  });
});
