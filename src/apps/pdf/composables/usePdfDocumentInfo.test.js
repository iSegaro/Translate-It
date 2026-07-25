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
      'File Name', 'File Size', 'Pages', 'Page Size',
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
    expect(rows.value).toHaveLength(13)

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

    expect(rows.value).toHaveLength(13)
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

  it.each([
    ['A4 Portrait — 210 × 297 mm (8.27 × 11.69 in)', 595.28, 841.89],
    ['A4 Landscape — 297 × 210 mm (11.69 × 8.27 in)', 841.89, 595.28],
    ['Letter Portrait — 215.9 × 279.4 mm (8.5 × 11 in)', 612, 792],
    ['Legal Portrait — 215.9 × 355.6 mm (8.5 × 14 in)', 612, 1008],
    ['Tabloid Portrait — 279.4 × 431.8 mm (11 × 17 in)', 792, 1224]
  ])('formats standard page size %s', (expected, naturalWidth, naturalHeight) => {
    const { rows } = usePdfDocumentInfo({
      pageMetrics: [{ naturalWidth, naturalHeight }]
    })

    expect(rows.value.find(row => row.label === 'Page Size').value).toBe(expected)
  })

  it('formats custom page sizes with raw dimensions', () => {
    const { rows } = usePdfDocumentInfo({
      pageMetrics: [{ naturalWidth: 500, naturalHeight: 700 }]
    })

    expect(rows.value.find(row => row.label === 'Page Size').value)
      .toBe('176.4 × 246.9 mm (6.94 × 9.72 in)')
  })

  it('labels square custom page sizes', () => {
    const { rows } = usePdfDocumentInfo({
      pageMetrics: [{ naturalWidth: 500, naturalHeight: 500 }]
    })

    expect(rows.value.find(row => row.label === 'Page Size').value)
      .toBe('Square — 176.4 × 176.4 mm (6.94 × 6.94 in)')
  })

  it('shows Varies for different page dimensions', () => {
    const { rows } = usePdfDocumentInfo({
      pageMetrics: [
        { naturalWidth: 595.28, naturalHeight: 841.89 },
        { naturalWidth: 612, naturalHeight: 792 }
      ]
    })

    expect(rows.value.find(row => row.label === 'Page Size').value).toBe('Varies')
  })

  it('recognizes whole-point A4 dimensions', () => {
    const { rows } = usePdfDocumentInfo({
      pageMetrics: [{ naturalWidth: 595, naturalHeight: 842 }]
    })

    expect(rows.value.find(row => row.label === 'Page Size').value)
      .toBe('A4 Portrait — 210 × 297 mm (8.27 × 11.69 in)')
  })

  it('recognizes dimensions at the one-point tolerance boundary', () => {
    const { rows } = usePdfDocumentInfo({
      pageMetrics: [{ naturalWidth: 596.28, naturalHeight: 840.89 }]
    })

    expect(rows.value.find(row => row.label === 'Page Size').value)
      .toBe('A4 Portrait — 210 × 297 mm (8.27 × 11.69 in)')
  })

  it('uses the metadata placeholder when page dimensions are invalid or unavailable', () => {
    const { rows } = usePdfDocumentInfo({
      pageMetrics: [{ naturalWidth: 0, naturalHeight: Number.NaN }]
    })

    expect(rows.value.find(row => row.label === 'Page Size').value).toBe('—')
  })
})
