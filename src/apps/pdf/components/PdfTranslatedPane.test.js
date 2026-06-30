import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfTranslatedPane from './PdfTranslatedPane.vue'

let intersectionCallback

vi.mock('./PdfTranslatedBlock.vue', () => ({
  default: {
    name: 'PdfTranslatedBlock',
    props: ['block', 'translationState'],
    template: '<div class="mock-block">{{ block.text }}</div>'
  }
}))

describe('PdfTranslatedPane', () => {
  beforeEach(() => {
    intersectionCallback = null

    vi.stubGlobal('IntersectionObserver', class IntersectionObserver {
      constructor(callback) {
        intersectionCallback = callback
      }

      observe() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders empty state when no translated data', () => {
    const wrapper = mount(PdfTranslatedPane, {
      props: { translatedPageData: [] }
    })

    expect(wrapper.text()).toContain('No translations yet')
    expect(wrapper.find('.pdf-translated-pane__empty').exists()).toBe(true)
  })

  it('renders empty state when all pages have no blocks', () => {
    const wrapper = mount(PdfTranslatedPane, {
      props: {
        translatedPageData: [
          { pageNumber: 1, width: 100, height: 200, blocks: [] },
          { pageNumber: 2, width: 100, height: 200, blocks: [] }
        ]
      }
    })

    expect(wrapper.text()).toContain('No translations yet')
  })

  it('renders pages with blocks', () => {
    const wrapper = mount(PdfTranslatedPane, {
      props: {
        translatedPageData: [
          {
            pageNumber: 1,
            width: 100,
            height: 200,
            blocks: [
              { id: 'b1', text: 'First block', translationState: { status: 'translated', translatedText: 'Primer bloque' } },
              { id: 'b2', text: 'Second block', translationState: { status: 'idle', translatedText: '' } }
            ]
          }
        ]
      }
    })

    expect(wrapper.find('.pdf-translated-page').exists()).toBe(true)
    expect(wrapper.text()).toContain('Page 1')
    expect(wrapper.findAll('.mock-block')).toHaveLength(2)
  })

  it('renders empty page message when page has no blocks but other pages do', () => {
    const wrapper = mount(PdfTranslatedPane, {
      props: {
        translatedPageData: [
          { pageNumber: 1, width: 100, height: 200, blocks: [] },
          { pageNumber: 2, width: 100, height: 200, blocks: [{ id: 'b1', text: 'Block', translationState: { status: 'idle' } }] }
        ]
      }
    })

    expect(wrapper.text()).toContain('No text blocks on this page')
  })

  it('renders multiple pages in order', () => {
    const wrapper = mount(PdfTranslatedPane, {
      props: {
        translatedPageData: [
          { pageNumber: 1, width: 100, height: 200, blocks: [{ id: 'b1', text: 'Page 1 block', translationState: { status: 'idle' } }] },
          { pageNumber: 2, width: 100, height: 200, blocks: [{ id: 'b2', text: 'Page 2 block', translationState: { status: 'idle' } }] }
        ]
      }
    })

    const pages = wrapper.findAll('.pdf-translated-page')
    expect(pages).toHaveLength(2)
    expect(pages[0].text()).toContain('Page 1')
    expect(pages[1].text()).toContain('Page 2')
  })

  it('emits the top-most visible translated page', async () => {
    const wrapper = mount(PdfTranslatedPane, {
      props: {
        translatedPageData: [
          { pageNumber: 1, width: 100, height: 200, blocks: [{ id: 'b1', text: 'Page 1 block', translationState: { status: 'idle' } }] },
          { pageNumber: 2, width: 100, height: 200, blocks: [{ id: 'b2', text: 'Page 2 block', translationState: { status: 'idle' } }] }
        ]
      },
      attachTo: document.body
    })

    await wrapper.vm.$nextTick()

    intersectionCallback?.([
      { target: { dataset: { pageNumber: '2' } }, isIntersecting: true },
      { target: { dataset: { pageNumber: '1' } }, isIntersecting: true }
    ])

    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(1)

    wrapper.unmount()
  })
})
