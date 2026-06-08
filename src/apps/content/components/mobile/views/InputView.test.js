import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref, nextTick } from 'vue'
import InputView from './InputView.vue'

let mockMobileStore
let mockSettingsStore
let mockLanguageDefaults
let mockTTSSmart

vi.mock('@/store/modules/mobile.js', () => ({
  useMobileStore: () => mockMobileStore
}))

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => mockSettingsStore
}))

vi.mock('@/features/settings/composables/useLanguageDefaults.js', () => ({
  useLanguageDefaults: () => mockLanguageDefaults
}))

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key, fallback) => fallback || key
  })
}))

vi.mock('@/shared/messaging/composables/useMessaging.js', () => ({
  useMessaging: () => ({
    sendMessage: vi.fn().mockResolvedValue({ success: true, result: { translatedText: 'hello' } }),
    createMessage: vi.fn((action, payload) => ({ action, payload }))
  })
}))

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({
    getErrorForDisplay: vi.fn().mockResolvedValue({ message: 'error' }),
    handleError: vi.fn().mockResolvedValue(undefined)
  })
}))

vi.mock('@/features/tts/composables/useTTSSmart.js', () => ({
  useTTSSmart: () => mockTTSSmart
}))

vi.mock('@/components/shared/TranslationDisplay.vue', () => ({
  default: {
    name: 'TranslationDisplay',
    template: '<div class="translation-display-stub" />'
  }
}))

vi.mock('@/components/shared/LanguageSelector.vue', () => ({
  default: {
    name: 'LanguageSelector',
    props: [
      'sourceLanguage',
      'targetLanguage',
      'provider',
      'compact',
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
      'autoDetectLabel'
    ],
    emits: ['set-default-source', 'set-default-target'],
    template: '<div class="language-selector-stub" />'
  }
}))

vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: {
    name: 'ProviderSelector',
    template: '<div class="provider-selector-stub" />'
  }
}))

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: vi.fn()
  }
}))

vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessageActions: {
    SHOW_NOTIFICATION_SIMPLE: 'SHOW_NOTIFICATION_SIMPLE',
    TRANSLATE: 'TRANSLATE',
    CANCEL_TRANSLATION: 'CANCEL_TRANSLATION'
  },
  MessageContexts: {
    MOBILE_TRANSLATE: 'MOBILE_TRANSLATE'
  }
}))

vi.mock('@/shared/utils/text/textAnalysis.js', () => ({
  shouldApplyRtl: vi.fn(() => false)
}))

vi.mock('@/shared/constants/mobile.js', () => ({
  MOBILE_CONSTANTS: {
    VIEWS: {
      DASHBOARD: 'dashboard',
      HISTORY: 'history'
    },
    SHEET_STATE: {
      FULL: 'full'
    },
    UI_MODE: {
      AUTO: 'auto'
    }
  }
}))

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    Dictionary_Translation: 'dictionary',
    Mobile_Translate: 'mobile'
  }
}))

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn(() => false),
    handleContextError: vi.fn()
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

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: vi.fn((path) => path)
    }
  }
}))

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('InputView', () => {
  beforeEach(() => {
    mockMobileStore = reactive({
      selectionData: {
        text: 'hello',
        sourceLang: 'fr',
        targetLang: 'de',
        translation: '',
        mode: null,
        error: ''
      },
      updateSelectionData: vi.fn(),
      navigate: vi.fn(),
      setSheetState: vi.fn(),
      closeSheet: vi.fn(),
      setView: vi.fn()
    })

    mockSettingsStore = reactive({
      isDarkTheme: false,
      isInitialized: false,
      settings: {
        DEEPL_BETA_LANGUAGES_ENABLED: false,
        SOURCE_LANGUAGE: 'auto',
        TARGET_LANGUAGE: 'en',
        TRANSLATION_API: 'google'
      }
    })

    mockLanguageDefaults = {
      savedSourceLanguage: ref('auto'),
      savedTargetLanguage: ref('en'),
      isReady: ref(false),
      setSourceLanguageAsDefault: vi.fn().mockResolvedValue(true),
      setTargetLanguageAsDefault: vi.fn().mockResolvedValue(true)
    }

    mockTTSSmart = {
      ttsState: ref('idle'),
      stop: vi.fn(),
      speak: vi.fn().mockResolvedValue(undefined)
    }
  })

  it('disables default actions before settings are ready', async () => {
    const wrapper = mount(InputView)
    await flushPromises()
    await nextTick()

    const selector = wrapper.findComponent({ name: 'LanguageSelector' })
    expect(selector.props('defaultActionsEnabled')).toBe(false)
  })

  it('enables default actions after settings become ready', async () => {
    const wrapper = mount(InputView)
    await flushPromises()
    await nextTick()

    mockLanguageDefaults.isReady.value = true
    mockSettingsStore.isInitialized = true
    await nextTick()

    const selector = wrapper.findComponent({ name: 'LanguageSelector' })
    expect(selector.props('defaultActionsEnabled')).toBe(true)
  })

  it('persists the current local language when a star is clicked', async () => {
    const wrapper = mount(InputView)
    await flushPromises()
    await nextTick()

    mockLanguageDefaults.isReady.value = true
    mockSettingsStore.isInitialized = true
    await nextTick()

    const selector = wrapper.findComponent({ name: 'LanguageSelector' })
    expect(selector.props('sourceLanguage')).toBe('fr')
    expect(selector.props('targetLanguage')).toBe('de')

    selector.vm.$emit('set-default-source')
    selector.vm.$emit('set-default-target')
    await flushPromises()

    expect(mockLanguageDefaults.setSourceLanguageAsDefault).toHaveBeenCalledWith('fr')
    expect(mockLanguageDefaults.setTargetLanguageAsDefault).toHaveBeenCalledWith('de')
    expect(selector.props('sourceLanguage')).toBe('fr')
    expect(selector.props('targetLanguage')).toBe('de')
  })
})
