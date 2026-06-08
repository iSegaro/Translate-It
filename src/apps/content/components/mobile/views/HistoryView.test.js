import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import HistoryView from './HistoryView.vue';

const vajehyabMarkdown = '### سلام [salām]\n*اسم*\n\n---\n\n**معنی**:\nدرود';

const mockHistory = {
  historyItems: ref([
    {
      sourceText: 'source text',
      translatedText: vajehyabMarkdown,
      sourceLanguage: 'fa',
      targetLanguage: 'en',
      timestamp: 0,
      mode: 'dictionary',
    },
  ]),
  isLoading: ref(false),
  hasHistory: ref(true),
  loadHistory: vi.fn().mockResolvedValue(undefined),
  deleteHistoryItem: vi.fn().mockResolvedValue(undefined),
  clearAllHistory: vi.fn().mockResolvedValue(true),
  exportHistory: vi.fn(),
  formatTime: vi.fn(() => 'Just now'),
};

vi.mock('@/features/history/composables/useHistory.js', () => ({
  useHistory: () => mockHistory,
}));

vi.mock('@/store/modules/mobile.js', () => ({
  useMobileStore: () => ({
    navigate: vi.fn(),
  }),
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => ({
    isDarkTheme: false,
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

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('HistoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays translated text as plain truncated text, not rich HTML', async () => {
    const wrapper = mount(HistoryView);
    await flushPromises();

    const translatedText = wrapper.find('.ti-m-target-preview');
    expect(translatedText.exists()).toBe(true);
    expect(translatedText.text()).toBe('### سلام [salām]');
    expect(translatedText.find('strong').exists()).toBe(false);
    expect(translatedText.find('em').exists()).toBe(false);
    expect(translatedText.html()).not.toContain('<strong>');
    expect(translatedText.html()).not.toContain('<em>');
  });
});
