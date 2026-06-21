import { describe, expect, it } from 'vitest'
import { buildTxtOutput, buildMarkdownOutput } from './PdfExportFormatter.js'

describe('PdfExportFormatter', () => {
  const sampleBlocks = [
    { pageNumber: 1, role: 'heading', readingOrderIndex: 0, translatedText: 'Introduction' },
    { pageNumber: 1, role: 'paragraph', readingOrderIndex: 1, translatedText: 'This is the first paragraph.' },
    { pageNumber: 1, role: 'list-item', readingOrderIndex: 2, translatedText: 'Item one' },
    { pageNumber: 2, role: 'paragraph', readingOrderIndex: 0, translatedText: 'Second page content.' },
    { pageNumber: 2, role: 'caption', readingOrderIndex: 1, translatedText: 'Figure 1' }
  ]

  describe('buildTxtOutput', () => {
    it('includes document title when provided', () => {
      const output = buildTxtOutput({ documentTitle: 'My Doc', blocks: sampleBlocks })

      expect(output).toContain('My Doc')
      expect(output).toContain('=====')
    })

    it('omits title section when no title', () => {
      const output = buildTxtOutput({ documentTitle: '', blocks: sampleBlocks })

      expect(output).not.toContain('===')
    })

    it('inserts page separators', () => {
      const output = buildTxtOutput({ documentTitle: '', blocks: sampleBlocks })

      expect(output).toContain('--- Page 1 ---')
      expect(output).toContain('--- Page 2 ---')
    })

    it('does not duplicate page separator for first page', () => {
      const output = buildTxtOutput({ documentTitle: '', blocks: sampleBlocks })

      const page1Index = output.indexOf('--- Page 1 ---')
      expect(page1Index).toBe(0)
    })

    it('includes all translated text', () => {
      const output = buildTxtOutput({ documentTitle: '', blocks: sampleBlocks })

      expect(output).toContain('Introduction')
      expect(output).toContain('This is the first paragraph.')
      expect(output).toContain('Item one')
      expect(output).toContain('Second page content.')
      expect(output).toContain('Figure 1')
    })

    it('handles empty blocks', () => {
      const output = buildTxtOutput({ documentTitle: '', blocks: [] })

      expect(output).toBe('')
    })
  })

  describe('buildMarkdownOutput', () => {
    it('includes document title as h1', () => {
      const output = buildMarkdownOutput({ documentTitle: 'My Doc', blocks: sampleBlocks })

      expect(output).toContain('# My Doc')
    })

    it('omits title when no title', () => {
      const output = buildMarkdownOutput({ documentTitle: '', blocks: sampleBlocks })

      expect(output).not.toMatch(/^# /m)
    })

    it('formats headings as markdown headings', () => {
      const output = buildMarkdownOutput({ documentTitle: '', blocks: sampleBlocks })

      expect(output).toContain('## Introduction')
    })

    it('formats list items as markdown lists', () => {
      const output = buildMarkdownOutput({ documentTitle: '', blocks: sampleBlocks })

      expect(output).toContain('- Item one')
    })

    it('formats captions as italic', () => {
      const output = buildMarkdownOutput({ documentTitle: '', blocks: sampleBlocks })

      expect(output).toContain('*Figure 1*')
    })

    it('inserts page separators with horizontal rule', () => {
      const output = buildMarkdownOutput({ documentTitle: '', blocks: sampleBlocks })

      expect(output).toContain('---')
      expect(output).toContain('### Page 2')
    })

    it('includes all translated text', () => {
      const output = buildMarkdownOutput({ documentTitle: '', blocks: sampleBlocks })

      expect(output).toContain('This is the first paragraph.')
      expect(output).toContain('Second page content.')
    })

    it('escapes markdown special characters', () => {
      const blocks = [
        { pageNumber: 1, role: 'paragraph', readingOrderIndex: 0, translatedText: 'Text with [brackets] and \\backslash' }
      ]
      const output = buildMarkdownOutput({ documentTitle: '', blocks })

      expect(output).toContain('\\[brackets\\]')
      expect(output).toContain('\\\\backslash')
    })

    it('handles empty blocks', () => {
      const output = buildMarkdownOutput({ documentTitle: '', blocks: [] })

      expect(output).toBe('')
    })
  })
})
