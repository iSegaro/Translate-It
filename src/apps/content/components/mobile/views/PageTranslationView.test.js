import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import PageTranslationView from './PageTranslationView.vue'
import { pageEventBus } from '@/core/PageEventBus.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js'

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

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: vi.fn(),
}))

vi.mock('@/components/shared/PageTranslationStatus.vue', () => ({
  default: { template: '<span />' },
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

describe('PageTranslationView page action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendRegularMessage.mockResolvedValue({ success: true })
    mobileStore = {
      pageTranslationData: ref({
        status: 'error',
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

  it('uses the normal Start Translation action for terminal errors without committed content', () => {
    const wrapper = mount(PageTranslationView)

    expect(wrapper.get('.ti-m-header-primary-btn').text()).toBe('Start Translation')
    expect(wrapper.text()).toContain('HTTP error')
    expect(wrapper.text()).not.toContain('Retry Translation')
  })

  it('uses the normal Start Translation action for zero-result completion', () => {
    mobileStore.pageTranslationData.value = {
      ...mobileStore.pageTranslationData.value,
      status: 'error',
      errorMessage: null,
      translatedCount: 0,
      failedCount: 3,
      totalCount: 3,
    }

    const wrapper = mount(PageTranslationView)

    expect(wrapper.get('.ti-m-header-primary-btn').text()).toBe('Start Translation')
    expect(wrapper.text()).not.toContain('Retry Translation')
  })

  it('uses the normal Start Translation action when idle', () => {
    mobileStore.pageTranslationData.value = {
      ...mobileStore.pageTranslationData.value,
      status: 'idle',
      errorMessage: null,
      failedCount: 0,
      totalCount: 0,
    }
    const wrapper = mount(PageTranslationView)

    expect(wrapper.get('.ti-m-header-primary-btn').text()).toBe('Start Translation')
  })

  it('resets terminal error and starts a fresh PAGE_TRANSLATE session', async () => {
    const wrapper = mount(PageTranslationView)

    await wrapper.get('.ti-m-header-primary-btn').trigger('click')

    expect(pageEventBus.emit).toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_RESET_ERROR)

    expect(sendRegularMessage).toHaveBeenCalledWith({
      action: MessageActions.PAGE_TRANSLATE,
      data: { provider: 'google' },
    }, { returnFailureResponse: true })
    expect(pageEventBus.emit).not.toHaveBeenCalledWith(
      MessageActions.PAGE_TRANSLATE,
      expect.anything(),
    )
  })

  it('sends STOP_AUTO through runtime', async () => {
    mobileStore.pageTranslationData.value = {
      ...mobileStore.pageTranslationData.value,
      status: 'translating',
      isTranslating: true,
    }
    const wrapper = mount(PageTranslationView)

    await wrapper.get('.ti-m-header-primary-btn').trigger('click')

    expect(sendRegularMessage).toHaveBeenCalledWith({
      action: MessageActions.PAGE_TRANSLATE_STOP_AUTO,
    }, { returnFailureResponse: true })
    expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_TRANSLATE_STOP_AUTO)
  })

  it('sends PAGE_RESTORE through runtime', async () => {
    mobileStore.pageTranslationData.value = {
      ...mobileStore.pageTranslationData.value,
      status: 'completed',
      isTranslated: true,
    }
    const wrapper = mount(PageTranslationView)

    await wrapper.get('.ti-m-header-primary-btn').trigger('click')

    expect(sendRegularMessage).toHaveBeenCalledWith({
      action: MessageActions.PAGE_RESTORE,
    }, { returnFailureResponse: true })
    expect(pageEventBus.emit).not.toHaveBeenCalledWith(MessageActions.PAGE_RESTORE)
  })

  it('keeps Restore for fatal partial output', () => {
    mobileStore.pageTranslationData.value = {
      ...mobileStore.pageTranslationData.value,
      isTranslated: true,
      translatedCount: 1,
      failedCount: 1,
      totalCount: 2,
    }
    const wrapper = mount(PageTranslationView)

    expect(wrapper.get('.ti-m-header-primary-btn').text()).toBe('Restore Original Page')
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
