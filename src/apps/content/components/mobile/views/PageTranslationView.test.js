import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import PageTranslationView from './PageTranslationView.vue'
import { pageEventBus } from '@/core/PageEventBus.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

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
    vi.clearAllMocks()
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

  it('does not expose Retry Translation for zero-result completion', () => {
    mobileStore.pageTranslationData.value = {
      ...mobileStore.pageTranslationData.value,
      status: 'error',
      canRetry: false,
      errorMessage: null,
      translatedCount: 0,
      failedCount: 3,
      totalCount: 3,
    }

    const wrapper = mount(PageTranslationView)

    expect(wrapper.get('.ti-m-header-primary-btn').text()).toBe('Close')
    expect(wrapper.text()).not.toContain('Retry Translation')
  })

  it('keeps Retry Translation for retryable error', async () => {
    mobileStore.pageTranslationData.value.canRetry = true
    const wrapper = mount(PageTranslationView)

    expect(wrapper.get('.ti-m-header-primary-btn').text()).toBe('Retry Translation')
  })

  it('dispatches PAGE_TRANSLATE for zero-commit Retry', async () => {
    mobileStore.pageTranslationData.value.canRetry = true
    const wrapper = mount(PageTranslationView)

    await wrapper.get('.ti-m-header-primary-btn').trigger('click')

    expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE, { provider: 'google' })
  })

  it('does not expose Retry for fatal partial output', () => {
    mobileStore.pageTranslationData.value = {
      ...mobileStore.pageTranslationData.value,
      isTranslated: true,
      translatedCount: 1,
      failedCount: 1,
      totalCount: 2,
      canRetry: false,
    }
    const wrapper = mount(PageTranslationView)

    expect(wrapper.get('.ti-m-header-primary-btn').text()).toBe('Close')
    expect(wrapper.text()).not.toContain('Retry Translation')
    expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE, expect.anything())
  })

  it('shows passive wording for partial completion', () => {
    mobileStore.pageTranslationData.value = {
      ...mobileStore.pageTranslationData.value,
      status: 'completed',
      isTranslated: true,
      translatedCount: 2,
      failedCount: 1,
      totalCount: 3,
    }

    const wrapper = mount(PageTranslationView)

    expect(wrapper.text()).toContain('Completed with some content untranslated')
  })
})
