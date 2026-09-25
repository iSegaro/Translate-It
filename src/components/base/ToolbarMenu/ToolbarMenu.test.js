import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ToolbarMenu from './ToolbarMenu.vue'
import { OVERLAY_ROOT_KEY } from './keys.js'

const originalMatchMedia = window.matchMedia

const stubMatchMedia = (matches) => {
  const mql = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
  window.matchMedia = vi.fn().mockReturnValue(mql)
  return mql
}

const mountMenu = (slots = {}) => mount(ToolbarMenu, {
  attachTo: document.body,
  global: {
    provide: {
      [OVERLAY_ROOT_KEY]: ref(null)
    }
  },
  slots: {
    trigger: `
      <template #trigger="slotProps">
        <button
          class="test-trigger"
          v-bind="slotProps.triggerAttrs"
          :ref="(el) => slotProps.triggerRef(el)"
          @click="slotProps.onToggle"
        >More</button>
      </template>
    `,
    default: '<button class="menu-item-a">A</button><button class="menu-item-b">B</button>',
    ...slots
  }
})

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('ToolbarMenu', () => {
  beforeEach(() => {
    stubMatchMedia(false)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    if (originalMatchMedia === undefined) {
      delete window.matchMedia
    } else {
      window.matchMedia = originalMatchMedia
    }
  })

  it('renders the trigger and keeps the menu closed initially', () => {
    const wrapper = mountMenu()

    const trigger = wrapper.find('.test-trigger')
    expect(trigger.exists()).toBe(true)
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.toolbar-menu__panel').exists()).toBe(false)

    wrapper.unmount()
  })

  it('opens the menu on trigger click and renders default slot content', async () => {
    const wrapper = mountMenu()

    await wrapper.find('.test-trigger').trigger('click')
    await wrapper.vm.$nextTick()

    const trigger = wrapper.find('.test-trigger')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    const panel = wrapper.find('.toolbar-menu__panel')
    expect(panel.exists()).toBe(true)
    expect(panel.attributes('role')).toBe('menu')
    expect(panel.find('.menu-item-a').exists()).toBe(true)
    expect(panel.find('.menu-item-b').exists()).toBe(true)

    wrapper.unmount()
  })

  it('toggles closed on a second trigger click', async () => {
    const wrapper = mountMenu()

    await wrapper.find('.test-trigger').trigger('click')
    expect(wrapper.find('.toolbar-menu__panel').exists()).toBe(true)

    await wrapper.find('.test-trigger').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.toolbar-menu__panel').exists()).toBe(false)
    expect(wrapper.find('.test-trigger').attributes('aria-expanded')).toBe('false')

    wrapper.unmount()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const wrapper = mountMenu()

    await wrapper.find('.test-trigger').trigger('click')
    await wrapper.vm.$nextTick()
    await flushPromises()
    expect(wrapper.find('.toolbar-menu__panel').exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.toolbar-menu__panel').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.find('.test-trigger').element)

    wrapper.unmount()
  })

  it('closes on outside pointerdown but stays open for inside clicks', async () => {
    const wrapper = mountMenu()

    await wrapper.find('.test-trigger').trigger('click')
    expect(wrapper.find('.toolbar-menu__panel').exists()).toBe(true)

    // Inside the menu root: no close.
    wrapper.find('.test-trigger').element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.toolbar-menu__panel').exists()).toBe(true)

    // Outside: closes.
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.toolbar-menu__panel').exists()).toBe(false)

    wrapper.unmount()
  })

  it('focuses the first menu item on open', async () => {
    const wrapper = mountMenu()

    await wrapper.find('.test-trigger').trigger('click')
    await wrapper.vm.$nextTick()
    await flushPromises()

    expect(document.activeElement).toBe(wrapper.find('.menu-item-a').element)

    wrapper.unmount()
  })

  it('renders the mobile drawer instead of the popover when the narrow query matches', async () => {
    stubMatchMedia(true)
    const wrapper = mountMenu()

    await wrapper.find('.test-trigger').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.toolbar-menu__panel').exists()).toBe(false)
    const drawer = document.body.querySelector('.toolbar-menu__drawer')
    expect(drawer).not.toBeNull()
    expect(drawer.querySelector('.menu-item-a')).not.toBeNull()

    // Drawer close button closes the menu (leave transition keeps the
    // node in the DOM for a tick, so assert the emitted event instead).
    drawer.querySelector('.toolbar-menu__drawer-close').dispatchEvent(new Event('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('close')).toBeTruthy()

    wrapper.unmount()
  })

  it('forcePopover keeps the popover at narrow viewport widths (no drawer, no mobile backdrop)', async () => {
    stubMatchMedia(true)
    const wrapper = mount(ToolbarMenu, {
      attachTo: document.body,
      props: { forcePopover: true },
      global: {
        provide: {
          [OVERLAY_ROOT_KEY]: ref(null)
        }
      },
      slots: {
        trigger: `
          <template #trigger="slotProps">
            <button
              class="test-trigger"
              v-bind="slotProps.triggerAttrs"
              :ref="(el) => slotProps.triggerRef(el)"
              @click="slotProps.onToggle"
            >More</button>
          </template>
        `,
        default: '<button class="menu-item-a">A</button>'
      }
    })

    // Root carries the force-popover class so the SCSS can scope out
    // the mobile drawer + mobile fullscreen backdrop rules.
    expect(wrapper.classes()).toContain('toolbar-menu--force-popover')

    await wrapper.find('.test-trigger').trigger('click')
    await wrapper.vm.$nextTick()

    // Anchored popover panel exists.
    expect(wrapper.find('.toolbar-menu__panel').exists()).toBe(true)
    expect(wrapper.find('.toolbar-menu__panel').attributes('role')).toBe('menu')

    // No mobile drawer branch.
    expect(wrapper.find('.toolbar-menu__drawer').exists()).toBe(false)
    expect(document.body.querySelector('.toolbar-menu__drawer')).toBeNull()

    // No mobile fullscreen backdrop on the body — the popover branch
    // renders the desktop backdrop inline, not teleported.
    const allBackdrops = document.body.querySelectorAll('.toolbar-menu__backdrop')
    expect(allBackdrops).toHaveLength(1)
    expect(wrapper.element.contains(allBackdrops[0])).toBe(true)

    wrapper.unmount()
  })

  it('removes document listeners on unmount without leaking handlers', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const wrapper = mountMenu()
    expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), true)
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('focusin', expect.any(Function))

    // Every handler added on document must be handed back to
    // removeEventListener on unmount (no leaked handlers).
    const addedHandlerFor = (type) => addSpy.mock.calls.find(([event]) => event === type)?.[1]

    wrapper.unmount()

    const removedTypes = removeSpy.mock.calls.map(([type]) => type)
    expect(removedTypes).toEqual(expect.arrayContaining(['pointerdown', 'keydown', 'focusin']))

    const removedHandlers = removeSpy.mock.calls.map(([, handler]) => handler)
    for (const type of ['pointerdown', 'keydown', 'focusin']) {
      expect(removedHandlers).toContain(addedHandlerFor(type))
    }

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
