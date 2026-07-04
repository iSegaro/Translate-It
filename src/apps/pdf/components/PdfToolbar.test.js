import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfToolbar from './PdfToolbar.vue'

describe('PdfToolbar', () => {
  it('renders the file name and keeps core actions available', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'very-long-document-name.pdf',
        pageCount: 12,
        currentPageNumber: 5,
        isLoading: false,
        isTranslating: false,
        canTranslateVisiblePages: true,
        canExport: true,
        scannedPageCount: 0,
        isOcrProcessing: false,
        zoomMode: 'fit-width',
        zoomPercent: 100,
        translationSummary: {
          status: 'idle',
          translatedCount: 0,
          failedCount: 0,
          totalCount: 0
        }
      }
    })

    expect(wrapper.find('.pdf-toolbar__file-row').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__file-name').text()).toBe('very-long-document-name.pdf')
    expect(wrapper.find('.pdf-toolbar__file-name').attributes('title')).toBe('very-long-document-name.pdf')
    expect(wrapper.find('.pdf-toolbar__page-input').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__page-input').element.value).toBe('5')
    expect(wrapper.find('.pdf-toolbar__page-total').text()).toBe('12')
    expect(wrapper.find('.pdf-toolbar__zoom-select').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__button[aria-label="More actions"]').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__button[aria-label="Export options"]').exists()).toBe(true)

    expect(wrapper.find('.pdf-toolbar__mode-button--active').exists()).toBe(true)
  })

  it('emits content-view-change when a content view button is clicked', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        contentView: 'original',
        layoutMode: 'single',
        zoomMode: 'fit-width',
        zoomPercent: 100,
        showTranslationOption: true
      }
    })

    await wrapper.find('.pdf-toolbar__mode-button--active').trigger('click')
    expect(wrapper.emitted('content-view-change')).toBeTruthy()
    expect(wrapper.emitted('content-view-change')?.[0]?.[0]).toBe('original')

    const translationButton = wrapper.findAll('.pdf-toolbar__mode-button').find(
      (btn) => btn.text().includes('Translation')
    )
    await translationButton?.trigger('click')
    expect(wrapper.emitted('content-view-change')?.[1]?.[0]).toBe('translation')
  })

  it('hides Translation option when showTranslationOption is false', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        contentView: 'original',
        showTranslationOption: false
      }
    })

    const allButtons = wrapper.findAll('.pdf-toolbar__mode-button')
    const contentButtons = allButtons.filter(
      btn => ['Original', 'Translation', 'Translated PDF'].some(label => btn.text().includes(label))
    )
    expect(contentButtons).toHaveLength(2)
    expect(contentButtons[0].text()).toBe('Original')
    expect(contentButtons[1].text()).toBe('Translated PDF')
    expect(contentButtons.some(btn => btn.text().includes('Translation'))).toBe(false)
  })

  it('shows Translation option when showTranslationOption is true', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        contentView: 'translation',
        showTranslationOption: true
      }
    })

    const allButtons = wrapper.findAll('.pdf-toolbar__mode-button')
    const contentButtons = allButtons.filter(
      btn => ['Original', 'Translation', 'Translated PDF'].some(label => btn.text().includes(label))
    )
    expect(contentButtons).toHaveLength(3)
    expect(contentButtons.some(btn => btn.text().includes('Translation'))).toBe(true)
  })

  it('emits layout-mode-change when a layout mode button is clicked', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        contentView: 'translation',
        layoutMode: 'single',
        zoomMode: 'fit-width',
        zoomPercent: 100
      }
    })

    const sideBySideButton = wrapper.find('.pdf-toolbar__mode-button[aria-label="Side by Side"]')
    await sideBySideButton?.trigger('click')
    expect(wrapper.emitted('layout-mode-change')).toBeTruthy()
    expect(wrapper.emitted('layout-mode-change')?.[0]?.[0]).toBe('side-by-side')
  })

  it('keeps Open PDF and Clear Cache in the hamburger menu and export in the export menu', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        isLoading: false,
        isTranslating: false,
        canTranslateVisiblePages: true,
        canExport: true,
        scannedPageCount: 0,
        isOcrProcessing: false,
        zoomMode: 'fit-width',
        zoomPercent: 100,
        translationSummary: {
          status: 'idle',
          translatedCount: 0,
          failedCount: 0,
          totalCount: 0
        }
      }
    })

    const toolbarButtons = () => wrapper.findAll('.pdf-toolbar__actions button')

    expect(toolbarButtons().some((button) => button.text().includes('Open PDF'))).toBe(false)
    expect(toolbarButtons().some((button) => button.text().includes('Clear Cache'))).toBe(false)

    await toolbarButtons().find((button) => button.text().includes('Translate Visible Pages'))?.trigger('click')
    expect(wrapper.emitted('translate-visible')).toBeTruthy()

    await wrapper.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')
    expect(wrapper.find('.pdf-toolbar__export-menu').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__export-menu').text()).toContain('Open PDF')
    expect(wrapper.find('.pdf-toolbar__export-menu').text()).toContain('Clear Cache')

    const fileInput = wrapper.find('input[type="file"]')
    const clickSpy = vi.spyOn(fileInput.element, 'click').mockImplementation(() => {})

    await wrapper.find('.pdf-toolbar__export-menu button').trigger('click')
    expect(clickSpy).toHaveBeenCalled()

    await wrapper.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')
    await wrapper.find('.pdf-toolbar__export-menu button:nth-child(2)').trigger('click')
    expect(wrapper.emitted('clear-cache')).toBeTruthy()

    await wrapper.find('.pdf-toolbar__button[aria-label="Export options"]').trigger('click')
    expect(wrapper.find('.pdf-toolbar__export-menu').exists()).toBe(true)

    await wrapper.findAll('button').find((button) => button.text().includes('Export TXT'))?.trigger('click')
    expect(wrapper.emitted('export-txt')).toBeTruthy()

    await wrapper.find('.pdf-toolbar__button[aria-label="Export options"]').trigger('click')
    await wrapper.findAll('button').find((button) => button.text().includes('Export Markdown'))?.trigger('click')
    expect(wrapper.emitted('export-markdown')).toBeTruthy()

    await wrapper.find('.pdf-toolbar__button[aria-label="Export options"]').trigger('click')
    await wrapper.findAll('button').find((button) => button.text().includes('Export HTML'))?.trigger('click')
    expect(wrapper.emitted('export-html')).toBeTruthy()

    await wrapper.find('.pdf-toolbar__zoom-select').setValue('125')
    expect(wrapper.emitted('zoom-change')?.at(-1)?.[0]).toEqual({ mode: 'percent', value: 125 })

    await wrapper.find('.pdf-toolbar__zoom-select').setValue('fit-page')
    expect(wrapper.emitted('zoom-change')?.at(-1)?.[0]).toEqual({ mode: 'fit-page', value: 100 })

    await wrapper.findAll('button').find((button) => button.text().trim() === '+')?.trigger('click')
    expect(wrapper.emitted('zoom-step')?.at(-1)?.[0]).toBe(1)
  })

  it('keeps the current labels while loading', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 2,
        currentPageNumber: 1,
        isLoading: true,
        canTranslateVisiblePages: false,
        canExport: false,
        isTranslating: false,
        zoomMode: 'fit-width',
        zoomPercent: 100
      }
    })

    expect(wrapper.text()).toContain('demo.pdf')

    await wrapper.find('.pdf-toolbar__button[aria-label="More actions"]').trigger('click')
    expect(wrapper.find('.pdf-toolbar__export-menu').text()).toContain('Loading...')
  })

  it('shows outline toggle button when hasOutline is true', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 1,
        currentPageNumber: 1,
        hasOutline: true,
        isOutlineVisible: false
      }
    })

    expect(wrapper.find('.pdf-toolbar__outline-toggle').exists()).toBe(true)
    expect(wrapper.find('.pdf-toolbar__outline-toggle--active').exists()).toBe(false)
  })

  it('hides outline toggle button when hasOutline is false', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 1,
        currentPageNumber: 1,
        hasOutline: false
      }
    })

    expect(wrapper.find('.pdf-toolbar__outline-toggle').exists()).toBe(false)
  })

  it('emits toggle-outline when outline button is clicked', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 1,
        currentPageNumber: 1,
        hasOutline: true,
        isOutlineVisible: false
      }
    })

    await wrapper.find('.pdf-toolbar__outline-toggle').trigger('click')
    expect(wrapper.emitted('toggle-outline')).toBeTruthy()
  })

  it('applies active class to outline toggle when outline is visible', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 1,
        currentPageNumber: 1,
        hasOutline: true,
        isOutlineVisible: true
      }
    })

    expect(wrapper.find('.pdf-toolbar__outline-toggle--active').exists()).toBe(true)
  })
})
