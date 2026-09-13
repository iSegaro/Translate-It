import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ProvidersTab from './ProvidersTab.vue'

const store = reactive({
  settings: { TRANSLATION_API: 'google', LIVE_DUBBING_PROVIDER: 'gemini' },
  activeConfigProvider: 'google',
  updateSettingAndPersist: vi.fn()
})

vi.mock('@/features/settings/stores/settings.js', () => ({ useSettingsStore: () => store }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (key) => ({
    provider_gemini_title: 'Google Gemini',
    provider_openai_title: 'OpenAI GPT',
    live_dubbing_provider_label: 'Live Dubbing Provider',
    live_dubbing_provider_description: 'Used for new live dubbing sessions.'
  }[key] || key) })
}))
vi.mock('@/features/translation/providers/ProviderManifest.js', () => ({
  findProviderById: () => ({ features: ['autoLanguage'], titleKey: 'provider_title', descriptionKey: 'provider_description' }),
  getProviderManifest: () => []
}))
vi.mock('@/features/translation/utils/providerValidator.js', () => ({ getFirstMissingSetting: () => null }))
vi.mock('@/shared/logging/logger.js', () => ({ getScopedLogger: () => ({ debug: vi.fn() }) }))
vi.mock('@/shared/logging/logConstants.js', () => ({ LOG_COMPONENTS: { UI: 'ui' } }))
vi.mock('../composables/useHighlightManager.js', () => ({ useHighlightManager: () => ({ checkAndHighlight: vi.fn(), highlightElement: vi.fn() }) }))
vi.mock('../composables/useProviderVisibility.js', () => ({ useProviderVisibility: () => ({ showInList: false }) }))
vi.mock('@/components/shared/ProviderSelector.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/base/BaseCheckbox.vue', () => ({ default: { template: '<div />' } }))

describe('ProvidersTab live dubbing provider setting', () => {
  beforeEach(() => {
    store.settings.LIVE_DUBBING_PROVIDER = 'gemini'
    store.updateSettingAndPersist.mockReset()
  })

  it('renders Gemini and OpenAI, reflects the current value, and persists changes', async () => {
    const wrapper = mount(ProvidersTab)
    const select = wrapper.find('#LIVE_DUBBING_PROVIDER')

    expect(select.element.value).toBe('gemini')
    expect(select.findAll('option').map((option) => option.text())).toEqual(['Google Gemini', 'OpenAI GPT'])

    await select.setValue('openai')
    expect(store.updateSettingAndPersist).toHaveBeenCalledWith('LIVE_DUBBING_PROVIDER', 'openai')
  })

  it('keeps translation provider selection independent', () => {
    const wrapper = mount(ProvidersTab)
    expect(wrapper.find('.primary-service-selection').exists()).toBe(true)
    expect(store.settings.TRANSLATION_API).toBe('google')
  })

  it('persists Gemini to OpenAI and back', async () => {
    store.settings.LIVE_DUBBING_PROVIDER = 'gemini'
    const wrapper = mount(ProvidersTab)
    const select = wrapper.find('#LIVE_DUBBING_PROVIDER')

    expect(select.element.value).toBe('gemini')
    await select.setValue('openai')
    expect(store.updateSettingAndPersist).toHaveBeenCalledWith('LIVE_DUBBING_PROVIDER', 'openai')

    store.settings.LIVE_DUBBING_PROVIDER = 'openai'
    await wrapper.vm.$nextTick()
    expect(select.element.value).toBe('openai')

    await select.setValue('gemini')
    expect(store.updateSettingAndPersist).toHaveBeenCalledWith('LIVE_DUBBING_PROVIDER', 'gemini')
  })
})
