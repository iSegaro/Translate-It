/**
 * PageTranslationHelper - Utility methods for whole page translation
 */
export class PageTranslationHelper {
  /**
   * Normalize text for consistent tracking and comparison
   */
  static normalizeText(text) {
    if (!text) return '';
    return text.trim().replace(/\s+/g, ' ');
  }

  /**
   * Determine if a text should be translated.
   * Filters out numbers, timers, and very short noisy strings.
   */
  static shouldTranslate(text) {
    if (!text) return false;
    const trimmed = text.trim();
    
    // Ignore purely numeric strings
    if (/^\d+$/.test(trimmed)) return false;
    
    // Ignore timers (e.g., 0:11, 1:20:05)
    if (/^(\d+:)+\d+$/.test(trimmed)) return false;
    
    // Ignore very short strings that are likely just icons or punctuation
    if (trimmed.length < 2 && !/[\u0600-\u06FF]/.test(trimmed)) return false;

    // Ignore strings that are just units or stats (e.g., "10k", "5.2M")
    if (/^\d+(\.\d+)?[kKM]$/.test(trimmed)) return false;

    return true;
  }

  /**
   * Check if a node is within the current viewport with custom margin
   * @param {Node} node - The node to check
   * @param {number} margin - Margin in pixels
   * @returns {boolean} True if node is in viewport with margin
   */
  static isInViewportWithMargin(node, margin) {
    if (!node) return false;

    try {
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement :
                     (node.nodeType === Node.ATTRIBUTE_NODE ? node.ownerElement : node);

      if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

      if (element.offsetParent === null && element.tagName !== 'BODY' && !(element instanceof SVGElement)) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      
      // Basic visibility check: must have some size
      if (rect.width === 0 || rect.height === 0) return false;

      // Check if element is hidden by CSS
      try {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
      } catch { 
        /* ignore */
      }

      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

      // Check both vertical and horizontal axes with margin
      return (
        rect.bottom >= -margin &&
        rect.top <= viewportHeight + margin &&
        rect.right >= -margin &&
        rect.left <= viewportWidth + margin
      );
    } catch (_) {
      return false;
    }
  }

  /**
   * Check if the current frame/document is suitable for translation
   * Used to avoid translating small iframes, ads, or empty pages
   * @returns {boolean} True if suitable
   */
  static isSuitableForTranslation(logger) {
    // Main frame is always suitable
    if (window === window.top) return true;

    try {
      // Heuristics for iframes:
      
      // 1. Size check: Tiny iframes are almost certainly ads or tracking pixels
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      if (width < 50 || height < 50) {
        if (logger) logger.debug(`Skipping tiny iframe: ${width}x${height}`);
        return false;
      }
      
      if (width < 120 && height < 120) {
        if (logger) logger.debug(`Skipping small square-ish iframe: ${width}x${height}`);
        return false;
      }

      // 2. Visibility check: Skip hidden iframes
      const style = window.getComputedStyle(document.documentElement);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      // 3. Content density check: Skip iframes with very little text
      const text = document.body ? document.body.innerText.trim() : '';
      if (text.length < 20) {
        // Double check if there are any translatable attributes if text is short
        const hasTranslatableAttributes = !!document.querySelector('[title], [alt], [placeholder], [aria-label]');
        if (!hasTranslatableAttributes) {
          if (logger) logger.debug(`Skipping iframe with low text density (${text.length} chars) and no translatable attributes`);
          return false;
        }
      }

      return true;
    } catch (e) {
      // In case of any error (security or DOM), fallback to size-based check
      return window.innerWidth > 150 && window.innerHeight > 150;
    }
  }
}
