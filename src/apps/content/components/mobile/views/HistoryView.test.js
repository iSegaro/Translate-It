import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import HistoryView from './HistoryView.vue';

const vajehyabMarkdown = '### سلام [salām]\n*اسم*\n\n---\n\n**معنی**:\nدرود';
const pronunciationMarkdown = [
  '表达方式',
  '',
  '**UK** : `/ɪkˈspreʃnz/`    **US** : `/ɪkˈspreʃnz/`',
  '',
  '- **名词**: 表达方式, 词语, 表情, 算式',
  '- **同义词**: 词汇, 措辞, 呈现',
].join('\n');

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
    mockHistory.historyItems.value = [
      {
        sourceText: 'source text',
        translatedText: vajehyabMarkdown,
        sourceLanguage: 'fa',
        targetLanguage: 'en',
        timestamp: 0,
        mode: 'dictionary',
      },
    ];
  });

  it('renders translated text as sanitized markdown preview while keeping source text plain', async () => {
    const wrapper = mount(HistoryView);
    await flushPromises();

    const sourceText = wrapper.find('.ti-m-source-preview');
    const translatedText = wrapper.find('.ti-m-target-preview');
    expect(sourceText.exists()).toBe(true);
    expect(sourceText.text()).toBe('source text');
    expect(translatedText.exists()).toBe(true);
    expect(translatedText.find('h3').exists()).toBe(true);
    expect(translatedText.find('em').exists()).toBe(true);
    expect(translatedText.html()).toContain('<strong>معنی</strong>');
    expect(translatedText.html()).not.toContain('###');
  });

  it('keeps the pronunciation line inline with bold labels and IPA code in history previews', async () => {
    mockHistory.historyItems.value[0].translatedText = pronunciationMarkdown;

    const wrapper = mount(HistoryView);
    await flushPromises();

    const preview = wrapper.find('.ti-m-target-preview .simple-markdown');
    const paragraphs = preview.findAll('p');

    expect(preview.exists()).toBe(true);
    expect(paragraphs[1].text().replace(/\s+/g, ' ')).toContain('UK : /ɪkˈspreʃnz/ US : /ɪkˈspreʃnz/');
    expect(paragraphs[1].findAll('strong')).toHaveLength(2);
    expect(paragraphs[1].findAll('code')).toHaveLength(2);
    expect(paragraphs[1].html()).toContain('<code>/ɪkˈspreʃnz/</code>');
  });

  it('sanitizes unsafe markdown/html in translated text previews', async () => {
    mockHistory.historyItems.value[0].translatedText = '<img src=x onerror=alert(1)>';

    const wrapper = mount(HistoryView);
    await flushPromises();

    const translatedText = wrapper.find('.ti-m-target-preview');
    expect(translatedText.exists()).toBe(true);
    expect(translatedText.html()).not.toContain('onerror');
    expect(translatedText.html()).not.toContain('alert(1)');
    expect(translatedText.find('img').exists()).toBe(true);
    expect(translatedText.element.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });
});
