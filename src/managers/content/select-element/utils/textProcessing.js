// Text Processing Utilities - Reusable text processing helpers

/**
 * Clean and normalize text for translation
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
export function cleanText(text) {
  if (!text) return '';

  return text
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .replace(/\t+/g, ' ') // Replace tabs with spaces
    .normalize('NFC'); // Normalize Unicode
}

/**
 * Extract text content from HTML string
 * @param {string} html - HTML string to extract text from
 * @returns {string} Extracted text
 */
export function extractTextFromHTML(html) {
  if (!html) return '';

  // Create a temporary element to parse HTML
  const tempElement = document.createElement('div');
  tempElement.innerHTML = html;
  
  // Get text content and clean it
  return cleanText(tempElement.textContent || '');
}

/**
 * Truncate text to a specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  
  return text.substring(0, maxLength) + '...';
}

/**
 * Count words in text
 * @param {string} text - Text to count words in
 * @returns {number} Word count
 */
export function countWords(text) {
  if (!text) return 0;
  
  return text.trim().split(/\s+/).length;
}

/**
 * Check if text contains mostly non-Latin characters
 * @param {string} text - Text to check
 * @returns {boolean} Whether text is mostly non-Latin
 */
export function isMostlyNonLatin(text) {
  if (!text) return false;
  
  const latinPattern = /[a-zA-Z]/g;
  const nonLatinPattern = /[^\x00-\x7F]/g;
  
  const latinCount = (text.match(latinPattern) || []).length;
  const nonLatinCount = (text.match(nonLatinPattern) || []).length;
  
  return nonLatinCount > latinCount;
}

/**
 * Detect language of text based on character patterns
 * @param {string} text - Text to analyze
 * @returns {string} Detected language code ('en', 'fa', etc.) or 'unknown'
 */
export function detectLanguage(text) {
  if (!text) return 'unknown';
  
  // Simple language detection based on character ranges
  const patterns = {
    fa: /[\u0600-\u06FF\uFB8A\u067E\u0686\u06AF]/g, // Persian/Arabic
    en: /[a-zA-Z]/g, // English
    ru: /[\u0400-\u04FF]/g, // Russian
    zh: /[\u4E00-\u9FFF]/g, // Chinese
    ja: /[\u3040-\u30FF\u31F0-\u31FF]/g, // Japanese
    ko: /[\uAC00-\uD7AF\u1100-\u11FF]/g // Korean
  };
  
  let maxCount = 0;
  let detectedLang = 'unknown';
  
  for (const [lang, pattern] of Object.entries(patterns)) {
    const count = (text.match(pattern) || []).length;
    if (count > maxCount) {
      maxCount = count;
      detectedLang = lang;
    }
  }
  
  return detectedLang;
}

/**
 * Remove duplicate lines from text
 * @param {string} text - Text with possible duplicate lines
 * @returns {string} Text with duplicates removed
 */
export function removeDuplicateLines(text) {
  if (!text) return '';
  
  const lines = text.split('\n');
  const uniqueLines = [...new Set(lines)];
  return uniqueLines.join('\n');
}

/**
 * Capitalize first letter of each sentence
 * @param {string} text - Text to capitalize
 * @returns {string} Capitalized text
 */
export function capitalizeSentences(text) {
  if (!text) return '';
  
  return text.replace(/(^|\.\s+)([a-z])/g, (match, p1, p2) => 
    p1 + p2.toUpperCase()
  );
}

/**
 * Normalize whitespace in text
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeWhitespace(text) {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHTML(text) {
  if (!text) return '';
  
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}

/**
 * Unescape HTML special characters
 * @param {string} text - Text to unescape
 * @returns {string} Unescaped text
 */
export function unescapeHTML(text) {
  if (!text) return '';
  
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Generate a preview of text for logging
 * @param {string} text - Text to preview
 * @param {number} maxLength - Maximum preview length
 * @returns {string} Text preview
 */
export function generateTextPreview(text, maxLength = 50) {
  if (!text) return '';
  
  const cleaned = cleanText(text);
  return truncateText(cleaned, maxLength);
}

/**
 * Check if text is likely to be a URL
 * @param {string} text - Text to check
 * @returns {boolean} Whether text is a URL
 */
export function isLikelyURL(text) {
  if (!text) return false;
  
  const urlPatterns = [
    /^https?:\/\//,
    /^www\./,
    /\.(com|org|net|edu|gov|io|ai|dev)$/i
  ];
  
  return urlPatterns.some(pattern => pattern.test(text));
}

/**
 * Check if text is likely to be an email address
 * @param {string} text - Text to check
 * @returns {boolean} Whether text is an email
 */
export function isLikelyEmail(text) {
  if (!text) return false;
  
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(text);
}

/**
 * Extract all URLs from text
 * @param {string} text - Text to extract URLs from
 * @returns {string[]} Array of URLs
 */
export function extractURLs(text) {
  if (!text) return [];
  
  const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/g;
  return text.match(urlPattern) || [];
}

/**
 * Remove URLs from text
 * @param {string} text - Text to remove URLs from
 * @returns {string} Text without URLs
 */
export function removeURLs(text) {
  if (!text) return '';
  
  const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/g;
  return text.replace(urlPattern, '').trim();
}

/**
 * Generate a hash for text content (simple implementation)
 * @param {string} text - Text to hash
 * @returns {string} Hash string
 */
export function hashText(text) {
  if (!text) return '';
  
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}
