import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PopupApp from './PopupApp.vue'

let mockSettingsStore
let mockUnifiedTranslation
let mockLanguageDefaults
const useUnifiedTranslationMock = vi.hoisted(() => vi.fn())
const liveDubbingViewLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0, stopCalls: 0 }))

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
    template: '<div class="popup-header-stub"><slot /></div>'
  }
}))

vi.mock('@/components/popup/PopupViewSwitcher.vue', () => ({
  default: {
    name: 'PopupViewSwitcher',
    props: ['modelValue', 'showLiveDubbing'],
    emits: ['update:modelValue'],
    template: `
      <div class="view-switcher-stub">
        <button class="switch-to-translate" role="tab" @click="$emit('update:modelValue', 'translate')">Translate</button>
        <button v-if="showLiveDubbing" class="switch-to-live-dubbing" role="tab" @click="$emit('update:modelValue', 'live-dubbing')">Live Dubbing</button>
      </div>
    `
  }
}))

vi.mock('@/components/popup/TranslationView.vue', () => ({
  default: {
    name: 'TranslationView',
    props: [
      'sourceLanguage',
      'targetLanguage',
      'currentProvider',
      'translation',
      'liveDubbingBusy',
      'isReady',
      'sourceIsSavedDefault',
      'targetIsSavedDefault',
      'sourceDefaultTitle',
      'targetDefaultTitle',
      'lastKeyword'
    ],
    emits: [
      'translate',
      'cancel',
      'clear',
      'set-default-source',
      'set-default-target',
      'can-translate-change',
      'update:sourceLanguage',
      'update:targetLanguage',
      'update:currentProvider'
    ],
    template: '<div class="translation-view-stub" />'
  }
}))

vi.mock('@/components/popup/LiveDubbingView.vue', () => ({
  default: {
    name: 'LiveDubbingView',
    props: ['targetLanguage', 'providerId'],
    emits: ['busy-change', 'update:targetLanguage'],
    mounted() {
      liveDubbingViewLifecycle.mounts += 1
    },
    unmounted() {
      liveDubbingViewLifecycle.unmounts += 1
    },
    methods: {
      stop() {
        liveDubbingViewLifecycle.stopCalls += 1
      }
    },
    template: '<div class="live-dubbing-view-stub" />'
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
    liveDubbingViewLifecycle.mounts = 0
    liveDubbingViewLifecycle.unmounts = 0
    liveDubbingViewLifecycle.stopCalls = 0
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

  it('passes default action props to TranslationView', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    const view = wrapper.findComponent({ name: 'TranslationView' })

    expect(view.exists()).toBe(true)
    expect(view.props('isReady')).toBe(true)
    expect(view.props('sourceIsSavedDefault')).toBe(true)
    expect(view.props('targetIsSavedDefault')).toBe(false)
  })

  it('creates one popup translation owner and passes it to TranslationView', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    expect(useUnifiedTranslationMock).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({ name: 'TranslationView' }).props('translation')).toBe(mockUnifiedTranslation)
  })

  it('persists current source and target when stars are clicked', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    const view = wrapper.findComponent({ name: 'TranslationView' })

    view.vm.$emit('set-default-source')
    view.vm.$emit('set-default-target')
    await flushPromises()

    expect(mockLanguageDefaults.setSourceLanguageAsDefault).toHaveBeenCalledWith('fr')
    expect(mockLanguageDefaults.setTargetLanguageAsDefault).toHaveBeenCalledWith('de')
  })

  it('passes the normalized live dubbing provider without affecting translation provider', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'LiveDubbingView' }).props('providerId')).toBe('openai')
    expect(wrapper.findComponent({ name: 'TranslationView' }).props('currentProvider')).toBe('google')
  })

  it('falls back to Gemini for an unknown live dubbing provider', async () => {
    mockSettingsStore.settings.LIVE_DUBBING_PROVIDER = 'unsupported'
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'LiveDubbingView' }).props('providerId')).toBe('gemini')
  })

  it('shows the translate view by default and hides live dubbing', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'TranslationView' }).isVisible()).toBe(true)
    expect(wrapper.findComponent({ name: 'LiveDubbingView' }).isVisible()).toBe(false)
    expect(wrapper.findComponent({ name: 'PopupViewSwitcher' }).exists()).toBe(true)
  })

  it('passes the last translation keyword to TranslationView', async () => {
    mockUnifiedTranslation.lastTranslation = ref({ source: 'hello-world' })
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'TranslationView' }).props('lastKeyword')).toBe('hello-world')
  })

  it('passes an empty keyword when there is no last translation', async () => {
    mockUnifiedTranslation.lastTranslation = ref(null)
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'TranslationView' }).props('lastKeyword')).toBe('')
  })

  it('switching to live dubbing hides the translation view', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    await wrapper.find('.switch-to-live-dubbing').trigger('click')

    expect(wrapper.findComponent({ name: 'TranslationView' }).isVisible()).toBe(false)
    expect(wrapper.findComponent({ name: 'LiveDubbingView' }).isVisible()).toBe(true)
  })

  it('switching back restores the translation view', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    await wrapper.find('.switch-to-live-dubbing').trigger('click')
    await wrapper.find('.switch-to-translate').trigger('click')

    expect(wrapper.findComponent({ name: 'TranslationView' }).isVisible()).toBe(true)
    expect(wrapper.findComponent({ name: 'LiveDubbingView' }).isVisible()).toBe(false)
  })

  it('hides live dubbing entirely when unsupported', async () => {
    vi.stubGlobal('__BROWSER__', 'firefox')
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('.switch-to-live-dubbing').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'PopupViewSwitcher' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'LiveDubbingView' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'TranslationView' }).isVisible()).toBe(true)
  })

  it('keeps header actions independent from the active view', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    const header = wrapper.findComponent({ name: 'PopupHeader' })
    expect(header.exists()).toBe(true)
    expect(header.props('targetLanguage')).toBe('de')
    expect(header.props('provider')).toBe('google')

    await wrapper.find('.switch-to-live-dubbing').trigger('click')

    const headerAfterSwitch = wrapper.findComponent({ name: 'PopupHeader' })
    expect(headerAfterSwitch.exists()).toBe(true)
    expect(headerAfterSwitch.props('targetLanguage')).toBe('de')
    expect(headerAfterSwitch.props('provider')).toBe('google')
  })

  it('does not stop live dubbing when switching views', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    await wrapper.find('.switch-to-live-dubbing').trigger('click')
    await wrapper.find('.switch-to-translate').trigger('click')

    expect(liveDubbingViewLifecycle.stopCalls).toBe(0)
  })

  it('keeps the live dubbing view mounted across view switches', async () => {
    const wrapper = mount(PopupApp)
    await flushPromises()
    await flushPromises()

    expect(liveDubbingViewLifecycle.mounts).toBe(1)

    await wrapper.find('.switch-to-live-dubbing').trigger('click')
    await wrapper.find('.switch-to-translate').trigger('click')

    expect(liveDubbingViewLifecycle.mounts).toBe(1)
    expect(liveDubbingViewLifecycle.unmounts).toBe(0)
  })
})
