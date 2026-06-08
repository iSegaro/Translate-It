import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import SidepanelHistory from './SidepanelHistory.vue';

const googleMarkdown = '**Noun**: test, experiment';
const pronunciationMarkdown = [
  'Expression',
  '',
  '**UK** : `/ɪkˈspreʃnz/`    **US** : `/ɪkˈspreʃnz/`',
  '',
  '- **Noun**: Expression, phrase, wording',
  '- **Synonyms**: Phrase, wording, statement',
].join('\n');

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
    mockHistory.historyItems.value = [
      {
        sourceText: 'source text',
        translatedText: googleMarkdown,
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        timestamp: 0,
      },
    ];
    mockHistory.sortedHistoryItems.value = [
      {
        sourceText: 'source text',
        translatedText: googleMarkdown,
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        timestamp: 0,
      },
    ];
  });

  it('renders translated text as sanitized markdown preview while keeping source text plain', async () => {
    const wrapper = mount(SidepanelHistory, {
      props: {
        isVisible: true,
      },
    });

    await flushPromises();

    const translatedText = wrapper.find('.translated-text');
    const sourceText = wrapper.find('.source-text');
    expect(translatedText.exists()).toBe(true);
    expect(sourceText.text()).toBe('source text');
    expect(translatedText.find('strong').exists()).toBe(true);
    expect(translatedText.html()).toContain('<strong>Noun</strong>');
    expect(translatedText.html()).not.toContain('**Noun**');
  });

  it('keeps the pronunciation line inline with bold labels and IPA code in history previews', async () => {
    mockHistory.historyItems.value[0].translatedText = pronunciationMarkdown;
    mockHistory.sortedHistoryItems.value[0].translatedText = pronunciationMarkdown;

    const wrapper = mount(SidepanelHistory, {
      props: {
        isVisible: true,
      },
    });

    await flushPromises();

    const preview = wrapper.find('.translated-text .simple-markdown');
    const paragraphs = preview.findAll('p');

    expect(preview.exists()).toBe(true);
    expect(paragraphs[1].text().replace(/\s+/g, ' ')).toContain('UK : /ɪkˈspreʃnz/ US : /ɪkˈspreʃnz/');
    expect(paragraphs[1].findAll('strong')).toHaveLength(2);
    expect(paragraphs[1].findAll('code')).toHaveLength(2);
    expect(paragraphs[1].html()).toContain('<code>/ɪkˈspreʃnz/</code>');
  });

  it('sanitizes unsafe markdown/html in translated text previews', async () => {
    mockHistory.historyItems.value[0].translatedText = '<img src=x onerror=alert(1)>';
    mockHistory.sortedHistoryItems.value[0].translatedText = '<img src=x onerror=alert(1)>';

    const wrapper = mount(SidepanelHistory, {
      props: {
        isVisible: true,
      },
    });

    await flushPromises();

    const translatedText = wrapper.find('.translated-text');
    expect(translatedText.exists()).toBe(true);
    expect(translatedText.html()).not.toContain('onerror');
    expect(translatedText.html()).not.toContain('alert(1)');
    expect(translatedText.find('img').exists()).toBe(true);
    expect(translatedText.element.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });
});
