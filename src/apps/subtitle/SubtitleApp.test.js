import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactive, ref, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import SubtitleApp from './SubtitleApp.vue';

const { openOptionsPageMock } = vi.hoisted(() => ({
  openOptionsPageMock: vi.fn(),
}));

const { loggerErrorMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
}));

vi.mock('@/core/helpers.js', () => ({
  openOptionsPage: (...args) => openOptionsPageMock(...args),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
      },
      getManifest: vi.fn(() => ({ version: '1.0.0' })),
    },
  },
}));

vi.mock('@/features/subtitle-translation/composables/useSubtitleTranslation.js', () => ({
  useSubtitleTranslation: () => ({
    status: ref('idle'),
    progress: ref({}),
    error: ref(''),
    currentFile: ref(null),
    cues: ref([]),
    startTranslation: vi.fn(),
    cancelTranslation: vi.fn(),
    downloadResult: vi.fn(),
    cleanup: vi.fn(),
  }),
}));

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key, fallback) => fallback ?? key,
  }),
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => reactive({
    settings: {
      THEME: 'light',
      TRANSLATION_API: 'googlev2',
      TARGET_LANGUAGE: 'en',
      DEEPL_BETA_LANGUAGES_ENABLED: false,
    },
    isDarkTheme: false,
    isInitialized: true,
    loadSettings: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/features/translation/providers/ProviderManifest.js', () => ({
  findProviderById: vi.fn(() => ({
    features: ['subtitle'],
  })),
}));

vi.mock('@/features/translation/utils/providerValidator.js', () => ({
  isProviderConfigured: vi.fn(() => true),
}));

vi.mock('@/utils/ui/theme.js', () => ({
  applyTheme: vi.fn(),
}));

vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({
    addEventListener: vi.fn(),
  }),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    error: loggerErrorMock,
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('@/features/subtitle-translation/components/SubtitleFileDropzone.vue', () => ({
  default: {
    emits: ['update:modelValue', 'file-loaded'],
    template: `
      <button
        class="subtitle-dropzone-stub"
        @click="$emit('update:modelValue', { name: 'sample.srt' }); $emit('file-loaded', '1\\n00:00:00,000 --> 00:00:01,000\\nHello')"
      />
    `,
  },
}));

vi.mock('@/features/subtitle-translation/components/SubtitleProgressPanel.vue', () => ({
  default: {
    template: '<div />',
  },
}));

vi.mock('@/features/subtitle-translation/components/SubtitleViewer.vue', () => ({
  default: {
    template: '<div />',
  },
}));

vi.mock('@/components/shared/LanguageSelector.vue', () => ({
  default: {
    template: '<div />',
  },
}));

vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: {
    template: '<div />',
  },
}));

vi.mock('@/apps/options/components/ThemeSelector.vue', () => ({
  default: {
    template: '<div />',
  },
}));

vi.mock('@iconify/vue', () => ({
  Icon: {
    template: '<i />',
  },
}));

describe('SubtitleApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loggerErrorMock.mockReset();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('opens provider settings through the anchor-aware options helper', async () => {
    openOptionsPageMock.mockResolvedValue({ success: true });
    const wrapper = mount(SubtitleApp, {
      attachTo: document.body,
      global: {
        stubs: {
          transition: false,
        },
      },
    });

    await flushPromises();
    await nextTick();

    await wrapper.find('button.subtitle-dropzone-stub').trigger('click');
    await flushPromises();
    await nextTick();

    await wrapper.find('button.settings-link-btn').trigger('click');

    expect(openOptionsPageMock).toHaveBeenCalledTimes(1);
    expect(openOptionsPageMock).toHaveBeenCalledWith('providers');
  });

  it('logs when provider settings opening fails', async () => {
    openOptionsPageMock.mockResolvedValue({ success: false, error: 'failed to open' });
    const wrapper = mount(SubtitleApp, {
      attachTo: document.body,
      global: {
        stubs: {
          transition: false,
        },
      },
    });

    await flushPromises();
    await nextTick();

    await wrapper.find('button.subtitle-dropzone-stub').trigger('click');
    await flushPromises();
    await nextTick();

    await wrapper.find('button.settings-link-btn').trigger('click');

    expect(openOptionsPageMock).toHaveBeenCalledWith('providers');
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to open provider settings:', 'failed to open');
  });
});
