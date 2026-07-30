/**
 * PdfLoader — converts a PdfSource into a named buffer.
 * ADR-015: Single owner for PDF loading.
 */
export const PdfLoader = {
  /**
   * @param {{ type: string, file?: File }} source
   * @returns {Promise<{ name: string, buffer: ArrayBuffer }>}
   */
  async load(source) {
    if (source.type === 'file') {
      const buffer = await source.file.arrayBuffer();
      return { name: source.file.name || 'document.pdf', buffer };
    }
    throw new Error(`Unsupported PdfSource type: ${source.type}`);
  },
};
