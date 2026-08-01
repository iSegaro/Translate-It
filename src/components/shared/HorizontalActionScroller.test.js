import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HorizontalActionScroller from './HorizontalActionScroller.vue'

let resizeObserver
let animationFrameCallbacks

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
  callbacks.forEach((callback) => callback())
}

describe('HorizontalActionScroller', () => {
  beforeEach(() => {
    resizeObserver = null
    animationFrameCallbacks = []
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      animationFrameCallbacks.push(callback)
      return animationFrameCallbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mountScroller() {
    return mount(HorizontalActionScroller, {
      props: { ariaLabel: 'Popup actions' },
      slots: {
        default: '<button data-action="first">First</button><button data-action="second">Second</button>'
      }
    })
  }

  it('renders no arrows when slot content fits', async () => {
    const wrapper = mountScroller()
    const viewport = wrapper.find('.ti-horizontal-action-scroller__viewport').element
    setViewportMetrics(viewport, { clientWidth: 200, scrollWidth: 200 })
    await wrapper.vm.$nextTick()
    resizeObserver.callback()
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

    expect(wrapper.find('.ti-horizontal-action-scroller__control--previous').exists()).toBe(false)
    expect(wrapper.find('.ti-horizontal-action-scroller__control--next').exists()).toBe(true)

    viewport.scrollLeft = 17
    viewport.dispatchEvent(new Event('scroll'))
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ti-horizontal-action-scroller__control--previous').exists()).toBe(true)
    expect(wrapper.find('.ti-horizontal-action-scroller__control--next').exists()).toBe(true)
    expect([...wrapper.element.children].map((element) => element.className)).toEqual([
      'ti-horizontal-action-scroller__control ti-horizontal-action-scroller__control--previous',
      'ti-horizontal-action-scroller__viewport',
      'ti-horizontal-action-scroller__control ti-horizontal-action-scroller__control--next'
    ])

    viewport.scrollLeft = 34
    viewport.dispatchEvent(new Event('scroll'))
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ti-horizontal-action-scroller__control--previous').exists()).toBe(true)
    expect(wrapper.find('.ti-horizontal-action-scroller__control--next').exists()).toBe(false)
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

  it('updates after resize and disconnects its observer on unmount', async () => {
    const wrapper = mountScroller()
    const viewport = wrapper.find('.ti-horizontal-action-scroller__viewport').element
    setViewportMetrics(viewport, { clientWidth: 100, scrollWidth: 264 })
    await wrapper.vm.$nextTick()
    resizeObserver.callback()
    flushAnimationFrame()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ti-horizontal-action-scroller__control--next').exists()).toBe(true)

    wrapper.unmount()

    expect(resizeObserver.disconnect).toHaveBeenCalledOnce()
  })

  it('preserves slot tab order', () => {
    const wrapper = mountScroller()

    expect(wrapper.findAll('[data-action]').map((button) => button.attributes('data-action'))).toEqual(['first', 'second'])
  })
})
