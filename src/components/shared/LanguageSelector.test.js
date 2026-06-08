import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import LanguageSelector from './LanguageSelector.vue'

const mockLanguages = ref([
  { code: 'en', name: 'English' },
  { code: 'fa', name: 'Persian' },
  { code: 'fr', name: 'French' }
])

vi.mock('@/composables/shared/useLanguages.js', () => ({
  useLanguages: () => ({
    allLanguages: mockLanguages,
    isLoaded: ref(true),
    loadLanguages: vi.fn().mockResolvedValue(undefined)
  })
}))

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({
    handleError: vi.fn()
  })
}))

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key, fallback) => fallback || key
  })
}))

vi.mock('@/features/translation/composables/useTranslationModes.js', () => ({
  useSelectElementTranslation: () => ({
    isSelectModeActive: ref(false),
    deactivateSelectMode: vi.fn()
  })
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('@/shared/config/languageConstants.js', () => ({
  PROVIDER_SUPPORTED_LANGUAGES: {},
  PROVIDER_LANGUAGE_PAIRS: {},
  getProviderLanguageCode: (code) => code
}))

vi.mock('@/features/translation/providers/ProviderManifest.js', () => ({
  findProviderById: () => null
}))

vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    TARGET_LANGUAGE: 'en'
  }
}))

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: {
    getI18nUtils: vi.fn().mockResolvedValue({
      findLanguageCode: vi.fn((value) => Promise.resolve(value))
    })
  }
}))

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getURL: vi.fn((path) => path)
    }
  }
}))

describe('LanguageSelector', () => {
  beforeEach(() => {
    global.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  })

  afterEach(() => {
    delete global.ResizeObserver
  })

  const mountSelector = (props = {}) => mount(LanguageSelector, {
    props: {
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      provider: '',
      ...props
    }
  })

  it('hides stars by default', () => {
    const wrapper = mountSelector()
    expect(wrapper.findAll('.ti-default-action-button')).toHaveLength(0)
  })

  it('shows stars when enabled', () => {
    const wrapper = mountSelector({
      showDefaultActions: true
    })

    expect(wrapper.findAll('.ti-default-action-button')).toHaveLength(2)
  })

  it('reflects filled and empty states from props', () => {
    const wrapper = mountSelector({
      showDefaultActions: true,
      sourceIsSavedDefault: true,
      targetIsSavedDefault: false,
      sourceDefaultTitle: 'Source default',
      targetDefaultTitle: 'Target default'
    })

    expect(wrapper.get('button[title="Source default"]').text()).toContain('★')
    expect(wrapper.get('button[title="Target default"]').text()).toContain('☆')
  })

  it('disables star buttons when defaultActionsEnabled is false', () => {
    const wrapper = mountSelector({
      showDefaultActions: true,
      defaultActionsEnabled: false
    })

    const buttons = wrapper.findAll('.ti-default-action-button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].attributes('disabled')).toBeDefined()
    expect(buttons[1].attributes('disabled')).toBeDefined()
  })

  it('emits set-default-source when the source star is clicked', async () => {
    const wrapper = mountSelector({
      showDefaultActions: true,
      sourceDefaultTitle: 'Source default',
      targetDefaultTitle: 'Target default'
    })

    await wrapper.get('button[title="Source default"]').trigger('click')

    expect(wrapper.emitted('set-default-source')).toHaveLength(1)
  })

  it('emits set-default-target when the target star is clicked', async () => {
    const wrapper = mountSelector({
      showDefaultActions: true,
      sourceDefaultTitle: 'Source default',
      targetDefaultTitle: 'Target default'
    })

    await wrapper.get('button[title="Target default"]').trigger('click')

    expect(wrapper.emitted('set-default-target')).toHaveLength(1)
  })
})
