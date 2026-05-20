/**
 * SrtAdapter - Handles parsing and serialization of SubRip (.srt) files.
 */

export class SrtAdapter {
  /**
   * Parses SRT file content into a normalized cue model.
   * @param {string} content - Raw SRT text
   * @returns {Object} { cues, metadata, warnings }
   */
  parse(content) {
    if (!content) return { cues: [], metadata: {}, warnings: [] };

    const cues = [];
    const warnings = [];
    
    // Normalize line endings and split by potential empty lines (resilient to 1 or more newlines)
    const rawBlocks = content.split(/\r?\n\r?\n/);
    
    let cueIndex = 1;
    for (const block of rawBlocks) {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) continue;

      const lines = trimmedBlock.split(/\r?\n/);
      if (lines.length < 2) {
        warnings.push(`Malformed block at index ${cueIndex}: insufficient lines.`);
        continue;
      }

      // Line 1: Index (optional but standard)
      // Line 2: Timestamp (00:00:01,000 --> 00:00:04,000)
      // Line 3+: Text
      
      let timestampLineIndex = -1;
      for (let i = 0; i < Math.min(lines.length, 3); i++) {
        if (lines[i].includes('-->')) {
          timestampLineIndex = i;
          break;
        }
      }

      if (timestampLineIndex === -1) {
        warnings.push(`Could not find timestamp in block starting with: "${lines[0].substring(0, 20)}..."`);
        continue;
      }

      const timestampLine = lines[timestampLineIndex];
      const textLines = lines.slice(timestampLineIndex + 1);
      const text = textLines.join('\n').trim();

      const [startStr, endStr] = timestampLine.split('-->').map(s => s.trim());
      
      if (!startStr || !endStr) {
        warnings.push(`Invalid timestamp format: ${timestampLine}`);
        continue;
      }

      cues.push({
        id: `cue-${cueIndex}`,
        index: cueIndex,
        startTime: startStr,
        endTime: endStr,
        text: text,
        rawText: text,
        translatedText: '',
        status: 'pending',
        warnings: []
      });

      cueIndex++;
    }

    return {
      cues,
      metadata: { format: 'srt', totalCues: cues.length },
      warnings
    };
  }

  /**
   * Serializes normalized cues back into SRT format.
   * @param {Array} cues - Array of cue objects
   * @param {Object} options - { useTranslation: boolean }
   * @returns {string} SRT content
   */
  serialize(cues, options = { useTranslation: true }) {
    if (!cues || !Array.isArray(cues)) return '';

    return cues.map((cue, idx) => {
      const text = options.useTranslation && cue.translatedText ? cue.translatedText : cue.text;
      const index = cue.index || (idx + 1);
      
      return `${index}\n${cue.startTime} --> ${cue.endTime}\n${text}\n`;
    }).join('\n');
  }

  /**
   * Helper to convert SRT timestamp to milliseconds (useful for future features like sync)
   */
  timestampToMs(timestamp) {
    const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (!match) return 0;
    const [, h, m, s, ms] = match;
    return (parseInt(h) * 3600000) + (parseInt(m) * 60000) + (parseInt(s) * 1000) + parseInt(ms);
  }
}
