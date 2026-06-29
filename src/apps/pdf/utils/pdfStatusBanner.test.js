import { describe, expect, it } from 'vitest'
import { buildPdfStatusBannerState } from './pdfStatusBanner.js'

describe('buildPdfStatusBannerState', () => {
  it('returns null when idle', () => {
    expect(buildPdfStatusBannerState()).toBeNull()
  })

  it('builds a loading banner', () => {
    expect(buildPdfStatusBannerState({ isLoading: true })).toEqual({
      visible: true,
      variant: 'info',
      title: 'Opening PDF',
      message: 'Loading PDF and rebuilding visible pages.',
      detail: ''
    })
  })

  it('builds a translating banner', () => {
    expect(buildPdfStatusBannerState({ isTranslating: true })).toEqual({
      visible: true,
      variant: 'info',
      title: 'Translating visible pages',
      message: 'Translating visible pages.',
      detail: ''
    })
  })

  it('builds a cache-restore banner', () => {
    expect(buildPdfStatusBannerState({ restoredTranslationCount: 2 })).toEqual({
      visible: true,
      variant: 'success',
      title: 'Restored from cache',
      message: 'Restored 2 cached translation(s).',
      detail: ''
    })
  })

  it('builds a partial export warning banner', () => {
    expect(buildPdfStatusBannerState({ isPartialExport: true })).toEqual({
      visible: true,
      variant: 'warning',
      title: 'Partial translation',
      message: 'Partial translation available. Not all blocks are translated yet.',
      detail: ''
    })
  })

  it('builds an export success banner', () => {
    expect(buildPdfStatusBannerState({
      exportSuccess: {
        variant: 'success',
        title: 'TXT export ready',
        message: 'TXT export downloaded successfully.',
        detail: ''
      }
    })).toEqual({
      visible: true,
      variant: 'success',
      title: 'TXT export ready',
      message: 'TXT export downloaded successfully.',
      detail: ''
    })
  })

  it('keeps partial export above success', () => {
    expect(buildPdfStatusBannerState({
      isPartialExport: true,
      exportSuccess: {
        variant: 'success',
        title: 'HTML export ready',
        message: 'HTML export downloaded successfully.',
        detail: ''
      }
    })).toEqual({
      visible: true,
      variant: 'warning',
      title: 'Partial translation',
      message: 'Partial translation available. Not all blocks are translated yet.',
      detail: ''
    })
  })

  it('prefers error state over other states', () => {
    expect(buildPdfStatusBannerState({
      error: 'Failed to open the PDF file.',
      isLoading: true,
      restoredTranslationCount: 3,
      exportSuccess: {
        variant: 'success',
        title: 'Markdown export ready',
        message: 'Markdown export downloaded successfully.',
        detail: ''
      }
    })).toEqual({
      visible: true,
      variant: 'error',
      title: 'PDF error',
      message: 'Failed to open the PDF file.',
      detail: ''
    })
  })
})
