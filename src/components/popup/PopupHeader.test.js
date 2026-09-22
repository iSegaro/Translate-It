import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, onMounted, onUnmounted } from 'vue'
import PopupHeader from './PopupHeader.vue'
import MaskIcon from '@/components/shared/MaskIcon.vue'
import { openExtensionApp } from '@/core/ExtensionAppLauncher.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

let settings
let closePopup
let sidebarToggle

const { mockSelectModeHolder, mockToggleSelectElement, mockToggleMouseHover, mockSendMessage, mockFindProviderById } = vi.hoisted(() => ({
  mockSelectModeHolder: { ref: null },
  mockToggleSelectElement: vi.fn(),
  mockToggleMouseHover: vi.fn(),
  mockSendMessage: vi.fn(),
  mockFindProviderById: vi.fn(() => ({ features: ['bulk'] }))
}))
const mockT = vi.hoisted(() => vi.fn((key, fallback) => fallback || key))

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
  useUnifiedI18n: () => ({ t: (...args) => mockT(...args) })
}))

vi.mock('@/features/translation/providers/ProviderManifest.js', () => ({
  findProviderById: (...args) => mockFindProviderById(...args)
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
    props: {
      placement: {
        type: String,
        default: 'end'
      },
      forcePopover: {
        type: Boolean,
        default: false
      }
    },
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
    mockT.mockClear()
    mockToggleSelectElement.mockClear()
    mockToggleMouseHover.mockClear()
    mockSendMessage.mockClear()
    mockSendMessage.mockResolvedValue({})
    mockFindProviderById.mockReset()
    mockFindProviderById.mockImplementation(() => ({ features: ['bulk'] }))
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
    for (const selector of ['.ti-btn-more-menu', '.ti-btn-settings', '.ti-btn-mouse-hover', '.ti-btn-capture', '.ti-select-action', '.ti-btn-sidepanel']) {
      expect(actions.find(selector).exists()).toBe(true)
    }
    // Revert badge lives INSIDE the select-action wrapper (anchored on
    // Select), not as a top-level action of its own.
    expect([...actions.element.children].some((element) => element.classList.contains('ti-btn-revert-badge'))).toBe(false)
    expect(actions.find('.ti-select-action .ti-btn-revert-badge').exists()).toBe(true)
  })

  it('orders actions More → Settings → Hover → Capture → SelectAction → Sidepanel', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    // Select + Revert badge are a single plain wrapper in the DOM order.
    expect([...wrapper.find('.ti-header-actions').element.children].map((element) => element.className)).toEqual([
      'toolbar-menu-stub ti-btn-more-menu',
      'ti-toolbar-button ti-btn-settings',
      'ti-toolbar-button ti-btn-mouse-hover ti-header-toolbar-button--narrow-hide',
      'ti-toolbar-button ti-btn-capture ti-header-toolbar-button--narrow-hide',
      'ti-select-action',
      'ti-toolbar-button ti-btn-sidepanel ti-header-toolbar-button--narrow-hide'
    ])
  })

  it('keeps the select-action order stable regardless of select mode state', async () => {
    mockSelectModeHolder.ref.value = true
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    // Revert is always a child of the Select wrapper; order never shifts.
    expect([...wrapper.find('.ti-header-actions').element.children].map((element) => element.className)).toEqual([
      'toolbar-menu-stub ti-btn-more-menu',
      'ti-toolbar-button ti-btn-settings',
      'ti-toolbar-button ti-btn-mouse-hover ti-header-toolbar-button--narrow-hide',
      'ti-toolbar-button ti-btn-capture ti-header-toolbar-button--narrow-hide',
      'ti-select-action',
      'ti-toolbar-button ti-btn-sidepanel ti-header-toolbar-button--narrow-hide'
    ])
  })

  it('renders Select plus a Revert badge inside the select-action wrapper (no menu, no chevron)', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    // Only the More menu still uses ToolbarMenu.
    expect(wrapper.findAllComponents({ name: 'ToolbarMenu' })).toHaveLength(1)

    const action = wrapper.find('.ti-select-action')
    expect(action.exists()).toBe(true)
    // Ordinary Select button + Revert badge button inside .ti-select-action.
    expect([...action.element.children].map((element) => element.className)).toEqual([
      'ti-toolbar-button ti-btn-select',
      'ti-btn-revert-badge'
    ])
    // No chevron button anywhere in the header.
    expect(wrapper.find('.ti-btn-select-chevron').exists()).toBe(false)
    expect(wrapper.find('.ti-chevron-icon').exists()).toBe(false)

    // Non-interactive visual surface inside the native Revert badge: it
    // owns geometry + glyph, is hidden from AT, and is never focusable.
    const surface = wrapper.find('.ti-btn-revert-badge .ti-revert-badge-surface')
    expect(surface.exists()).toBe(true)
    expect(surface.attributes('aria-hidden')).toBe('true')
    expect(surface.element.tagName).toBe('SPAN')
    expect(surface.attributes('tabindex')).toBeUndefined()
    // Glyph lives inside the surface; the native button still owns a11y.
    expect(surface.findComponent(MaskIcon).exists()).toBe(true)
    expect(wrapper.find('.ti-btn-revert-badge > .ti-revert-badge-surface').exists()).toBe(true)
  })

  it('passes force-popover to the single remaining PopupHeader ToolbarMenu (More menu)', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    const menus = wrapper.findAllComponents({ name: 'ToolbarMenu' })
    expect(menus).toHaveLength(1)
    expect(menus[0].props('forcePopover')).toBe(true)
  })

  it('applies ti-active to Select only; Revert badge never carries it', async () => {
    const idle = mount(PopupHeader)
    await idle.vm.$nextTick()
    expect(idle.find('.ti-btn-select').classes()).not.toContain('ti-active')
    expect(idle.find('.ti-btn-revert-badge').classes()).not.toContain('ti-active')

    mockSelectModeHolder.ref.value = true
    const active = mount(PopupHeader)
    await active.vm.$nextTick()

    const select = active.find('.ti-btn-select')
    const revert = active.find('.ti-btn-revert-badge')
    expect(select.classes()).toContain('ti-active')
    expect(revert.classes()).not.toContain('ti-active')

    // Hover interaction must not leak active state onto the Revert badge.
    await select.trigger('mouseenter')
    await revert.trigger('mouseenter')
    expect(select.classes()).toContain('ti-active')
    expect(revert.classes()).not.toContain('ti-active')

    // Select keeps pressed-toggle semantics; Revert is a plain action button.
    expect(select.attributes('aria-pressed')).toBe('true')
    expect(revert.attributes('aria-pressed')).toBeUndefined()
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

  it('uses the popup_more_actions_title key for the More button name', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    expect(mockT).toHaveBeenCalledWith('popup_more_actions_title', 'More actions')
    const more = wrapper.find('.ti-btn-more')
    expect(more.attributes('aria-label')).toBe('More actions')
    expect(more.attributes('title')).toBe('More actions')
  })

  it('gives the Revert badge its own localized title and aria-label (no chevron options key)', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ti-btn-select-chevron').exists()).toBe(false)
    const revert = wrapper.find('.ti-btn-revert-badge')
    expect(revert.exists()).toBe(true)
    expect(mockT).toHaveBeenCalledWith('popup_revert_title_icon', 'Revert')
    expect(mockT).toHaveBeenCalledWith('popup_revert_alt_icon', 'Revert')
    expect(revert.attributes('title')).toBe('Revert')
    expect(revert.attributes('aria-label')).toBe('Revert')
    // Plain native button — never a menu item; surface is decorative only.
    expect(revert.element.tagName).toBe('BUTTON')
    expect(revert.attributes('type')).toBe('button')
    expect(revert.attributes('role')).toBeUndefined()
    expect(revert.attributes('tabindex')).toBeUndefined()
    expect(revert.find('.ti-revert-badge-surface').attributes('aria-hidden')).toBe('true')
  })

  it('passes English fallbacks as the second t() argument for select and revert titles', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    expect(mockT).toHaveBeenCalledWith('popup_select_element_title_icon', 'Select Element mode')

    // The Revert name is on the always-rendered Revert segment — no menu to open.
    expect(mockT).toHaveBeenCalledWith('popup_revert_title_icon', 'Revert')
    expect(mockT).toHaveBeenCalledWith('popup_revert_alt_icon', 'Revert')
  })

  it('uses the unsupported-provider fallback when the provider lacks bulk support', async () => {
    mockFindProviderById.mockReturnValue({ features: [] })
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    expect(mockT).toHaveBeenCalledWith('provider_does_not_support_bulk', 'This provider does not support page/element translation')
    // Unsupported: the Select button explains itself and stays disabled.
    expect(wrapper.find('.ti-btn-select').attributes('title')).toBe('This provider does not support page/element translation')
    expect(wrapper.find('.ti-btn-select').attributes('disabled')).toBeDefined()
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

  it('renders the Revert badge beside Select whenever Select Element is enabled', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ti-select-action .ti-btn-select').exists()).toBe(true)
    expect(wrapper.find('.ti-select-action .ti-btn-revert-badge').exists()).toBe(true)
    expect(wrapper.find('.ti-btn-select-chevron').exists()).toBe(false)
    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(false)
  })

  it('clicking the Revert badge never activates Select Element and opens no menu', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    await wrapper.find('.ti-btn-revert-badge').trigger('click')
    await flushPromises()

    expect(mockToggleSelectElement).not.toHaveBeenCalled()
    expect(closePopup).not.toHaveBeenCalled()
    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(false)
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
    // Monochrome menu icons render via MaskIcon (currentColor), not <img>.
    const maskSrcs = panel.findAllComponents(MaskIcon).map((icon) => icon.props('src'))
    const maskOrImgSrcs = [...icons, ...maskSrcs]
    expect(maskOrImgSrcs.some((src) => src.includes('mouse-hover.png'))).toBe(true)
    expect(maskOrImgSrcs.some((src) => src.includes('capture.svg'))).toBe(true)
    expect(maskOrImgSrcs.some((src) => src.includes('side-panel.png'))).toBe(true)
    // Capture is fully off the image path: no <img> anywhere in the menu.
    expect(icons.some((src) => src.includes('capture'))).toBe(false)
    expect(panel.text()).toContain('Disable on this site')

    // Breakpoint contract classes: direct buttons hide at narrow widths,
    // narrow-only duplicates show there instead.
    expect(panel.find('.ti-header-menu-item--very-narrow-only').exists()).toBe(true)
    expect(panel.findAll('.ti-header-menu-item--narrow-only')).toHaveLength(2)
    for (const selector of ['.ti-btn-mouse-hover', '.ti-btn-capture', '.ti-btn-sidepanel']) {
      expect(wrapper.find(selector).classes()).toContain('ti-header-toolbar-button--narrow-hide')
    }
  })

  it('renders direct toolbar actions in IconButton mask mode', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    const buttons = wrapper.findAllComponents({ name: 'IconButton' })
    // The IconButton mock declares no props, so icon/mask/type arrive as
    // fallthrough attrs; read them via $attrs instead of props().
    const byIcon = Object.fromEntries(buttons.map((button) => [button.vm.$attrs.icon, button]))
    for (const icon of ['settings.png', 'mouse-hover.png', 'capture.svg', 'side-panel.png']) {
      expect(byIcon[icon].vm.$attrs.type).toBe('toolbar')
      expect(byIcon[icon].vm.$attrs.mask).toBe(true)
    }
    // Capture is fully off the image path in the header.
    expect(wrapper.find('.ti-btn-capture img').exists()).toBe(false)
  })

  it('renders the Select main action as a decorative MaskIcon', async () => {
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    const select = wrapper.find('.ti-btn-select')
    expect(select.find('img').exists()).toBe(false)
    // Decorative mask icon: the button owns a stable accessible name,
    // independent of the support-aware tooltip (echo-mock returns the key).
    expect(mockT).toHaveBeenCalledWith('popup_select_element_alt_icon')
    expect(select.attributes('aria-label')).toBe('popup_select_element_alt_icon')
    expect(select.attributes('title')).toBe('Select Element mode')
    expect(select.attributes('disabled')).toBeUndefined()
  })

  it('keeps the Select accessible name when the provider lacks bulk support', async () => {
    mockFindProviderById.mockReturnValue({ features: [] })
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    const select = wrapper.find('.ti-btn-select')
    // Disabled branch: tooltip explains itself, but the accessible name
    // stays the stable action label.
    expect(select.attributes('disabled')).toBeDefined()
    expect(select.attributes('title')).toBe('This provider does not support page/element translation')
    expect(select.attributes('aria-label')).toBe('popup_select_element_alt_icon')
    const revert = wrapper.find('.ti-btn-revert-badge')
    const icon = select.findComponent(MaskIcon)
    expect(icon.exists()).toBe(true)
    expect(icon.props('src')).toContain('select.png')
    expect(icon.props('size')).toBe(22)
    expect(icon.attributes('aria-hidden')).toBe('true')
    // Revert badge stays independent of the disabled Select state and
    // keeps its own smaller decorative MaskIcon.
    expect(revert.attributes('disabled')).toBeUndefined()
    const revertIcon = revert.findComponent(MaskIcon)
    expect(revertIcon.exists()).toBe(true)
    expect(revertIcon.props('src')).toContain('revert.png')
    expect(revertIcon.props('size')).toBe(12)
    expect(revertIcon.attributes('aria-hidden')).toBe('true')
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

    expect(wrapper.find('.ti-select-action').exists()).toBe(false)
    expect(wrapper.find('.ti-btn-select').exists()).toBe(false)
    expect(wrapper.find('.ti-btn-revert-badge').exists()).toBe(false)
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

    await wrapper.find('.ti-select-action .ti-btn-select').trigger('click')

    expect(mockToggleSelectElement).toHaveBeenCalledWith({ targetLanguage: 'fa', provider: 'google' })
    expect(closePopup).toHaveBeenCalled()
  })

  it('sends a revert request from the Revert badge', async () => {
    mockSendMessage.mockResolvedValue({ success: true })
    const wrapper = mount(PopupHeader)
    await wrapper.vm.$nextTick()

    // Revert is a direct badge button — click it, no menu involved.
    await wrapper.find('.ti-select-action .ti-btn-revert-badge').trigger('click')
    await flushPromises()

    expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: MessageActions.REVERT_SELECT_ELEMENT_MODE
    }))
    expect(wrapper.find('.toolbar-menu-panel-stub').exists()).toBe(false)
  })
})
