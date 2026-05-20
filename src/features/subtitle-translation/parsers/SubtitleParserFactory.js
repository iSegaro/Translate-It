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
      case 'vtt':
        // WebVTT is similar to SRT, could use a VttAdapter later
        // For MVP, if user forces SRT on VTT it might partially work, but better to be explicit.
        throw new Error('WebVTT (.vtt) support is coming soon.');
      case 'ass':
      case 'ssa':
        throw new Error('Advanced Substation Alpha (.ass) support is coming soon.');
      default:
        throw new Error(`Unsupported subtitle format: ${normalizedFormat}`);
    }
  }
}
