import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfTranslatedPane from './PdfTranslatedPane.vue'

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

vi.mock('./PdfTranslatedBlock.vue', () => ({
  default: {
    name: 'PdfTranslatedBlock',
    props: ['block', 'translationState'],
    template: '<div class="mock-block">{{ block.text }}</div>'
  }
}))

describe('PdfTranslatedPane', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class IntersectionObserver {
      constructor() {}

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
        layoutMode: 'side-by-side',
        pageMetrics: [
          { pageNumber: 1, width: 100, height: 200 }
        ],
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

  it('applies page-height normalization in side-by-side layout', () => {
    const wrapper = mount(PdfTranslatedPane, {
      props: {
        layoutMode: 'side-by-side',
        pageMetrics: [
          { pageNumber: 1, width: 100, height: 240 }
        ],
        translatedPageData: [
          {
            pageNumber: 1,
            width: 100,
            height: 120,
            blocks: [
              { id: 'b1', text: 'First block', translationState: { status: 'translated', translatedText: 'Primer bloque' } }
            ]
          }
        ]
      }
    })

    expect(wrapper.find('.pdf-translated-page__body').attributes('style')).toContain('min-height: 240px')
  })

  it('does not apply page-height normalization in single layout', () => {
    const wrapper = mount(PdfTranslatedPane, {
      props: {
        layoutMode: 'single',
        pageMetrics: [
          { pageNumber: 1, width: 100, height: 240 }
        ],
        translatedPageData: [
          {
            pageNumber: 1,
            width: 100,
            height: 120,
            blocks: [
              { id: 'b1', text: 'First block', translationState: { status: 'translated', translatedText: 'Primer bloque' } }
            ]
          }
        ]
      }
    })

    expect(wrapper.find('.pdf-translated-page__body').attributes('style') || '').not.toContain('min-height')
  })

  it('renders normally when page metrics are missing', () => {
    const wrapper = mount(PdfTranslatedPane, {
      props: {
        layoutMode: 'side-by-side',
        translatedPageData: [
          {
            pageNumber: 1,
            width: 100,
            height: 120,
            blocks: [
              { id: 'b1', text: 'First block', translationState: { status: 'translated', translatedText: 'Primer bloque' } }
            ]
          }
        ]
      }
    })

    expect(wrapper.find('.pdf-translated-page').exists()).toBe(true)
    expect(wrapper.find('.pdf-translated-page__body').exists()).toBe(true)
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

  it('emits the primary translated page', async () => {
    const wrapper = mount(PdfTranslatedPane, {
      props: {
        translatedPageData: [
          { pageNumber: 1, width: 100, height: 200, blocks: [{ id: 'b1', text: 'Page 1 block', translationState: { status: 'idle' } }] },
          { pageNumber: 2, width: 100, height: 200, blocks: [{ id: 'b2', text: 'Page 2 block', translationState: { status: 'idle' } }] }
        ]
      },
      attachTo: document.body
    })

    wrapper.element.parentElement.getBoundingClientRect = () => buildRect(0, 500, 300)

    await wrapper.vm.$nextTick()

    const pages = wrapper.findAll('.pdf-translated-page')
    pages[0].element.getBoundingClientRect = () => buildRect(10, 200, 300)
    pages[1].element.getBoundingClientRect = () => buildRect(120, 200, 300)

    await wrapper.vm.$nextTick()

    pages[0].element.getBoundingClientRect = () => buildRect(-40, 200, 300)
    pages[1].element.getBoundingClientRect = () => buildRect(20, 200, 300)

    wrapper.element.parentElement?.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => requestAnimationFrame(resolve))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(2)

    wrapper.unmount()
  })

  it('suppresses explicit translated current-page refresh while current-page updates are suppressed', async () => {
    const wrapper = mount(PdfTranslatedPane, {
      props: {
        suppressCurrentPageUpdates: true,
        translatedPageData: [
          { pageNumber: 1, width: 100, height: 200, blocks: [{ id: 'b1', text: 'Page 1 block', translationState: { status: 'idle' } }] }
        ]
      },
      attachTo: document.body
    })

    wrapper.element.parentElement.getBoundingClientRect = () => buildRect(0, 500, 300)
    await wrapper.vm.$nextTick()

    const page = wrapper.find('.pdf-translated-page')
    page.element.getBoundingClientRect = () => buildRect(10, 200, 300)
    wrapper.vm.refreshCurrentPage()

    expect(wrapper.emitted('current-page-change')).toBeFalsy()

    await wrapper.setProps({ suppressCurrentPageUpdates: false })
    wrapper.vm.refreshCurrentPage()

    expect(wrapper.emitted('current-page-change')?.at(-1)?.[0]).toBe(1)

    wrapper.unmount()
  })
})
