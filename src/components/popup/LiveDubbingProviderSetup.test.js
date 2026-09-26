import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import LiveDubbingProviderSetup from './LiveDubbingProviderSetup.vue'

const here = dirname(fileURLToPath(import.meta.url))

const harness = vi.hoisted(() => ({ store: null, i18n: {}, sendMessage: vi.fn() }))

vi.mock('@/features/settings/stores/settings.js', () => ({ useSettingsStore: () => harness.store }))
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
    settings: { GEMINI_API_KEY: '', OPENAI_API_KEY: '', ...overrides },
    updateSettingAndPersist: vi.fn(async () => true),
    updateSettingLocally: vi.fn((key, value) => { store.settings[key] = value })
  }
  return store
}

const mountSetup = (props = {}) => mount(LiveDubbingProviderSetup, {
  props: { providerId: 'gemini', targetLanguage: 'en', ...props }
})
const textarea = (wrapper) => wrapper.find('textarea.ti-textarea')
const typeKey = async (wrapper, value) => {
  await clickButton(wrapper, 'Show')
  await textarea(wrapper).setValue(value)
  await clickButton(wrapper, 'Hide')
  await nextTick()
}
const clickButton = async (wrapper, label) => {
  const button = wrapper.findAll('button').find((candidate) => (
    candidate.text() === label || candidate.attributes('aria-label') === label
  ))
  expect(button, `button "${label}"`).toBeTruthy()
  await button.trigger('click')
}
const valid = { ok: true, valid: true, reason: 'VALID' }
const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await nextTick() }

describe('LiveDubbingProviderSetup', () => {
  beforeEach(() => {
    harness.store = makeStore()
    harness.sendMessage.mockReset().mockResolvedValue(valid)
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
      live_dubbing_setup_key_guidance: 'One API key per line',
      live_dubbing_setup_too_many_keys: 'Enter no more than 10 unique API keys.',
      live_dubbing_setup_key_failed: 'Key {position}: {reason}',
      live_dubbing_setup_save_error: "Your API key couldn't be saved. Please try again.",
      live_dubbing_validation_auth_error: 'This key was rejected or does not have access to Live Dubbing.',
      live_dubbing_validation_quota_error: "This key can't be verified right now because of a quota, rate, or billing limit.",
      live_dubbing_validation_unavailable_error: 'Live Dubbing validation is temporarily unavailable. Please try again.',
      live_dubbing_validation_configuration_error: 'Unable to validate this key with the selected provider and language. Check your configuration and try again.'
    }
  })

  it('shows provider information and matching key links without a service-required line', () => {
    const gemini = mountSetup()
    expect(gemini.text()).not.toContain('This service (Google Gemini) requires an API Key.')
    expect(gemini.find('a').attributes('href')).toBe('https://aistudio.google.com/app/apikey')
    expect(gemini.text()).toContain('You can get your Gemini API key from Google AI Studio.')
    const openai = mountSetup({ providerId: 'openai' })
    expect(openai.text()).not.toContain('This service (OpenAI GPT) requires an API Key.')
    expect(openai.find('a').attributes('href')).toBe('https://platform.openai.com/api-keys')
    expect(openai.text()).toContain('You can get your OpenAI API key from OpenAI Platform.')
  })

  it('uses a masked LTR textarea with accessible name, guidance and visibility controls', async () => {
    const wrapper = mountSetup()
    const field = textarea(wrapper)
    expect(field.exists()).toBe(true)
    expect(field.attributes('dir')).toBe('ltr')
    expect(field.attributes('placeholder')).toBe('Paste your Gemini API key here')
    expect(field.attributes('rows')).toBe('3')
    expect(field.attributes('aria-label')).toBe('API Key')
    expect(field.attributes('aria-describedby')).toBe('live-dubbing-key-guidance')
    expect(field.attributes('aria-invalid')).toBe('false')
    expect(wrapper.find('#live-dubbing-key-guidance').text()).toBe('One API key per line')
    const inputControl = wrapper.find('.live-dubbing-setup-input-control')
    expect(inputControl.element.contains(field.element)).toBe(true)
    expect(inputControl.element.contains(wrapper.find('.live-dubbing-setup-toggle').element)).toBe(true)

    await typeKey(wrapper, 'first-secret\nsecond-secret')
    expect(textarea(wrapper).element.value).toBe('••••••••••••\n•••••••••••••')
    expect(wrapper.text()).not.toContain('first-secret')
    await clickButton(wrapper, 'Show')
    expect(textarea(wrapper).element.value).toBe('first-secret\nsecond-secret')
    expect(wrapper.find('.live-dubbing-setup-toggle').attributes('aria-pressed')).toBe('true')
    await clickButton(wrapper, 'Hide')
    expect(textarea(wrapper).element.value).toBe('••••••••••••\n•••••••••••••')
    expect(wrapper.find('.live-dubbing-setup-toggle').attributes('aria-pressed')).toBe('false')
  })

  it.each([
    ['gemini', 'GEMINI_API_KEY'],
    ['openai', 'OPENAI_API_KEY']
  ])('validates and saves one key for %s under %s', async (providerId, storageKey) => {
    const wrapper = mountSetup({ providerId })
    await typeKey(wrapper, ' one-key ')
    await clickButton(wrapper, 'Save')
    await flush()
    expect(harness.sendMessage).toHaveBeenCalledOnce()
    expect(harness.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      data: { providerId, apiKey: 'one-key', targetLanguage: 'en' }
    }))
    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledWith(storageKey, 'one-key')
    expect(textarea(wrapper).element.value).toBe('')
  })

  it('rejects blank-only drafts without messaging or persistence', async () => {
    const wrapper = mountSetup()
    await typeKey(wrapper, ' \n  \n ')
    await clickButton(wrapper, 'Save')
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()
    expect(wrapper.find('.live-dubbing-setup-feedback').text()).toContain('API key for Google Gemini cannot be empty.')
    expect(harness.sendMessage).not.toHaveBeenCalled()
  })

  it('trims, removes blanks and deduplicates keys in first-occurrence order', async () => {
    const wrapper = mountSetup()
    await typeKey(wrapper, ' alpha \n\n beta\nalpha\n gamma \nbeta ')
    await clickButton(wrapper, 'Save')
    await flush()
    expect(harness.sendMessage.mock.calls.map(([message]) => message.data.apiKey))
      .toEqual(['alpha', 'beta', 'gamma'])
    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledOnce()
    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledWith('GEMINI_API_KEY', 'alpha\nbeta\ngamma')
  })

  it('persists only when each validation response is exactly VALID', async () => {
    harness.sendMessage.mockResolvedValue({ ok: true, valid: true, reason: 'ALMOST_VALID' })
    const wrapper = mountSetup()
    await typeKey(wrapper, 'strict-check')
    await clickButton(wrapper, 'Save')
    await flush()
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()
    expect(wrapper.find('.live-dubbing-setup-feedback').text()).toContain('Key 1:')
    expect(wrapper.text()).not.toContain('strict-check')
  })

  it('accepts 10 unique keys and rejects 11 before sending any messages', async () => {
    let wrapper = mountSetup()
    await typeKey(wrapper, Array.from({ length: 10 }, (_, i) => `key-${i + 1}`).join('\n'))
    await clickButton(wrapper, 'Save')
    await flush()
    expect(harness.sendMessage).toHaveBeenCalledTimes(10)
    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledWith(
      'GEMINI_API_KEY', Array.from({ length: 10 }, (_, i) => `key-${i + 1}`).join('\n')
    )

    harness.sendMessage.mockClear()
    harness.store = makeStore()
    wrapper = mountSetup()
    await typeKey(wrapper, Array.from({ length: 11 }, (_, i) => `key-${i + 1}`).join('\n'))
    await clickButton(wrapper, 'Save')
    expect(harness.sendMessage).not.toHaveBeenCalled()
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()
    expect(wrapper.find('.live-dubbing-setup-feedback').text()).toContain('Enter no more than 10 unique API keys.')
  })

  it('runs at most two validations concurrently and persists one ordered join only after all succeed', async () => {
    const pending = []
    let active = 0
    let maxActive = 0
    harness.sendMessage.mockImplementation((message) => {
      const request = deferred()
      active += 1
      maxActive = Math.max(maxActive, active)
      pending.push({ key: message.data.apiKey, resolve: (response = valid) => { active -= 1; request.resolve(response) } })
      return request.promise
    })
    const wrapper = mountSetup()
    await typeKey(wrapper, 'first\nsecond\nthird')
    await clickButton(wrapper, 'Save')
    expect(harness.sendMessage.mock.calls.map(([message]) => message.data.apiKey)).toEqual(['first', 'second'])
    expect(maxActive).toBe(2)
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()

    pending[1].resolve()
    await flush()
    expect(harness.sendMessage.mock.calls.map(([message]) => message.data.apiKey)).toEqual(['first', 'second', 'third'])
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()
    pending[2].resolve()
    await flush()
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()
    pending[0].resolve()
    await flush()
    expect(maxActive).toBe(2)
    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledOnce()
    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledWith('GEMINI_API_KEY', 'first\nsecond\nthird')
  })

  it.each([
    ['AUTH_INVALID', 'This key was rejected or does not have access to Live Dubbing.'],
    ['FORBIDDEN', 'This key was rejected or does not have access to Live Dubbing.'],
    ['QUOTA_EXCEEDED', "This key can't be verified right now because of a quota, rate, or billing limit."],
    ['RATE_LIMITED', "This key can't be verified right now because of a quota, rate, or billing limit."],
    ['INSUFFICIENT_BALANCE', "This key can't be verified right now because of a quota, rate, or billing limit."],
    ['NETWORK_ERROR', 'Live Dubbing validation is temporarily unavailable. Please try again.'],
    ['SERVER_ERROR', 'Live Dubbing validation is temporarily unavailable. Please try again.'],
    ['INVALID_RESPONSE', 'Live Dubbing validation is temporarily unavailable. Please try again.'],
    ['REQUEST_FAILED', 'Live Dubbing validation is temporarily unavailable. Please try again.'],
    ['UNKNOWN_RAW_REASON_SECRET', 'Unable to validate this key with the selected provider and language. Check your configuration and try again.']
  ])('reports %s for normalized key 2 without exposing reason or key material', async (reason, localizedReason) => {
    const failedKey = 'rejected-key-secret'
    harness.sendMessage.mockImplementation(async ({ data }) => data.apiKey === failedKey
      ? { ok: true, valid: false, reason }
      : valid)
    const wrapper = mountSetup()
    const draft = ` first-secret \n\n first-secret \n ${failedKey} \n third-secret `
    await typeKey(wrapper, draft)
    await clickButton(wrapper, 'Save')
    await flush()

    expect(wrapper.find('.live-dubbing-setup-feedback').text()).toBe(`Key 2: ${localizedReason}`)
    expect(textarea(wrapper).element.value).toBe(draft.replace(/[^\n]/g, '•'))
    for (const secret of [reason, failedKey, 'first-secret', 'third-secret']) {
      expect(wrapper.text()).not.toContain(secret)
    }
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()
  })

  it('reports the lowest normalized failed position when concurrent responses fail out of order', async () => {
    const first = deferred()
    const second = deferred()
    const wrapper = mountSetup()
    harness.sendMessage
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    const draft = ' first-secret \nsecond-secret\nthird-secret '
    await typeKey(wrapper, draft)
    await clickButton(wrapper, 'Save')
    expect(harness.sendMessage).toHaveBeenCalledTimes(2)

    second.resolve({ ok: true, valid: false, reason: 'FORBIDDEN' })
    await flush()
    expect(harness.sendMessage).toHaveBeenCalledTimes(2)

    first.resolve({ ok: true, valid: false, reason: 'AUTH_INVALID' })
    await flush()
    expect(harness.sendMessage).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.live-dubbing-setup-feedback').text()).toBe(
      'Key 1: This key was rejected or does not have access to Live Dubbing.'
    )
    expect(textarea(wrapper).element.value).toBe(draft.replace(/[^\n]/g, '•'))
    expect(wrapper.text()).not.toContain('first-secret')
    expect(wrapper.text()).not.toContain('second-secret')
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()
  })

  it('reports a thrown validation failure by normalized index without exposing error secrets', async () => {
    harness.sendMessage.mockImplementation(async ({ data }) => {
      if (data.apiKey === 'second-secret') throw new Error('request leaked second-secret')
      return valid
    })
    const wrapper = mountSetup()
    await typeKey(wrapper, 'first-secret\nsecond-secret')
    await clickButton(wrapper, 'Save')
    await flush()
    expect(wrapper.find('.live-dubbing-setup-feedback').text()).toContain('Key 2:')
    expect(wrapper.text()).not.toContain('second-secret')
    expect(wrapper.text()).not.toContain('request leaked')
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalled()
  })

  it('uses a single immutable provider and language snapshot while validation is pending', async () => {
    const request = deferred()
    harness.sendMessage.mockReturnValue(request.promise)
    const wrapper = mountSetup({ providerId: 'gemini', targetLanguage: 'en' })
    await typeKey(wrapper, ' gemini-key ')
    await clickButton(wrapper, 'Save')
    await wrapper.setProps({ providerId: 'openai', targetLanguage: 'ja' })
    request.resolve(valid)
    await flush()
    expect(harness.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      data: { providerId: 'gemini', targetLanguage: 'en', apiKey: 'gemini-key' }
    }))
    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledWith('GEMINI_API_KEY', 'gemini-key')
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalledWith('OPENAI_API_KEY', expect.anything())
  })

  it('ignores duplicate Save while validation is pending', async () => {
    const request = deferred()
    harness.sendMessage.mockReturnValue(request.promise)
    const wrapper = mountSetup()
    await typeKey(wrapper, 'once-only')
    await wrapper.find('.live-dubbing-setup-save').trigger('click')
    await wrapper.find('.live-dubbing-setup-save').trigger('click')
    expect(harness.sendMessage).toHaveBeenCalledOnce()
    request.resolve(valid)
    await flush()
    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledOnce()
  })

  it('disables textarea, show/hide and Save throughout validation and persistence', async () => {
    const validation = deferred()
    const persistence = deferred()
    harness.sendMessage.mockReturnValue(validation.promise)
    harness.store.updateSettingAndPersist = vi.fn(() => persistence.promise)
    const wrapper = mountSetup()
    await typeKey(wrapper, 'pending-secret')
    await clickButton(wrapper, 'Save')
    const assertDisabled = () => {
      expect(textarea(wrapper).attributes('disabled')).toBeDefined()
      expect(wrapper.find('.live-dubbing-setup-toggle').attributes('disabled')).toBeDefined()
      expect(wrapper.find('.live-dubbing-setup-save').attributes('disabled')).toBeDefined()
    }
    await nextTick()
    assertDisabled()
    validation.resolve(valid)
    await flush()
    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledOnce()
    assertDisabled()
    persistence.resolve(true)
    await flush()
  })

  it('rolls back an optimistic multi-key write and safely retains the draft when persistence throws', async () => {
    const previous = 'previous-key-one\nprevious-key-two'
    const attempted = 'private-secret-one\nprivate-secret-two'
    harness.store = makeStore({ GEMINI_API_KEY: previous })
    harness.store.updateSettingAndPersist = vi.fn(async (key, value) => {
      harness.store.settings[key] = value
      throw new Error('storage exploded: private-secret-one')
    })
    const wrapper = mountSetup()
    const draft = 'private-secret-one\nprivate-secret-two'
    await typeKey(wrapper, draft)
    await clickButton(wrapper, 'Save')
    await flush()
    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledWith('GEMINI_API_KEY', attempted)
    expect(harness.store.settings.GEMINI_API_KEY).toBe(previous)
    expect(harness.store.updateSettingLocally).toHaveBeenCalledWith('GEMINI_API_KEY', previous)
    expect(textarea(wrapper).element.value).toBe(draft.replace(/[^\n]/g, '•'))
    expect(wrapper.find('.live-dubbing-setup-feedback').text()).toBe("Your API key couldn't be saved. Please try again.")
    expect(wrapper.text()).not.toContain('private-secret-one')
    expect(wrapper.text()).not.toContain('private-secret-two')
    expect(wrapper.text()).not.toContain('storage exploded')
    expect(wrapper.emitted('save-pending')).toEqual([[true], [false]])
  })

  it('keeps guidance and Save together after the field and feedback mounted last', async () => {
    const wrapper = mountSetup()
    const row = wrapper.find('.live-dubbing-setup-row')
    const field = wrapper.find('.live-dubbing-setup-input-field')
    const guidance = wrapper.find('#live-dubbing-key-guidance')
    const controls = wrapper.find('.live-dubbing-setup-controls-row')
    const saveButton = wrapper.find('.live-dubbing-setup-save')
    const feedback = wrapper.find('.live-dubbing-setup-feedback')
    expect(feedback.attributes('role')).toBe('alert')
    expect(feedback.attributes('dir')).toBe('auto')
    expect(feedback.text()).toBe('')
    expect(guidance.element.parentElement).toBe(controls.element)
    expect(saveButton.element.parentElement).toBe(controls.element)
    expect(Array.from(row.element.children)).toEqual([field.element, controls.element, feedback.element])
    expect(Array.from(controls.element.children)).toEqual([guidance.element, saveButton.element])

    await clickButton(wrapper, 'Save')
    expect(wrapper.find('.live-dubbing-setup-feedback').element).toBe(feedback.element)
    expect(feedback.text()).toContain('API key for Google Gemini cannot be empty.')
    expect(wrapper.find('.live-dubbing-setup-save').element).toBe(saveButton.element)
    expect(field.element.contains(feedback.element)).toBe(false)
    expect(feedback.element.previousElementSibling).toBe(controls.element)
  })

  it('keeps the setup guidance and feedback accessible without rendering secret text', async () => {
    harness.sendMessage.mockResolvedValue({ ok: true, valid: false, reason: 'AUTH_INVALID' })
    const wrapper = mountSetup()
    await typeKey(wrapper, 'secret-not-for-feedback')
    await clickButton(wrapper, 'Save')
    await flush()
    expect(textarea(wrapper).attributes('dir')).toBe('ltr')
    expect(textarea(wrapper).attributes('aria-describedby')).toBe('live-dubbing-key-guidance live-dubbing-key-error')
    expect(textarea(wrapper).attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).not.toContain('secret-not-for-feedback')
  })

  it('uses an RTL-safe grid and bounded local feedback scrolling without clipping the card', () => {
    const scss = readFileSync(resolve(here, 'LiveDubbingView.scss'), 'utf8')
    const rowRule = scss.match(/\.live-dubbing-setup-row\s*\{[^}]*\}/m)?.[0]
    expect(rowRule).toMatch(/display:\s*block/)
    const controlsRule = scss.match(/\.live-dubbing-setup-controls-row\s*\{[^}]*\}/m)?.[0]
    expect(controlsRule).toMatch(/display:\s*grid/)
    expect(controlsRule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/)
    expect(controlsRule).toMatch(/gap\s*:/)
    expect(controlsRule).not.toMatch(/(?:^|\n)\s*(?:left|right)\s*:/)
    const rtlControlsRule = scss.match(/\.live-dubbing-view--rtl \.live-dubbing-setup-controls-row\s*\{[^}]*\}/m)?.[0]
    expect(rtlControlsRule).toMatch(/direction:\s*rtl/)
    const textareaRule = scss.match(/\.live-dubbing-setup-input \.ti-textarea\s*\{[^}]*\}/m)?.[0]
    expect(textareaRule).not.toMatch(/min-height:\s*92px/)

    const rtlRules = scss.match(/\.live-dubbing-view--rtl[^{}]*\{[^}]*\}/gm) ?? []
    const setupRtlRules = rtlRules.filter((rule) => /live-dubbing-setup/.test(rule))
    expect(setupRtlRules.length).toBeGreaterThan(0)
    expect(setupRtlRules.join('\n')).not.toMatch(/(?:^|\n)\s*(?:left|right)\s*:/)
    expect(setupRtlRules.join('\n')).toMatch(/direction:\s*rtl/)

    const slotRule = scss.match(/\.live-dubbing-setup-feedback\s*\{[^}]*\}/m)?.[0]
    expect(slotRule).toMatch(/overflow-wrap:\s*anywhere/)
    expect(slotRule).toMatch(/min-block-size:\s*2\.8em\s*;/)
    expect(slotRule).toMatch(/max-block-size:\s*5\.6em\s*;/)
    expect(slotRule).toMatch(/line-height:\s*1\.4\s*;/)
    expect(slotRule).toMatch(/overflow-y\s*:\s*auto\s*;/)
    expect(slotRule).not.toMatch(/text-overflow\s*:/)
    expect(slotRule).not.toMatch(/overflow\s*:\s*hidden/)
    expect(slotRule).not.toMatch(/white-space\s*:\s*nowrap/)
    expect(slotRule).not.toMatch(/position\s*:\s*(?:absolute|fixed)/)

    const saveRule = scss.match(/\.live-dubbing-setup-controls-row\s*>\s*\.ti-btn\.live-dubbing-setup-save\s*\{[^}]*\}/m)?.[0]
    expect(saveRule).toBeTruthy()
    expect(saveRule).not.toMatch(/position\s*:\s*(?:absolute|fixed)/)
    const setupCardRule = scss.match(/\.live-dubbing-setup-card\s*\{[^}]*\}/m)?.[0] ?? ''
    expect(setupCardRule).not.toMatch(/(?:^|\n)\s*(?:height|block-size)\s*:/)
  })
})
