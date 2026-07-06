import { mount } from '@vue/test-utils'
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
})
