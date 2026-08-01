import { describe, expect, it, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent } from 'vue'
import { usePdfTextFitter } from './usePdfTextFitter.js'

function createHostComponent({ width, height, scale, fontSize, watchDeps, text }) {
  return defineComponent({
    setup() {
      const w = computed(() => width)
      const h = computed(() => height)
      const s = computed(() => scale)
      const fs = computed(() => fontSize)

      const { textRef, resolvedFontSize, fitTextToBox } = usePdfTextFitter({
        width: w,
        height: h,
        scale: s,
        fontSize: fs,
        watchDeps: watchDeps || []
      })

      return { textRef, resolvedFontSize, fitTextToBox, text: text || 'Hello' }
    },
    template: `<div><span ref="textRef">{{ text }}</span></div>`
  })
}

describe('usePdfTextFitter', () => {
  const originalGetBCR = Element.prototype.getBoundingClientRect

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBCR
  })

  it('returns textRef, resolvedFontSize, and fitTextToBox', async () => {
    const Host = createHostComponent({ width: 100, height: 20, scale: 1, fontSize: 12 })
    const wrapper = mount(Host)

    expect(wrapper.vm.textRef).toBeDefined()
    expect(typeof wrapper.vm.resolvedFontSize).toBe('number')
    expect(typeof wrapper.vm.fitTextToBox).toBe('function')
  })

  it('computes resolvedFontSize as fontSize * scale', async () => {
    const Host = createHostComponent({ width: 100, height: 20, scale: 2, fontSize: 10 })
    const wrapper = mount(Host)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resolvedFontSize).toBe(20)
  })

  it('does not reduce font scale when text fits', async () => {
    Element.prototype.getBoundingClientRect = function () {
      return { width: 80, height: 15, top: 0, left: 0, bottom: 15, right: 80 }
    }

    const Host = createHostComponent({ width: 100, height: 20, scale: 1, fontSize: 12 })
    const wrapper = mount(Host)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resolvedFontSize).toBe(12)
  })

  it('reduces font scale when text overflows', async () => {
    let callCount = 0
    Element.prototype.getBoundingClientRect = function () {
      callCount++
      if (callCount <= 1) {
        return { width: 200, height: 50, top: 0, left: 0, bottom: 50, right: 200 }
      }
      return { width: 190, height: 18, top: 0, left: 0, bottom: 18, right: 190 }
    }

    const Host = createHostComponent({ width: 180, height: 16, scale: 1, fontSize: 12 })
    const wrapper = mount(Host)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resolvedFontSize).toBeLessThan(12)
    expect(wrapper.vm.resolvedFontSize).toBeGreaterThanOrEqual(7.2)
  })

  it('handles zero-width container gracefully', async () => {
    const Host = createHostComponent({ width: 0, height: 20, scale: 1, fontSize: 12 })
    const wrapper = mount(Host)
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.resolvedFontSize).toBe(12)
  })
})
