import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ProvidersTab from './ProvidersTab.vue'

const store = reactive({
  settings: { TRANSLATION_API: 'google' },
  activeConfigProvider: 'google'
})

vi.mock('@/features/settings/stores/settings.js', () => ({ useSettingsStore: () => store }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (key) => key })
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

describe('ProvidersTab', () => {
  it('keeps translation provider selection independent', () => {
    const wrapper = mount(ProvidersTab)
    expect(wrapper.find('.primary-service-selection').exists()).toBe(true)
    expect(wrapper.find('#LIVE_DUBBING_PROVIDER').exists()).toBe(false)
    expect(store.settings.TRANSLATION_API).toBe('google')
  })
})
