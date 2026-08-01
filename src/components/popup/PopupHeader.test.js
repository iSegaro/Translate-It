import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PopupHeader from './PopupHeader.vue'

let settings

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => ({ settings })
}))

vi.mock('@/features/translation/stores/translation.js', () => ({
  useTranslationStore: () => ({ ephemeralSync: {}, selectedProvider: '' })
}))

vi.mock('@/features/translation/composables/useTranslationModes.js', () => ({
  useSelectElementTranslation: () => ({ isSelectModeActive: ref(false), toggleSelectElement: vi.fn() })
}))

vi.mock('@/features/mouse-hover/composables/useMouseHoverToggle.js', () => ({
  useMouseHoverToggle: () => ({ isMouseHoverEnabled: ref(false), toggleMouseHover: vi.fn() })
}))

vi.mock('@/shared/messaging/composables/useMessaging.js', () => ({
  useMessaging: () => ({ sendMessage: vi.fn().mockResolvedValue({}) })
}))

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({ handleError: vi.fn() })
}))

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (key, fallback) => fallback || key })
}))

vi.mock('@/features/translation/providers/ProviderManifest.js', () => ({
  findProviderById: () => ({ features: ['bulk'] })
}))

vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({ addEventListener: vi.fn() })
}))

vi.mock('@/utils/browser/compatibility.js', () => ({
  getBrowserInfoSync: () => ({ isMobile: false })
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), error: vi.fn() })
}))

vi.mock('@/components/shared/IconButton.vue', () => ({
  default: {
    name: 'IconButton',
    emits: ['click'],
    template: '<button class="ti-toolbar-button" @click="$emit(\'click\')" />'
  }
}))

vi.mock('@/components/shared/HorizontalActionScroller.vue', () => ({
  default: {
    name: 'HorizontalActionScroller',
    props: ['ariaLabel'],
    template: '<div class="horizontal-action-scroller-stub"><slot /></div>'
  }
}))

vi.mock('@/features/page-translation/components/PageTranslationButton.vue', () => ({
  default: {
    name: 'PageTranslationButton',
    template: '<div class="page-translation-button-stub" />'
  }
}))

describe('PopupHeader', () => {
  beforeEach(() => {
    settings = {
      EXTENSION_ENABLED: true,
      TRANSLATE_WITH_SELECT_ELEMENT: true,
      ENABLE_SCREEN_CAPTURE: true,
      WHOLE_PAGE_TRANSLATION_ENABLED: true,
      MODE_PROVIDERS: {},
      TRANSLATION_API: 'google'
    }
  })

  it('keeps Page Translation fixed while utility controls render inside scroller', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    const pageTranslationButton = wrapper.find('.ti-header-toolbar > .page-translation-button-stub')
    expect(pageTranslationButton.exists()).toBe(true)

    const scroller = wrapper.find('.ti-header-toolbar > .horizontal-action-scroller-stub')
    expect(scroller.exists()).toBe(true)
    const toolbarChildren = wrapper.find('.ti-header-toolbar').element.children
    expect(toolbarChildren[0]).toBe(pageTranslationButton.element)
    expect(toolbarChildren[1]).toBe(scroller.element)
    expect(scroller.find('.ti-switch').exists()).toBe(true)
    expect(scroller.find('.ti-btn-settings').exists()).toBe(true)
    expect(scroller.find('.ti-btn-revert').exists()).toBe(true)
    expect(scroller.find('.ti-btn-capture').exists()).toBe(true)
    expect(scroller.find('.ti-btn-select').exists()).toBe(true)
    expect(scroller.find('.ti-btn-mouse-hover').exists()).toBe(true)
    expect(scroller.find('.ti-btn-sidepanel').exists()).toBe(true)
  })

  it('preserves conditional utility action rendering', async () => {
    settings.TRANSLATE_WITH_SELECT_ELEMENT = false
    settings.ENABLE_SCREEN_CAPTURE = false
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    const scroller = wrapper.find('.horizontal-action-scroller-stub')
    expect(scroller.find('.ti-btn-revert').exists()).toBe(false)
    expect(scroller.find('.ti-btn-select').exists()).toBe(false)
    expect(scroller.find('.ti-btn-capture').exists()).toBe(false)
    expect(scroller.find('.ti-btn-settings').exists()).toBe(true)
    expect(scroller.find('.ti-btn-mouse-hover').exists()).toBe(true)
  })
})
