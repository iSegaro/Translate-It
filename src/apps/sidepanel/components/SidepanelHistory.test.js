import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import SidepanelHistory from './SidepanelHistory.vue';

const googleMarkdown = '**Noun**: test, experiment';

const mockHistory = {
  historyItems: ref([
    {
      sourceText: 'source text',
      translatedText: googleMarkdown,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      timestamp: 0,
    },
  ]),
  sortedHistoryItems: ref([
    {
      sourceText: 'source text',
      translatedText: googleMarkdown,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      timestamp: 0,
    },
  ]),
  hasHistory: ref(true),
  isLoading: ref(false),
  historyError: ref(''),
  loadHistory: vi.fn().mockResolvedValue(undefined),
  deleteHistoryItem: vi.fn().mockResolvedValue(undefined),
  clearAllHistory: vi.fn().mockResolvedValue(true),
  exportHistory: vi.fn(),
  formatTime: vi.fn(() => 'Just now'),
  createMarkdownContent: vi.fn(() => '<div class="simple-markdown"><p>ignored</p></div>'),
};

vi.mock('@/features/history/composables/useHistory.js', () => ({
  useHistory: () => mockHistory,
}));

vi.mock('@/composables/ui/useUI.js', () => ({
  useUI: () => ({
    showVisualFeedback: vi.fn(),
  }),
}));

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({
    handleError: vi.fn(),
  }),
}));

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key, fallback) => fallback || key,
  }),
}));

vi.mock('@/composables/shared/useLanguages.js', () => ({
  useLanguages: () => ({
    loadLanguages: vi.fn().mockResolvedValue(undefined),
    getLanguageName: vi.fn((code) => code),
  }),
}));

vi.mock('@/shared/utils/text/textAnalysis.js', () => ({
  shouldApplyRtl: vi.fn(() => false),
}));

vi.mock('@/components/base/BaseDropdown.vue', () => ({
  default: {
    name: 'BaseDropdown',
    setup() {
      const toggle = vi.fn();
      const close = vi.fn();
      return { toggle, close };
    },
    template: `
      <div class="base-dropdown-stub">
        <slot name="trigger" :toggle="toggle" />
        <slot :close="close" />
      </div>
    `,
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('SidepanelHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays translated text as plain truncated text, not rich HTML', async () => {
    const wrapper = mount(SidepanelHistory, {
      props: {
        isVisible: true,
      },
    });

    await flushPromises();

    const translatedText = wrapper.find('.translated-text');
    expect(translatedText.exists()).toBe(true);
    expect(translatedText.text()).toBe(googleMarkdown);
    expect(translatedText.find('strong').exists()).toBe(false);
    expect(translatedText.find('em').exists()).toBe(false);
    expect(translatedText.html()).not.toContain('<strong>');
    expect(translatedText.html()).not.toContain('<em>');
  });
});
