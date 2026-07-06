import { defineComponent, h, nextTick, onMounted, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pageRootEls, pageRectMap } = vi.hoisted(() => {
  const pageRootEls = new Map()
  const pageRectMap = new Map()
  return { pageRootEls, pageRectMap }
})

function buildRect(top, height = 100, width = 300, left = 0) {
  return {
    top,
    bottom: top + height,
    left,
    right: left + width,
    width,
    height,
    x: left,
    y: top
  }
}

vi.mock('./PdfPageView.vue', () => ({
  default: defineComponent({
    name: 'PdfPageView',
    props: {
      page: { type: Object, required: true },
      session: { type: Object, required: true },
      visible: { type: Boolean, default: false }
    },
    setup(props, { expose }) {
      const rootEl = ref(null)

      onMounted(() => {
        if (!rootEl.value) return

        rootEl.value.dataset.pageNumber = String(props.page.pageNumber)
        rootEl.value.getBoundingClientRect = () => pageRectMap.get(props.page.pageNumber) || buildRect(0)
        pageRootEls.set(props.page.pageNumber, rootEl.value)
      })

      expose({
        getRootEl: () => rootEl.value,
        rootEl
      })
      return () => h('article', { ref: rootEl, class: 'pdf-page' })
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
const waitAnimationFrame = () => new Promise(resolve => requestAnimationFrame(resolve))

describe('PdfViewer', () => {
  beforeEach(() => {
    observeMock.mockClear()
    disconnectMock.mockClear()
    resizeObserveMock.mockClear()
    resizeDisconnectMock.mockClear()
    pageRootEls.clear()
    pageRectMap.clear()
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

    wrapper.find('.pdf-viewer').element.getBoundingClientRect = () => buildRect(0, 500, 300)

    await nextTick()
    await nextTick()

    expect(observeMock).toHaveBeenCalledWith(pageRootEls.get(1))

    wrapper.unmount()
  })

  it('emits the primary page as the current page', async () => {
    const session = {
      updateVisiblePages: vi.fn(),
      updateRenderCandidates: vi.fn()
    }
    pageRectMap.set(1, buildRect(10, 100, 300))
    pageRectMap.set(2, buildRect(120, 100, 300))

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

    wrapper.find('.pdf-viewer').element.getBoundingClientRect = () => buildRect(0, 500, 300)

    await nextTick()
    await nextTick()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(1)

    pageRectMap.set(1, buildRect(-60, 100, 300))
    pageRectMap.set(2, buildRect(20, 100, 300))
    await wrapper.setProps({
      pages: [
        { pageNumber: 1, width: 100, height: 100, scale: 1 },
        { pageNumber: 2, width: 100, height: 100, scale: 1 }
      ]
    })

    await waitAnimationFrame()
    await nextTick()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(2)

    wrapper.unmount()
  })

  it('emits current page from geometry without waiting for observer visibility', async () => {
    pageRectMap.set(1, buildRect(10, 100, 300))

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
    expect(observeMock).toHaveBeenCalledWith(pageRootEls.get(1))

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
      viewerEl.element.dispatchEvent(new Event('pointermove', { bubbles: true }))

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
