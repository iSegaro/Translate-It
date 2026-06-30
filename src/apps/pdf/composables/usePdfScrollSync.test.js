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
        <div ref="originalPaneRef" class="original-pane"></div>
        <div ref="translatedPaneRef" class="translated-pane"></div>
      </div>
    `
  })
}

function setScrollMetrics(element, { scrollHeight, clientHeight, scrollTop = 0 }) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight
  })

  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight
  })

  element.scrollTop = scrollTop
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

  it('syncs original scroll to translated scroll proportionally', async () => {
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

    setScrollMetrics(originalPane, { scrollHeight: 1500, clientHeight: 500, scrollTop: 500 })
    setScrollMetrics(translatedPane, { scrollHeight: 1200, clientHeight: 600, scrollTop: 0 })

    originalPane.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(translatedPane.scrollTop).toBe(300)

    wrapper.unmount()
  })

  it('syncs translated scroll back to original scroll', async () => {
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

    setScrollMetrics(originalPane, { scrollHeight: 1600, clientHeight: 600, scrollTop: 0 })
    setScrollMetrics(translatedPane, { scrollHeight: 1000, clientHeight: 400, scrollTop: 250 })

    translatedPane.dispatchEvent(new Event('scroll'))
    await nextTick()

    expect(originalPane.scrollTop).toBe(417)

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

    setScrollMetrics(originalPane, { scrollHeight: 1500, clientHeight: 500, scrollTop: 500 })
    setScrollMetrics(translatedPane, { scrollHeight: 1200, clientHeight: 600, scrollTop: 0 })

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

    setScrollMetrics(originalPane, { scrollHeight: 1500, clientHeight: 500, scrollTop: 500 })
    setScrollMetrics(translatedPane, { scrollHeight: 1200, clientHeight: 600, scrollTop: 0 })

    originalPane.dispatchEvent(new Event('scroll'))
    wrapper.unmount()

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(99)
    expect(typeof pendingCallback).toBe('function')

    pendingCallback = null
    originalPane.dispatchEvent(new Event('scroll'))
    expect(pendingCallback).toBeNull()
  })
})
