import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import OpenAIApiSettings from './OpenAIApiSettings.vue'

const mocks = vi.hoisted(() => ({ settingsStore: null }))

vi.mock('@/features/settings/stores/settings.js', () => ({ useSettingsStore: () => mocks.settingsStore }))
vi.mock('@/shared/config/config.js', () => ({
  CONFIG: {
    OPENAI_API_MODEL: 'curated/model-one',
    OPENAI_MODELS: [
      { value: 'curated/model-one', name: 'Curated One' },
      { value: 'curated/model-two', name: 'Curated Two' },
      { value: 'custom', name: 'Custom Model' },
    ],
  },
}))
vi.mock('@/composables/ui/useRTLSelect.js', () => ({ useRTLSelect: () => ({ rtlSelectStyle: {} }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key === 'PROVIDER_MODEL_LABEL' ? 'Model' : key }) }))
vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({
  ApiKeyManager: { parseKeys: value => typeof value === 'string' ? value.split('\n').map(key => key.trim()).filter(Boolean) : [] },
}))
vi.mock('@/features/translation/providers/ProviderConstants.js', () => ({ ProviderRegistryIds: { OPENAI: 'openai' } }))
vi.mock('@/features/settings/presentation/ProviderSettingsErrorPresenter.js', () => ({ presentProviderSettingsError: vi.fn() }))
vi.mock('@/features/translation/providers/OpenAIModelDiscovery.js', () => ({
  fetchOpenAIModels: vi.fn(),
  getCachedOpenAIModels: vi.fn(() => null),
  MissingOpenAIKeyError: class MissingOpenAIKeyError extends Error {},
}))
vi.mock('./ApiKeyInput.vue', () => ({ default: { template: '<input>' } }))
vi.mock('@/components/base/BaseInput.vue', () => ({ default: { template: '<input>' } }))
vi.mock('@/components/feature/api-settings/ModelCatalogPicker.vue', () => ({ default: { template: '<div />' } }))

describe('OpenAI model select label with real BaseSelect', () => {
  let wrapper

  beforeEach(() => {
    mocks.settingsStore = {
      settings: reactive({ OPENAI_API_KEY: '', OPENAI_API_MODEL: 'curated/model-one' }),
      isSettingDirty: vi.fn(() => false),
      updateSettingLocally: vi.fn((key, value) => { mocks.settingsStore.settings[key] = value }),
    }
  })

  afterEach(() => wrapper?.unmount())

  it('forwards the provider id to the native select and keeps its label and selection functional', async () => {
    wrapper = mount(OpenAIApiSettings)

    const select = wrapper.get('select#openai-model-select')
    const label = wrapper.get('label[for="openai-model-select"]')
    expect(select.element.id).toBe('openai-model-select')
    expect(label.text()).toBe('Model')
    expect(label.element.control).toBe(select.element)

    const ids = wrapper.findAll('[id]').map(element => element.element.id)
    expect(ids).toHaveLength(new Set(ids).size)

    await select.setValue('curated/model-two')
    expect(select.element.value).toBe('curated/model-two')
    expect(mocks.settingsStore.settings.OPENAI_API_MODEL).toBe('curated/model-two')
  })
})
