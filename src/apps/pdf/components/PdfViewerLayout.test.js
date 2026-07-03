import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfViewerLayout from './PdfViewerLayout.vue'

vi.mock('../composables/usePdfScrollSync.js', () => ({
  usePdfScrollSync: vi.fn(() => ({ syncFromPane: vi.fn(), syncNow: vi.fn() }))
}))

describe('PdfViewerLayout', () => {
  it('renders side-by-side layout with two panes', () => {
    const wrapper = mount(PdfViewerLayout, {
      props: {
        layoutMode: 'side-by-side',
        showOriginalPane: true,
        showTranslatedPane: true
      },
      slots: {
        original: '<div class="original-pane">Original</div>',
        translated: '<div class="translated-pane">Translated</div>'
      }
    })

    expect(wrapper.classes()).toContain('pdf-viewer-layout--side-by-side')
    expect(wrapper.find('.original-pane').exists()).toBe(true)
    expect(wrapper.find('.translated-pane').exists()).toBe(true)
  })

  it('renders only original pane in single layout', () => {
    const wrapper = mount(PdfViewerLayout, {
      props: {
        layoutMode: 'single',
        showOriginalPane: true,
        showTranslatedPane: false
      },
      slots: {
        original: '<div class="original-pane">Original</div>',
        translated: '<div class="translated-pane">Translated</div>'
      }
    })

    expect(wrapper.classes()).toContain('pdf-viewer-layout--single')
    expect(wrapper.find('.original-pane').exists()).toBe(true)
    expect(wrapper.find('.translated-pane').exists()).toBe(false)
  })

  it('renders only translated pane in single layout', () => {
    const wrapper = mount(PdfViewerLayout, {
      props: {
        layoutMode: 'single',
        showOriginalPane: false,
        showTranslatedPane: true
      },
      slots: {
        original: '<div class="original-pane">Original</div>',
        translated: '<div class="translated-pane">Translated</div>'
      }
    })

    expect(wrapper.classes()).toContain('pdf-viewer-layout--single')
    expect(wrapper.find('.original-pane').exists()).toBe(false)
    expect(wrapper.find('.translated-pane').exists()).toBe(true)
  })

  it('applies correct layout class', () => {
    const wrapper = mount(PdfViewerLayout, {
      props: {
        layoutMode: 'side-by-side',
        showOriginalPane: true,
        showTranslatedPane: true
      }
    })

    expect(wrapper.classes()).toContain('pdf-viewer-layout--side-by-side')
    expect(wrapper.classes()).not.toContain('pdf-viewer-layout--single')
  })

  it('exposes scroll containers and directional sync API', () => {
    const wrapper = mount(PdfViewerLayout, {
      props: {
        layoutMode: 'side-by-side',
        showOriginalPane: true,
        showTranslatedPane: true
      },
      slots: {
        original: '<div class="original-pane">Original</div>',
        translated: '<div class="translated-pane">Translated</div>'
      }
    })

    expect(wrapper.vm.scrollContainer).toBeTruthy()
    expect(wrapper.vm.translatedPaneRef).toBeTruthy()
    expect(wrapper.vm.syncFromPane).toBeTruthy()
  })
})
