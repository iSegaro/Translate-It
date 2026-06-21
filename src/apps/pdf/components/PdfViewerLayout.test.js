import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfViewerLayout from './PdfViewerLayout.vue'

describe('PdfViewerLayout', () => {
  it('renders bilingual layout with two panes', () => {
    const wrapper = mount(PdfViewerLayout, {
      props: {
        viewerMode: 'bilingual',
        showOriginalPane: true,
        showTranslatedPane: true
      },
      slots: {
        original: '<div class="original-pane">Original</div>',
        translated: '<div class="translated-pane">Translated</div>'
      }
    })

    expect(wrapper.classes()).toContain('pdf-viewer-layout--bilingual')
    expect(wrapper.find('.original-pane').exists()).toBe(true)
    expect(wrapper.find('.translated-pane').exists()).toBe(true)
  })

  it('renders only original pane in original mode', () => {
    const wrapper = mount(PdfViewerLayout, {
      props: {
        viewerMode: 'original',
        showOriginalPane: true,
        showTranslatedPane: false
      },
      slots: {
        original: '<div class="original-pane">Original</div>',
        translated: '<div class="translated-pane">Translated</div>'
      }
    })

    expect(wrapper.classes()).toContain('pdf-viewer-layout--original')
    expect(wrapper.find('.original-pane').exists()).toBe(true)
    expect(wrapper.find('.translated-pane').exists()).toBe(false)
  })

  it('renders only translated pane in translated mode', () => {
    const wrapper = mount(PdfViewerLayout, {
      props: {
        viewerMode: 'translated',
        showOriginalPane: false,
        showTranslatedPane: true
      },
      slots: {
        original: '<div class="original-pane">Original</div>',
        translated: '<div class="translated-pane">Translated</div>'
      }
    })

    expect(wrapper.classes()).toContain('pdf-viewer-layout--translated')
    expect(wrapper.find('.original-pane').exists()).toBe(false)
    expect(wrapper.find('.translated-pane').exists()).toBe(true)
  })

  it('applies correct mode class', () => {
    const wrapper = mount(PdfViewerLayout, {
      props: {
        viewerMode: 'bilingual',
        showOriginalPane: true,
        showTranslatedPane: true
      }
    })

    expect(wrapper.classes()).toContain('pdf-viewer-layout--bilingual')
    expect(wrapper.classes()).not.toContain('pdf-viewer-layout--original')
    expect(wrapper.classes()).not.toContain('pdf-viewer-layout--translated')
  })
})
