import { describe, expect, it } from 'vitest'
import { buildTxtOutput, buildMarkdownOutput, buildHtmlOutput } from './PdfExportFormatter.js'

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

  describe('buildHtmlOutput', () => {
    const samplePages = [
      {
        pageNumber: 1,
        width: 612,
        height: 792,
        displayWidth: 600,
        displayHeight: 774,
        scale: 1,
        canvasDataUrl: 'data:image/jpeg;base64,abc123',
        blocks: [
          { blockId: 'b1', role: 'paragraph', readingOrderIndex: 0, boundingBox: { x: 72, y: 100, width: 400, height: 20 }, fontSize: 12, fontFamily: null, translatedText: 'Hello World' },
          { blockId: 'b2', role: 'heading', readingOrderIndex: 1, boundingBox: { x: 72, y: 140, width: 300, height: 16 }, fontSize: 14, fontFamily: 'serif', translatedText: 'Section Title' }
        ]
      }
    ]

    it('returns empty string for empty pages', () => {
      expect(buildHtmlOutput({ documentTitle: '', pages: [] })).toBe('')
      expect(buildHtmlOutput({ documentTitle: '', pages: null })).toBe('')
    })

    it('includes document title', () => {
      const output = buildHtmlOutput({ documentTitle: 'My Doc', pages: samplePages })

      expect(output).toContain('<title>My Doc</title>')
      expect(output).toContain('My Doc</h1>')
    })

    it('includes page container with correct dimensions', () => {
      const output = buildHtmlOutput({ documentTitle: '', pages: samplePages })

      expect(output).toContain('width: 600px')
      expect(output).toContain('height: 774px')
    })

    it('includes background canvas image', () => {
      const output = buildHtmlOutput({ documentTitle: '', pages: samplePages })

      expect(output).toContain('data:image/jpeg;base64,abc123')
      expect(output).toContain('class="page-bg"')
    })

    it('positions translated blocks absolutely', () => {
      const output = buildHtmlOutput({ documentTitle: '', pages: samplePages })

      expect(output).toContain('position: absolute')
      expect(output).toContain('left: 72px')
      expect(output).toContain('top: 100px')
      expect(output).toContain('width: 400px')
    })

    it('includes translated text content', () => {
      const output = buildHtmlOutput({ documentTitle: '', pages: samplePages })

      expect(output).toContain('Hello World')
      expect(output).toContain('Section Title')
    })

    it('escapes HTML in translated text', () => {
      const pages = [{
        ...samplePages[0],
        blocks: [{ ...samplePages[0].blocks[0], translatedText: '<script>alert("xss")</script>' }]
      }]
      const output = buildHtmlOutput({ documentTitle: '', pages })

      expect(output).not.toContain('<script>')
      expect(output).toContain('&lt;script&gt;')
    })

    it('applies dir="rtl" for RTL text', () => {
      const pages = [{
        ...samplePages[0],
        blocks: [{ ...samplePages[0].blocks[0], translatedText: 'مرحبا بالعالم' }]
      }]
      const output = buildHtmlOutput({ documentTitle: '', pages })

      expect(output).toContain('dir="rtl"')
    })

    it('does not add dir="rtl" for LTR text', () => {
      const output = buildHtmlOutput({ documentTitle: '', pages: samplePages })

      const rtlCount = (output.match(/dir="rtl"/g) || []).length
      expect(rtlCount).toBe(0)
    })

    it('does not get dir="rtl" for mostly-English text with one Arabic word', () => {
      const pages = [{
        ...samplePages[0],
        blocks: [{ ...samplePages[0].blocks[0], translatedText: 'The report was published by ESMA in cooperation with مرحبا officials last quarter.' }]
      }]
      const output = buildHtmlOutput({ documentTitle: '', pages })

      expect(output).not.toContain('dir="rtl"')
    })

    it('gets dir="rtl" for mostly Arabic/Farsi text with a small English token', () => {
      const pages = [{
        ...samplePages[0],
        blocks: [{ ...samplePages[0].blocks[0], translatedText: 'شاخص‌های کلیدی عملکرد ESMA در سال ۲۰۲۵ منتشر شد.' }]
      }]
      const output = buildHtmlOutput({ documentTitle: '', pages })

      expect(output).toContain('dir="rtl"')
    })

    it('omits page background image when no canvasDataUrl', () => {
      const pages = [{
        ...samplePages[0],
        canvasDataUrl: null
      }]
      const output = buildHtmlOutput({ documentTitle: '', pages })

      expect(output).not.toContain('class="page-bg"')
    })

    it('includes deferred layout note', () => {
      const output = buildHtmlOutput({ documentTitle: '', pages: samplePages })

      expect(output).toContain('deferred')
    })

    it('skips blocks without boundingBox', () => {
      const pages = [{
        ...samplePages[0],
        blocks: [{ ...samplePages[0].blocks[0], boundingBox: null }]
      }]
      const output = buildHtmlOutput({ documentTitle: '', pages })

      expect(output).not.toContain('Hello World')
    })

    it('applies fontFamily from block metadata', () => {
      const output = buildHtmlOutput({ documentTitle: '', pages: samplePages })

      expect(output).toContain('font-family: serif')
    })
  })
})
