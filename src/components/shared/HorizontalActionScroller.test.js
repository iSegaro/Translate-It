import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HorizontalActionScroller from './HorizontalActionScroller.vue'

let resizeObserver
let animationFrameCallbacks
let cancelledAnimationFrameIds
let wrappers

vi.mock('@/composables/shared/useUnifiedI18n.js', () => ({
  useUnifiedI18n: () => ({ t: (key) => key })
}))

class ResizeObserverMock {
  constructor(callback) {
    this.callback = callback
    this.disconnect = vi.fn()
    resizeObserver = this
  }

  observe = vi.fn()
}

function setViewportMetrics(viewport, { clientWidth, scrollWidth, scrollLeft = 0 }) {
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
    scrollLeft: { configurable: true, writable: true, value: scrollLeft }
  })
}

function flushAnimationFrame() {
  const callbacks = animationFrameCallbacks.splice(0)
  callbacks.forEach(({ callback }) => callback())
}

describe('HorizontalActionScroller', () => {
  beforeEach(() => {
    resizeObserver = null
    animationFrameCallbacks = []
    cancelledAnimationFrameIds = []
    wrappers = []
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      const id = animationFrameCallbacks.length + 1
      animationFrameCallbacks.push({ id, callback })
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id) => {
      cancelledAnimationFrameIds.push(id)
      animationFrameCallbacks = animationFrameCallbacks.filter((entry) => entry.id !== id)
    })
  })

  afterEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount())
    vi.unstubAllGlobals()
  })

  function mountScroller() {
    const wrapper = mount(HorizontalActionScroller, {
      attachTo: document.body,
      props: { ariaLabel: 'Popup actions' },
      slots: {
        default: '<button data-action="first">First</button><button data-action="second">Second</button>'
      }
    })
    wrappers.push(wrapper)
    return wrapper
  }

  it('renders no arrows when slot content fits', async () => {
    const wrapper = mountScroller()
    const viewport = wrapper.find('.ti-horizontal-action-scroller__viewport').element
    setViewportMetrics(viewport, { clientWidth: 200, scrollWidth: 200 })
    await wrapper.vm.$nextTick()
    resizeObserver.callback()
    flushAnimationFrame()
    await wrapper.vm.$nextTick()
    await wrapper.vm.scrollToEnd()
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.ti-horizontal-action-scroller__control')).toHaveLength(0)
  })

  it('updates arrow visibility at each scroll edge', async () => {
    const wrapper = mountScroller()
    const viewport = wrapper.find('.ti-horizontal-action-scroller__viewport').element
    setViewportMetrics(viewport, { clientWidth: 302, scrollWidth: 336 })
    await wrapper.vm.$nextTick()
    resizeObserver.callback()
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    const previous = wrapper.find('.ti-horizontal-action-scroller__control--previous')
    const next = wrapper.find('.ti-horizontal-action-scroller__control--next')

    expect(wrapper.findAll('.ti-horizontal-action-scroller__control')).toHaveLength(2)
    expect(previous.classes()).toContain('ti-horizontal-action-scroller__control--inactive')
    expect(previous.attributes('disabled')).toBeDefined()
    expect(previous.attributes('tabindex')).toBe('-1')
    expect(previous.attributes('aria-hidden')).toBe('true')
    expect(next.classes()).not.toContain('ti-horizontal-action-scroller__control--inactive')
    expect(next.attributes('disabled')).toBeUndefined()

    viewport.scrollLeft = 17
    viewport.dispatchEvent(new Event('scroll'))
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    expect(previous.classes()).not.toContain('ti-horizontal-action-scroller__control--inactive')
    expect(next.classes()).not.toContain('ti-horizontal-action-scroller__control--inactive')
    expect([...wrapper.element.children].map((element) => element.className)).toEqual([
      'ti-horizontal-action-scroller__control ti-horizontal-action-scroller__control--previous',
      'ti-horizontal-action-scroller__viewport',
      'ti-horizontal-action-scroller__control ti-horizontal-action-scroller__control--next'
    ])

    viewport.scrollLeft = 34
    viewport.dispatchEvent(new Event('scroll'))
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    expect(previous.classes()).not.toContain('ti-horizontal-action-scroller__control--inactive')
    expect(next.classes()).toContain('ti-horizontal-action-scroller__control--inactive')
    expect(next.attributes('disabled')).toBeDefined()
    expect(next.attributes('tabindex')).toBe('-1')
    expect(next.attributes('aria-hidden')).toBe('true')
  })

  it('smooth-scrolls by eighty percent of viewport width', async () => {
    const wrapper = mountScroller()
    const viewport = wrapper.find('.ti-horizontal-action-scroller__viewport').element
    viewport.scrollBy = vi.fn()
    setViewportMetrics(viewport, { clientWidth: 100, scrollWidth: 264 })
    await wrapper.vm.$nextTick()
    resizeObserver.callback()
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    await wrapper.find('.ti-horizontal-action-scroller__control--next').trigger('click')

    expect(viewport.scrollBy).toHaveBeenCalledWith({ left: 80, behavior: 'smooth' })
  })

  it('stabilizes the first end anchor and keeps later calls immediate', async () => {
    const wrapper = mountScroller()
    const viewport = wrapper.find('.ti-horizontal-action-scroller__viewport').element
    setViewportMetrics(viewport, { clientWidth: 302, scrollWidth: 336 })
    await wrapper.vm.$nextTick()

    await wrapper.vm.scrollToEnd()
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    expect(cancelledAnimationFrameIds).toEqual([1])
    expect(wrapper.find('.ti-horizontal-action-scroller__control--previous').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.ti-horizontal-action-scroller__control--next').attributes('disabled')).toBeDefined()

    await wrapper.vm.scrollToEnd()

    expect(cancelledAnimationFrameIds).toEqual([1])
  })

  it('updates after resize and disconnects its observer on unmount', async () => {
    const wrapper = mountScroller()
    const viewport = wrapper.find('.ti-horizontal-action-scroller__viewport').element
    setViewportMetrics(viewport, { clientWidth: 100, scrollWidth: 264 })
    await wrapper.vm.$nextTick()
    resizeObserver.callback()
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.ti-horizontal-action-scroller__control')).toHaveLength(2)

    wrapper.unmount()

    expect(resizeObserver.disconnect).toHaveBeenCalledOnce()
  })

  it('preserves slot tab order', () => {
    const wrapper = mountScroller()

    expect(wrapper.findAll('[data-action]').map((button) => button.attributes('data-action'))).toEqual(['first', 'second'])
  })

  it('keeps control slots and viewport geometry stable at both edges', async () => {
    const wrapper = mountScroller()
    const viewport = wrapper.find('.ti-horizontal-action-scroller__viewport').element
    setViewportMetrics(viewport, { clientWidth: 302, scrollWidth: 336 })
    await wrapper.vm.$nextTick()
    resizeObserver.callback()
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    const viewportBefore = wrapper.find('.ti-horizontal-action-scroller__viewport').element
    expect(wrapper.element.children).toHaveLength(3)
    expect(viewportBefore.clientWidth).toBe(302)

    viewport.scrollLeft = 34
    viewport.dispatchEvent(new Event('scroll'))
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    expect(wrapper.element.children).toHaveLength(3)
    expect(wrapper.find('.ti-horizontal-action-scroller__viewport').element).toBe(viewportBefore)
    expect(viewport.clientWidth).toBe(302)
  })

  it('moves focus from an inactive edge control to opposite active control', async () => {
    const wrapper = mountScroller()
    const viewport = wrapper.find('.ti-horizontal-action-scroller__viewport').element
    setViewportMetrics(viewport, { clientWidth: 302, scrollWidth: 336 })
    await wrapper.vm.$nextTick()
    resizeObserver.callback()
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    const previous = wrapper.find('.ti-horizontal-action-scroller__control--previous').element
    const next = wrapper.find('.ti-horizontal-action-scroller__control--next').element
    next.focus()

    viewport.scrollLeft = 34
    viewport.dispatchEvent(new Event('scroll'))
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    expect(document.activeElement).toBe(previous)
  })

  it('keeps inactive controls out of interaction and tab order', async () => {
    const wrapper = mountScroller()
    const viewport = wrapper.find('.ti-horizontal-action-scroller__viewport').element
    viewport.scrollBy = vi.fn()
    setViewportMetrics(viewport, { clientWidth: 302, scrollWidth: 336 })
    await wrapper.vm.$nextTick()
    resizeObserver.callback()
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    const previous = wrapper.find('.ti-horizontal-action-scroller__control--previous')
    previous.element.click()

    expect(previous.attributes('disabled')).toBeDefined()
    expect(previous.attributes('tabindex')).toBe('-1')
    expect(previous.attributes('aria-hidden')).toBe('true')
    expect(viewport.scrollBy).not.toHaveBeenCalled()
  })
})
