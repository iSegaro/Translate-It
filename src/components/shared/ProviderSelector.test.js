import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'

const settingsStore = vi.hoisted(() => ({
  settings: null,
  isDarkTheme: false,
  updateSettingAndPersist: vi.fn(),
}))
settingsStore.settings = reactive({ TRANSLATION_API: 'googlev2', DEBUG_MODE: false, HIDDEN_PROVIDERS: [] })
const translationStore = vi.hoisted(() => ({ ephemeralSync: {}, selectedProvider: null }))
const registry = vi.hoisted(() => ({
  providers: [
    { id: 'googlev2', name: 'Google', icon: 'providers/google.svg', category: 'FREE', supported: true, features: ['translation', 'bulk'] },
  ],
}))
const openOptionsPage = vi.hoisted(() => vi.fn())
const extensionContext = vi.hoisted(() => ({ isContentScript: false }))
const trackedListeners = vi.hoisted(() => [])

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => settingsStore,
}))

vi.mock('@/features/translation/stores/translation.js', () => ({
  useTranslationStore: () => translationStore,
}))

vi.mock('@/core/helpers.js', () => ({ openOptionsPage }))

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({ handleError: vi.fn() }),
}))

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({
    t: (key) => {
      const labels = {
        popup_translate_button_text: 'Translate',
        popup_stop_button_title: 'Stop',
        provider_default: 'Default',
        provider_category_free: 'Traditional',
        provider_category_ai: 'AI',
        provider_category_local: 'Local',
        configure_providers: 'Configure Providers',
      }
      if (labels[key]) return labels[key]
      if (/(traditional|free)/i.test(key) && /(category|group|provider)/i.test(key)) return 'Traditional'
      if (/local/i.test(key) && /(category|group|provider)/i.test(key)) return 'Local'
      if (/\bai\b|_ai|ai_/i.test(key) && /(category|group|provider)/i.test(key)) return 'AI'
      if (/configure.*provider|provider.*configure/i.test(key)) return 'Configure Providers'
      return key
    },
  }),
}))

vi.mock('@/features/translation/composables/useTranslationModes.js', () => ({
  useSelectElementTranslation: () => ({
    isSelectModeActive: ref(false),
    deactivateSelectMode: vi.fn(),
  }),
}))

vi.mock('@/core/provider-registry.js', () => ({
  getProvidersForDropdown: (debugMode) => registry.providers.filter((provider) => provider.id !== 'mock' || debugMode),
  getProviderById: (id) => registry.providers.find((provider) => provider.id === id),
}))

vi.mock('@/features/translation/utils/providerValidator.js', () => ({
  isProviderConfigured: (id) => id !== 'unconfigured',
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
    isContentScript: () => extensionContext.isContentScript,
    GENERIC_FALLBACK_ICON: 'fallback.svg',
  },
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/composables/core/useResourceTracker.js', () => ({
  useResourceTracker: () => ({
    addEventListener: (target, event, listener, options) => {
      if (typeof event === 'string' && typeof listener === 'function') {
        target.addEventListener(event, listener, options)
        trackedListeners.push({ target, event, listener, options })
      }
    },
  }),
}))

import ProviderSelector from './ProviderSelector.vue'

afterEach(() => {
  trackedListeners.splice(0).forEach(({ target, event, listener, options }) => {
    target.removeEventListener(event, listener, options)
  })
})

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

  it('auto-triggers translate after provider selection by default', async () => {
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
      await wrapper.find('.ti-dropdown-item-btn').trigger('click')

      expect(wrapper.emitted('provider-change')).toEqual([['googlev2']])
      expect(wrapper.emitted('update:modelValue')).toEqual([['googlev2']])
      expect(wrapper.emitted('translate')).toEqual([[{ provider: 'googlev2' }]])
    } finally {
      wrapper?.unmount()
      container.remove()
    }
  })

  it('skips the automatic translate emit when translateOnProviderChange is false', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    let wrapper
    try {
      wrapper = mount(ProviderSelector, {
        props: { mode: 'split', modelValue: 'googlev2', translateOnProviderChange: false },
        global: { stubs: { Teleport: true } },
        attachTo: container,
      })

      const rootEl = wrapper.find('.ti-split-translate-button-container').element
      vi.spyOn(rootEl, 'getBoundingClientRect').mockReturnValue({
        top: 10, left: 10, right: 300, bottom: 50,
        width: 290, height: 40, x: 10, y: 10
      })

      await wrapper.find('.ti-provider-dropdown-area').trigger('click')
      await wrapper.find('.ti-dropdown-item').trigger('click')

      expect(wrapper.emitted('provider-change')).toEqual([['googlev2']])
      expect(wrapper.emitted('update:modelValue')).toEqual([['googlev2']])
      expect(wrapper.emitted('translate')).toBeUndefined()
    } finally {
      wrapper?.unmount()
      container.remove()
    }
  })
})

const providers = [
  { id: 'googlev2', name: 'Google', category: 'free', features: ['translation', 'bulk'] },
  { id: 'deepl', name: 'DeepL', category: 'free', needsApiKey: true, consumesTokens: true },
  { id: 'unconfigured', name: 'Unconfigured', category: 'free' },
  { id: 'openai', name: 'OpenAI', category: 'ai' },
  { id: 'gemini', name: 'Gemini', category: 'ai' },
  { id: 'browser', name: 'Browser', category: 'local' },
].map((provider) => ({
  icon: `providers/${provider.id}.svg`, supported: true, features: ['translation'], ...provider,
}))

const attachSelector = async (props = {}, { realTeleport = false, shadow = false, popupAncestor = false, rect } = {}) => {
  const container = document.createElement('div')
  if (popupAncestor) container.classList.add('translation-view')
  document.body.appendChild(container)
  let mountPoint = container
  let shadowRoot
  if (shadow) {
    const host = document.createElement('div')
    shadowRoot = host.attachShadow({ mode: 'open' })
    const overlay = document.createElement('div')
    overlay.className = 'ti-host-container'
    const shadowMount = document.createElement('div')
    overlay.appendChild(shadowMount)
    shadowRoot.appendChild(overlay)
    container.appendChild(host)
    mountPoint = shadowMount
    extensionContext.isContentScript = true
  }
  const global = realTeleport || shadow ? {} : { stubs: { Teleport: true } }
  const wrapper = mount(ProviderSelector, { props, attachTo: mountPoint, global })
  const anchor = wrapper.element.querySelector('.ti-split-translate-button-container, .ti-provider-button-container, .ti-provider-icon-only-container, .ti-provider-mobile-container')
  if (anchor) {
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      top: 10, left: 100, right: 300, bottom: 50, width: 200, height: 40, x: 100, y: 10,
      ...rect,
    })
  }
  return { wrapper, container, shadowRoot }
}

describe('ProviderSelector provider list contract', () => {
  beforeEach(() => {
    registry.providers = providers.map((provider) => ({ ...provider }))
    Object.assign(settingsStore.settings, { TRANSLATION_API: 'googlev2', DEBUG_MODE: false, HIDDEN_PROVIDERS: [] })
    settingsStore.updateSettingAndPersist.mockReset()
    openOptionsPage.mockReset()
    translationStore.ephemeralSync = {}
    translationStore.selectedProvider = null
    extensionContext.isContentScript = false
  })

  it('groups six providers by registry category in Traditional, AI, Local order, preserving manifest order', async () => {
    const { wrapper, container } = await attachSelector({ mode: 'button', modelValue: 'googlev2' })
    try {
      await wrapper.find('.ti-provider-button').trigger('click')
      const menu = wrapper.find('.ti-provider-dropdown-menu')
      const categoryLabels = Array.from(menu.element.querySelectorAll('*'))
        .filter((element) => !element.closest('.ti-dropdown-item') && element.children.length === 0)
        .map((element) => element.textContent.trim())
        .filter((text) => ['Traditional', 'AI', 'Local'].includes(text))
      expect(categoryLabels).toEqual(['Traditional', 'AI', 'Local'])
      expect(menu.findAll('.ti-dropdown-item').map((item) => item.text().trim())).toEqual([
        'Google', 'DeepL', 'Unconfigured', 'OpenAI', 'Gemini', 'Browser',
      ])
      const selected = menu.findAll('.ti-dropdown-item-btn')[0]
      const sibling = menu.findAll('.ti-dropdown-item-btn')[1]
      expect(selected.attributes('aria-current')).toBe('true')
      expect(sibling.attributes('aria-current')).not.toBe('true')
      expect(selected.find('img').attributes('alt')).toBe('')
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('uses unique menu and category IDs for selectors in the same Vue app', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const wrapper = mount({
      components: { ProviderSelector },
      template: '<div><ProviderSelector mode="button" model-value="googlev2" /><ProviderSelector mode="button" model-value="deepl" /></div>',
    }, { attachTo: container, global: { stubs: { Teleport: true } } })
    try {
      wrapper.element.querySelectorAll('.ti-provider-button-container').forEach((anchor) => {
        vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
          top: 10, left: 100, right: 300, bottom: 50, width: 200, height: 40, x: 100, y: 10,
        })
      })
      const triggers = wrapper.findAll('.ti-provider-button')
      await triggers[0].trigger('click')
      const outsideClickListeners = trackedListeners.filter(({ target, event }) => target === document && event === 'click')
      outsideClickListeners.forEach(({ target, event, listener, options }) => target.removeEventListener(event, listener, options))
      try {
        await triggers[1].trigger('click')
      } finally {
        outsideClickListeners.forEach(({ target, event, listener, options }) => target.addEventListener(event, listener, options))
      }

      const menuElements = Array.from(wrapper.element.querySelectorAll('.ti-provider-dropdown-menu'))
      const menuIds = menuElements.map((menu) => menu.id)
      expect(menuIds).toHaveLength(2)
      expect(menuIds.every(Boolean)).toBe(true)
      expect(new Set(menuIds).size).toBe(2)
      expect(triggers.map((trigger) => trigger.attributes('aria-controls'))).toEqual(menuIds)

      const headerIds = menuElements.flatMap((menu) =>
        Array.from(menu.querySelectorAll('.ti-dropdown-group-header'), (header) => header.id),
      )
      expect(headerIds.length).toBeGreaterThan(0)
      expect(headerIds.every(Boolean)).toBe(true)
      expect(new Set(headerIds).size).toBe(headerIds.length)
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('keeps small and single-category lists flat', async () => {
    registry.providers = providers.slice(0, 5).map((provider) => ({ ...provider }))
    const { wrapper, container } = await attachSelector({ mode: 'button', modelValue: 'googlev2' })
    try {
      await wrapper.find('.ti-provider-button').trigger('click')
      expect(wrapper.find('.ti-provider-dropdown-menu').text()).not.toContain('Traditional')
    } finally {
      wrapper.unmount()
      container.remove()
    }

    registry.providers = providers.slice(0, 6).map((provider) => ({ ...provider, category: 'free' }))
    const singleCategory = await attachSelector({ mode: 'button', modelValue: 'googlev2' })
    try {
      await singleCategory.wrapper.find('.ti-provider-button').trigger('click')
      expect(singleCategory.wrapper.find('.ti-provider-dropdown-menu').text()).not.toContain('Traditional')
    } finally {
      singleCategory.wrapper.unmount()
      singleCategory.container.remove()
    }
  })

  it('applies debug, hidden, configured, feature, and default filters before displaying providers', async () => {
    registry.providers.push({ id: 'mock', name: 'Mock', category: 'local', icon: 'mock.svg', supported: true, features: ['translation'] })
    settingsStore.settings.HIDDEN_PROVIDERS = ['deepl']
    let mounted = await attachSelector({ mode: 'button', modelValue: 'googlev2', onlyConfigured: true })
    try {
      await mounted.wrapper.find('.ti-provider-button').trigger('click')
      expect(mounted.wrapper.findAll('.ti-dropdown-item').map((item) => item.text().trim())).toEqual(['Google', 'OpenAI', 'Gemini', 'Browser'])
    } finally {
      mounted.wrapper.unmount()
      mounted.container.remove()
    }

    mounted = await attachSelector({ mode: 'button', modelValue: 'googlev2', ignoreHidden: true, allowDefault: true, requiredFeature: 'bulk' })
    try {
      await mounted.wrapper.find('.ti-provider-button').trigger('click')
      expect(mounted.wrapper.findAll('.ti-dropdown-item').map((item) => item.text().trim())).toEqual(['Default', 'Google'])
    } finally {
      mounted.wrapper.unmount()
      mounted.container.remove()
    }

    settingsStore.settings.DEBUG_MODE = true
    mounted = await attachSelector({ mode: 'button', modelValue: 'googlev2' })
    try {
      await mounted.wrapper.find('.ti-provider-button').trigger('click')
      expect(mounted.wrapper.findAll('.ti-dropdown-item').map((item) => item.text().trim())).toContain('Mock')
    } finally {
      mounted.wrapper.unmount()
      mounted.container.remove()
    }
  })

  it('opens provider configuration from the menu footer', async () => {
    const { wrapper, container } = await attachSelector({ mode: 'button', modelValue: 'googlev2' })
    try {
      await wrapper.find('.ti-provider-button').trigger('click')
      const configureButton = wrapper.findAll('button').find((button) => button.text().includes('Configure Providers'))
      expect(configureButton).toBeTruthy()
      await configureButton.trigger('click')
      expect(openOptionsPage).toHaveBeenCalledWith('providers')
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('keeps category order as keyboard navigation order and selects on Enter', async () => {
    const { wrapper, container } = await attachSelector({ mode: 'button', modelValue: 'googlev2' })
    try {
      const trigger = wrapper.find('.ti-provider-button')
      trigger.element.focus()
      await trigger.trigger('click')
      const keyOnFocusedControl = async (key) => {
        const activeElement = document.activeElement
        expect(activeElement).toBeTruthy()
        activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
        await wrapper.vm.$nextTick()
      }
      await keyOnFocusedControl('ArrowDown')
      await keyOnFocusedControl('ArrowDown')
      await keyOnFocusedControl('Enter')
      expect(wrapper.emitted('provider-change')).toEqual([['unconfigured']])
      expect(wrapper.emitted('update:modelValue')).toEqual([['unconfigured']])
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('renders each mode with its expected provider-selection control', async () => {
    for (const mode of ['split', 'button', 'icon-only', 'mobile']) {
      const { wrapper, container } = await attachSelector({ mode, modelValue: 'googlev2' })
      try {
        const trigger = wrapper.find({
          split: '.ti-provider-dropdown-area',
          button: '.ti-provider-button',
          'icon-only': '.ti-provider-icon-button',
          mobile: '.ti-provider-mobile-button',
        }[mode])
        expect(trigger.exists()).toBe(true)
        await trigger.trigger('click')
        expect(wrapper.find('.ti-provider-dropdown-menu').exists()).toBe(true)
      } finally {
        wrapper.unmount()
        container.remove()
      }
    }

    const { wrapper, container } = await attachSelector({ mode: 'compact', modelValue: 'googlev2' })
    try {
      expect(wrapper.find('select.ti-provider-select').exists()).toBe(true)
      expect(wrapper.findAll('select option')).toHaveLength(6)
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('keeps Default and every provider selectable in compact mode and exposes configuration', async () => {
    const { wrapper, container } = await attachSelector({ mode: 'compact', modelValue: 'googlev2', allowDefault: true })
    try {
      const select = wrapper.get('select.ti-provider-select')
      expect(Array.from(select.element.options).map((option) => option.value)).toEqual([
        'default', 'googlev2', 'deepl', 'unconfigured', 'openai', 'gemini', 'browser',
      ])
      await select.setValue('deepl')
      expect(wrapper.emitted('provider-change')).toEqual([['deepl']])

      const configure = wrapper.get('.ti-provider-compact-config-btn')
      expect(configure.attributes('aria-label')).toBe('Configure Providers')
      await configure.trigger('click')
      expect(openOptionsPage).toHaveBeenCalledWith('providers')
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it.each([true, false])('persists only global selection (isGlobal=%s)', async (isGlobal) => {
    const { wrapper, container } = await attachSelector({ mode: 'button', modelValue: 'googlev2', isGlobal })
    try {
      await wrapper.find('.ti-provider-button').trigger('click')
      await wrapper.findAll('.ti-dropdown-item')[1].trigger('click')
      expect(wrapper.emitted('provider-change')).toEqual([['deepl']])
      expect(translationStore.selectedProvider).toBe('deepl')
      expect(settingsStore.updateSettingAndPersist).toHaveBeenCalledTimes(isGlobal ? 1 : 0)
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('keeps default-star persistence independent from temporary selection and sync toggling', async () => {
    const { wrapper, container } = await attachSelector({
      mode: 'button', modelValue: 'googlev2', isGlobal: false, allowSetDefault: true, showSync: true,
    })
    try {
      await wrapper.find('.ti-provider-button').trigger('click')
      const deeplItem = wrapper.findAll('.ti-dropdown-item')[1]
      await deeplItem.find('.ti-set-default-btn').trigger('click')
      expect(settingsStore.updateSettingAndPersist).toHaveBeenCalledWith('TRANSLATION_API', 'deepl')
      expect(wrapper.emitted('provider-change')).toEqual([['deepl']])

      await wrapper.find('.ti-provider-button').trigger('click')
      expect(wrapper.findAll('.ti-sync-row')).toHaveLength(2)
      await wrapper.findAll('.ti-sync-row')[0].trigger('click')
      expect(translationStore.ephemeralSync.page).toBe(true)
      expect(settingsStore.updateSettingAndPersist).toHaveBeenCalledTimes(1)
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('closes on Escape from the focused dropdown control and restores trigger focus', async () => {
    const { wrapper, container } = await attachSelector({ mode: 'button', modelValue: 'googlev2' })
    try {
      const trigger = wrapper.find('.ti-provider-button')
      trigger.element.focus()
      await trigger.trigger('click')
      const focusedControl = document.activeElement
      expect(focusedControl).toBeTruthy()
      focusedControl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.ti-provider-dropdown-menu').exists()).toBe(false)
      expect(document.activeElement).toBe(trigger.element)
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('keeps star, sync, and configure controls tabbable without intercepting Tab', async () => {
    const { wrapper, container } = await attachSelector({
      mode: 'button', modelValue: 'googlev2', isGlobal: false, allowSetDefault: true, showSync: true,
    }, { realTeleport: true })
    try {
      await wrapper.find('.ti-provider-button').trigger('click')
      const menu = document.body.querySelector('.ti-provider-dropdown-menu')
      const buttons = Array.from(menu.querySelectorAll('button'))
      const star = buttons.find((button) => button.classList.contains('ti-set-default-btn'))
      const sync = buttons.find((button) => button.classList.contains('ti-sync-row'))
      const configure = buttons.find((button) => button.textContent.includes('Configure Providers'))
      expect(star).toBeTruthy()
      expect(sync).toBeTruthy()
      expect(configure).toBeTruthy()
      expect(buttons.indexOf(star)).toBeLessThan(buttons.indexOf(sync))
      expect(buttons.indexOf(sync)).toBeLessThan(buttons.indexOf(configure))

      star.focus()
      expect(document.activeElement).toBe(star)
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      document.activeElement.dispatchEvent(tab)
      await wrapper.vm.$nextTick()
      expect(tab.defaultPrevented).toBe(false)
      expect(document.body.querySelector('.ti-provider-dropdown-menu')).toBe(menu)
      sync.focus()
      expect(document.activeElement).toBe(sync)
      configure.focus()
      expect(document.activeElement).toBe(configure)
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('teleports into the document and positions the menu using RTL inline coordinates', async () => {
    const previousDir = document.documentElement.dir
    document.documentElement.dir = 'rtl'
    const { wrapper, container } = await attachSelector({ mode: 'button', modelValue: 'googlev2' }, { realTeleport: true })
    try {
      await wrapper.find('.ti-provider-button').trigger('click')
      const menu = document.body.querySelector('.ti-provider-dropdown-menu')
      expect(menu).toBeTruthy()
      expect(menu.getAttribute('style')).toContain(`right: ${window.innerWidth - 300}px`)
    } finally {
      wrapper.unmount()
      container.remove()
      document.documentElement.dir = previousDir
    }
  })

  it('marks only Popup Text menus for popup sizing and keeps provider controls intact', async () => {
    const longName = 'A deliberately long provider display name that should remain available'
    registry.providers[1].name = longName
    const { wrapper, container } = await attachSelector({
      mode: 'split', modelValue: 'googlev2', isGlobal: false, allowSetDefault: true, showSync: true,
    }, { realTeleport: true, popupAncestor: true })
    try {
      await wrapper.find('.ti-provider-dropdown-area').trigger('click')
      const menu = document.body.querySelector('.ti-provider-dropdown-menu')
      expect(menu.classList.contains('ti-provider-dropdown-menu--popup')).toBe(true)
      expect(menu.textContent).toContain(longName)
      expect(menu.querySelector('.ti-set-default-btn')).toBeTruthy()
      expect(menu.querySelectorAll('.ti-sync-row')).toHaveLength(2)
      expect(menu.querySelector('.ti-configure-row')).toBeTruthy()
    } finally {
      wrapper.unmount()
      container.remove()
    }

    for (const mode of ['split', 'button', 'icon-only', 'mobile']) {
      const regular = await attachSelector({ mode, modelValue: 'googlev2' }, { realTeleport: true })
      try {
        await regular.wrapper.find({
          split: '.ti-provider-dropdown-area',
          button: '.ti-provider-button',
          'icon-only': '.ti-provider-icon-button',
          mobile: '.ti-provider-mobile-button',
        }[mode]).trigger('click')
        const menu = document.body.querySelector('.ti-provider-dropdown-menu')
        expect(menu.classList.contains('ti-provider-dropdown-menu--popup')).toBe(false)
        expect(menu.style.width).not.toBe('245px')
      } finally {
        regular.wrapper.unmount()
        regular.container.remove()
      }
    }
  })

  it.each([
    { label: 'LTR near the right edge', width: 360, dir: 'ltr', rect: { left: 250, right: 300, width: 50 } },
    { label: 'RTL near the left edge', width: 360, dir: 'rtl', rect: { left: 10, right: 60, width: 50 } },
    { label: 'narrow viewport', width: 240, dir: 'ltr', rect: { left: 180, right: 220, width: 40 } },
  ])('clamps Popup Text menu within the viewport: $label', async ({ width, dir, rect }) => {
    const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    const previousDir = document.documentElement.dir
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    document.documentElement.dir = dir
    const { wrapper, container } = await attachSelector(
      { mode: 'split', modelValue: 'googlev2' },
      { realTeleport: true, popupAncestor: true, rect },
    )
    try {
      await wrapper.find('.ti-provider-dropdown-area').trigger('click')
      const menu = document.body.querySelector('.ti-provider-dropdown-menu')
      expect(menu.classList.contains('ti-provider-dropdown-menu--popup')).toBe(true)
      const menuWidth = Math.min(245, width - 16)
      const left = menu.style.left !== 'auto'
        ? Number.parseFloat(menu.style.left)
        : width - Number.parseFloat(menu.style.right) - menuWidth
      expect(left).toBeGreaterThanOrEqual(8)
      expect(left + menuWidth).toBeLessThanOrEqual(width - 8)
    } finally {
      wrapper.unmount()
      container.remove()
      document.documentElement.dir = previousDir
      if (widthDescriptor) Object.defineProperty(window, 'innerWidth', widthDescriptor)
      else delete window.innerWidth
    }
  })

  it('allows provider selection and Configure Providers clicks inside the real teleported menu', async () => {
    const { wrapper, container } = await attachSelector(
      { mode: 'button', modelValue: 'googlev2' }, { realTeleport: true },
    )
    try {
      await wrapper.find('.ti-provider-button').trigger('click')
      const menu = document.body.querySelector('.ti-provider-dropdown-menu')
      await menu.querySelectorAll('.ti-dropdown-item-btn')[1].click()
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('provider-change')).toEqual([['deepl']])
      expect(document.body.querySelector('.ti-provider-dropdown-menu')).toBeNull()

      await wrapper.find('.ti-provider-button').trigger('click')
      const configure = Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent.includes('Configure Providers'))
      expect(configure).toBeTruthy()
      configure.click()
      expect(openOptionsPage).toHaveBeenCalledWith('providers')
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('does not classify a real teleported menu click as outside during capture', async () => {
    const { wrapper, container } = await attachSelector(
      { mode: 'button', modelValue: 'googlev2' }, { realTeleport: true },
    )
    let captureState
    try {
      const trigger = wrapper.find('.ti-provider-button')
      await trigger.trigger('click')
      const menu = document.body.querySelector('.ti-provider-dropdown-menu')
      const observeCapture = () => { captureState = wrapper.vm.$.setupState.isDropdownOpen }
      document.addEventListener('click', observeCapture, true)
      try {
        menu.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
      } finally {
        document.removeEventListener('click', observeCapture, true)
      }
      expect(captureState).toBe(true)
      await wrapper.vm.$nextTick()
      expect(trigger.attributes('aria-expanded')).toBe('true')
      expect(document.body.querySelector('.ti-provider-dropdown-menu')).toBe(menu)
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('preserves provider selection when a row-edge pointer sequence moves focus before click', async () => {
    const { wrapper, container } = await attachSelector(
      { mode: 'button', modelValue: 'googlev2' }, { realTeleport: true },
    )
    try {
      const trigger = wrapper.find('.ti-provider-button')
      await trigger.trigger('click')
      const menu = document.body.querySelector('.ti-provider-dropdown-menu')
      const row = menu.querySelectorAll('.ti-dropdown-item')[1]
      const rowButton = row.querySelector('.ti-dropdown-item-btn')
      rowButton.focus()

      // jsdom has no CSS hit testing; the row container represents its padding edge.
      row.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }))
      row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
      rowButton.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(trigger.attributes('aria-expanded')).toBe('true')

      row.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(wrapper.emitted('provider-change')).toEqual([['deepl']])
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('keeps star, sync, and configure clicks independent from provider selection', async () => {
    const { wrapper, container } = await attachSelector({
      mode: 'button', modelValue: 'googlev2', isGlobal: false, allowSetDefault: true, showSync: true,
    }, { realTeleport: true })
    try {
      const trigger = wrapper.find('.ti-provider-button')
      await trigger.trigger('click')
      let menu = document.body.querySelector('.ti-provider-dropdown-menu')
      await menu.querySelector('.ti-dropdown-item-btn[aria-current="true"]')
        .closest('.ti-dropdown-item').querySelector('.ti-set-default-btn').click()
      expect(settingsStore.updateSettingAndPersist).toHaveBeenCalledWith('TRANSLATION_API', 'googlev2')
      expect(wrapper.emitted('provider-change')).toBeUndefined()

      await trigger.trigger('click')
      menu = document.body.querySelector('.ti-provider-dropdown-menu')
      menu.querySelector('.ti-sync-row').click()
      expect(translationStore.ephemeralSync.page).toBe(true)
      expect(wrapper.emitted('provider-change')).toBeUndefined()

      await trigger.trigger('click')
      menu = document.body.querySelector('.ti-provider-dropdown-menu')
      menu.querySelector('.ti-configure-row').click()
      expect(openOptionsPage).toHaveBeenCalledWith('providers')
      expect(wrapper.emitted('provider-change')).toBeUndefined()
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('dismisses on a real outside click without selecting or stealing focus', async () => {
    const { wrapper, container } = await attachSelector(
      { mode: 'button', modelValue: 'googlev2' }, { realTeleport: true },
    )
    const outside = document.createElement('button')
    outside.textContent = 'Outside'
    container.appendChild(outside)
    try {
      const trigger = wrapper.find('.ti-provider-button')
      await trigger.trigger('click')
      const triggerFocus = vi.spyOn(trigger.element, 'focus')
      outside.click()
      await wrapper.vm.$nextTick()
      expect(document.body.querySelector('.ti-provider-dropdown-menu')).toBeNull()
      expect(wrapper.emitted('provider-change')).toBeUndefined()
      expect(triggerFocus).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })

  it('teleports into the component shadow root when running in content-script context', async () => {
    const { wrapper, container, shadowRoot } = await attachSelector(
      { mode: 'button', modelValue: 'googlev2' }, { shadow: true },
    )
    try {
      await wrapper.find('.ti-provider-button').trigger('click')
      const menu = shadowRoot.querySelector('.ti-provider-dropdown-menu')
      expect(menu).toBeTruthy()
      expect(document.body.querySelector('.ti-provider-dropdown-menu')).toBeNull()
      const trigger = wrapper.find('.ti-provider-button')
      menu.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
      await wrapper.vm.$nextTick()
      expect(trigger.attributes('aria-expanded')).toBe('true')
      const configure = Array.from(shadowRoot.querySelectorAll('button'))
        .find((button) => button.textContent.includes('Configure Providers'))
      expect(configure).toBeTruthy()
      configure.click()
      expect(openOptionsPage).toHaveBeenCalledWith('providers')
    } finally {
      wrapper.unmount()
      container.remove()
    }
  })
})
