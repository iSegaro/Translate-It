import { describe, expect, it } from 'vitest'
import { sanitizeFilename, buildExportFilename } from './PdfFileDownloader.js'

describe('PdfFileDownloader', () => {
  describe('sanitizeFilename', () => {
    it('replaces invalid characters with underscores', () => {
      expect(sanitizeFilename('file:name')).toBe('file_name')
      expect(sanitizeFilename('file/name')).toBe('file_name')
      expect(sanitizeFilename('file\\name')).toBe('file_name')
      expect(sanitizeFilename('file?name')).toBe('file_name')
      expect(sanitizeFilename('file*name')).toBe('file_name')
    })

    it('collapses multiple underscores', () => {
      expect(sanitizeFilename('a___b')).toBe('a_b')
    })

    it('trims leading and trailing underscores', () => {
      expect(sanitizeFilename('_file_')).toBe('file')
    })

    it('replaces spaces with underscores', () => {
      expect(sanitizeFilename('my document')).toBe('my_document')
    })

    it('handles empty string', () => {
      expect(sanitizeFilename('')).toBe('')
    })
  })

  describe('buildExportFilename', () => {
    it('builds filename with sanitized title and extension', () => {
      expect(buildExportFilename('My Document', 'txt')).toBe('My_Document_translated.txt')
    })

    it('sanitizes special characters in title', () => {
      expect(buildExportFilename('Report: Q1/2024', 'md')).toBe('Report_Q1_2024_translated.md')
    })

    it('uses default title when empty', () => {
      expect(buildExportFilename('', 'txt')).toBe('document_translated.txt')
    })

    it('uses default title when undefined', () => {
      expect(buildExportFilename(undefined, 'txt')).toBe('document_translated.txt')
    })
  })
})
