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

vi.mock('@/components/popup/LiveDubbingControl.vue', () => ({
  default: {
    name: 'LiveDubbingControl',
    props: ['targetLanguage', 'providerId', 'isSupported', 'unsupportedReason'],
    template: '<div class="live-dubbing-control-stub" />'
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
    vi.stubGlobal('__BROWSER__', 'chrome')
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
        LIVE_DUBBING_PROVIDER: 'openai',
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

  it('passes the normalized live dubbing provider without affecting translation provider', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).props('providerId')).toBe('openai')
    expect(wrapper.findComponent({ name: 'TranslationForm' }).props('provider')).toBe('google')
  })

  it('falls back to Gemini for an unknown live dubbing provider', async () => {
    mockSettingsStore.settings.LIVE_DUBBING_PROVIDER = 'unsupported'
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).props('providerId')).toBe('gemini')
  })

  // Phase 4 Popup UI gate — Firefox Live Dubbing (explicit browser/provider capability)
  describe('Phase 4 Live Dubbing Popup gate', () => {
    it('1) Chrome renders LiveDubbingControl', async () => {
      vi.stubGlobal('__BROWSER__', 'chrome')
      mockSettingsStore.settings.LIVE_DUBBING_PROVIDER = 'gemini'
      const wrapper = mount(PopupApp)
      await flushPromises()
      await flushPromises()
      expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).exists()).toBe(true)
    })

    it('2) Firefox renders LiveDubbingControl', async () => {
      vi.stubGlobal('__BROWSER__', 'firefox')
      mockSettingsStore.settings.LIVE_DUBBING_PROVIDER = 'gemini'
      const wrapper = mount(PopupApp)
      await flushPromises()
      await flushPromises()
      expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).exists()).toBe(true)
    })

    it('3) Firefox+Gemini passes providerId="gemini" and Start is supported', async () => {
      vi.stubGlobal('__BROWSER__', 'firefox')
      mockSettingsStore.settings.LIVE_DUBBING_PROVIDER = 'gemini'
      const wrapper = mount(PopupApp)
      await flushPromises()
      await flushPromises()
      const control = wrapper.findComponent({ name: 'LiveDubbingControl' })
      expect(control.exists()).toBe(true)
      expect(control.props('providerId')).toBe('gemini')
      expect(control.props('isSupported')).toBe(true)
      expect(control.props('unsupportedReason')).toBe('')
    })

    it('4) Firefox+OpenAI does not silently change persisted provider (remains openai)', async () => {
      vi.stubGlobal('__BROWSER__', 'firefox')
      mockSettingsStore.settings.LIVE_DUBBING_PROVIDER = 'openai'
      const wrapper = mount(PopupApp)
      await flushPromises()
      await flushPromises()
      const control = wrapper.findComponent({ name: 'LiveDubbingControl' })
      expect(control.exists()).toBe(true)
      expect(control.props('providerId')).toBe('openai')
      expect(control.props('providerId')).not.toBe('gemini')
    })

    it('5) Firefox+OpenAI reports unsupported and cannot START (disabled with message)', async () => {
      vi.stubGlobal('__BROWSER__', 'firefox')
      mockSettingsStore.settings.LIVE_DUBBING_PROVIDER = 'openai'
      const wrapper = mount(PopupApp)
      await flushPromises()
      await flushPromises()
      const control = wrapper.findComponent({ name: 'LiveDubbingControl' })
      expect(control.props('isSupported')).toBe(false)
      expect(control.props('unsupportedReason')).toBe('OpenAI Live Dubbing is not supported on Firefox yet.')
    })

    it('6) Chrome+OpenAI remains supported (unchanged)', async () => {
      vi.stubGlobal('__BROWSER__', 'chrome')
      mockSettingsStore.settings.LIVE_DUBBING_PROVIDER = 'openai'
      const wrapper = mount(PopupApp)
      await flushPromises()
      await flushPromises()
      const control = wrapper.findComponent({ name: 'LiveDubbingControl' })
      expect(control.props('providerId')).toBe('openai')
      expect(control.props('isSupported')).toBe(true)
      expect(control.props('unsupportedReason')).toBe('')
    })

    it('7) unknown browser does not render LiveDubbingControl (fail-closed)', async () => {
      vi.stubGlobal('__BROWSER__', 'safari')
      mockSettingsStore.settings.LIVE_DUBBING_PROVIDER = 'gemini'
      const wrapper = mount(PopupApp)
      await flushPromises()
      await flushPromises()
      expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).exists()).toBe(false)

      vi.stubGlobal('__BROWSER__', undefined)
      const wrapper2 = mount(PopupApp)
      await flushPromises()
      await flushPromises()
      expect(wrapper2.findComponent({ name: 'LiveDubbingControl' }).exists()).toBe(false)
    })

    it('8) translation provider remains independent from Live Dubbing provider', async () => {
      vi.stubGlobal('__BROWSER__', 'firefox')
      mockSettingsStore.settings.TRANSLATION_API = 'google'
      mockSettingsStore.settings.LIVE_DUBBING_PROVIDER = 'openai'
      const wrapper = mount(PopupApp)
      await flushPromises()
      await flushPromises()
      expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).props('providerId')).toBe('openai')
      expect(wrapper.findComponent({ name: 'TranslationForm' }).props('provider')).toBe('google')

      // Flip translation provider — live dubbing still openai (no silent gemini fallback)
      mockSettingsStore.settings.TRANSLATION_API = 'deepl'
      const wrapper2 = mount(PopupApp)
      await flushPromises()
      await flushPromises()
      expect(wrapper2.findComponent({ name: 'TranslationForm' }).props('provider')).toBe('deepl')
      expect(wrapper2.findComponent({ name: 'LiveDubbingControl' }).props('providerId')).toBe('openai')

      // Flip live dubbing provider — translation stays independent
      vi.stubGlobal('__BROWSER__', 'chrome')
      mockSettingsStore.settings.LIVE_DUBBING_PROVIDER = 'gemini'
      mockSettingsStore.settings.TRANSLATION_API = 'yandex'
      const wrapper3 = mount(PopupApp)
      await flushPromises()
      await flushPromises()
      expect(wrapper3.findComponent({ name: 'LiveDubbingControl' }).props('providerId')).toBe('gemini')
      expect(wrapper3.findComponent({ name: 'TranslationForm' }).props('provider')).toBe('yandex')
    })
  })
})
