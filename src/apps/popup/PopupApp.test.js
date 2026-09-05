import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PopupApp from './PopupApp.vue'

let mockSettingsStore
let mockUnifiedTranslation
let mockLanguageDefaults
const useUnifiedTranslationMock = vi.hoisted(() => vi.fn())

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => mockSettingsStore
}))

vi.mock('@/features/translation/composables/useUnifiedTranslation.js', () => ({
  useUnifiedTranslation: (...args) => {
    useUnifiedTranslationMock(...args)
    return mockUnifiedTranslation
  }
}))

vi.mock('@/features/settings/composables/useLanguageDefaults.js', () => ({
  useLanguageDefaults: () => mockLanguageDefaults
}))

vi.mock('@/shared/messaging/composables/useMessaging.js', () => ({
  useMessaging: () => ({
    sendMessage: vi.fn()
  })
}))

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({
    handleError: vi.fn().mockResolvedValue(undefined)
  })
}))

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key, fallback) => fallback || key
  })
}))

vi.mock('@/features/tts/core/TTSGlobalManager.js', () => ({
  useTTSGlobal: () => ({
    register: vi.fn(),
    unregister: vi.fn()
  })
}))

vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({
    trackTimeout: vi.fn(),
    addEventListener: vi.fn()
  })
}))

vi.mock('@/composables/shared/useFont.js', () => ({
  useGlobalFont: () => ({
    applyGlobalCSSVariables: vi.fn()
  })
}))

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: {
    getUIUtils: vi.fn().mockResolvedValue({
      applyTheme: vi.fn().mockResolvedValue(undefined)
    })
  }
}))

vi.mock('@/composables/shared/useLanguages.js', () => ({
  preloadLanguages: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('@/components/base/LoadingSpinner.vue', () => ({
  default: {
    name: 'LoadingSpinner',
    template: '<div class="loading-spinner-stub" />'
  }
}))

vi.mock('@/components/popup/PopupHeader.vue', () => ({
  default: {
    name: 'PopupHeader',
    props: ['targetLanguage', 'provider'],
    template: '<div class="popup-header-stub" />'
  }
}))

vi.mock('@/components/shared/LanguageSelector.vue', () => ({
  default: {
    name: 'LanguageSelector',
    props: [
      'sourceLanguage',
      'targetLanguage',
      'provider',
      'lastKeyword',
      'beta',
      'showDefaultActions',
      'defaultActionsEnabled',
      'sourceIsSavedDefault',
      'targetIsSavedDefault',
      'sourceDefaultTitle',
      'targetDefaultTitle',
      'sourceTitle',
      'targetTitle',
      'swapTitle',
      'swapAlt',
      'autoDetectLabel'
    ],
    emits: ['set-default-source', 'set-default-target', 'update:sourceLanguage', 'update:targetLanguage'],
    template: '<div class="language-selector-stub" />'
  }
}))

vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: {
    name: 'ProviderSelector',
    template: '<div class="provider-selector-stub" />'
  }
}))

vi.mock('@/components/popup/TranslationForm.vue', () => ({
  default: {
    name: 'TranslationForm',
    props: ['sourceLanguage', 'targetLanguage', 'provider', 'translation'],
    template: '<div class="translation-form-stub" />'
  }
}))

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: vi.fn((path) => path)
    }
  }
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('PopupApp', () => {
  beforeEach(() => {
    mockUnifiedTranslation = {
      sourceLanguage: ref('fr'),
      targetLanguage: ref('de'),
      sourceText: ref('hello'),
      translatedText: ref('bonjour'),
      clearTranslation: vi.fn().mockResolvedValue(undefined),
      initializeSessionState: vi.fn().mockResolvedValue(undefined),
      lastTranslation: ref({ source: 'hello' })
    }
    useUnifiedTranslationMock.mockClear()

    mockLanguageDefaults = {
      savedSourceLanguage: ref('fr'),
      savedTargetLanguage: ref('en'),
      isReady: ref(true),
      setSourceLanguageAsDefault: vi.fn().mockResolvedValue(true),
      setTargetLanguageAsDefault: vi.fn().mockResolvedValue(true)
    }

    mockSettingsStore = {
      settings: {
        DEEPL_BETA_LANGUAGES_ENABLED: false,
        TRANSLATION_API: 'google',
        THEME: 'auto'
      },
      loadSettings: vi.fn().mockResolvedValue(undefined),
      isInitialized: true
    }
  })

  it('passes default action props', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    const selector = wrapper.findComponent({ name: 'LanguageSelector' })

    expect(selector.exists()).toBe(true)
    expect(selector.props('showDefaultActions')).not.toBe(false)
    expect(selector.props('defaultActionsEnabled')).toBe(true)
    expect(selector.props('sourceIsSavedDefault')).toBe(true)
    expect(selector.props('targetIsSavedDefault')).toBe(false)
  })

  it('creates one popup translation owner and passes it to TranslationForm', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    expect(useUnifiedTranslationMock).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({ name: 'TranslationForm' }).props('translation')).toBe(mockUnifiedTranslation)
  })

  it('persists current source and target when stars are clicked', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    const selector = wrapper.findComponent({ name: 'LanguageSelector' })

    selector.vm.$emit('set-default-source')
    selector.vm.$emit('set-default-target')
    await flushPromises()

    expect(mockLanguageDefaults.setSourceLanguageAsDefault).toHaveBeenCalledWith('fr')
    expect(mockLanguageDefaults.setTargetLanguageAsDefault).toHaveBeenCalledWith('de')
  })
})
