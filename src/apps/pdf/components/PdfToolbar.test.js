import { describe, expect, it } from 'vitest'
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
        isBlockTargetingActive: false,
        scannedPageCount: 0,
        isOcrProcessing: false,
        viewerMode: 'bilingual',
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

    expect(wrapper.find('.pdf-toolbar__file-name').text()).toBe('very-long-document-name.pdf')
    expect(wrapper.find('.pdf-toolbar__file-name').attributes('title')).toBe('very-long-document-name.pdf')
    expect(wrapper.find('.pdf-toolbar__page-indicator').text()).toBe('5 / 12')
    expect(wrapper.find('option[value="fit-page"]').exists()).toBe(true)

    await wrapper.find('.pdf-toolbar__mode-button--active').trigger('click')
    expect(wrapper.emitted('mode-change')).toBeTruthy()
  })

  it('emits export and translate actions', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 12,
        currentPageNumber: 1,
        isLoading: false,
        isTranslating: false,
        canTranslateVisiblePages: true,
        canExport: true,
        isBlockTargetingActive: false,
        scannedPageCount: 0,
        isOcrProcessing: false,
        viewerMode: 'bilingual',
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

    await wrapper.findAll('button').find((button) => button.text().includes('Translate Visible Pages'))?.trigger('click')
    expect(wrapper.emitted('translate-visible')).toBeTruthy()

    await wrapper.findAll('button').find((button) => button.text().includes('Export TXT'))?.trigger('click')
    expect(wrapper.emitted('export-txt')).toBeTruthy()

    await wrapper.find('.pdf-toolbar__zoom-select').setValue('125')
    expect(wrapper.emitted('zoom-change')?.at(-1)?.[0]).toEqual({ mode: 'percent', value: 125 })

    await wrapper.find('.pdf-toolbar__zoom-select').setValue('fit-page')
    expect(wrapper.emitted('zoom-change')?.at(-1)?.[0]).toEqual({ mode: 'fit-page', value: 100 })

    await wrapper.findAll('button').find((button) => button.text().trim() === '+')?.trigger('click')
    expect(wrapper.emitted('zoom-step')?.at(-1)?.[0]).toBe(1)
  })

  it('keeps the current labels while loading', () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        pageCount: 2,
        currentPageNumber: 1,
        isLoading: true,
        canTranslateVisiblePages: false,
        canExport: false,
        isTranslating: false,
        viewerMode: 'bilingual',
        zoomMode: 'fit-width',
        zoomPercent: 100
      }
    })

    expect(wrapper.text()).toContain('demo.pdf')
    expect(wrapper.text()).toContain('Loading...')
  })
})
