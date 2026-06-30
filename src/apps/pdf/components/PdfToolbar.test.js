import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PdfToolbar from './PdfToolbar.vue'

describe('PdfToolbar', () => {
  it('renders the file name and keeps core actions available', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'very-long-document-name.pdf',
        pageCount: 12,
        workerLabel: 'configured',
        isLoading: false,
        isTranslating: false,
        canTranslateVisiblePages: true,
        canExport: true,
        isPartialExport: false,
        isBlockTargetingActive: false,
        scannedPageCount: 0,
        isOcrProcessing: false,
        restoredTranslationCount: 0,
        viewerMode: 'bilingual',
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

    await wrapper.find('.pdf-toolbar__mode-button--active').trigger('click')
    expect(wrapper.emitted('mode-change')).toBeTruthy()
  })

  it('emits export and translate actions', async () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        isLoading: false,
        isTranslating: false,
        canTranslateVisiblePages: true,
        canExport: true,
        isPartialExport: false,
        isBlockTargetingActive: false,
        scannedPageCount: 0,
        isOcrProcessing: false,
        viewerMode: 'bilingual',
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
  })

  it('keeps the current labels while loading', () => {
    const wrapper = mount(PdfToolbar, {
      props: {
        fileName: 'demo.pdf',
        isLoading: true,
        canTranslateVisiblePages: false,
        canExport: false,
        isTranslating: false,
        viewerMode: 'bilingual'
      }
    })

    expect(wrapper.text()).toContain('demo.pdf')
    expect(wrapper.text()).toContain('Loading...')
  })
})
