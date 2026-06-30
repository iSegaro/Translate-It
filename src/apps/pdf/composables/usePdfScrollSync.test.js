import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { usePdfScrollSync } from './usePdfScrollSync.js'

function createHostComponent({ enabled = true } = {}) {
  return defineComponent({
    setup() {
      const originalPaneRef = ref(null)
      const translatedPaneRef = ref(null)
      const isEnabled = ref(enabled)

      usePdfScrollSync(originalPaneRef, translatedPaneRef, isEnabled)

      return {
        originalPaneRef,
        translatedPaneRef,
        isEnabled
      }
    },
    template: `
      <div>
        <div ref="originalPaneRef" class="original-pane">
          <div class="original-page" data-page-number="1"></div>
          <div class="original-page" data-page-number="2"></div>
          <div class="original-page" data-page-number="3"></div>
        </div>
        <div ref="translatedPaneRef" class="translated-pane">
          <div class="translated-page" data-page-number="1">
            <div class="pdf-translated-page__body"></div>
          </div>
          <div class="translated-page" data-page-number="2">
            <div class="pdf-translated-page__body"></div>
          </div>
          <div class="translated-page" data-page-number="3">
            <div class="pdf-translated-page__body"></div>
          </div>
        </div>
      </div>
    `
  })
}

function setScrollMetrics(element, { scrollHeight, clientHeight, scrollTop = 0, top = 0, height = 0 }) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight
  })

  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight
  })

  element.scrollTop = scrollTop

  element.getBoundingClientRect = () => ({
    top,
    left: 0,
    right: 100,
    bottom: top + height,
    width: 100,
    height
  })
}

function setPageMetrics(element, pane, { offsetTop = 0, height = 0 }) {
  element.getBoundingClientRect = () => ({
    top: offsetTop - Number(pane.scrollTop || 0),
    left: 0,
    right: 100,
    bottom: offsetTop - Number(pane.scrollTop || 0) + height,
    width: 100,
    height
  })
}

describe('usePdfScrollSync', () => {
  let originalRaf
  let originalCancelRaf

  beforeEach(() => {
    originalRaf = globalThis.requestAnimationFrame
    originalCancelRaf = globalThis.cancelAnimationFrame
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf
    globalThis.cancelAnimationFrame = originalCancelRaf
  })

  it('syncs original scroll to the matching translated page using page-aware ratios', async () => {
    globalThis.requestAnimationFrame = (callback) => {
      callback()
      return 1
    }
    globalThis.cancelAnimationFrame = vi.fn()

    const Host = createHostComponent({ enabled: true })
    const wrapper = mount(Host)
    await nextTick()

    const originalPane = wrapper.find('.original-pane').element
    const translatedPane = wrapper.find('.translated-pane').element

    setScrollMetrics(originalPane, { scrollHeight: 1500, clientHeight: 500, scrollTop: 500, top: 0, height: 1000 })
    setScrollMetrics(translatedPane, { scrollHeight: 1200, clientHeight: 600, scrollTop: 0, top: 0, height: 600 })

    const originalPages = originalPane.querySelectorAll('.original-page')
    const translatedPages = translatedPane.querySelectorAll('.translated-page')

    originalPages.forEach((pageEl, index) => {
      setPageMetrics(pageEl, originalPane, {
        offsetTop: index * 1000,
        height: 1000
      })
    })

    translatedPages.forEach((pageEl, index) => {
      setPageMetrics(pageEl, translatedPane, {
        offsetTop: index * 700,
        height: 700
      })
      setPageMetrics(pageEl.querySelector('.pdf-translated-page__body'), translatedPane, {
        offsetTop: index * 700 + 40,
        height: 660
      })
    })

    originalPane.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(translatedPane.scrollTop).toBe(330)

    wrapper.unmount()
  })

  it('syncs translated scroll back to the matching original page using page-aware ratios', async () => {
    globalThis.requestAnimationFrame = (callback) => {
      callback()
      return 1
    }
    globalThis.cancelAnimationFrame = vi.fn()

    const Host = createHostComponent({ enabled: true })
    const wrapper = mount(Host)
    await nextTick()

    const originalPane = wrapper.find('.original-pane').element
    const translatedPane = wrapper.find('.translated-pane').element

    setScrollMetrics(originalPane, { scrollHeight: 2600, clientHeight: 600, scrollTop: 1300, top: 0, height: 2000 })
    setScrollMetrics(translatedPane, { scrollHeight: 1800, clientHeight: 400, scrollTop: 0, top: 0, height: 1400 })

    const originalPages = originalPane.querySelectorAll('.original-page')
    const translatedPages = translatedPane.querySelectorAll('.translated-page')

    originalPages.forEach((pageEl, index) => {
      setPageMetrics(pageEl, originalPane, {
        offsetTop: index * 1000,
        height: 1000
      })
    })

    translatedPages.forEach((pageEl, index) => {
      setPageMetrics(pageEl, translatedPane, {
        offsetTop: index * 700,
        height: 700
      })
      setScrollMetrics(pageEl.querySelector('.pdf-translated-page__body'), {
        scrollHeight: 0,
        clientHeight: 0,
        top: index * 700 + 40,
        height: 660
      })
    })

    translatedPane.scrollTop = 820
    translatedPane.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(originalPane.scrollTop).toBe(1182)

    wrapper.unmount()
  })

  it('falls back to proportional sync when page markers are missing', async () => {
    globalThis.requestAnimationFrame = (callback) => {
      callback()
      return 1
    }
    globalThis.cancelAnimationFrame = vi.fn()

    const Host = createHostComponent({ enabled: true })
    const wrapper = mount(Host)
    await nextTick()

    const originalPane = wrapper.find('.original-pane').element
    const translatedPane = wrapper.find('.translated-pane').element

    wrapper.findAll('.original-page').forEach((page) => {
      delete page.element.dataset.pageNumber
      setPageMetrics(page.element, originalPane, {
        offsetTop: 0,
        height: 0
      })
      setScrollMetrics(page.element, {
        scrollHeight: 0,
        clientHeight: 0,
        top: 0,
        height: 0
      })
    })

    wrapper.findAll('.translated-page').forEach((page) => {
      delete page.element.dataset.pageNumber
      setPageMetrics(page.element, translatedPane, {
        offsetTop: 0,
        height: 0
      })
      setScrollMetrics(page.element, {
        scrollHeight: 0,
        clientHeight: 0,
        top: 0,
        height: 0
      })
    })

    setScrollMetrics(originalPane, { scrollHeight: 1500, clientHeight: 500, scrollTop: 500, top: 0, height: 1000 })
    setScrollMetrics(translatedPane, { scrollHeight: 1200, clientHeight: 600, scrollTop: 0, top: 0, height: 600 })

    originalPane.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(translatedPane.scrollTop).toBe(300)

    wrapper.unmount()
  })

  it('does not sync when disabled', async () => {
    globalThis.requestAnimationFrame = (callback) => {
      callback()
      return 1
    }
    globalThis.cancelAnimationFrame = vi.fn()

    const Host = createHostComponent({ enabled: false })
    const wrapper = mount(Host)
    await nextTick()

    const originalPane = wrapper.find('.original-pane').element
    const translatedPane = wrapper.find('.translated-pane').element

    setScrollMetrics(originalPane, { scrollHeight: 1500, clientHeight: 500, scrollTop: 500, top: 0, height: 1000 })
    setScrollMetrics(translatedPane, { scrollHeight: 1200, clientHeight: 600, scrollTop: 0, top: 0, height: 600 })

    originalPane.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(translatedPane.scrollTop).toBe(0)

    wrapper.unmount()
  })

  it('cleans up listeners and cancels pending animation frames on unmount', async () => {
    const cancelAnimationFrameMock = vi.fn()
    let pendingCallback = null

    globalThis.requestAnimationFrame = (callback) => {
      pendingCallback = callback
      return 99
    }
    globalThis.cancelAnimationFrame = cancelAnimationFrameMock

    const Host = createHostComponent({ enabled: true })
    const wrapper = mount(Host)
    await nextTick()

    const originalPane = wrapper.find('.original-pane').element
    const translatedPane = wrapper.find('.translated-pane').element

    setScrollMetrics(originalPane, { scrollHeight: 1500, clientHeight: 500, scrollTop: 500, top: 0, height: 1000 })
    setScrollMetrics(translatedPane, { scrollHeight: 1200, clientHeight: 600, scrollTop: 0, top: 0, height: 600 })

    originalPane.dispatchEvent(new Event('scroll'))
    wrapper.unmount()

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(99)
    expect(typeof pendingCallback).toBe('function')

    pendingCallback = null
    originalPane.dispatchEvent(new Event('scroll'))
    expect(pendingCallback).toBeNull()
  })
})
