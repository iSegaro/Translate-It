import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import PageTranslationView from './PageTranslationView.vue'

let mobileStore
let settingsStore

vi.mock('@/store/modules/mobile.js', () => ({
  useMobileStore: () => mobileStore,
}))

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => settingsStore,
}))

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (_key, fallback) => fallback }),
}))

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({ handleError: vi.fn() }),
}))

vi.mock('@/features/translation/providers/ProviderManifest.js', () => ({
  findProviderById: () => ({ features: ['bulk'] }),
}))

vi.mock('@/features/page-translation/composables/useAutoTranslateRules.js', () => ({
  useAutoTranslateRules: () => ({
    isAutoTranslateToggleVisible: ref(false),
    isAutoTranslateToggleActive: ref(false),
    autoTranslateToggleDesc: '',
    toggleAutoTranslateRule: vi.fn(),
  }),
}))

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: { emit: vi.fn() },
}))

vi.mock('@/components/shared/PageTranslationStatus.vue', () => ({
  default: { template: '<span />' },
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

describe('PageTranslationView retry action', () => {
  beforeEach(() => {
    mobileStore = {
      pageTranslationData: ref({
        status: 'error',
        canRetry: false,
        errorMessage: 'HTTP error',
        isTranslating: false,
        isAutoTranslating: false,
        isTranslated: false,
        translatedCount: 0,
        failedCount: 1,
        totalCount: 1,
      }),
      closeSheet: vi.fn(),
      navigate: vi.fn(),
    }
    settingsStore = reactive({
      isDarkTheme: false,
      settings: { MOBILE_PAGE_TRANSLATION_AUTO_CLOSE: false },
      getEffectiveProvider: () => 'google',
    })
  })

  it('does not expose Retry Translation for non-retryable error', () => {
    const wrapper = mount(PageTranslationView)

    expect(wrapper.get('.ti-m-header-primary-btn').text()).toBe('Close')
    expect(wrapper.text()).not.toContain('Retry Translation')
  })

  it('keeps Retry Translation for retryable error', async () => {
    mobileStore.pageTranslationData.value.canRetry = true
    const wrapper = mount(PageTranslationView)

    expect(wrapper.get('.ti-m-header-primary-btn').text()).toBe('Retry Translation')
  })
})
