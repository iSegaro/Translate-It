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

describe('PdfViewer', () => {
  beforeEach(() => {
    observeMock.mockClear()
    disconnectMock.mockClear()
    resizeObserveMock.mockClear()
    resizeDisconnectMock.mockClear()

    intersectionObserverClass = class IntersectionObserver {
      constructor() {}
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
          updateVisiblePages: vi.fn()
        }
      },
      attachTo: document.body
    })

    await nextTick()
    await nextTick()

    expect(observeMock).toHaveBeenCalledWith(pageRootEl)

    wrapper.unmount()
  })
})
