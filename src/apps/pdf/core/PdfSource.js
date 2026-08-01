/**
 * PdfSource — discriminated union describing how a PDF is obtained.
 * ADR-015: Remote PDF Source Support.
 */
export function pdfSourceFromFile(file) {
  return { type: 'file', file };
}

export function pdfSourceFromUrl(url) {
  return { type: 'url', url };
}
