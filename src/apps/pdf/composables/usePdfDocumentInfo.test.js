import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { usePdfDocumentInfo } from './usePdfDocumentInfo.js'

describe('usePdfDocumentInfo', () => {
  it('builds rows from plain object input', () => {
    const { rows } = usePdfDocumentInfo({
      fileName: 'doc.pdf',
      pageCount: 42,
      fileSize: 657704,
      pdfFingerprint: 'abc123',
      documentMetadata: {
        title: 'My Doc',
        author: 'Author',
        subject: 'Subject',
        keywords: 'one, two',
        creator: 'Creator',
        producer: 'Producer',
        pdfVersion: '1.7',
      },
    })

    expect(rows.value.map(row => row.label)).toEqual([
      'File Name', 'File Size', 'Pages',
      'Title', 'Author', 'Subject', 'Keywords',
      'Creation Date', 'Modification Date',
      'Creator', 'Producer', 'PDF Version'
    ])
    expect(rows.value).toEqual(expect.arrayContaining([
      { label: 'File Size', value: `642.3 KB (${(657704).toLocaleString()} bytes)` },
      { label: 'Title', value: 'My Doc' },
      { label: 'Subject', value: 'Subject' },
      { label: 'Keywords', value: 'one, two' },
    ]))
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
    expect(rows.value).toHaveLength(12)

    fileName.value = 'new.pdf'
    pageCount.value = 20
    expect(rows.value.find(row => row.label === 'File Name')).toEqual({ label: 'File Name', value: 'new.pdf' })
    expect(rows.value.find(row => row.label === 'Pages')).toEqual({ label: 'Pages', value: '20' })
  })

  it('formats PDF date strings correctly', () => {
    const localeSpy = vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('January 15, 2024, 12:30:00 PM')
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
    expect(dateRow.value).toBe('January 15, 2024, 12:30:00 PM')
    expect(localeSpy).toHaveBeenCalledWith(undefined, expect.objectContaining({
      hour: 'numeric', minute: 'numeric', second: 'numeric'
    }))
    localeSpy.mockRestore()
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

  it('uses placeholders for missing metadata', () => {
    const { rows } = usePdfDocumentInfo({
      fileName: '',
      pageCount: 0,
      fileSize: 0,
      pdfFingerprint: '',
      documentMetadata: {},
    })

    expect(rows.value).toHaveLength(12)
    expect(rows.value.every(row => row.value === '—')).toBe(true)
  })

  it('uses placeholders for each missing metadata field independently', () => {
    const { rows } = usePdfDocumentInfo({
      fileName: 'doc.pdf',
      pageCount: 1,
      fileSize: 1024,
      documentMetadata: {
        title: '',
        author: '',
        subject: '',
        keywords: '',
        creator: 'Creator',
        producer: 'Producer',
        pdfVersion: '1.7'
      },
    })

    expect(rows.value.filter(row => ['Title', 'Author', 'Subject', 'Keywords'].includes(row.label)))
      .toEqual([
        { label: 'Title', value: '—' },
        { label: 'Author', value: '—' },
        { label: 'Subject', value: '—' },
        { label: 'Keywords', value: '—' }
      ])
    expect(rows.value.find(row => row.label === 'Creator').value).toBe('Creator')
  })

  it('formats file sizes correctly', () => {
    const { rows } = usePdfDocumentInfo({
      fileName: '',
      pageCount: 0,
      fileSize: 500,
      pdfFingerprint: '',
      documentMetadata: {},
    })

    expect(rows.value.find(row => row.label === 'File Size').value).toBe('500 B (500 bytes)')
  })

  it('shows MB for large files', () => {
    const { rows } = usePdfDocumentInfo({
      fileName: '',
      pageCount: 0,
      fileSize: 3 * 1024 * 1024,
      pdfFingerprint: '',
      documentMetadata: {},
    })

    expect(rows.value.find(row => row.label === 'File Size').value).toBe(`3.0 MB (${(3 * 1024 * 1024).toLocaleString()} bytes)`)
  })
})
