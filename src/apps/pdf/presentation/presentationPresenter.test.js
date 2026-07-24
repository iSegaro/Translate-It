import { describe, expect, it } from 'vitest'

import { present } from './presentationPresenter.js'

describe('Presentation Presenter', () => {
  describe('acknowledgement intents', () => {
    it('presents export-completed as acknowledgement success', () => {
      const intent = present({ name: 'export-completed', format: 'txt' })

      expect(intent.intent).toBe('acknowledgement')
      expect(intent.severity).toBe('success')
      expect(intent.message).toBe('TXT exported successfully')
    })

    it('presents export-completed (markdown) with correct label', () => {
      const intent = present({ name: 'export-completed', format: 'markdown' })

      expect(intent.message).toBe('Markdown exported successfully')
    })

    it('presents JSON artifact export acknowledgement centrally', () => {
      const intent = present({ name: 'export-completed', format: 'json' })

      expect(intent.message).toBe('JSON exported successfully')
    })

    it('presents export-failed as error', () => {
      const intent = present({ name: 'export-failed', error: 'Disk full' })

      expect(intent.intent).toBe('acknowledgement')
      expect(intent.severity).toBe('error')
      expect(intent.message).toBe('Disk full')
    })

    it('presents export-failed with fallback message', () => {
      const intent = present({ name: 'export-failed' })

      expect(intent.message).toBe('Export failed')
    })

    it('presents ocr-failed as error', () => {
      const intent = present({ name: 'ocr-failed' })

      expect(intent.severity).toBe('error')
      expect(intent.message).toBe('OCR failed. Please try again.')
    })

    it('presents ocr-language-missing as error', () => {
      const intent = present({ name: 'ocr-language-missing' })

      expect(intent.severity).toBe('error')
      expect(intent.message).toContain('No OCR language is installed')
    })

    it('presents region-ocr-no-text as warning', () => {
      const intent = present({ name: 'region-ocr-no-text' })

      expect(intent.severity).toBe('warning')
      expect(intent.message).toBe('No text found in the selected region.')
    })

    it('presents region-ocr-failed as error', () => {
      const intent = present({ name: 'region-ocr-failed' })

      expect(intent.severity).toBe('error')
      expect(intent.message).toBe('Region OCR failed. Please try another region.')
    })
  })

  describe('outcome intents', () => {
    it('presents comparison-completed as outcome with notification', () => {
      const intent = present({
        name: 'comparison-completed',
        id: 'notif:1',
        summary: {
          winner: { candidateId: 'scale-1.5' },
          latency: { fastestMs: 342 }
        },
        result: {
          results: [],
          summary: { totalElapsedMs: 1200 }
        }
      })

      expect(intent.intent).toBe('outcome')
      expect(intent.notification.id).toBe('notif:1')
      expect(intent.notification.variant).toBe('success')
      expect(intent.notification.title).toBe('Region Comparison complete')
      expect(intent.notification.message).toBe('Winner: scale-1.5. Fastest: 342ms.')
      expect(intent.notification).not.toHaveProperty('body')
      expect(intent.comparison).toEqual({
        analysis: {
          winner: { candidateId: 'scale-1.5' },
          latency: { fastestMs: 342 }
        },
        results: [],
        totalElapsedMs: 1200
      })
    })

    it('presents comparison-completed with fallback message', () => {
      const intent = present({
        name: 'comparison-completed',
        id: 'notif:2',
        summary: {},
        result: {
          results: [],
          summary: { totalElapsedMs: 500 }
        }
      })

      expect(intent.notification.message).toBe('Region Comparison completed.')
    })

    it('presents comparison-failed as outcome with error notification', () => {
      const intent = present({
        name: 'comparison-failed',
        id: 'notif:3',
        error: 'All candidates rejected'
      })

      expect(intent.intent).toBe('outcome')
      expect(intent.notification.variant).toBe('error')
      expect(intent.notification.title).toBe('Region Comparison failed')
      expect(intent.notification.message).toBe('All candidates rejected')
    })

    it('presents comparison-failed with fallback message', () => {
      const intent = present({ name: 'comparison-failed', id: 'notif:4' })

      expect(intent.notification.message).toBe('Region Comparison failed. Please try again.')
    })

    it('presents translation-partial as outcome with partialTranslation', () => {
      const intent = present({ name: 'translation-partial', occurrenceId: 42 })

      expect(intent.intent).toBe('outcome')
      expect(intent.partialTranslation.occurrenceId).toBe(42)
    })
  })

  describe('activity intents', () => {
    it('presents translation-started as activity', () => {
      const intent = present({ name: 'translation-started' })

      expect(intent.intent).toBe('activity')
      expect(intent.running).toBe(true)
      expect(intent.title).toBe('Translating visible pages')
    })

    it('presents activity-completed as activity idle', () => {
      const intent = present({ name: 'activity-completed' })

      expect(intent.intent).toBe('activity')
      expect(intent.running).toBe(false)
    })

    it('presents ocr-progress-update with computed progress', () => {
      const intent = present({ name: 'ocr-progress-update', current: 45, total: 100 })

      expect(intent.intent).toBe('activity')
      expect(intent.running).toBe(true)
      expect(intent.progress).toBe(45)
      expect(intent.title).toBe('OCR: Processing pages')
    })
  })

  describe('unknown result', () => {
    it('returns null for unknown name', () => {
      expect(present({ name: 'nonexistent' })).toBeNull()
    })

    it('returns null for empty object', () => {
      expect(present({})).toBeNull()
    })

    it('returns null for null input', () => {
      expect(present(null)).toBeNull()
    })
  })
})
