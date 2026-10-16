import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ref } from 'vue'
import SidepanelToolbar from './SidepanelToolbar.vue'
import MaskIcon from '@/components/shared/MaskIcon.vue'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..', '..')

const GET = MessageActions.DESKTOP_FAB_GET_STATUS
const SET = MessageActions.DESKTOP_FAB_SET_OVERRIDE
const TAB = { id: 11, windowId: 7, url: 'https://example.com/page' }

const reply = (status, extra = {}) => ({ success: true, status, url: TAB.url, ...extra })

const mocks = vi.hoisted(() => ({
  translations: {},
  settings: null,
  sendMessage: vi.fn(),
  showVisualFeedback: vi.fn(),
  toggleMouseHover: vi.fn(),
  findProviderById: vi.fn(() => ({ features: ['bulk'] }))
}))

vi.mock('@/features/translation/composables/useTranslationModes.js', () => ({
  useSelectElementTranslation: () => ({
    isSelectModeActive: ref(false),
    activateSelectMode: vi.fn().mockResolvedValue(true),
    deactivateSelectMode: vi.fn().mockResolvedValue(true),
    isActivating: ref(false)
  }),
  useSidepanelActions: () => ({ revertTranslation: vi.fn().mockResolvedValue(true) })
}))

vi.mock('@/features/mouse-hover/composables/useMouseHoverToggle.js', () => ({
  useMouseHoverToggle: () => ({ isMouseHoverEnabled: ref(false), toggleMouseHover: mocks.toggleMouseHover })
}))

vi.mock('@/features/translation/stores/translation.js', () => ({
  useTranslationStore: () => ({
    uiTargetLanguage: 'en',
    ephemeralSync: {},
    selectedProvider: '',
    currentTranslation: {}
  })
}))

vi.mock('@/composables/ui/useUI.js', () => ({
  useUI: () => ({ showVisualFeedback: mocks.showVisualFeedback })
}))

vi.mock('@/composables/shared/useErrorHandler.js', () => ({
  useErrorHandler: () => ({ handleError: vi.fn() })
}))

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (key, fallback) => (fallback !== undefined ? fallback : key) })
}))

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => ({ settings: mocks.settings })
}))

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    Field: 'field', Select_Element: 'select-element', Selection: 'selection',
    Page: 'page', MouseHover: 'mouse-hover'
  }
}))

vi.mock('@/features/translation/providers/ProviderManifest.js', () => ({
  findProviderById: (...args) => mocks.findProviderById(...args)
}))

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: (...args) => mocks.sendMessage(...args)
}))

vi.mock('@/core/ExtensionAppLauncher.js', () => ({ openExtensionApp: vi.fn() }))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

vi.mock('@/components/shared/ProviderSelector.vue', () => ({
  default: {
    name: 'ProviderSelector',
    props: ['modelValue', 'mode', 'isGlobal', 'onlyConfigured'],
    emits: ['provider-change', 'update:modelValue'],
    template: '<div class="provider-selector-stub" />'
  }
}))

vi.mock('@/features/page-translation/components/PageTranslationButton.vue', () => ({
  default: {
    name: 'PageTranslationButton',
    props: ['compact', 'targetLanguage', 'disabled'],
    template: '<div class="page-translation-stub" />'
  }
}))

/** Minimal browser event: mirrors add/removeListener + emit for assertions. */
const makeEvent = () => {
  const listeners = []
  return {
    listeners,
    addListener: vi.fn((fn) => listeners.push(fn)),
    removeListener: vi.fn((fn) => {
      const index = listeners.indexOf(fn)
      if (index >= 0) listeners.splice(index, 1)
    }),
    emit: (...args) => listeners.slice().forEach((fn) => fn(...args))
  }
}

describe('SidepanelToolbar Desktop FAB toggle', () => {
  let tabsActivated
  let tabsUpdated
  let navHistory
  let navFragment
  let wrapper
  let originalOpenOptionsPage

  /** Drain the read chain: query → GET → confirm-query → apply. */
  const drain = async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve()
    // The wrapper may already be unmounted when draining a teardown sequence.
    if (wrapper) await wrapper.vm.$nextTick()
    for (let i = 0; i < 4; i += 1) await Promise.resolve()
  }

  const fabButton = () => wrapper.get('#fabVisibilityBtn')
  const getCallCount = () => globalThis.browser.tabs.sendMessage.mock.calls
    .filter(([, message]) => message.action === GET).length

  const mountToolbar = async () => {
    wrapper = mount(SidepanelToolbar, { attachTo: document.body })
    await drain()
    return wrapper
  }

  beforeEach(() => {
    mocks.translations = {}
    mocks.settings = {
      EXTENSION_ENABLED: true,
      TRANSLATE_WITH_SELECT_ELEMENT: true,
      WHOLE_PAGE_TRANSLATION_ENABLED: true,
      ENABLE_SCREEN_CAPTURE: true,
      MODE_PROVIDERS: {},
      TRANSLATION_API: 'google'
    }
    mocks.sendMessage = vi.fn().mockResolvedValue({})
    mocks.showVisualFeedback.mockReset()
    mocks.toggleMouseHover.mockReset()
    originalOpenOptionsPage = globalThis.browser.runtime.openOptionsPage
    globalThis.browser.runtime.openOptionsPage = vi.fn().mockResolvedValue(undefined)
    globalThis.browser.tabs.query = vi.fn(async () => [TAB])
    globalThis.browser.tabs.sendMessage = vi.fn(async () => reply('hidden'))
    tabsActivated = makeEvent()
    tabsUpdated = makeEvent()
    navHistory = makeEvent()
    navFragment = makeEvent()
    globalThis.browser.tabs.onActivated = tabsActivated
    globalThis.browser.tabs.onUpdated = tabsUpdated
    globalThis.browser.webNavigation = {
      onHistoryStateUpdated: navHistory,
      onReferenceFragmentUpdated: navFragment
    }
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
    delete document.visibilityState
    delete globalThis.browser.webNavigation
    if (originalOpenOptionsPage === undefined) delete globalThis.browser.runtime.openOptionsPage
    else globalThis.browser.runtime.openOptionsPage = originalOpenOptionsPage
  })

  // ── Structure / order ──────────────────────────────────────────────────

  it('places the FAB toggle first in the lower group: FAB → PDF → Subtitle → Settings', async () => {
    await mountToolbar()

    const lower = wrapper.findAll('.toolbar-group-bottom > .toolbar-button')
    expect(lower.map((button) => button.attributes('id'))).toEqual([
      'fabVisibilityBtn', 'pdfBtn', 'subtitleBtn', 'settingsBtn'
    ])
    // The upper group is untouched: same 8 children, no FAB entry.
    const upperChildren = [...wrapper.get('.toolbar-group').element.children]
    expect(upperChildren).toHaveLength(8)
    expect(wrapper.find('.toolbar-group #fabVisibilityBtn').exists()).toBe(false)
    expect(upperChildren.map((child) => child.id)).toEqual([
      'selectElementBtn', 'revertActionBtn', '', '', 'screenCaptureBtn', '', '', 'historyBtn'
    ])
    // Both groups keep the shared row contract.
    for (const button of lower) expect(button.classes()).toContain('toolbar-button')
  })

  it('renders decorative accessible mask icons on the four migrated rail actions', async () => {
    await mountToolbar()
    const findMaskButton = (part) => wrapper.findAll('button.toolbar-button').find((button) => {
      const icon = button.findComponent(MaskIcon)
      return icon.exists() && icon.props('src').includes(part)
    })
    const buttons = [
      findMaskButton('mouse-hover'),
      wrapper.get('#screenCaptureBtn'),
      wrapper.get('#historyBtn'),
      wrapper.get('#settingsBtn')
    ]

    for (const button of buttons) {
      const icon = button.findComponent(MaskIcon)
      expect(button.element.tagName).toBe('BUTTON')
      expect(button.attributes('aria-label')).toBeTruthy()
      expect(button.attributes('aria-label')).toBe(button.attributes('title'))
      expect(icon.classes()).toContain('toolbar-mask-icon')
      expect(icon.props('size')).toBe(22)
      expect(icon.attributes('aria-hidden')).toBe('true')
    }

    expect(wrapper.get('#pdfBtn img').attributes('src')).toContain('pdf_viewer/pdf.png')
    expect(wrapper.get('#subtitleBtn img').attributes('src')).toContain('subtitle.svg')
  })

  it('activates each migrated rail action once for click, Enter, and Space', async () => {
    await mountToolbar()
    const findMaskButton = (part) => wrapper.findAll('button.toolbar-button').find((button) => {
      const icon = button.findComponent(MaskIcon)
      return icon.exists() && icon.props('src').includes(part)
    })
    const actions = [
      { button: findMaskButton('mouse-hover'), count: () => mocks.toggleMouseHover.mock.calls.length },
      {
        button: wrapper.get('#screenCaptureBtn'),
        count: () => mocks.sendMessage.mock.calls.filter(([message]) =>
          message.action === MessageActions.START_SCREEN_CAPTURE).length
      },
      { button: wrapper.get('#historyBtn'), count: () => wrapper.emitted('historyToggle')?.length || 0 },
      { button: wrapper.get('#settingsBtn'), count: () => globalThis.browser.runtime.openOptionsPage.mock.calls.length }
    ]

    for (const { button, count } of actions) {
      await button.trigger('click')
      await button.trigger('keydown', { key: 'Enter' })
      await button.trigger('keydown', { key: ' ' })
      await drain()
      expect(count()).toBe(3)
    }
  })

  it('renders the glyph as a MaskIcon sized to the rail, without .toolbar-icon', async () => {
    await mountToolbar()

    const button = fabButton()
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')

    const icon = button.findComponent(MaskIcon)
    expect(icon.exists()).toBe(true)
    expect(icon.props('size')).toBe(22)
    // .toolbar-icon carries --icon-filter (dark invert): a mask must not get it.
    expect(icon.classes()).not.toContain('toolbar-icon')
    expect(icon.classes()).toContain('fab-toggle-icon')
    expect(icon.attributes('aria-hidden')).toBe('true')
  })

  // ── Status → label / icon (content is the only source) ────────────────

  it('offers "Show FAB for Now" with the open-eye icon while the FAB is hidden', async () => {
    await mountToolbar()

    const button = fabButton()
    expect(button.attributes('title')).toBe('Show FAB for Now')
    expect(button.attributes('aria-label')).toBe('Show FAB for Now')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.findComponent(MaskIcon).props('src')).toContain('eye-open.svg')
  })

  it('offers "Hide FAB for Now" with the closed-eye icon while the FAB is visible', async () => {
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) =>
      message.action === GET ? reply('visible') : reply('visible'))
    await mountToolbar()

    const button = fabButton()
    expect(button.attributes('title')).toBe('Hide FAB for Now')
    expect(button.attributes('aria-label')).toBe('Hide FAB for Now')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.findComponent(MaskIcon).props('src')).toContain('eye-hide.svg')
  })

  it('stays disabled with the loading explanation until the status lands', async () => {
    let resolveStatus
    globalThis.browser.tabs.sendMessage.mockImplementation(() =>
      new Promise((resolveStatusPromise) => { resolveStatus = resolveStatusPromise }))
    await mountToolbar()

    const button = fabButton()
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toBe('Reading the floating button’s status…')
    expect(button.attributes('aria-label')).toBe('Reading the floating button’s status…')

    resolveStatus(reply('hidden'))
    await drain()
    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('title')).toBe('Show FAB for Now')
  })

  it('explains an unavailable status with the recognized localized reason', async () => {
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) =>
      message.action === GET
        ? reply('unavailable', { reason: 'fullscreen' })
        : reply('unavailable', { reason: 'fullscreen' }))
    await mountToolbar()

    const button = fabButton()
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toBe('The floating button is hidden while this page is fullscreen.')
    expect(button.attributes('aria-label')).toBe('The floating button is hidden while this page is fullscreen.')
  })

  it('never leaks raw transport errors into title or aria-label', async () => {
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) => {
      if (message.action !== GET) return {}
      throw new Error('Could not establish connection. Receiving end does not exist.')
    })
    await mountToolbar()

    const button = fabButton()
    const generic = 'The floating button’s status is unavailable on this page.'
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toBe(generic)
    expect(button.attributes('aria-label')).toBe(generic)
    expect(button.attributes('title')).not.toContain('Could not establish connection')
    // Never claims a state it does not have.
    expect(button.attributes('title')).not.toContain('FAB for Now')
  })

  it('uses only localized copy that already exists in en, fa and ja', () => {
    const keys = [
      'popup_fab_show_label',
      'popup_fab_hide_label',
      'popup_fab_loading_reason',
      'popup_fab_unavailable_reason',
      'popup_fab_reason_disabled_by_setting',
      'popup_fab_reason_fullscreen',
      'popup_fab_reason_ui_absent'
    ]
    const localesDir = resolve(srcDir, '_locales')
    const read = (locale) =>
      JSON.parse(readFileSync(resolve(localesDir, `${locale}/messages.json`), 'utf8'))

    for (const locale of ['en', 'fa', 'ja']) {
      const messages = read(locale)
      for (const key of keys) {
        expect(messages[key], `${locale} is missing ${key}`).toBeTruthy()
        expect(String(messages[key].message).trim()).not.toBe('')
      }
    }
    // Reused strings must be genuinely translated, not English passthroughs.
    const fa = read('fa')
    expect(fa.popup_fab_show_label.message).not.toBe('Show FAB for Now')
    expect(fa.popup_fab_hide_label.message).not.toBe('Hide FAB for Now')
    const ja = read('ja')
    expect(ja.popup_fab_show_label.message).not.toBe('Show FAB for Now')
  })

  // ── Wire contract ─────────────────────────────────────────────────────

  it('reads the status from the active tab of this window at frame 0', async () => {
    await mountToolbar()

    expect(globalThis.browser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true })
    expect(globalThis.browser.tabs.sendMessage).toHaveBeenCalledWith(
      TAB.id, { action: GET }, { frameId: 0 }
    )
  })

  it('fails closed when the reply does not echo the target URL', async () => {
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) =>
      message.action === GET ? { success: true, status: 'visible', url: 'https://other.example/' } : {})
    await mountToolbar()

    const button = fabButton()
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title'))
      .toBe('The floating button’s status is unavailable on this page.')
  })

  it('fails closed when the reply reports success:false despite a visible status', async () => {
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) =>
      message.action === GET ? { success: false, status: 'visible', url: TAB.url } : {})
    await mountToolbar()

    const button = fabButton()
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).not.toContain('Hide FAB for Now')
  })

  it('rejects a reply that resolves after the active tab changed to the same URL', async () => {
    globalThis.browser.tabs.query
      .mockResolvedValueOnce([TAB])                                            // initial read
      .mockResolvedValueOnce([{ id: 99, windowId: 7, url: TAB.url }])          // identity confirm
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) =>
      message.action === GET ? reply('visible') : {})
    await mountToolbar()

    const button = fabButton()
    expect(globalThis.browser.tabs.sendMessage).toHaveBeenCalledWith(
      TAB.id, { action: GET }, { frameId: 0 }
    )
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).not.toContain('Hide FAB for Now')
  })

  // ── Tab / navigation / focus listeners ────────────────────────────────

  it('refreshes on activation of this window and ignores other windows', async () => {
    await mountToolbar()
    expect(getCallCount()).toBe(1)

    tabsActivated.emit({ tabId: 12, windowId: 7 })
    await drain()
    expect(getCallCount()).toBe(2)

    tabsActivated.emit({ tabId: 13, windowId: 8 })
    await drain()
    expect(getCallCount()).toBe(2)
  })

  it('refreshes only on full navigations of the target tab', async () => {
    await mountToolbar()
    expect(getCallCount()).toBe(1)

    // Full URL change on the target tab.
    tabsUpdated.emit(TAB.id, { url: 'https://example.com/next' }, { ...TAB, url: 'https://example.com/next' })
    await drain()
    expect(getCallCount()).toBe(2)

    // Load completion on the target tab.
    tabsUpdated.emit(TAB.id, { status: 'complete' }, TAB)
    await drain()
    expect(getCallCount()).toBe(3)

    // Progress/title noise and other tabs are ignored.
    tabsUpdated.emit(TAB.id, { title: 'Loading…', status: 'loading' }, TAB)
    tabsUpdated.emit(77, { url: 'https://elsewhere.test/' }, { id: 77, windowId: 7, url: 'https://elsewhere.test/' })
    tabsUpdated.emit(TAB.id, { url: 'https://example.com/next' }, { ...TAB, url: 'https://elsewhere.test/', windowId: 8 })
    await drain()
    expect(getCallCount()).toBe(3)
  })

  it('refreshes on SPA and hash changes of the target tab at frame 0 only', async () => {
    await mountToolbar()
    expect(getCallCount()).toBe(1)

    navHistory.emit({ tabId: TAB.id, frameId: 0, url: `${TAB.url}#/spa` })
    await drain()
    expect(getCallCount()).toBe(2)

    navFragment.emit({ tabId: TAB.id, frameId: 0, url: `${TAB.url}#section` })
    await drain()
    expect(getCallCount()).toBe(3)

    // Subframes and foreign tabs are ignored.
    navHistory.emit({ tabId: TAB.id, frameId: 2, url: `${TAB.url}#/iframe` })
    navFragment.emit({ tabId: 77, frameId: 0, url: 'https://elsewhere.test/#x' })
    await drain()
    expect(getCallCount()).toBe(3)
  })

  it.each(['full navigation', 'SPA navigation'])(
    'keeps filtering and supersedes an unresolved GET during %s', async (navigation) => {
      let active = TAB
      const pendingReads = []
      globalThis.browser.tabs.query = vi.fn(async () => [active])
      globalThis.browser.tabs.sendMessage.mockImplementation((tabId, message) => {
        if (message.action !== GET) return Promise.resolve({ success: true })
        return new Promise((resolvePromise) => { pendingReads.push(resolvePromise) })
      })
      wrapper = mount(SidepanelToolbar, { attachTo: document.body })
      await drain()
      expect(pendingReads).toHaveLength(1)

      const next = { ...TAB, url: 'https://example.com/pending-route' }
      active = next
      if (navigation === 'full navigation') {
        tabsUpdated.emit(TAB.id, { url: next.url }, next)
      } else {
        navHistory.emit({ tabId: TAB.id, frameId: 0, url: next.url })
      }
      await drain()
      expect(pendingReads).toHaveLength(2)

      pendingReads[1](reply('visible', { url: next.url }))
      await drain()
      expect(fabButton().attributes('title')).toBe('Hide FAB for Now')

      pendingReads[0](reply('hidden'))
      await drain()
      expect(fabButton().attributes('title')).toBe('Hide FAB for Now')
    }
  )

  it('registers webNavigation listeners without a filter argument (Firefox contract)', async () => {
    await mountToolbar()

    // One listener per event, invoked with the details object ONLY.
    expect(navHistory.addListener).toHaveBeenCalledTimes(1)
    expect(navHistory.addListener.mock.calls[0]).toHaveLength(1)
    expect(navFragment.addListener).toHaveBeenCalledTimes(1)
    expect(navFragment.addListener.mock.calls[0]).toHaveLength(1)
  })

  it('mounts without webNavigation support and still reads the status', async () => {
    delete globalThis.browser.webNavigation
    await mountToolbar()

    expect(getCallCount()).toBe(1)
    expect(fabButton().attributes('title')).toBe('Show FAB for Now')
  })

  it('refreshes when the panel becomes visible or focused again', async () => {
    let visibility = 'hidden'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    await mountToolbar()
    expect(getCallCount()).toBe(1)

    // Hidden → no refresh (and the retry leash is cancelled by this handler).
    document.dispatchEvent(new Event('visibilitychange'))
    await drain()
    expect(getCallCount()).toBe(1)

    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await drain()
    expect(getCallCount()).toBe(2)

    window.dispatchEvent(new Event('focus'))
    await drain()
    expect(getCallCount()).toBe(3)

    visibility = 'hidden'
    window.dispatchEvent(new Event('focus'))
    await drain()
    expect(getCallCount()).toBe(3)
  })

  // ── Command (SET) ─────────────────────────────────────────────────────

  it('sends the show command with expectedUrl at frame 0 and re-reads the status', async () => {
    let afterSet = false
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) => {
      if (message.action === SET) {
        afterSet = true
        return { success: true }
      }
      // The command landed: the authoritative read now reports visible.
      return reply(afterSet ? 'visible' : 'hidden')
    })
    await mountToolbar()
    expect(fabButton().attributes('title')).toBe('Show FAB for Now')

    await fabButton().trigger('click')
    await drain()

    expect(globalThis.browser.tabs.sendMessage).toHaveBeenCalledWith(
      TAB.id,
      { action: SET, data: { expectedUrl: TAB.url, override: 'show' } },
      { frameId: 0 }
    )
    // Status comes from a fresh read, never from the command reply.
    expect(getCallCount()).toBe(2)
    expect(fabButton().attributes('title')).toBe('Hide FAB for Now')
    expect(fabButton().attributes('disabled')).toBeUndefined()
  })

  it('sends the hide command while the FAB is visible', async () => {
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) =>
      message.action === SET ? { success: true } : reply('visible'))
    await mountToolbar()
    expect(fabButton().attributes('title')).toBe('Hide FAB for Now')

    await fabButton().trigger('click')
    await drain()

    expect(globalThis.browser.tabs.sendMessage).toHaveBeenCalledWith(
      TAB.id,
      { action: SET, data: { expectedUrl: TAB.url, override: 'hide' } },
      { frameId: 0 }
    )
  })

  it('never commands a tab other than the one the status came from', async () => {
    await mountToolbar()
    const readsBefore = getCallCount()

    // The active tab moves on between read and command.
    globalThis.browser.tabs.query.mockResolvedValue([{ id: 12, windowId: 7, url: 'https://elsewhere.test/' }])
    await fabButton().trigger('click')
    await drain()

    const setCalls = globalThis.browser.tabs.sendMessage.mock.calls
      .filter(([, message]) => message.action === SET)
    expect(setCalls).toHaveLength(0)
    // …and the row re-reads the newly active tab instead.
    expect(getCallCount()).toBeGreaterThan(readsBefore)
  })

  it('keeps the failure readable while re-reading, then shows the true status', async () => {
    let failNext = true
    let resolveRefresh = null
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) => {
      if (message.action === SET) {
        if (failNext) {
          failNext = false
          return { success: false, status: 'unavailable', url: TAB.url, reason: 'write refused' }
        }
        return { success: true }
      }
      if (resolveRefresh) return new Promise((resolvePromise) => { resolveRefresh = resolvePromise })
      return reply('visible')
    })
    await mountToolbar()
    expect(fabButton().attributes('title')).toBe('Hide FAB for Now')

    // Hold the post-failure re-read so the failure state is observable.
    resolveRefresh = true
    await fabButton().trigger('click')
    await drain()

    expect(wrapper.vm.fabState.status).toBe('unavailable')
    expect(wrapper.vm.fabState.reason).toBe('write refused')
    // Raw content reason is never shown; the localized fallback is.
    expect(fabButton().attributes('title'))
      .toBe('The floating button’s status is unavailable on this page.')
    expect(fabButton().attributes('disabled')).toBeDefined()

    // The authoritative re-read finally lands and replaces the failure.
    expect(resolveRefresh).toBeTypeOf('function')
    const finishRefresh = resolveRefresh
    resolveRefresh = null
    finishRefresh(reply('visible'))
    await drain()
    expect(fabButton().attributes('title')).toBe('Hide FAB for Now')
    expect(fabButton().attributes('disabled')).toBeUndefined()
  })

  it('re-reads after the command rejects, without claiming success', async () => {
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) => {
      if (message.action === SET) throw new Error('runtime disconnected')
      return reply('hidden')
    })
    await mountToolbar()
    const readsBefore = getCallCount()

    await fabButton().trigger('click')
    await drain()

    const setCalls = globalThis.browser.tabs.sendMessage.mock.calls
      .filter(([, message]) => message.action === SET)
    expect(setCalls).toHaveLength(1)
    // Rejection → refreshed authoritative status, not an optimistic flip.
    expect(getCallCount()).toBeGreaterThan(readsBefore)
    expect(fabButton().attributes('title')).toBe('Show FAB for Now')
    expect(fabButton().attributes('title')).not.toContain('runtime disconnected')
  })

  it('disables the toggle while a command is outstanding (single action)', async () => {
    let resolveSet = null
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) => {
      if (message.action === SET) return new Promise((resolvePromise) => { resolveSet = resolvePromise })
      return reply('hidden')
    })
    await mountToolbar()

    await fabButton().trigger('click')
    await wrapper.vm.$nextTick()
    expect(resolveSet).toBeTypeOf('function')
    expect(wrapper.vm.isFabToggleDisabled).toBe(true)
    expect(fabButton().attributes('disabled')).toBeDefined()

    // A second activation cannot start a second command.
    await fabButton().trigger('click')
    await drain()
    const setCalls = globalThis.browser.tabs.sendMessage.mock.calls
      .filter(([, message]) => message.action === SET)
    expect(setCalls).toHaveLength(1)

    resolveSet({ success: true })
    await drain()
    expect(wrapper.vm.isFabToggleDisabled).toBe(false)
  })

  it('allows B commands while A SET is pending and fences A completion to its target', async () => {
    const tabB = { id: 22, windowId: 7, url: 'https://example.com/other-tab' }
    let active = TAB
    const pendingSets = new Map()
    globalThis.browser.tabs.query = vi.fn(async () => [active])
    globalThis.browser.tabs.sendMessage.mockImplementation((tabId, message) => {
      if (message.action === GET) return Promise.resolve(reply('hidden', { url: tabId === TAB.id ? TAB.url : tabB.url }))
      return new Promise((resolvePromise) => { pendingSets.set(tabId, resolvePromise) })
    })
    await mountToolbar()

    await fabButton().trigger('click')
    await drain()
    expect(pendingSets.has(TAB.id)).toBe(true)
    expect(wrapper.vm.isFabToggleDisabled).toBe(true)

    active = tabB
    tabsActivated.emit({ tabId: tabB.id, windowId: tabB.windowId })
    await drain()
    expect(wrapper.vm.fabState.status).toBe('hidden')
    expect([...wrapper.vm.fabCommandsInFlight]).toEqual([JSON.stringify([7, TAB.id, TAB.url])])
    expect(fabButton().attributes('disabled')).toBeUndefined()
    expect(fabButton().attributes('title')).toBe('Show FAB for Now')

    await fabButton().trigger('click')
    await drain()
    expect(pendingSets.has(tabB.id)).toBe(true)
    expect(globalThis.browser.tabs.sendMessage.mock.calls
      .filter(([, message]) => message.action === SET)).toHaveLength(2)
    expect(wrapper.vm.isFabToggleDisabled).toBe(true)
    const readsWhileBPending = getCallCount()

    pendingSets.get(TAB.id)({ success: true })
    await drain()
    expect(getCallCount()).toBe(readsWhileBPending)
    expect(wrapper.vm.isFabToggleDisabled).toBe(true)
    expect(fabButton().attributes('title')).toBe('Reading the floating button’s status…')

    pendingSets.get(tabB.id)({ success: true })
    await drain()
    expect(fabButton().attributes('disabled')).toBeUndefined()
    expect(fabButton().attributes('title')).toBe('Show FAB for Now')
  })

  // ── Staleness / overlap ───────────────────────────────────────────────

  it('drops a stale read that resolves after a newer one', async () => {
    const pendingReads = []
    globalThis.browser.tabs.sendMessage.mockImplementation((tabId, message) => {
      if (message.action !== GET) return Promise.resolve({})
      return new Promise((resolvePromise) => { pendingReads.push(resolvePromise) })
    })

    wrapper = mount(SidepanelToolbar, { attachTo: document.body })
    await drain()
    expect(pendingReads).toHaveLength(1)

    // A tab activation supersedes the first read before it answers.
    tabsActivated.emit({ tabId: 12, windowId: 7 })
    await drain()
    expect(pendingReads).toHaveLength(2)

    pendingReads[1](reply('visible'))
    await drain()
    expect(fabButton().attributes('title')).toBe('Hide FAB for Now')

    // The stale reply resolves last and must be discarded.
    pendingReads[0](reply('hidden'))
    await drain()
    expect(fabButton().attributes('title')).toBe('Hide FAB for Now')
    expect(fabButton().attributes('disabled')).toBeUndefined()
  })

  // ── Bounded retry ─────────────────────────────────────────────────────

  it('retries a transient loading status on a bounded leash, then stops', async () => {
    vi.useFakeTimers()
    let afterSet = false
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) => {
      if (message.action === SET) {
        afterSet = true
        return { success: true }
      }
      // Freshly shown FAB: the child reports loading until it mounts.
      if (afterSet) return reply('loading', { reason: 'fab-settling' })
      return reply('hidden')
    })

    wrapper = mount(SidepanelToolbar, { attachTo: document.body })
    await drain()
    expect(fabButton().attributes('title')).toBe('Show FAB for Now')

    await fabButton().trigger('click')
    await drain()
    const readsAfterWrite = getCallCount()
    expect(fabButton().attributes('disabled')).toBeDefined()
    expect(fabButton().attributes('title')).toBe('Reading the floating button’s status…')

    // Each retry re-reads while still loading…
    await vi.advanceTimersByTimeAsync(150)
    await drain()
    expect(getCallCount()).toBeGreaterThan(readsAfterWrite)

    // …until the budget drains: no open-ended polling.
    await vi.advanceTimersByTimeAsync(150 * 20)
    await drain()
    const boundedTotal = getCallCount()
    expect(boundedTotal - readsAfterWrite).toBeLessThanOrEqual(8)
    await vi.advanceTimersByTimeAsync(150 * 20)
    await drain()
    expect(getCallCount()).toBe(boundedTotal)
    expect(fabButton().attributes('title')).not.toContain('FAB for Now')
  })

  it('starts a fresh bounded loading retry budget after adopting a new tab', async () => {
    vi.useFakeTimers()
    const tabB = { id: 22, windowId: 7, url: 'https://example.com/other-tab' }
    let active = TAB
    globalThis.browser.tabs.query = vi.fn(async () => [active])
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) =>
      message.action === GET
        ? reply('loading', { reason: 'fab-settling', url: tabId === TAB.id ? TAB.url : tabB.url })
        : { success: true })

    wrapper = mount(SidepanelToolbar, { attachTo: document.body })
    await drain()
    await vi.advanceTimersByTimeAsync(150 * 20)
    await drain()
    const exhaustedAReads = getCallCount()
    expect(exhaustedAReads).toBe(9)

    active = tabB
    tabsActivated.emit({ tabId: tabB.id, windowId: tabB.windowId })
    await drain()
    const firstBRead = getCallCount()
    expect(firstBRead).toBe(exhaustedAReads + 1)

    await vi.advanceTimersByTimeAsync(150)
    await drain()
    expect(getCallCount()).toBe(firstBRead + 1)
  })

  it('restores the retry budget for each same-target hide/show operation', async () => {
    vi.useFakeTimers()
    let settledStatus = 'hidden'
    let needLoading = false
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) => {
      if (message.action === SET) {
        settledStatus = settledStatus === 'hidden' ? 'visible' : 'hidden'
        needLoading = true
        return { success: true }
      }
      if (needLoading) {
        needLoading = false
        return reply('loading', { reason: 'fab-settling' })
      }
      return reply(settledStatus)
    })

    wrapper = mount(SidepanelToolbar, { attachTo: document.body })
    await drain()

    // FAB_RETRY_MAX + N same-target toggles: every operation must still get
    // its settling retry instead of sticking on a drained shared budget.
    const operations = 8 + 2
    for (let i = 0; i < operations; i += 1) {
      const expectedTitle = settledStatus === 'hidden' ? 'Show FAB for Now' : 'Hide FAB for Now'
      expect(fabButton().attributes('title')).toBe(expectedTitle)

      await fabButton().trigger('click')
      await drain()
      const readsAfterCommand = getCallCount()
      expect(fabButton().attributes('title')).toBe('Reading the floating button’s status…')

      // The transient loading settles on this operation's own retry.
      await vi.advanceTimersByTimeAsync(150)
      await drain()
      expect(getCallCount()).toBeGreaterThan(readsAfterCommand)
      const settledTitle = settledStatus === 'hidden' ? 'Show FAB for Now' : 'Hide FAB for Now'
      expect(fabButton().attributes('title')).toBe(settledTitle)
      expect(fabButton().attributes('disabled')).toBeUndefined()
    }
  })

  it('bounds the restored budget within a single operation that never settles', async () => {
    vi.useFakeTimers()
    let afterSet = false
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) => {
      if (message.action === SET) {
        afterSet = true
        return { success: true }
      }
      if (afterSet) return reply('loading', { reason: 'fab-settling' })
      return reply('hidden')
    })

    wrapper = mount(SidepanelToolbar, { attachTo: document.body })
    await drain()

    await fabButton().trigger('click')
    await drain()
    const readsAfterWrite = getCallCount()

    // One retry per tick, at most FAB_RETRY_MAX scheduled retries.
    for (let i = 0; i < 8; i += 1) {
      await vi.advanceTimersByTimeAsync(150)
      await drain()
      expect(getCallCount()).toBe(readsAfterWrite + i + 1)
    }

    // Budget drained: no unbounded polling afterwards.
    await vi.advanceTimersByTimeAsync(150 * 20)
    await drain()
    expect(getCallCount()).toBe(readsAfterWrite + 8)
    expect(fabButton().attributes('title')).not.toContain('FAB for Now')
  })

  it('never retries an unavailable status', async () => {
    vi.useFakeTimers()
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) =>
      message.action === GET
        ? reply('unavailable', { reason: 'ui-absent' })
        : reply('unavailable', { reason: 'ui-absent' }))

    wrapper = mount(SidepanelToolbar, { attachTo: document.body })
    await drain()
    const reads = getCallCount()

    await vi.advanceTimersByTimeAsync(150 * 20)
    await drain()
    expect(getCallCount()).toBe(reads)
    expect(fabButton().attributes('disabled')).toBeDefined()
    expect(fabButton().attributes('title'))
      .toBe('The floating button is not available on this page.')
  })

  // ── Keyboard ──────────────────────────────────────────────────────────

  it('relies on native button activation only, so no keydown can double-fire', async () => {
    await mountToolbar()
    const button = fabButton()
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')

    // No keydown handler is bound: these dispatches must do nothing.
    const readsBefore = globalThis.browser.tabs.sendMessage.mock.calls.length
    await button.trigger('keydown', { key: 'Enter' })
    await button.trigger('keydown', { key: ' ' })
    await drain()
    expect(globalThis.browser.tabs.sendMessage.mock.calls.length).toBe(readsBefore)

    // One activation → exactly one command.
    await button.trigger('click')
    await drain()
    expect(globalThis.browser.tabs.sendMessage.mock.calls
      .filter(([, message]) => message.action === SET)).toHaveLength(1)
  })

  it('ignores activation attempts while disabled', async () => {
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) => {
      if (message.action !== GET) return {}
      return new Promise(() => {})   // stay loading forever
    })
    await mountToolbar()
    expect(fabButton().attributes('disabled')).toBeDefined()

    await fabButton().trigger('click')
    await drain()
    expect(globalThis.browser.tabs.sendMessage.mock.calls
      .filter(([, message]) => message.action === SET)).toHaveLength(0)
  })

  // ── Cleanup ───────────────────────────────────────────────────────────

  it('removes every listener and timer on unmount and ignores late replies', async () => {
    let resolveLate = null
    globalThis.browser.tabs.sendMessage.mockImplementation(() =>
      new Promise((resolvePromise) => { resolveLate = resolvePromise }))
    wrapper = mount(SidepanelToolbar, { attachTo: document.body })
    await drain()
    const readsBefore = getCallCount()

    wrapper.unmount()
    wrapper = null

    expect(tabsActivated.removeListener).toHaveBeenCalledTimes(1)
    expect(tabsUpdated.removeListener).toHaveBeenCalledTimes(1)
    expect(navHistory.removeListener).toHaveBeenCalledTimes(1)
    expect(navFragment.removeListener).toHaveBeenCalledTimes(1)
    // Same handler instance that was registered.
    expect(tabsActivated.removeListener).toHaveBeenCalledWith(tabsActivated.addListener.mock.calls[0][0])
    expect(navFragment.removeListener).toHaveBeenCalledWith(navFragment.addListener.mock.calls[0][0])
    expect(tabsActivated.listeners).toHaveLength(0)
    expect(navHistory.listeners).toHaveLength(0)

    // Events and late replies after unmount trigger nothing.
    tabsActivated.emit({ tabId: 12, windowId: 7 })
    navHistory.emit({ tabId: TAB.id, frameId: 0, url: 'https://example.com/late' })
    resolveLate(reply('visible'))
    await drain()
    expect(getCallCount()).toBe(readsBefore)
  })

  it('stops the retry timer when the panel is hidden or the component unmounts', async () => {
    vi.useFakeTimers()
    let afterSet = false
    globalThis.browser.tabs.sendMessage.mockImplementation(async (tabId, message) => {
      if (message.action === SET) {
        afterSet = true
        return { success: true }
      }
      if (afterSet) return reply('loading', { reason: 'fab-settling' })
      return reply('hidden')
    })

    wrapper = mount(SidepanelToolbar, { attachTo: document.body })
    await drain()
    await fabButton().trigger('click')
    await drain()
    const reads = getCallCount()

    // Hide the panel: the scheduled retry must not run.
    let visibility = 'hidden'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(150 * 10)
    await drain()
    expect(getCallCount()).toBe(reads)

    // Unmount also clears any timer scheduled afterwards.
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await drain()
    const afterVisibleRead = getCallCount()
    wrapper.unmount()
    wrapper = null
    await vi.advanceTimersByTimeAsync(150 * 10)
    await drain()
    expect(getCallCount()).toBe(afterVisibleRead)
  })
})
