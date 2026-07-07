import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PdfPageView from './PdfPageView.vue'

vi.mock('@/features/pdf-translation/core/PdfTextLayerRenderer.js', () => ({
  PdfTextLayerRenderer: class PdfTextLayerRenderer {
    clear() {}
  }
}))

vi.mock('./PdfOverlayLayer.vue', () => ({
  default: {
    name: 'PdfOverlayLayer',
    template: '<div />'
  }
}))

vi.mock('./PdfLinkOverlay.vue', () => ({
  default: {
    name: 'PdfLinkOverlay',
    template: '<div />'
  }
}))

function createSession() {
  return {
    renderPage: vi.fn().mockResolvedValue(true),
    clearPage: vi.fn(),
    getPageMaskModel: vi.fn(() => null)
  }
}

function createPage(overrides = {}) {
  return {
    pageNumber: 3,
    width: 500,
    height: 700,
    scale: 1,
    ...overrides
  }
}

async function settleWatchers() {
  await flushPromises()
  await flushPromises()
}

describe('PdfPageView', () => {
  it('reserves the PDF canvas slot before the page renders', () => {
    const wrapper = mount(PdfPageView, {
      props: {
        page: {
          pageNumber: 3,
          width: 500,
          height: 700,
          scale: 1
        },
        session: createSession(),
        visible: false
      }
    })

    expect(wrapper.attributes('style')).toContain('width: 500px')
    expect(wrapper.find('.pdf-page__stage').attributes('style')).toContain('height: 700px')
  })

  it('does not clear an initially hidden page when metrics change', async () => {
    const session = createSession()
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: false
      }
    })

    await settleWatchers()

    await wrapper.setProps({
      page: createPage({ scale: 1.25 })
    })
    await settleWatchers()

    expect(session.clearPage).not.toHaveBeenCalled()
  })

  it('renders a visible page when scale changes', async () => {
    const session = createSession()
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: true
      }
    })

    await settleWatchers()
    session.renderPage.mockClear()

    await wrapper.setProps({
      page: createPage({ scale: 1.5 })
    })
    await settleWatchers()

    expect(session.renderPage).toHaveBeenCalledTimes(1)
  })

  it('clears a page when it leaves the render window', async () => {
    const session = createSession()
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: true
      }
    })

    await settleWatchers()
    session.clearPage.mockClear()

    await wrapper.setProps({ visible: false })
    await settleWatchers()

    expect(session.clearPage).toHaveBeenCalledTimes(1)
  })

  it('does not clear on unmount when render lifecycle is not owned', async () => {
    const session = createSession()
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: true,
        clearOnUnmount: false
      }
    })

    await settleWatchers()
    session.clearPage.mockClear()

    wrapper.unmount()

    expect(session.clearPage).not.toHaveBeenCalled()
  })

  it('does not render or clear a hidden page when dimensions and scale change', async () => {
    const session = createSession()
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: false
      }
    })

    await settleWatchers()
    session.renderPage.mockClear()
    session.clearPage.mockClear()

    await wrapper.setProps({
      page: createPage({ width: 620, height: 820, scale: 1.4 })
    })
    await settleWatchers()

    expect(session.renderPage).not.toHaveBeenCalled()
    expect(session.clearPage).not.toHaveBeenCalled()
  })

  it('does not call session.renderPage when visible becomes false during nextTick gap', async () => {
    const session = createSession()
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: true
      }
    })

    // The immediate watcher fires renderPage(), which hits await nextTick() and yields.
    // Before that nextTick resolves, set visible=false to trigger the zombie-render guard.
    await wrapper.setProps({ visible: false })

    // Flush remaining promises so the stale nextTick resolves.
    await flushPromises()

    expect(session.renderPage).not.toHaveBeenCalled()
  })
})
