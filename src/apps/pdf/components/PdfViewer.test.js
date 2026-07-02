import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pageRootEl } = vi.hoisted(() => {
  const pageRootEl = document.createElement('article')
  return { pageRootEl }
})

vi.mock('./PdfPageView.vue', () => ({
  default: defineComponent({
    name: 'PdfPageView',
    props: {
      page: { type: Object, required: true },
      session: { type: Object, required: true },
      visible: { type: Boolean, default: false }
    },
    setup(_, { expose }) {
      expose({
        getRootEl: () => pageRootEl,
        rootEl: pageRootEl
      })
      return () => h('article')
    }
  })
}))

import PdfViewer from './PdfViewer.vue'

const observeMock = vi.fn()
const disconnectMock = vi.fn()
const resizeObserveMock = vi.fn()
const resizeDisconnectMock = vi.fn()
let intersectionObserverClass
let resizeObserverClass
let visibilityCallback
let renderCallback

describe('PdfViewer', () => {
  beforeEach(() => {
    observeMock.mockClear()
    disconnectMock.mockClear()
    resizeObserveMock.mockClear()
    resizeDisconnectMock.mockClear()
    visibilityCallback = null
    renderCallback = null
    let instanceCount = 0

    intersectionObserverClass = class IntersectionObserver {
      constructor(callback) {
        this._index = instanceCount++
        if (this._index === 0) {
          visibilityCallback = callback
        } else {
          renderCallback = callback
        }
      }
      observe(target) {
        observeMock(target)
      }
      disconnect() {
        disconnectMock()
      }
    }

    resizeObserverClass = class ResizeObserver {
      constructor() {}
      observe(target) {
        resizeObserveMock(target)
      }
      disconnect() {
        resizeDisconnectMock()
      }
    }

    vi.stubGlobal('IntersectionObserver', intersectionObserverClass)
    vi.stubGlobal('ResizeObserver', resizeObserverClass)
  })

  it('observes raw page root elements from exposed page views', async () => {
    const wrapper = mount(PdfViewer, {
      props: {
        pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
        session: {
          updateVisiblePages: vi.fn(),
          updateRenderCandidates: vi.fn()
        }
      },
      attachTo: document.body
    })

    await nextTick()
    await nextTick()

    expect(observeMock).toHaveBeenCalledWith(pageRootEl)

    wrapper.unmount()
  })

  it('emits the top-most visible page as the current page', async () => {
    const session = {
      updateVisiblePages: vi.fn(),
      updateRenderCandidates: vi.fn()
    }

    const wrapper = mount(PdfViewer, {
      props: {
        pages: [
          { pageNumber: 1, width: 100, height: 100, scale: 1 },
          { pageNumber: 2, width: 100, height: 100, scale: 1 }
        ],
        session
      },
      attachTo: document.body
    })

    await nextTick()
    await nextTick()

    visibilityCallback?.([
      { target: { dataset: { pageNumber: '2' } }, isIntersecting: true, intersectionRatio: 0.5 },
      { target: { dataset: { pageNumber: '1' } }, isIntersecting: true, intersectionRatio: 0.5 }
    ])

    await nextTick()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(1)
    expect(session.updateVisiblePages).toHaveBeenCalled()

    visibilityCallback?.([
      { target: { dataset: { pageNumber: '1' } }, isIntersecting: false, intersectionRatio: 0 },
      { target: { dataset: { pageNumber: '2' } }, isIntersecting: true, intersectionRatio: 0.5 }
    ])

    await nextTick()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(2)

    wrapper.unmount()
  })

  it('emits both width and height for layout changes', async () => {
    const session = {
      updateVisiblePages: vi.fn(),
      updateRenderCandidates: vi.fn()
    }

    const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

    try {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get: () => 960
      })
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get: () => 720
      })

      const wrapper = mount(PdfViewer, {
        props: {
          pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
          session
        },
        attachTo: document.body
      })

      await nextTick()
      await nextTick()

      expect(wrapper.emitted('layout-change')?.at(-1)?.[0]).toEqual({ width: 960, height: 720 })

      wrapper.unmount()
    } finally {
      if (widthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor)
      }
      if (heightDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', heightDescriptor)
      }
    }
  })
})
