import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import LiveDubbingProviderSetup from './LiveDubbingProviderSetup.vue'

const harness = vi.hoisted(() => ({
  store: null,
  i18n: {},
  sendMessage: vi.fn()
}))

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => harness.store
}))

// Mirrors useUnifiedI18n semantics: (key, 'fallback') uses the fallback when
// untranslated; (key, { params }) interpolates; bare key falls back to key.
vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key, options) => {
      const message = harness.i18n[key]
      if (typeof options === 'string') return message ?? options
      if (message == null) return key
      if (options && typeof options === 'object') {
        return message.replace(/\{(\w+)\}/g, (match, name) => options[name] ?? match)
      }
      return message
    }
  })
}))

vi.mock('@/shared/messaging/composables/useMessaging.js', () => ({
  useMessaging: () => ({ sendMessage: (...args) => harness.sendMessage(...args) })
}))

const makeStore = (overrides = {}) => {
  const store = {
    settings: { GEMINI_API_KEY: '', OPENAI_API_KEY: '', API_KEY: '', ...overrides },
    updateSettingAndPersist: vi.fn(async () => true),
    updateSettingLocally: vi.fn((key, value) => {
      store.settings[key] = value
    })
  }
  return store
}

const mountSetup = (props = {}) => mount(LiveDubbingProviderSetup, {
  props: { providerId: 'gemini', targetLanguage: 'en', ...props }
})

const typeKey = async (wrapper, value) => {
  await wrapper.find('input').setValue(value)
  await nextTick()
}

const clickButton = async (wrapper, label) => {
  const button = wrapper.findAll('button').find((candidate) => (
    candidate.text() === label || candidate.attributes('aria-label') === label
  ))
  expect(button, `button "${label}"`).toBeTruthy()
  await button.trigger('click')
}

describe('LiveDubbingProviderSetup', () => {
  beforeEach(() => {
    harness.store = makeStore()
    harness.sendMessage.mockReset()
    harness.sendMessage.mockResolvedValue({ ok: true, valid: true, reason: 'VALID' })
    harness.i18n = {
      provider_gemini_title: 'Google Gemini',
      provider_openai_title: 'OpenAI GPT',
      provider_config_required_api: 'This service ({provider}) requires an API Key.',
      gemini_api_key_info: 'You can get your Gemini API key from Google AI Studio.',
      openai_api_key_info: 'You can get your OpenAI API key from OpenAI Platform.',
      gemini_api_key_link: 'Get Your Free API Key',
      openai_api_key_link: 'Get Your API Key',
      gemini_api_key_placeholder: 'Paste your Gemini API key here',
      openai_api_key_placeholder: 'Paste your OpenAI API key here',
      custom_api_settings_api_key_label: 'API Key',
      api_key_show: 'Show',
      api_key_hide: 'Hide',
      validation_api_key_empty: 'API key for {provider} cannot be empty.',
      live_dubbing_setup_save: 'Save',
      live_dubbing_setup_save_error: "Your API key couldn't be saved. Please try again.",
      live_dubbing_validation_auth_error: 'This key was rejected or does not have access to Live Dubbing.',
      live_dubbing_validation_quota_error: "This key can't be verified right now because of a quota, rate, or billing limit.",
      live_dubbing_validation_unavailable_error: 'Live Dubbing validation is temporarily unavailable. Please try again.',
      live_dubbing_validation_configuration_error: 'Unable to validate this key with the selected provider and language. Check your configuration and try again.'
    }
  })

  it('names the provider and links to the matching key page', () => {
    const gemini = mountSetup({ providerId: 'gemini' })
    expect(gemini.text()).toContain('This service (Google Gemini) requires an API Key.')
    expect(gemini.find('a').attributes('href')).toBe('https://aistudio.google.com/app/apikey')
    expect(gemini.text()).toContain('You can get your Gemini API key from Google AI Studio.')

    const openai = mountSetup({ providerId: 'openai' })
    expect(openai.text()).toContain('This service (OpenAI GPT) requires an API Key.')
    expect(openai.find('a').attributes('href')).toBe('https://platform.openai.com/api-keys')
    expect(openai.text()).toContain('You can get your OpenAI API key from OpenAI Platform.')
  })

  it('masks the key input as LTR password with a show/hide toggle', async () => {
    const wrapper = mountSetup()
    const input = wrapper.find('input')

    expect(input.attributes('type')).toBe('password')
    expect(input.attributes('dir')).toBe('ltr')
    expect(input.attributes('placeholder')).toBe('Paste your Gemini API key here')
    expect(wrapper.find('.ti-input__label').text()).toBe('API Key')

    await clickButton(wrapper, 'Show')
    expect(wrapper.find('input').attributes('type')).toBe('text')
    expect(wrapper.find('.live-dubbing-setup-toggle').attributes('aria-label')).toBe('Hide')
    expect(wrapper.find('.live-dubbing-setup-toggle').attributes('aria-pressed')).toBe('true')

    await clickButton(wrapper, 'Hide')
    expect(wrapper.find('input').attributes('type')).toBe('password')
    expect(wrapper.find('.live-dubbing-setup-toggle').attributes('aria-pressed')).toBe('false')
  })

  it('saves a Gemini key under GEMINI_API_KEY', async () => {
    const wrapper = mountSetup({ providerId: 'gemini' })

    await typeKey(wrapper, 'gemini-secret-key')
    await clickButton(wrapper, 'Save')
    await nextTick()

    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledWith(
      'GEMINI_API_KEY',
      'gemini-secret-key'
    )
    expect(harness.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      data: { providerId: 'gemini', apiKey: 'gemini-secret-key', targetLanguage: 'en' }
    }))
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalledWith(
      'OPENAI_API_KEY',
      expect.anything()
    )
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalledWith(
      'TRANSLATION_API',
      expect.anything()
    )
    // Success clears the draft; the parent hides the card once the store reacts.
    expect(wrapper.find('input').element.value).toBe('')
  })

  it('saves an OpenAI key under OPENAI_API_KEY', async () => {
    const wrapper = mountSetup({ providerId: 'openai' })

    await typeKey(wrapper, 'sk-openai-secret')
    await clickButton(wrapper, 'Save')
    await nextTick()

    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledWith(
      'OPENAI_API_KEY',
      'sk-openai-secret'
    )
  })

  it('rejects an empty key with the localized provider validation message', async () => {
    const wrapper = mountSetup({ providerId: 'gemini' })

    await clickButton(wrapper, 'Save')
    await nextTick()

    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('API key for Google Gemini cannot be empty.')
    expect(harness.sendMessage).not.toHaveBeenCalled()
  })

  it.each([
    ['AUTH_INVALID', 'rejected'],
    ['FORBIDDEN', 'rejected'],
    ['QUOTA_EXCEEDED', 'quota'],
    ['RATE_LIMITED', 'quota'],
    ['INSUFFICIENT_BALANCE', 'quota'],
    ['NETWORK_ERROR', 'temporarily unavailable'],
    ['SERVER_ERROR', 'temporarily unavailable'],
    ['INVALID_RESPONSE', 'temporarily unavailable'],
    ['REQUEST_FAILED', 'temporarily unavailable'],
    ['UNKNOWN_REASON', 'selected provider and language']
  ])('fails closed for %s without persisting or leaking the draft', async (reason, wording) => {
    harness.sendMessage.mockResolvedValue({ ok: true, valid: false, reason })
    const wrapper = mountSetup()
    await typeKey(wrapper, 'sk-validation-secret')
    await clickButton(wrapper, 'Save')
    await nextTick()

    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()
    expect(wrapper.find('input').element.value).toBe('sk-validation-secret')
    expect(wrapper.text()).toContain(wording)
    expect(wrapper.text()).not.toContain('sk-validation-secret')
  })

  it('uses one immutable submission snapshot for validation and persistence', async () => {
    let resolveValidation
    harness.sendMessage.mockImplementation(() => new Promise(resolve => {
      resolveValidation = resolve
    }))
    const wrapper = mountSetup({ providerId: 'gemini', targetLanguage: 'en' })
    await typeKey(wrapper, '  gemini-key  ')
    await clickButton(wrapper, 'Save')
    await wrapper.setProps({ providerId: 'openai', targetLanguage: 'ja' })

    resolveValidation({ ok: true, valid: true, reason: 'VALID' })
    await nextTick()
    await nextTick()

    expect(harness.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      data: { providerId: 'gemini', targetLanguage: 'en', apiKey: 'gemini-key' }
    }))
    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledWith('GEMINI_API_KEY', 'gemini-key')
  })

  it('ignores duplicate saves during validation', async () => {
    let resolveValidation
    harness.sendMessage.mockImplementation(() => new Promise(resolve => {
      resolveValidation = resolve
    }))
    const wrapper = mountSetup()
    await typeKey(wrapper, 'sk-only-once')
    await wrapper.find('.live-dubbing-setup-save').trigger('click')
    await wrapper.find('.live-dubbing-setup-save').trigger('click')

    expect(harness.sendMessage).toHaveBeenCalledOnce()
    resolveValidation({ ok: true, valid: true, reason: 'VALID' })
    await nextTick()
  })

  it('keeps the draft and shows a fixed safe error when persistence fails', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Mirror production updateSettingAndPersist(): it mutates reactive local
    // state FIRST and only then fails at the storage write.
    harness.store.updateSettingAndPersist = vi.fn(async (key, value) => {
      harness.store.settings[key] = value
      throw new Error('storage exploded: sk-top-secret')
    })

    const wrapper = mountSetup({ providerId: 'gemini' })
    await typeKey(wrapper, 'sk-typed-secret-value')
    await clickButton(wrapper, 'Save')
    await nextTick()

    // Input is kept so the user can retry.
    expect(wrapper.find('input').element.value).toBe('sk-typed-secret-value')
    // The optimistic store mutation is rolled back to the previous value.
    expect(harness.store.settings.GEMINI_API_KEY).toBe('')
    // Fixed localized message only — neither the draft nor the raw error leaks.
    expect(wrapper.text()).toContain("Your API key couldn't be saved. Please try again.")
    expect(wrapper.text()).not.toContain('sk-typed-secret-value')
    expect(wrapper.text()).not.toContain('storage exploded')
    // The secret never reaches the console through this component.
    for (const spy of [logSpy, warnSpy, errorSpy]) {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    }
  })

  it('keeps the secret out of rendered text while typing', async () => {
    const wrapper = mountSetup({ providerId: 'gemini' })
    await typeKey(wrapper, 'sk-hidden-from-text')

    expect(wrapper.find('input').element.value).toBe('sk-hidden-from-text')
    expect(wrapper.text()).not.toContain('sk-hidden-from-text')
  })

  it('disables the input, visibility toggle, and save action while saving', async () => {
    let resolveSave
    harness.store.updateSettingAndPersist = vi.fn(() => new Promise((resolve) => {
      resolveSave = resolve
    }))
    const wrapper = mountSetup()
    await typeKey(wrapper, 'sk-saving-secret')

    await wrapper.find('.live-dubbing-setup-save').trigger('click')
    await nextTick()

    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.live-dubbing-setup-toggle').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.live-dubbing-setup-save').attributes('disabled')).toBeDefined()

    resolveSave(true)
    await nextTick()
  })

  it('keeps all credential controls disabled during validation and persistence', async () => {
    let resolveValidation
    harness.sendMessage.mockImplementation(() => new Promise(resolve => {
      resolveValidation = resolve
    }))
    let resolvePersistence
    harness.store.updateSettingAndPersist = vi.fn(() => new Promise(resolve => {
      resolvePersistence = resolve
    }))

    const wrapper = mountSetup()
    await typeKey(wrapper, 'sk-validation-pending')
    await wrapper.find('.live-dubbing-setup-save').trigger('click')
    await nextTick()

    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.live-dubbing-setup-toggle').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.live-dubbing-setup-save').attributes('disabled')).toBeDefined()
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()

    resolveValidation({ ok: true, valid: true, reason: 'VALID' })
    await nextTick()
    await nextTick()

    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledOnce()
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.live-dubbing-setup-toggle').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.live-dubbing-setup-save').attributes('disabled')).toBeDefined()

    resolvePersistence(true)
    await nextTick()
  })
})
