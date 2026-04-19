/**
 * Complexity Analyzer - Utilities for calculating text and batch complexity
 * Used to adjust batch sizes and delays dynamically based on content density.
 */

export const ComplexityAnalyzer = {
  /**
   * Calculate complexity for a single text segment.
   * Higher complexity scores indicate content that might be harder for AI to process
   * or requires more network bandwidth (e.g., lots of special characters, URLs, code).
   * 
   * @param {string} text - The text to analyze
   * @returns {number} Complexity score (typically 0-100)
   */
  calculateTextComplexity(text) {
    if (!text || typeof text !== 'string') return 0;
    
    let complexity = 0;
    
    // Base complexity from character count
    complexity += Math.min(text.length / 20, 50);
    
    // Bonus for special characters
    const specialChars = (text.match(/[^\w\s\u0080-\uFFFF]/g) || []).length;
    complexity += specialChars;
    
    // Bonus for technical content patterns
    if (text.match(/https?:\/\/|www\./)) complexity += 15; // URLs
    if (text.match(/[{}[\]<>]/)) complexity += 8;         // Code blocks / HTML
    if (text.match(/\d+\.\d+|\w+\.\w+/)) complexity += 5;  // Numbers / Dot notation
    
    // Bonus for mixed scripts (e.g., Latin + Farsi)
    const hasLatin = /[a-zA-Z]/.test(text);
    const hasNonLatin = /[^\x20-\x7E]/.test(text); 
    if (hasLatin && hasNonLatin) complexity += 10;
    
    return Math.round(complexity);
  },

  /**
   * Get adjusted batch size based on average complexity of segments.
   * Complex segments require smaller batch sizes to prevent provider timeouts or token overflows.
   * 
   * @param {number} avgComplexity - Average complexity of segments in current processing window
   * @param {number} baseBatchSize - Default batch size
   * @returns {number} The optimized batch size
   */
  getAdjustedBatchSize(avgComplexity, baseBatchSize) {
    if (avgComplexity > 80) return Math.max(3, Math.floor(baseBatchSize * 0.3));
    if (avgComplexity > 50) return Math.max(5, Math.floor(baseBatchSize * 0.5));
    if (avgComplexity > 30) return Math.max(7, Math.floor(baseBatchSize * 0.7));
    return baseBatchSize;
  },

  /**
   * Calculate total batch complexity score based on its segments.
   * Used by translation handlers to determine adaptive delays.
   * 
   * @param {Array} batch - Array of segments (strings or objects)
   * @returns {number} Total batch complexity
   */
  calculateBatchComplexity(batch) {
    if (!Array.isArray(batch) || batch.length === 0) return 0;
    
    let totalComplexity = 0;
    for (const item of batch) {
      const text = typeof item === 'object' ? (item.t || item.text || '') : (item || '');
      let textComplexity = 0;
      
      // Weight character length
      textComplexity += Math.min((text?.length || 0) / 10, 30);
      
      // Weight special characters density
      const specialChars = (text?.match(/[^\w\s\u0080-\uFFFF]/g) || []).length;
      textComplexity += specialChars * 0.5;
      
      // Weight technical markers
      if (text?.match(/https?:\/\/|www\./)) textComplexity += 10;
      if (text?.match(/[{}[\]<>]/)) textComplexity += 5;
      if (text?.match(/\d+\.\d+|\w+\.\w+/)) textComplexity += 3;
      
      // Weight mixed scripts
      const hasLatin = /[a-zA-Z]/.test(text);
      const hasNonLatin = /[^\x20-\x7E]/.test(text); 
      if (hasLatin && hasNonLatin) textComplexity += 8;
      
      totalComplexity += textComplexity;
    }
    
    // Average complexity of the batch
    return Math.round(totalComplexity / batch.length);
  }
};
