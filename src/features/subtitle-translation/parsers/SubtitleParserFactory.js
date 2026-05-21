import { SrtAdapter } from './SrtAdapter.js';

/**
 * Factory for creating the appropriate subtitle adapter based on file type.
 */
export class SubtitleParserFactory {
  /**
   * Get adapter for a specific file extension or format name.
   * @param {string} format - 'srt', 'vtt', 'ass' or filename
   */
  static getAdapter(format) {
    const normalizedFormat = format.toLowerCase().includes('.') 
      ? format.split('.').pop().toLowerCase() 
      : format.toLowerCase();

    switch (normalizedFormat) {
      case 'srt':
        return new SrtAdapter();
      default:
        throw new Error(`Unsupported subtitle format: ${normalizedFormat}. Only .srt files are supported.`);
    }
  }
}
