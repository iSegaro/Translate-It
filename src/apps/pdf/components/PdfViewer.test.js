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
import { VIEWER_ROLE } from '../composables/usePdfViewerMode.js'

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

  it('does not emit a fallback current page before observer visibility exists', async () => {
    const initialPages = [{ pageNumber: 1, width: 100, height: 100, scale: 1 }]
    const wrapper = mount(PdfViewer, {
      props: {
        pages: initialPages,
        session: {
          updateVisiblePages: vi.fn(),
          updateRenderCandidates: vi.fn()
        }
      },
      attachTo: document.body
    })

    await nextTick()
    await nextTick()

    expect(wrapper.emitted('current-page-change')).toBeFalsy()

    await wrapper.setProps({
      pages: [{ pageNumber: 1, width: 120, height: 120, scale: 1 }]
    })
    await nextTick()
    await nextTick()

    expect(wrapper.emitted('current-page-change')).toBeFalsy()

    visibilityCallback?.([
      { target: { dataset: { pageNumber: '1' } }, isIntersecting: true, intersectionRatio: 0.5 }
    ])
    await nextTick()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(1)

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

  it('rebuilds observers when scroll container changes', async () => {
    const session = {
      updateVisiblePages: vi.fn(),
      updateRenderCandidates: vi.fn()
    }
    const firstRoot = document.createElement('div')
    const secondRoot = document.createElement('div')

    const wrapper = mount(PdfViewer, {
      props: {
        pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
        session,
        scrollContainer: firstRoot
      },
      attachTo: document.body
    })

    await nextTick()
    await nextTick()

    expect(resizeObserveMock).toHaveBeenCalledWith(firstRoot)
    const disconnectCount = disconnectMock.mock.calls.length
    const resizeDisconnectCount = resizeDisconnectMock.mock.calls.length

    await wrapper.setProps({ scrollContainer: secondRoot })
    await nextTick()
    await nextTick()

    expect(disconnectMock.mock.calls.length).toBeGreaterThan(disconnectCount)
    expect(resizeDisconnectMock.mock.calls.length).toBeGreaterThan(resizeDisconnectCount)
    expect(resizeObserveMock).toHaveBeenCalledWith(secondRoot)
    expect(observeMock).toHaveBeenCalledWith(pageRootEl)

    wrapper.unmount()
  })

  // ── viewerRole ───────────────────────────────────────────────

  describe('viewerRole', () => {
    it('defaults to VIEWER_ROLE.ORIGINAL', () => {
      const wrapper = mount(PdfViewer, {
        props: {
          pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
          session: {
            updateVisiblePages: vi.fn(),
            updateRenderCandidates: vi.fn()
          }
        }
      })

      expect(wrapper.props('viewerRole')).toBe(VIEWER_ROLE.ORIGINAL)
    })

    it('does not emit layout-change for overlay role', async () => {
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
            session,
            viewerRole: VIEWER_ROLE.OVERLAY
          },
          attachTo: document.body
        })

        await nextTick()
        await nextTick()

        expect(wrapper.emitted('layout-change')).toBeFalsy()

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

    it('does not emit current-page-change for overlay role', async () => {
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
          session,
          viewerRole: VIEWER_ROLE.OVERLAY
        },
        attachTo: document.body
      })

      await nextTick()
      await nextTick()

      visibilityCallback?.([
        { target: { dataset: { pageNumber: '1' } }, isIntersecting: true, intersectionRatio: 0.5 }
      ])

      await nextTick()

      expect(wrapper.emitted('current-page-change')).toBeFalsy()

      wrapper.unmount()
    })

    it('does not call session.updateVisiblePages for overlay role', async () => {
      const session = {
        updateVisiblePages: vi.fn(),
        updateRenderCandidates: vi.fn()
      }

      const wrapper = mount(PdfViewer, {
        props: {
          pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
          session,
          viewerRole: VIEWER_ROLE.OVERLAY
        },
        attachTo: document.body
      })

      await nextTick()
      await nextTick()

      visibilityCallback?.([
        { target: { dataset: { pageNumber: '1' } }, isIntersecting: true, intersectionRatio: 0.5 }
      ])

      await nextTick()

      expect(session.updateVisiblePages).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('does not call session.updateRenderCandidates for overlay role', async () => {
      const session = {
        updateVisiblePages: vi.fn(),
        updateRenderCandidates: vi.fn()
      }

      const wrapper = mount(PdfViewer, {
        props: {
          pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
          session,
          viewerRole: VIEWER_ROLE.OVERLAY
        },
        attachTo: document.body
      })

      await nextTick()
      await nextTick()

      renderCallback?.([
        { target: { dataset: { pageNumber: '1' } }, isIntersecting: true }
      ])

      await nextTick()

      expect(session.updateRenderCandidates).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('does not emit block-pointer-move for overlay role', async () => {
      const session = {
        updateVisiblePages: vi.fn(),
        updateRenderCandidates: vi.fn()
      }

      const wrapper = mount(PdfViewer, {
        props: {
          pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
          session,
          viewerRole: VIEWER_ROLE.OVERLAY,
          isBlockTargetingActive: true
        },
        attachTo: document.body
      })

      await nextTick()

      const viewerEl = wrapper.find('.pdf-viewer')
      viewerEl.trigger('pointermove', { clientX: 0, clientY: 0 })

      expect(wrapper.emitted('block-pointer-move')).toBeFalsy()

      wrapper.unmount()
    })

    it('does not emit block-click for overlay role', async () => {
      const session = {
        updateVisiblePages: vi.fn(),
        updateRenderCandidates: vi.fn()
      }

      const wrapper = mount(PdfViewer, {
        props: {
          pages: [{ pageNumber: 1, width: 100, height: 100, scale: 1 }],
          session,
          viewerRole: VIEWER_ROLE.OVERLAY,
          isBlockTargetingActive: true
        },
        attachTo: document.body
      })

      await nextTick()

      const viewerEl = wrapper.find('.pdf-viewer')
      viewerEl.trigger('click')

      expect(wrapper.emitted('block-click')).toBeFalsy()

      wrapper.unmount()
    })
  })
})
