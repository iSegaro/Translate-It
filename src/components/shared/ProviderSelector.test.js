import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const settingsStore = vi.hoisted(() => ({
  settings: { TRANSLATION_API: 'googlev2', DEBUG_MODE: false, HIDDEN_PROVIDERS: [] },
  isDarkTheme: false,
  updateSettingAndPersist: vi.fn(),
}))

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => settingsStore,
}))

vi.mock('@/features/translation/stores/translation.js', () => ({
  useTranslationStore: () => ({ ephemeralSync: {} }),
}))

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({ handleError: vi.fn() }),
}))

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => ({
      popup_translate_button_text: 'Translate',
      popup_stop_button_title: 'Stop',
    })[key] || key,
  }),
}))

vi.mock('@/features/translation/composables/useTranslationModes.js', () => ({
  useSelectElementTranslation: () => ({
    isSelectModeActive: ref(false),
    deactivateSelectMode: vi.fn(),
  }),
}))

vi.mock('@/core/provider-registry.js', () => ({
  getProvidersForDropdown: () => [{ id: 'googlev2', name: 'Google', icon: 'providers/google.svg', features: ['translation'] }],
  getProviderById: () => ({ id: 'googlev2', icon: 'providers/google.svg', features: ['translation'] }),
}))

vi.mock('@/features/translation/utils/providerValidator.js', () => ({
  isProviderConfigured: () => true,
}))

vi.mock('./IconButton.vue', () => ({
  default: { template: '<span class="mock-icon-button" />' },
}))

vi.mock('@iconify/vue', () => ({
  Icon: { template: '<span class="mock-icon" />' },
}))

vi.mock('webextension-polyfill', () => ({ default: {} }))

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    safeGetURL: (path) => path,
    isContextError: () => false,
    isContentScript: () => false,
    GENERIC_FALLBACK_ICON: 'fallback.svg',
  },
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({ addEventListener: vi.fn() }),
}))

import ProviderSelector from './ProviderSelector.vue'

describe('ProviderSelector split mode', () => {
  beforeEach(() => {
    settingsStore.updateSettingAndPersist.mockReset()
  })

  it('keeps accessible Translate and Stop labels while reserving localized label width', async () => {
    const wrapper = mount(ProviderSelector, {
      props: { mode: 'split', modelValue: 'googlev2' },
      global: { stubs: { Teleport: true } },
    })

    const mainAction = wrapper.find('.ti-translate-main-area')
    const labels = wrapper.find('.ti-translate-main-labels')
    expect(mainAction.attributes('aria-label')).toBe('Translate')
    expect(wrapper.find('.ti-translate-main-label').text()).toBe('Translate')
    expect(labels.findAll('.ti-translate-main-label-reserve')).toHaveLength(2)
    expect(labels.findAll('.ti-translate-main-label-reserve').map((label) => label.text())).toEqual(['Translate', 'Stop'])
    expect(labels.findAll('.ti-translate-main-label-reserve').every((label) => label.attributes('aria-hidden') === 'true')).toBe(true)

    await mainAction.trigger('click')
    expect(wrapper.emitted('translate')).toEqual([[{ provider: 'googlev2' }]])

    await wrapper.setProps({ loading: true })
    expect(mainAction.attributes('aria-label')).toBe('Stop')
    expect(wrapper.find('.ti-translate-main-label').text()).toBe('Stop')

    await mainAction.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('exposes compact-label presentation without changing split actions', () => {
    const wrapper = mount(ProviderSelector, {
      props: { mode: 'split', modelValue: 'googlev2', presentation: 'compact-label' },
      global: { stubs: { Teleport: true } },
    })

    expect(wrapper.find('.ti-split-translate-button-container').classes()).toContain('ti-split-translate-button-container--compact-label')
    expect(wrapper.find('.ti-translate-main-label').text()).toBe('Translate')
    expect(wrapper.find('.ti-provider-dropdown-area').exists()).toBe(true)
  })

  it('keeps provider dropdown trigger available in split mode', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let wrapper
    try {
      wrapper = mount(ProviderSelector, {
        props: { mode: 'split', modelValue: 'googlev2' },
        global: { stubs: { Teleport: true } },
        attachTo: container,
      })

      const rootEl = wrapper.find('.ti-split-translate-button-container').element
      vi.spyOn(rootEl, 'getBoundingClientRect').mockReturnValue({
        top: 10, left: 10, right: 300, bottom: 50,
        width: 290, height: 40, x: 10, y: 10
      })

      await wrapper.find('.ti-provider-dropdown-area').trigger('click')
      expect(wrapper.find('.ti-provider-dropdown-menu').exists()).toBe(true)
    } finally {
      wrapper?.unmount()
      container.remove()
    }
  })
})
