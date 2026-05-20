/**
 * Subtitle Context Builder - Provides neighboring cue context for AI translation.
 * Helps AI understand the flow of dialogue for better gender and tone consistency.
 */
export class SubtitleContextBuilder {
  /**
   * Builds context for a specific cue within its parent list.
   * @param {number} cueIndex - Index of the current cue
   * @param {Array} allCues - The full list of cues
   * @param {Object} options - { windowSize: number }
   * @returns {Object} { previous: Array, next: Array }
   */
  static buildContext(cueIndex, allCues, options = { windowSize: 2 }) {
    const { windowSize } = options;
    
    const start = Math.max(0, cueIndex - windowSize);
    const end = Math.min(allCues.length, cueIndex + windowSize + 1);
    
    const previous = allCues.slice(start, cueIndex).map(c => c.text);
    const next = allCues.slice(cueIndex + 1, end).map(c => c.text);
    
    return { previous, next };
  }

  /**
   * Builds a compact string representation of the context for prompt injection.
   */
  static formatContextString(context) {
    let contextStr = '';
    if (context.previous.length > 0) {
      contextStr += `Previous cues: ${context.previous.join(' | ')}\n`;
    }
    if (context.next.length > 0) {
      contextStr += `Next cues: ${context.next.join(' | ')}\n`;
    }
    return contextStr.trim();
  }
}
