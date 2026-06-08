import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { useHistory } from './useHistory.js';

const googleMarkdown = '**Noun**: test, experiment';
const vajehyabMarkdown = '### سلام [salām]\n*اسم*\n\n---\n\n**معنی**:\nدرود';

const { storageManagerMock, settingsStoreMock, utilsFactoryMock, loggerMock } = vi.hoisted(() => ({
  storageManagerMock: {
    get: vi.fn(),
    set: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  settingsStoreMock: {
    settings: {
      translationHistory: [],
    },
  },
  utilsFactoryMock: {
    getI18nUtils: vi.fn(),
  },
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => settingsStoreMock,
}));

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: utilsFactoryMock,
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: storageManagerMock,
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => loggerMock,
}));

describe('useHistory', () => {
  let wrapper;
  let composable;
  let lastBlob;

  const mountHarness = () => {
    const Harness = defineComponent({
      setup() {
        composable = useHistory();
        return () => h('div');
      },
    });

    wrapper = mount(Harness);
    return wrapper;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(0);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:history');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('Blob', class TestBlob {
      constructor(parts, options) {
        lastBlob = { parts, options };
      }
    });

    lastBlob = null;
    storageManagerMock.get.mockResolvedValue({ translationHistory: [] });
    storageManagerMock.set.mockResolvedValue(undefined);
    storageManagerMock.on.mockReturnValue(undefined);
    storageManagerMock.off.mockReturnValue(undefined);
    utilsFactoryMock.getI18nUtils.mockResolvedValue({
      getTranslationString: vi.fn().mockResolvedValue('Are you sure you want to clear all translation history?'),
    });
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
      wrapper = null;
    }

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves raw markdown-rich entries when loading history', async () => {
    const loadedHistory = [
      {
        sourceText: 'source one',
        translatedText: googleMarkdown,
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        mode: 'dictionary',
        timestamp: 0,
      },
      {
        sourceText: 'source two',
        translatedText: vajehyabMarkdown,
        sourceLanguage: 'fa',
        targetLanguage: 'en',
        mode: 'dictionary',
        timestamp: 1,
      },
    ];

    storageManagerMock.get.mockResolvedValue({ translationHistory: loadedHistory });

    mountHarness();
    await flushPromises();
    await flushPromises();

    expect(composable.historyItems.value).toEqual(loadedHistory);
    expect(composable.historyItems.value[0].translatedText).toBe(googleMarkdown);
    expect(composable.historyItems.value[1].translatedText).toBe(vajehyabMarkdown);
  });

  it('preserves raw markdown-rich entries when saving history', async () => {
    mountHarness();
    await flushPromises();
    await composable.loadHistory(true);

    await composable.addToHistory({
      sourceText: 'source one',
      translatedText: googleMarkdown,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      mode: 'dictionary',
    });

    await composable.addToHistory({
      sourceText: 'source two',
      translatedText: vajehyabMarkdown,
      sourceLanguage: 'fa',
      targetLanguage: 'en',
      mode: 'dictionary',
    });

    const persistedHistory = storageManagerMock.set.mock.calls.at(-1)[0].translationHistory;

    expect(persistedHistory[0].translatedText).toBe(vajehyabMarkdown);
    expect(persistedHistory[1].translatedText).toBe(googleMarkdown);
  });

  it('exports json_raw with markdown markers preserved', async () => {
    mountHarness();
    await flushPromises();
    await composable.loadHistory(true);

    await composable.addToHistory({
      sourceText: 'source text',
      translatedText: googleMarkdown,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      mode: 'dictionary',
    });

    composable.exportHistory('json_raw');

    expect(lastBlob.parts[0]).toBe(JSON.stringify([
      {
        sourceText: 'source text',
        translatedText: googleMarkdown,
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        mode: 'dictionary',
        timestamp: 0,
      },
    ], null, 2));
  });

  it('exports json_clean with markdown markers stripped', async () => {
    mountHarness();
    await flushPromises();
    await composable.loadHistory(true);

    await composable.addToHistory({
      sourceText: 'source text',
      translatedText: googleMarkdown,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      mode: 'dictionary',
    });

    composable.exportHistory('json_clean');

    expect(lastBlob.parts[0]).toBe(JSON.stringify([
      {
        sourceText: 'source text',
        translatedText: 'Noun: test, experiment',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        mode: 'dictionary',
        timestamp: 0,
      },
    ], null, 2));
  });

  it('exports csv with markdown markers stripped', async () => {
    mountHarness();
    await flushPromises();
    await composable.loadHistory(true);

    await composable.addToHistory({
      sourceText: 'source text',
      translatedText: googleMarkdown,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      mode: 'dictionary',
    });

    composable.exportHistory('csv');

    expect(lastBlob.parts[0]).toBe([
      'Source Text,Translated Text,Source Language,Target Language,Timestamp',
      '"source text","Noun: test, experiment","en","fa","1970-01-01T00:00:00.000Z"',
    ].join('\n'));
  });

  it('exports anki with markdown markers stripped', async () => {
    mountHarness();
    await flushPromises();
    await composable.loadHistory(true);

    await composable.addToHistory({
      sourceText: 'source text',
      translatedText: googleMarkdown,
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      mode: 'dictionary',
    });

    composable.exportHistory('anki');

    expect(lastBlob.parts[0]).toBe('source text\tNoun: test, experiment');
  });
});
