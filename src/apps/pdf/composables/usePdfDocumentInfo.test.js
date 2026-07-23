import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import { usePdfDocumentInfo } from './usePdfDocumentInfo.js'

describe('usePdfDocumentInfo', () => {
  it('builds rows from plain object input', () => {
    const { rows } = usePdfDocumentInfo({
      fileName: 'doc.pdf',
      pageCount: 42,
      fileSize: 2048,
      pdfFingerprint: 'abc123',
      documentMetadata: {
        title: 'My Doc',
        author: '',
      },
    })

    expect(rows.value).toEqual([
      { label: 'File Name', value: 'doc.pdf' },
      { label: 'Pages', value: '42' },
      { label: 'File Size', value: '2.0 KB' },
      { label: 'Fingerprint', value: 'abc123' },
      { label: 'Title', value: 'My Doc' },
    ])
  })

  it('reacts to computed input changes', () => {
    const fileName = ref('old.pdf')
    const pageCount = ref(10)
    const source = computed(() => ({
      fileName: fileName.value,
      pageCount: pageCount.value,
      fileSize: 0,
      pdfFingerprint: '',
      documentMetadata: {},
    }))

    const { rows } = usePdfDocumentInfo(source)
    expect(rows.value).toHaveLength(2)

    fileName.value = 'new.pdf'
    pageCount.value = 20
    expect(rows.value).toEqual([
      { label: 'File Name', value: 'new.pdf' },
      { label: 'Pages', value: '20' },
    ])
  })

  it('formats PDF date strings correctly', () => {
    const { rows } = usePdfDocumentInfo({
      fileName: '',
      pageCount: 0,
      fileSize: 0,
      pdfFingerprint: '',
      documentMetadata: {
        creationDate: 'D:20240115123000Z',
      },
    })

    const dateRow = rows.value.find(r => r.label === 'Creation Date')
    expect(dateRow).toBeTruthy()
    // "January 15, 2024" in any locale
    expect(dateRow.value).toMatch(/2024/)
  })

  it('falls back to raw value for unparseable dates', () => {
    const { rows } = usePdfDocumentInfo({
      fileName: '',
      pageCount: 0,
      fileSize: 0,
      pdfFingerprint: '',
      documentMetadata: {
        creationDate: 'garbage',
      },
    })

    const dateRow = rows.value.find(r => r.label === 'Creation Date')
    expect(dateRow.value).toBe('garbage')
  })

  it('filters empty fields', () => {
    const { rows } = usePdfDocumentInfo({
      fileName: '',
      pageCount: 0,
      fileSize: 0,
      pdfFingerprint: '',
      documentMetadata: {},
    })

    expect(rows.value).toHaveLength(0)
  })

  it('formats file sizes correctly', () => {
    const { rows } = usePdfDocumentInfo({
      fileName: '',
      pageCount: 0,
      fileSize: 500,
      pdfFingerprint: '',
      documentMetadata: {},
    })

    expect(rows.value[0].value).toBe('500 B')
  })

  it('shows MB for large files', () => {
    const { rows } = usePdfDocumentInfo({
      fileName: '',
      pageCount: 0,
      fileSize: 3 * 1024 * 1024,
      pdfFingerprint: '',
      documentMetadata: {},
    })

    expect(rows.value[0].value).toBe('3.0 MB')
  })
})
