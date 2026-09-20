import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, onMounted, onUnmounted } from 'vue'
import PopupHeader from './PopupHeader.vue'
import { openExtensionApp } from '@/core/ExtensionAppLauncher.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

let settings
let closePopup
let sidebarToggle

const { mockSelectModeHolder, mockToggleSelectElement, mockToggleMouseHover, mockSendMessage } = vi.hoisted(() => ({
  mockSelectModeHolder: { ref: null },
  mockToggleSelectElement: vi.fn(),
  mockToggleMouseHover: vi.fn(),
  mockSendMessage: vi.fn()
}))

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: () => ({ settings })
}))

vi.mock('@/features/translation/stores/translation.js', () => ({
  useTranslationStore: () => ({ ephemeralSync: {}, selectedProvider: '' })
}))

vi.mock('@/features/translation/composables/useTranslationModes.js', () => ({
  useSelectElementTranslation: () => {
    // Created lazily so the test file's `ref` import is initialized (same
    // ordering guarantee as the useMouseHoverToggle mock below). A real ref
    // is required: the template relies on setup-binding auto-unwrapping.
    if (!mockSelectModeHolder.ref) mockSelectModeHolder.ref = ref(false)
    return {
      isSelectModeActive: mockSelectModeHolder.ref,
      toggleSelectElement: mockToggleSelectElement
    }
  }
}))

vi.mock('@/features/mouse-hover/composables/useMouseHoverToggle.js', () => ({
  useMouseHoverToggle: () => ({ isMouseHoverEnabled: ref(false), toggleMouseHover: mockToggleMouseHover })
}))

vi.mock('@/shared/messaging/composables/useMessaging.js', () => ({
  useMessaging: () => ({ sendMessage: mockSendMessage })
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

vi.mock('@/utils/browser/compatibility.js', () => ({
  getBrowserInfoSync: () => ({ isMobile: false })
}))

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('@/core/ExtensionAppLauncher.js', () => ({
  openExtensionApp: vi.fn()
}))

vi.mock('@/components/shared/IconButton.vue', () => ({
  default: {
    name: 'IconButton',
    emits: ['click'],
    template: '<button class="ti-toolbar-button" @click="$emit(\'click\')" />'
  }
}))

// Kept intentionally: the header must NOT render the scroller anymore, so
// this stub exists only to prove its absence from the rendered tree.
vi.mock('@/components/shared/HorizontalActionScroller.vue', () => ({
  default: {
    name: 'HorizontalActionScroller',
    template: '<div class="horizontal-action-scroller-stub"><slot /></div>'
  }
}))

vi.mock('@/components/base/ToolbarMenu/ToolbarMenu.vue', () => ({
  default: {
    name: 'ToolbarMenu',
    props: ['placement'],
    setup() {
      const open = ref(false)
      const toggle = () => { open.value = !open.value }
      const close = () => { open.value = false }
      const noopRef = () => {}
      const onKeydown = (event) => {
        if (event.key === 'Escape') close()
      }
      const onPointerDown = (event) => {
        if (!open.value) return
        if (event.target?.closest?.('.toolbar-menu-stub')) return
        close()
      }
      onMounted(() => {
        document.addEventListener('keydown', onKeydown)
        document.addEventListener('pointerdown', onPointerDown)
      })
      onUnmounted(() => {
        document.removeEventListener('keydown', onKeydown)
        document.removeEventListener('pointerdown', onPointerDown)
      })
      return { open, toggle, close, noopRef }
    },
    template: `
      <div class="toolbar-menu-stub">
        <slot name="trigger" :trigger-attrs="{}" :trigger-ref="noopRef" :on-toggle="toggle" :toggle="toggle" :close="close" :open="open" />
        <div v-if="open" class="toolbar-menu-panel-stub"><slot :close="close" :is-open="open" /></div>
      </div>
    `
  }
}))

vi.mock('@/features/page-translation/components/PageTranslationButton.vue', () => ({
  default: {
    name: 'PageTranslationButton',
    props: ['compact', 'textOnly', 'targetLanguage', 'disabled', 'showAutoTranslateToggle'],
    template: '<div class="page-translation-button-stub" />'
  }
}))

describe('PopupHeader', () => {
  beforeEach(() => {
    if (mockSelectModeHolder.ref) mockSelectModeHolder.ref.value = false
    mockToggleSelectElement.mockClear()
    mockToggleMouseHover.mockClear()
    mockSendMessage.mockClear()
    mockSendMessage.mockResolvedValue({})
    vi.mocked(openExtensionApp).mockClear()
    vi.mocked(openExtensionApp).mockResolvedValue({ success: true })
    closePopup = vi.spyOn(window, 'close').mockImplementation(() => {})
    globalThis.browser.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com/' }])
    sidebarToggle = vi.fn()
    globalThis.browser.sidebarAction = { toggle: sidebarToggle }
    settings = {
      EXTENSION_ENABLED: true,
      TRANSLATE_WITH_SELECT_ELEMENT: true,
      ENABLE_SCREEN_CAPTURE: true,
      WHOLE_PAGE_TRANSLATION_ENABLED: true,
      MODE_PROVIDERS: {},
      TRANSLATION_API: 'google'
    }
  })

  afterEach(() => {
    closePopup.mockRestore()
    delete globalThis.browser.sidebarAction
  })

  const openMoreMenu = async (wrapper) => {
    await wrapper.find('.ti-btn-more').trigger('click')
    return wrapper.find('.toolbar-menu-panel-stub')
  }

  const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('renders left and actions groups without the action scroller', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    // The HorizontalActionScroller is gone from the header entirely.
    expect(wrapper.find('.horizontal-action-scroller-stub').exists()).toBe(false)

    // Two visual groups: left (page + switcher slot) and right actions.
    const toolbar = wrapper.find('.ti-header-toolbar')
    expect([...toolbar.element.children].map((element) => element.className)).toEqual([
      'ti-header-left',
      'ti-header-actions'
    ])

    const left = wrapper.find('.ti-header-left')
    const pageTranslationButton = left.find('.page-translation-button-stub')
    expect(pageTranslationButton.exists()).toBe(true)
    expect(pageTranslationButton.attributes('class')).toContain('ti-page-translate-btn')

    // Direct actions all live inside the actions group.
    const actions = wrapper.find('.ti-header-actions')
    for (const selector of ['.ti-btn-more-menu', '.ti-btn-settings', '.ti-btn-mouse-hover', '.ti-btn-capture', '.ti-btn-select', '.ti-btn-sidepanel']) {
      expect(actions.find(selector).exists()).toBe(true)
    }
    expect(actions.find('.ti-btn-revert').exists()).toBe(false)
  })

  it('orders actions More → Settings → Hover → Capture → Select → Sidepanel', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    // Revert is contextual (hidden); the rest keep a stable DOM order.
    expect([...wrapper.find('.ti-header-actions').element.children].map((element) => element.className)).toEqual([
      'toolbar-menu-stub ti-btn-more-menu',
      'ti-toolbar-button ti-btn-settings',
      'ti-toolbar-button ti-btn-mouse-hover ti-header-toolbar-button--narrow-hide',
      'ti-toolbar-button ti-btn-capture ti-header-toolbar-button--narrow-hide',
      'ti-toolbar-button ti-btn-select',
      'ti-toolbar-button ti-btn-sidepanel ti-header-toolbar-button--narrow-hide'
    ])
  })

  it('keeps action order stable with Revert between Capture and Select', async () => {
    mockSelectModeHolder.ref.value = true
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    expect([...wrapper.find('.ti-header-actions').element.children].map((element) => element.className)).toEqual([
      'toolbar-menu-stub ti-btn-more-menu',
      'ti-toolbar-button ti-btn-settings',
      'ti-toolbar-button ti-btn-mouse-hover ti-header-toolbar-button--narrow-hide',
      'ti-toolbar-button ti-btn-capture ti-header-toolbar-button--narrow-hide',
      'ti-toolbar-button ti-btn-revert',
      'ti-toolbar-button ti-btn-select',
      'ti-toolbar-button ti-btn-sidepanel ti-header-toolbar-button--narrow-hide'
    ])
  })

  it('renders the More trigger as a normal toolbar button with an ellipsis glyph', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    const more = wrapper.find('.ti-btn-more')
    expect(more.element.tagName).toBe('BUTTON')
    expect(more.attributes('aria-label')).toBe('More actions')
    expect(more.text()).toContain('⋯')
    // No rotated chevron workaround: no icon image inside the trigger.
    expect(more.find('img').exists()).toBe(false)
  })

  it('passes compact mode to the page translation button', async () => {
    const wrapper = mount(PopupHeader, { props: { targetLanguage: 'fa' } })
    await wrapper.vm.$nextTick()

    const pageButton = wrapper.findComponent({ name: 'PageTranslationButton' })
    expect(pageButton.exists()).toBe(true)
    expect(pageButton.props('compact')).toBe(true)
    expect(pageButton.props('targetLanguage')).toBe('fa')
    expect(pageButton.props('showAutoTranslateToggle')).toBe(true)
  })

  it('shows the revert button only while select mode is active', async () => {
    const hidden = mount(PopupHeader)
    await hidden.vm.$nextTick()
    expect(hidden.find('.ti-btn-revert').exists()).toBe(false)

    mockSelectModeHolder.ref.value = true
    const shown = mount(PopupHeader)
    await shown.vm.$nextTick()
    expect(shown.find('.ti-btn-select').exists()).toBe(true)
    expect(shown.find('.ti-btn-revert').exists()).toBe(true)
  })

  it('opens the More menu with Subtitle, PDF, Exclude plus narrow-only duplicates', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(false)

    const panel = await openMoreMenu(wrapper)
    expect(panel.exists()).toBe(true)

    const items = panel.findAll('[role="menuitem"]')
    // Structurally six: the three always-visible items plus the narrow-only
    // duplicates (CSS-hidden at normal widths — see PopupHeader.scss
    // breakpoint ownership). JSDOM does not apply CSS, so assert existence.
    expect(items).toHaveLength(6)
    const icons = panel.findAll('.ti-header-menu-item img').map((img) => img.attributes('src'))
    expect(icons.some((src) => src.includes('subtitle.png'))).toBe(true)
    expect(icons.some((src) => src.includes('pdf.png'))).toBe(true)
    expect(icons.some((src) => src.includes('mouse-hover.png'))).toBe(true)
    expect(icons.some((src) => src.includes('capture.svg'))).toBe(true)
    expect(icons.some((src) => src.includes('side-panel.png'))).toBe(true)
    expect(panel.text()).toContain('Disable on this site')

    // Breakpoint contract classes: direct buttons hide at narrow widths,
    // narrow-only duplicates show there instead.
    expect(panel.find('.ti-header-menu-item--very-narrow-only').exists()).toBe(true)
    expect(panel.findAll('.ti-header-menu-item--narrow-only')).toHaveLength(2)
    for (const selector of ['.ti-btn-mouse-hover', '.ti-btn-capture', '.ti-btn-sidepanel']) {
      expect(wrapper.find(selector).classes()).toContain('ti-header-toolbar-button--narrow-hide')
    }
  })

  it('launches Subtitle and PDF translators from the menu before closing Popup', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    let panel = await openMoreMenu(wrapper)
    await panel.findAll('[role="menuitem"]')[0].trigger('click')
    expect(openExtensionApp).toHaveBeenNthCalledWith(1, 'subtitle')

    panel = await openMoreMenu(wrapper)
    await panel.findAll('[role="menuitem"]')[1].trigger('click')
    expect(openExtensionApp).toHaveBeenNthCalledWith(2, 'pdf')

    expect(closePopup).toHaveBeenCalledTimes(2)
    expect(openExtensionApp.mock.invocationCallOrder[0]).toBeLessThan(closePopup.mock.invocationCallOrder[0])
    expect(openExtensionApp.mock.invocationCallOrder[1]).toBeLessThan(closePopup.mock.invocationCallOrder[1])
    // Menu closes after the action.
    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(false)
  })

  it('keeps Popup open when an extension app launch fails', async () => {
    vi.mocked(openExtensionApp).mockResolvedValueOnce({ success: false })
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    const panel = await openMoreMenu(wrapper)
    await panel.findAll('[role="menuitem"]')[0].trigger('click')

    expect(openExtensionApp).toHaveBeenCalledWith('subtitle')
    expect(closePopup).not.toHaveBeenCalled()
  })

  it('updates the site toggle from the server response on success only', async () => {
    mockSendMessage.mockImplementation(({ action }) => {
      if (action === MessageActions.IS_Current_Page_Excluded) return Promise.resolve({ excluded: false })
      if (action === MessageActions.Set_Exclude_Current_Page) return Promise.resolve({ success: true, excluded: true })
      return Promise.resolve({})
    })
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    let panel = await openMoreMenu(wrapper)
    expect(panel.findAll('[role="menuitem"]')[2].text()).toContain('Disable on this site')

    await panel.findAll('[role="menuitem"]')[2].trigger('click')
    await flushPromises()
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: MessageActions.Set_Exclude_Current_Page,
      data: { exclude: true, url: 'https://example.com/' }
    }))
    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(false)

    // Server confirmed excluded: label flips to Enable with a checkmark.
    panel = await openMoreMenu(wrapper)
    expect(panel.findAll('[role="menuitem"]')[2].text()).toContain('Enable on this site')
    expect(panel.findAll('[role="menuitem"]')[2].text()).toContain('✓')
  })

  it('keeps the site toggle unchanged when the server reports failure', async () => {
    mockSendMessage.mockImplementation(({ action }) => {
      if (action === MessageActions.IS_Current_Page_Excluded) return Promise.resolve({ excluded: false })
      if (action === MessageActions.Set_Exclude_Current_Page) return Promise.resolve({ success: false })
      return Promise.resolve({})
    })
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    const panel = await openMoreMenu(wrapper)
    await panel.findAll('[role="menuitem"]')[2].trigger('click')
    await flushPromises()

    const reopened = await openMoreMenu(wrapper)
    // No optimistic flip: still enabled, still offering Disable.
    expect(reopened.findAll('[role="menuitem"]')[2].text()).toContain('Disable on this site')
  })

  it('routes narrow-duplicate menu actions to the same handlers and closes the menu', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    let panel = await openMoreMenu(wrapper)
    await panel.find('.ti-header-menu-item--very-narrow-only').trigger('click')
    expect(mockToggleMouseHover).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(false)

    panel = await openMoreMenu(wrapper)
    const narrowItems = panel.findAll('.ti-header-menu-item--narrow-only')
    await narrowItems[0].trigger('click')
    await flushPromises()
    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: MessageActions.START_SCREEN_CAPTURE
    }))
    expect(closePopup).toHaveBeenCalled()
    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(false)

    panel = await openMoreMenu(wrapper)
    await panel.findAll('.ti-header-menu-item--narrow-only')[1].trigger('click')
    await flushPromises()
    expect(sidebarToggle).toHaveBeenCalled()
    expect(closePopup).toHaveBeenCalled()
    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(false)
  })

  it('toggles mouse hover from its direct button without closing Popup', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    await wrapper.find('.ti-btn-mouse-hover').trigger('click')

    expect(mockToggleMouseHover).toHaveBeenCalledTimes(1)
    expect(closePopup).not.toHaveBeenCalled()
  })

  it('starts screen capture from its direct button and closes Popup', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    await wrapper.find('.ti-btn-capture').trigger('click')
    await flushPromises()

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: MessageActions.START_SCREEN_CAPTURE
    }))
    expect(closePopup).toHaveBeenCalled()
  })

  it('opens the side panel from its direct button and closes Popup', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    await wrapper.find('.ti-btn-sidepanel').trigger('click')
    await flushPromises()

    expect(sidebarToggle).toHaveBeenCalled()
    expect(closePopup).toHaveBeenCalled()
  })

  it('closes the More menu on Escape', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    await openMoreMenu(wrapper)
    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(false)
  })

  it('closes the More menu on outside click', async () => {
    const wrapper = mount(PopupHeader, { attachTo: document.body })
    await wrapper.vm.$nextTick()

    await openMoreMenu(wrapper)
    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(true)

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides conditional actions when disabled', async () => {
    settings.TRANSLATE_WITH_SELECT_ELEMENT = false
    settings.ENABLE_SCREEN_CAPTURE = false
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ti-btn-select').exists()).toBe(false)
    expect(wrapper.find('.ti-btn-revert').exists()).toBe(false)
    expect(wrapper.find('.ti-btn-capture').exists()).toBe(false)
    expect(wrapper.find('.ti-btn-mouse-hover').exists()).toBe(true)
    expect(wrapper.find('.ti-btn-sidepanel').exists()).toBe(true)
    expect(wrapper.find('.ti-btn-settings').exists()).toBe(true)

    const panel = await openMoreMenu(wrapper)
    // Capture duplicate follows its setting (v-if); hover + sidepanel
    // duplicates stay structural: subtitle, pdf, exclude, hover, sidepanel.
    expect(panel.findAll('[role="menuitem"]')).toHaveLength(5)
    expect(panel.find('.ti-header-menu-item--very-narrow-only').exists()).toBe(true)
    expect(panel.findAll('.ti-header-menu-item--narrow-only')).toHaveLength(1)
  })

  it('renders slot content (view switcher) inside the left group', async () => {
    const wrapper = mount(PopupHeader, {
      slots: { default: '<div class="view-switcher-stub" />' }
    })
    await wrapper.vm.$nextTick()

    // Slot sits with Page Translation in the left group, before the actions.
    const leftChildren = [...wrapper.find('.ti-header-left').element.children]
    const switcher = wrapper.find('.view-switcher-stub')
    expect(switcher.exists()).toBe(true)
    expect(leftChildren[0].className).toContain('page-translation-button-stub')
    expect(leftChildren[1]).toBe(switcher.element)

    const toolbarChildren = [...wrapper.find('.ti-header-toolbar').element.children]
    expect(toolbarChildren[0].className).toBe('ti-header-left')
    expect(toolbarChildren[1].className).toBe('ti-header-actions')
    // Actions group starts with More and keeps its order.
    expect(wrapper.find('.ti-header-actions').element.children[0].className).toContain('ti-btn-more-menu')
  })

  it('starts select-element mode and closes the popup', async () => {
    mockToggleSelectElement.mockResolvedValue(true)
    const wrapper = mount(PopupHeader, { props: { targetLanguage: 'fa', provider: 'google' } })
    await wrapper.vm.$nextTick()

    await wrapper.find('.ti-btn-select').trigger('click')

    expect(mockToggleSelectElement).toHaveBeenCalledWith({ targetLanguage: 'fa', provider: 'google' })
    expect(closePopup).toHaveBeenCalled()
  })

  it('sends a revert request from the contextual revert button', async () => {
    mockSendMessage.mockResolvedValue({ success: true })
    mockSelectModeHolder.ref.value = true
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    await wrapper.find('.ti-btn-revert').trigger('click')
    await flushPromises()

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: MessageActions.REVERT_SELECT_ELEMENT_MODE
    }))
  })
})
