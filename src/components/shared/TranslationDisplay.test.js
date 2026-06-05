import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import TranslationDisplay from './TranslationDisplay.vue';
import { SimpleMarkdown } from '@/shared/utils/text/markdown.js';
import { TranslationMode } from '@/shared/config/config.js';

vi.mock('@/composables/shared/useTextDirection.js', () => ({
  useTextDirection: () => ({
    direction: ref('ltr'),
    textAlign: ref('left'),
  }),
}));

vi.mock('@/composables/shared/useFont.js', () => ({
  useFont: () => ({
    fontStyles: ref({}),
    cssVariables: ref({}),
  }),
}));

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => key,
    locale: ref('en'),
  }),
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => ({
    isDarkTheme: false,
  }),
}));

vi.mock('@/features/text-actions/components/ActionToolbar.vue', () => ({
  default: {
    name: 'ActionToolbar',
    template: '<div class="action-toolbar-stub" />',
  },
}));

vi.mock('@/components/base/LoadingSpinner.vue', () => ({
  default: {
    name: 'LoadingSpinner',
    template: '<div class="loading-spinner-stub" />',
  },
}));

describe('TranslationDisplay.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables dictionary label formatting when lastTranslation.mode is dictionary', async () => {
    const renderSpy = vi
      .spyOn(SimpleMarkdown, 'render')
      .mockImplementation(() => {
        const el = document.createElement('div');
        el.className = 'simple-markdown';
        return el;
      });

    mount(TranslationDisplay, {
      props: {
        content: '**UK** : `/ɪkˈspreʃnz/`    **US** : `/ɪkˈspreʃnz/`',
        mode: 'compact',
        lastTranslation: {
          mode: TranslationMode.Dictionary_Translation,
        },
        showToolbar: false,
        enableMarkdown: true,
      },
    });

    expect(renderSpy).toHaveBeenCalledWith(
      '**UK** : `/ɪkˈspreʃnz/`    **US** : `/ɪkˈspreʃnz/`',
      'ltr',
      expect.objectContaining({
        enableLabelFormatting: true,
      }),
    );
  });

  it('keeps label formatting disabled for non-dictionary compact content', async () => {
    const renderSpy = vi
      .spyOn(SimpleMarkdown, 'render')
      .mockImplementation(() => {
        const el = document.createElement('div');
        el.className = 'simple-markdown';
        return el;
      });

    mount(TranslationDisplay, {
      props: {
        content: '**UK** : `/ɪkˈspreʃnz/`    **US** : `/ɪkˈspreʃnz/`',
        mode: 'compact',
        lastTranslation: null,
        showToolbar: false,
        enableMarkdown: true,
      },
    });

    expect(renderSpy).toHaveBeenCalledWith(
      '**UK** : `/ɪkˈspreʃnz/`    **US** : `/ɪkˈspreʃnz/`',
      'ltr',
      expect.objectContaining({
        enableLabelFormatting: false,
      }),
    );
  });
});
