import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import LiveDubbingView from './LiveDubbingView.vue'

const here = dirname(fileURLToPath(import.meta.url))

// Shared mutable harness so vi.mock factories (hoisted above imports) can
// reach per-test store/i18n state.
const harness = vi.hoisted(() => ({
  store: null,
  i18n: {},
  locale: { value: 'en' }
}))

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => harness.store
}))

// Mirrors useUnifiedI18n semantics: (key, 'fallback') uses the fallback when
// untranslated; (key, { params }) interpolates; bare key falls back to key.
vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    locale: harness.locale,
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

// Stubbed children: this suite covers ONLY the view-level wiring contract
// (configuration card, credential visibility, prop forwarding). LiveDubbingControl
// behavior itself is covered by LiveDubbingControl.test.js and must not be duplicated.
const LanguageSelectorStub = {
  name: 'LanguageSelector',
  props: {
    targetLanguage: { type: String, default: 'en' },
    provider: { type: String, default: '' },
    enableSelectElementIntegration: { type: Boolean, default: true },
    targetOnly: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false }
  },
  emits: ['update:targetLanguage'],
  template: '<div class="language-selector-stub" />'
}

const setupLifecycle = { mounts: 0 }

const LiveDubbingControlStub = {
  name: 'LiveDubbingControl',
  props: {
    targetLanguage: { type: String, default: '' },
    providerId: { type: String, default: '' }
  },
  emits: ['busy-change'],
  template: '<div class="live-dubbing-control-stub" />'
}

const LiveDubbingProviderSetupStub = {
  name: 'LiveDubbingProviderSetup',
  props: {
    providerId: { type: String, default: '' }
  },
  emits: ['save-pending', 'saved'],
  mounted() {
    setupLifecycle.mounts += 1
  },
  template: '<div class="live-dubbing-provider-setup-stub" />'
}

/** In-memory settings store: persists one key immediately into reactive state. */
const makeStore = (settings = {}) => {
  const store = {
    settings: reactive({
      GEMINI_API_KEY: '',
      OPENAI_API_KEY: '',
      API_KEY: '',
      TRANSLATION_API: 'google',
      ...settings
    }),
    updateSettingAndPersist: vi.fn(async (key, value) => {
      store.settings[key] = value
      return true
    })
  }
  return store
}

const mountView = (props = {}) => mount(LiveDubbingView, {
  props: { targetLanguage: 'en', providerId: 'gemini', ...props },
  global: {
    stubs: {
      LanguageSelector: LanguageSelectorStub,
      LiveDubbingControl: LiveDubbingControlStub,
      LiveDubbingProviderSetup: LiveDubbingProviderSetupStub
    }
  }
})

const providerSelect = (wrapper) => wrapper.find('#live-dubbing-provider-select')

describe('LiveDubbingView', () => {
  beforeEach(() => {
    setupLifecycle.mounts = 0
    harness.locale.value = 'en'
    harness.store = makeStore({
      GEMINI_API_KEY: 'gemini-configured-key',
      OPENAI_API_KEY: 'openai-configured-key'
    })
    harness.i18n = {
      provider_gemini_title: 'Google Gemini',
      provider_openai_title: 'OpenAI GPT',
      provider_label: 'Provider',
      target_language_label: 'Target Language',
      live_dubbing_provider_description: 'Used for new live dubbing sessions.',
      live_dubbing_config_label: 'Configuration'
    }
  })

  it('renders the LanguageSelector in target-only mode', () => {
    const wrapper = mountView({ providerId: 'openai' })

    const selector = wrapper.findComponent({ name: 'LanguageSelector' })
    expect(selector.exists()).toBe(true)
    expect(selector.props('targetOnly')).toBe(true)
    expect(selector.props('enableSelectElementIntegration')).toBe(false)
    expect(selector.props('provider')).toBe('openai')
  })

  it('renders localized labels with the shared label treatment', () => {
    const wrapper = mountView()

    expect(wrapper.findAll('.live-dubbing-config-label').map((label) => label.text())).toEqual([
      'Target Language',
      'Provider'
    ])
    expect(wrapper.find('label[for="live-dubbing-provider-select"]').classes())
      .toContain('live-dubbing-config-label')
  })

  it('marks the view locally for Persian RTL styling', async () => {
    harness.locale.value = 'fa'
    const wrapper = mountView()

    await nextTick()
    expect(wrapper.find('.live-dubbing-view').classes()).toContain('live-dubbing-view--rtl')
  })

  it('forwards the selected target language to LiveDubbingControl', async () => {
    const wrapper = mountView()

    // A selection inside the LanguageSelector flows up as update:targetLanguage;
    // the parent owns the prop, so the view re-emits it unchanged.
    await wrapper.findComponent({ name: 'LanguageSelector' }).vm.$emit('update:targetLanguage', 'de')
    expect(wrapper.emitted('update:targetLanguage')).toEqual([['de']])

    // Once the parent applies the new prop, the control receives it.
    await wrapper.setProps({ targetLanguage: 'de' })
    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).props('targetLanguage')).toBe('de')
  })

  it('forwards the selected provider to the selector and the control', async () => {
    const wrapper = mountView()

    await wrapper.setProps({ providerId: 'openai' })
    expect(wrapper.findComponent({ name: 'LanguageSelector' }).props('provider')).toBe('openai')
    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).props('providerId')).toBe('openai')
  })

  it('offers exactly the Gemini and OpenAI provider options', async () => {
    const wrapper = mountView()

    const options = providerSelect(wrapper).findAll('option')
    expect(options.map((option) => option.attributes('value'))).toEqual(['gemini', 'openai'])
    expect(options.map((option) => option.text())).toEqual(['Google Gemini', 'OpenAI GPT'])
  })

  it('persists provider changes under LIVE_DUBBING_PROVIDER without touching TRANSLATION_API', async () => {
    const wrapper = mountView()

    await providerSelect(wrapper).setValue('openai')

    expect(harness.store.updateSettingAndPersist).toHaveBeenCalledWith('LIVE_DUBBING_PROVIDER', 'openai')
    expect(harness.store.updateSettingAndPersist).not.toHaveBeenCalledWith(
      'TRANSLATION_API',
      expect.anything()
    )
    expect(harness.store.settings.TRANSLATION_API).toBe('google')

    // Parent applies the persisted value back down; the control follows it.
    await wrapper.setProps({ providerId: 'openai' })
    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).props('providerId')).toBe('openai')
  })

  it('disables the configuration card while the control reports busy', async () => {
    const wrapper = mountView()
    const control = wrapper.findComponent({ name: 'LiveDubbingControl' })

    control.vm.$emit('busy-change', true)
    await nextTick()

    expect(providerSelect(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.findComponent({ name: 'LanguageSelector' }).props('disabled')).toBe(true)
    // Busy still propagates to the parent unchanged (TranslationView lock).
    expect(wrapper.emitted('busy-change')).toEqual([[true]])

    control.vm.$emit('busy-change', false)
    await nextTick()

    expect(providerSelect(wrapper).attributes('disabled')).toBeUndefined()
    expect(wrapper.findComponent({ name: 'LanguageSelector' }).props('disabled')).toBe(false)
    expect(wrapper.emitted('busy-change')).toEqual([[true], [false]])
  })

  it('shows credential setup only for a provider that lacks credentials', async () => {
    harness.store = makeStore({ OPENAI_API_KEY: 'openai-configured-key' })
    const wrapper = mountView({ providerId: 'gemini' })

    const setup = () => wrapper.findComponent({ name: 'LiveDubbingProviderSetup' })
    expect(setup().exists()).toBe(true)
    expect(setup().props('providerId')).toBe('gemini')

    await wrapper.setProps({ providerId: 'openai' })
    expect(setup().exists()).toBe(false)

    await wrapper.setProps({ providerId: 'gemini' })
    expect(setup().exists()).toBe(true)
  })

  it('hides the session card while keeping the control mounted when setup is needed', () => {
    harness.store = makeStore({ OPENAI_API_KEY: 'openai-configured-key' })
    const wrapper = mountView({ providerId: 'gemini' })

    expect(wrapper.findComponent({ name: 'LiveDubbingProviderSetup' }).exists()).toBe(true)
    expect(wrapper.find('.live-dubbing-session-card').attributes('style')).toContain('display: none')
    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).exists()).toBe(true)
  })

  it('shows the session card when the hidden control becomes busy', async () => {
    harness.store = makeStore({ OPENAI_API_KEY: 'openai-configured-key' })
    const wrapper = mountView({ providerId: 'gemini' })
    const control = wrapper.findComponent({ name: 'LiveDubbingControl' })

    expect(wrapper.find('.live-dubbing-session-card').attributes('style')).toContain('display: none')

    control.vm.$emit('busy-change', true)
    await nextTick()

    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).exists()).toBe(true)
    expect(wrapper.find('.live-dubbing-session-card').attributes('style') || '')
      .not.toContain('display: none')
  })

  it('keeps the session control visible for a configured provider', () => {
    const wrapper = mountView({ providerId: 'openai' })

    expect(wrapper.findComponent({ name: 'LiveDubbingProviderSetup' }).exists()).toBe(false)
    expect(wrapper.find('.live-dubbing-session-card').exists()).toBe(true)
    expect(wrapper.find('.live-dubbing-session-card').attributes('style') || '')
      .not.toContain('display: none')
    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).exists()).toBe(true)
  })

  it('shows the session control immediately after successful setup', async () => {
    harness.store = makeStore()
    const wrapper = mountView({ providerId: 'gemini' })
    const setup = wrapper.findComponent({ name: 'LiveDubbingProviderSetup' })

    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).exists()).toBe(true)
    expect(wrapper.find('.live-dubbing-session-card').attributes('style')).toContain('display: none')

    await setup.vm.$emit('saved')
    harness.store.settings.GEMINI_API_KEY = 'freshly-saved-key'
    await nextTick()

    expect(wrapper.findComponent({ name: 'LiveDubbingProviderSetup' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).exists()).toBe(true)
    expect(wrapper.find('.live-dubbing-session-card').attributes('style') || '')
      .not.toContain('display: none')
  })

  it('treats the legacy API_KEY store as configured for Gemini', async () => {
    harness.store = makeStore({ API_KEY: 'legacy-gemini-key' })
    const wrapper = mountView({ providerId: 'gemini' })

    expect(wrapper.findComponent({ name: 'LiveDubbingProviderSetup' }).exists()).toBe(false)

    // OpenAI has its own key store — an empty one still requires setup.
    await wrapper.setProps({ providerId: 'openai' })
    expect(wrapper.findComponent({ name: 'LiveDubbingProviderSetup' }).exists()).toBe(true)
  })

  it('ignores blank-only credential values when deciding setup visibility', async () => {
    harness.store = makeStore({ GEMINI_API_KEY: '  \n\t ' })
    const wrapper = mountView({ providerId: 'gemini' })

    expect(wrapper.findComponent({ name: 'LiveDubbingProviderSetup' }).exists()).toBe(true)
  })

  it('switching provider remounts the setup card so stale state is cleared', async () => {
    // Neither provider configured → card visible across the switch.
    harness.store = makeStore()
    const wrapper = mountView({ providerId: 'gemini' })
    expect(setupLifecycle.mounts).toBe(1)

    await wrapper.setProps({ providerId: 'openai' })

    const setup = wrapper.findComponent({ name: 'LiveDubbingProviderSetup' })
    expect(setup.props('providerId')).toBe('openai')
    // :key="providerModel" forces a fresh instance (fresh draft/error state).
    expect(setupLifecycle.mounts).toBe(2)
  })

  it('keeps the redesign out of TranslationView and the sidepanel', () => {
    const translationView = readFileSync(resolve(here, 'TranslationView.vue'), 'utf8')
    expect(translationView).not.toMatch(/LiveDubbingProviderSetup|LIVE_DUBBING_PROVIDER/)

    const sidepanelDir = resolve(here, '../../apps/sidepanel')
    const sidepanelFiles = readdirSync(sidepanelDir, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.vue'))
    expect(sidepanelFiles.length).toBeGreaterThan(0)
    for (const file of sidepanelFiles) {
      const source = readFileSync(resolve(sidepanelDir, file), 'utf8')
      expect(source, file).not.toMatch(/LiveDubbingProviderSetup|LiveDubbingControl|LIVE_DUBBING_PROVIDER/)
    }
  })

  it('uses logical CSS properties so the layout survives RTL locales', () => {
    const scss = readFileSync(resolve(here, 'LiveDubbingView.scss'), 'utf8')

    expect(scss).not.toMatch(/(?:padding|margin|inset)-(?:left|right)\s*:/)
    expect(scss).not.toMatch(/(?:text-align|border(?:-left|-right)?):\s*(?:left|right)/)
    expect(scss).not.toMatch(/\b(?:left|right)\s*:\s*\d/)
    // Feedback/source text aligns to the logical start edge.
    expect(scss).toMatch(/text-align:\s*start/)
    // Theme-aware tokens only — no hardcoded light/dark surfaces.
    expect(scss).toMatch(/var\(--header-border-color\)/)
    expect(scss).toMatch(/var\(--language-controls-bg-color\)/)
    // Control alignment is owned by this card, not shared control styles.
    expect(scss).toMatch(/\.live-dubbing-config-field--language \.ti-language-select/)
    expect(scss).toMatch(/\.live-dubbing-config-field--provider \.ti-select/)
    expect(scss).not.toMatch(/^\.ti-language-select/m)
    expect(scss).not.toMatch(/^\.ti-select/m)
    expect(scss).not.toMatch(/\.live-dubbing-view--rtl\s*\{[\s\S]*?direction:\s*rtl/)

    const setupInputField = scss.match(
      /\.live-dubbing-setup-input-field\s*\{[\s\S]*?\n\}/m
    )?.[0]
    expect(setupInputField).toMatch(/direction:\s*ltr/)
    expect(scss).toMatch(/\.live-dubbing-setup-input \.ti-input[\s\S]*?padding-inline:\s*10px 42px\s*!important/)
    expect(scss).toMatch(/:root\.theme-dark \.live-dubbing-setup-toggle img[\s\S]*?filter:\s*invert\(1\)/)

    const rtlInputText = scss.match(
      /\.live-dubbing-view--rtl \.live-dubbing-setup-input \.ti-input__label,[\s\S]*?\.ti-input__help\s*\{[\s\S]*?\n\}/m
    )?.[0]
    expect(rtlInputText).toMatch(/direction:\s*rtl\s*!important/)
    expect(rtlInputText).toMatch(/text-align:\s*start\s*!important/)

    const rtlActions = scss.match(
      /\.live-dubbing-view--rtl \.live-dubbing-setup-actions\s*\{[\s\S]*?\n\}/m
    )?.[0]
    expect(rtlActions).toMatch(/direction:\s*rtl/)
    expect(rtlActions).toMatch(/justify-content:\s*flex-end/)

    const languageWrapper = scss.match(
      /\.live-dubbing-config-card \.live-dubbing-config-field--language > \.ti-language-controls\s*\{[\s\S]*?\n\}/m
    )?.[0]
    const languageWrapperSelector = languageWrapper.split('{')[0]
    expect((languageWrapperSelector.match(/\./g) || []).length)
      .toBeGreaterThan(('.popup-wrapper .ti-language-controls'.match(/\./g) || []).length)
    expect(languageWrapper).toMatch(/width:\s*100%/)
    expect(languageWrapper).toMatch(/min-width:\s*0/)
    expect(languageWrapper).toMatch(/height:\s*36px\s*!important/)
    expect(languageWrapper).toMatch(/min-height:\s*36px\s*!important/)
    expect(languageWrapper).toMatch(/margin:\s*0\s*!important/)
    expect(languageWrapper).toMatch(/padding:\s*0\s*!important/)
    expect(languageWrapper).toMatch(/background:\s*transparent\s*!important/)

    const responsiveSelector = '.ti-language-controls:not(.ti-compact-mode) .ti-language-select'
    const languageOverride = scss.match(
      /\.live-dubbing-config-card \.live-dubbing-config-field--language\s+\.ti-language-controls:not\(\.ti-compact-mode\) \.ti-language-select\s*\{[\s\S]*?\n\}/m
    )?.[0]
    expect(languageOverride).toBeTruthy()
    const languageOverrideSelector = languageOverride.split('{')[0]
    expect((languageOverrideSelector.match(/\./g) || []).length)
      .toBeGreaterThan((responsiveSelector.match(/\./g) || []).length)
    expect(languageOverride).toMatch(/height:\s*36px\s*!important/)
    expect(languageOverride).toMatch(/min-height:\s*36px\s*!important/)
    expect(languageOverride).toMatch(/font-size:\s*13px\s*!important/)
    expect(languageOverride).toMatch(/border-radius:\s*6px\s*!important/)
    expect(languageOverride).toMatch(/padding-inline:\s*10px 34px\s*!important/)
    expect(languageOverride).toMatch(/background-position:\s*right 10px center\s*!important/)
    const languageRtlBlock = scss.match(
      /\.live-dubbing-view--rtl \.live-dubbing-config-card\s+\.live-dubbing-config-field--language[\s\S]*?\{[\s\S]*?\n\}/m
    )?.[0]
    const providerRtlBlock = scss.match(
      /\.live-dubbing-view--rtl \.live-dubbing-config-card\s+\.live-dubbing-config-field--provider \.ti-select\s*\{[\s\S]*?\n\}/m
    )?.[0]
    expect(languageRtlBlock).toMatch(/padding-inline:\s*10px 34px\s*!important/)
    expect(providerRtlBlock).toMatch(/padding-inline:\s*10px 34px\s*!important/)
    expect(languageRtlBlock).toMatch(/background-position:\s*left 10px center\s*!important/)
    expect(providerRtlBlock).toMatch(/background-position:\s*left 10px center\s*!important/)
  })

  it('keeps the setup card mounted while a save is pending despite optimistic store mutation', async () => {
    harness.store = makeStore()
    const wrapper = mountView({ providerId: 'gemini' })
    const setup = () => wrapper.findComponent({ name: 'LiveDubbingProviderSetup' })
    expect(setup().exists()).toBe(true)

    // The setup signals pending BEFORE the store mutates; the card must stay.
    await setup().vm.$emit('save-pending', true)
    harness.store.settings.GEMINI_API_KEY = 'optimistic-draft-key'
    await nextTick()
    expect(setup().exists()).toBe(true)

    // Success path: pending clears and credentials are present → card hides.
    await setup().vm.$emit('save-pending', false)
    await nextTick()
    expect(setup().exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'LiveDubbingControl' }).exists()).toBe(true)
  })

  it('keeps the setup card visible when a failed save restores the previous value', async () => {
    harness.store = makeStore()
    const wrapper = mountView({ providerId: 'gemini' })
    const setup = () => wrapper.findComponent({ name: 'LiveDubbingProviderSetup' })

    await setup().vm.$emit('save-pending', true)
    harness.store.settings.GEMINI_API_KEY = 'optimistic-draft-key'
    await nextTick()
    expect(setup().exists()).toBe(true)

    // Failure path restores the previous (empty) value → card stays mounted.
    harness.store.settings.GEMINI_API_KEY = ''
    await setup().vm.$emit('save-pending', false)
    await nextTick()
    expect(setup().exists()).toBe(true)
  })

  it('locks the provider select while a credential save is pending', async () => {
    harness.store = makeStore()
    const wrapper = mountView({ providerId: 'gemini' })
    const setup = () => wrapper.findComponent({ name: 'LiveDubbingProviderSetup' })

    await setup().vm.$emit('save-pending', true)
    await nextTick()
    expect(providerSelect(wrapper).attributes('disabled')).toBeDefined()

    harness.store.settings.GEMINI_API_KEY = 'saved-key'
    await setup().vm.$emit('save-pending', false)
    await nextTick()
    expect(providerSelect(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('remounts the control on an idle provider switch so stale state cannot survive', async () => {
    const wrapper = mountView({ providerId: 'gemini' })
    const control = () => wrapper.findComponent({ name: 'LiveDubbingControl' })
    const before = control().vm

    await wrapper.setProps({ providerId: 'openai' })

    expect(control().props('providerId')).toBe('openai')
    // :key follows the provider while idle → fresh instance, fresh state.
    expect(control().vm).not.toBe(before)
  })

  it('does not remount the control while busy, then remounts once idle', async () => {
    const wrapper = mountView({ providerId: 'gemini' })
    const control = () => wrapper.findComponent({ name: 'LiveDubbingControl' })

    control().vm.$emit('busy-change', true)
    await nextTick()
    const busyInstance = control().vm

    await wrapper.setProps({ providerId: 'openai' })
    expect(control().props('providerId')).toBe('openai')
    // Key frozen while busy: same instance, no mid-session remount.
    expect(control().vm).toBe(busyInstance)

    control().vm.$emit('busy-change', false)
    await nextTick()
    // Unlocking with a changed provider remounts to the fresh provider state.
    expect(control().vm).not.toBe(busyInstance)
    expect(control().props('providerId')).toBe('openai')
  })

  it('leaves a fresh control behind after successful credential setup', async () => {
    harness.store = makeStore({ GEMINI_API_KEY: 'existing-key' })
    const wrapper = mountView({ providerId: 'gemini' })
    const control = () => wrapper.findComponent({ name: 'LiveDubbingControl' })
    const setup = () => wrapper.findComponent({ name: 'LiveDubbingProviderSetup' })
    const before = control().vm

    // Re-enter setup while idle, then complete it successfully.
    harness.store.settings.GEMINI_API_KEY = ''
    await nextTick()
    expect(setup().exists()).toBe(true)
    expect(control().exists()).toBe(true)
    expect(wrapper.find('.live-dubbing-session-card').attributes('style')).toContain('display: none')

    // Save success while idle freshens the control; the persisted credential
    // then hides the setup card — no popup reopen required.
    await setup().vm.$emit('saved')
    harness.store.settings.GEMINI_API_KEY = 'freshly-saved-key'
    await nextTick()

    expect(control().vm).not.toBe(before)
    expect(setup().exists()).toBe(false)
  })

  it('does not remount the control for a save that completes while busy', async () => {
    harness.store = makeStore({ GEMINI_API_KEY: 'existing-key' })
    const wrapper = mountView({ providerId: 'gemini' })
    const control = () => wrapper.findComponent({ name: 'LiveDubbingControl' })

    control().vm.$emit('busy-change', true)
    await nextTick()
    const busyInstance = control().vm

    harness.store.settings.GEMINI_API_KEY = ''
    await nextTick()
    expect(wrapper.findComponent({ name: 'LiveDubbingProviderSetup' }).exists()).toBe(true)

    await wrapper.findComponent({ name: 'LiveDubbingProviderSetup' }).vm.$emit('saved')
    await nextTick()

    expect(control().vm).toBe(busyInstance)
  })
})
