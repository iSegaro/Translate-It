import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { PDF_RENDER_RESULT_STATUS } from '@/features/pdf-translation/core/PdfRenderer.js'
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
    renderPage: vi.fn().mockResolvedValue({ status: PDF_RENDER_RESULT_STATUS.SUCCESS }),
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
  await nextTick()
  await flushPromises()
  await nextTick()
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

  it('mounts the region selection overlay inside the page stage', () => {
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session: createSession(),
        visible: false,
        regionSelectionActive: true,
        regionSelectionRect: { x: 10, y: 20, width: 30, height: 40 }
      }
    })

    const stage = wrapper.find('.pdf-page__stage')
    expect(stage.find('.pdf-region-selection-overlay').exists()).toBe(true)
    expect(stage.find('.pdf-region-selection-overlay__rect').exists()).toBe(true)
  })

  it('forwards region pointer events from stage to viewer owner', async () => {
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session: createSession(),
        visible: false,
        regionSelectionActive: true,
        regionSelectionRect: { x: 10, y: 20, width: 30, height: 40 }
      }
    })

    await wrapper.find('.pdf-page__stage').trigger('pointerdown')
    await wrapper.find('.pdf-page__stage').trigger('pointermove')
    await wrapper.find('.pdf-page__stage').trigger('pointerup')
    await wrapper.find('.pdf-page__stage').trigger('pointercancel')
    await wrapper.find('.pdf-page__stage').trigger('lostpointercapture')

    expect(wrapper.emitted('region-selection-pointer-down')).toBeTruthy()
    expect(wrapper.emitted('region-selection-pointer-move')).toBeTruthy()
    expect(wrapper.emitted('region-selection-pointer-up')).toBeTruthy()
    expect(wrapper.emitted('region-selection-pointer-cancel')).toBeTruthy()
    expect(wrapper.emitted('region-selection-lost-pointer-capture')).toBeTruthy()
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

  it('accepts render priority props without changing render behavior', async () => {
    const session = createSession()
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: true,
        renderPriority: 0,
        renderPriorityGroup: 'primary-visible'
      }
    })

    await settleWatchers()
    session.renderPage.mockClear()

    await wrapper.setProps({
      renderPriority: 2,
      renderPriorityGroup: 'near-buffer'
    })
    await settleWatchers()

    expect(session.renderPage).not.toHaveBeenCalled()
    expect(wrapper.props('renderPriority')).toBe(2)
    expect(wrapper.props('renderPriorityGroup')).toBe('near-buffer')
  })

  it('does not render while renderAllowed is false', async () => {
    const session = createSession()
    mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: true,
        renderAllowed: false
      }
    })

    await settleWatchers()

    expect(session.renderPage).not.toHaveBeenCalled()
  })

  it('renders when renderAllowed changes to true', async () => {
    const session = createSession()
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: true,
        renderAllowed: false
      }
    })

    await settleWatchers()
    await wrapper.setProps({ renderAllowed: true })
    await settleWatchers()

    expect(session.renderPage).toHaveBeenCalledTimes(1)
  })

  it('does not clear an existing page when renderAllowed becomes false', async () => {
    const session = createSession()
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: true,
        renderAllowed: true
      }
    })

    await settleWatchers()
    session.clearPage.mockClear()

    await wrapper.setProps({ renderAllowed: false })
    await settleWatchers()

    expect(session.clearPage).not.toHaveBeenCalled()
  })

  it('emits render-committed after a successful render', async () => {
    const session = createSession()
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: false
      }
    })

    await settleWatchers()
    await wrapper.setProps({ visible: true })
    await settleWatchers()

    expect(wrapper.emitted('render-started')).toEqual([[3]])
    expect(wrapper.emitted('render-committed')).toEqual([[3]])
    expect(wrapper.emitted('render-failed')).toBeFalsy()
  })

  it('emits render-cancelled when render is cancelled', async () => {
    const session = createSession()
    session.renderPage.mockResolvedValue({ status: PDF_RENDER_RESULT_STATUS.CANCELLED })
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: false
      }
    })

    await settleWatchers()
    await wrapper.setProps({ visible: true })
    await settleWatchers()

    expect(wrapper.emitted('render-started')).toEqual([[3]])
    expect(wrapper.emitted('render-cancelled')).toEqual([[3]])
    expect(wrapper.emitted('render-committed')).toBeFalsy()
    expect(wrapper.emitted('render-failed')).toBeFalsy()
  })

  it('emits render-failed when render fails', async () => {
    const session = createSession()
    session.renderPage.mockResolvedValue({ status: PDF_RENDER_RESULT_STATUS.FAILED })
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: false
      }
    })

    await settleWatchers()
    await wrapper.setProps({ visible: true })
    await settleWatchers()

    expect(wrapper.emitted('render-started')).toEqual([[3]])
    expect(wrapper.emitted('render-failed')).toEqual([[3]])
    expect(wrapper.emitted('render-committed')).toBeFalsy()
    expect(wrapper.emitted('render-cancelled')).toBeFalsy()
  })

  it('does not emit render-committed after render completes for a hidden page', async () => {
    let resolveRender
    const session = createSession()
    session.renderPage.mockReturnValue(new Promise(resolve => {
      resolveRender = resolve
    }))
    const wrapper = mount(PdfPageView, {
      props: {
        page: createPage(),
        session,
        visible: false
      }
    })

    await settleWatchers()
    await wrapper.setProps({ visible: true })
    await flushPromises()
    await wrapper.setProps({ visible: false })
    resolveRender({ status: PDF_RENDER_RESULT_STATUS.SUCCESS })
    await settleWatchers()

    expect(wrapper.emitted('render-started')).toEqual([[3]])
    expect(wrapper.emitted('render-committed')).toBeFalsy()
    expect(wrapper.emitted('render-cancelled')).toBeFalsy()
    expect(wrapper.emitted('render-failed')).toBeFalsy()
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
    expect(wrapper.emitted('render-started')).toBeFalsy()
    expect(wrapper.emitted('render-committed')).toBeFalsy()
    expect(wrapper.emitted('render-failed')).toBeFalsy()
  })
})
