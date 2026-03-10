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
   */
  static shouldTranslate(text) {
    if (!text) return false;
    const trimmed = text.trim();
    if (/^\d+$/.test(trimmed)) return false;
    if (/^(\d+:)+\d+$/.test(trimmed)) return false;
    if (trimmed.length < 2 && !/[\u0600-\u06FF]/.test(trimmed)) return false;
    if (/^\d+(\.\d+)?[kKM]$/.test(trimmed)) return false;
    return true;
  }

  /**
   * Deeply clean all translation-related markers from the DOM.
   * This is crucial for allowing re-translation and clean restoration.
   */
  static deepCleanDOM() {
    // 1. Remove our own markers and direction attributes from all elements
    const elementsWithDir = document.querySelectorAll('[data-page-translated], [data-translate-dir], [dir]');
    elementsWithDir.forEach(el => {
      el.removeAttribute('data-page-translated');
      el.removeAttribute('data-translate-dir');
      
      // Only remove 'dir' if we were the ones who set it
      if (el.hasAttribute('data-translate-dir')) {
        el.removeAttribute('dir');
      }
    });

    // 2. Specific reset for common containers
    const containers = ['html', 'body', 'main', 'article', 'section'];
    containers.forEach(tag => {
      const el = document.querySelector(tag);
      if (el) {
        el.removeAttribute('data-page-translated');
        el.removeAttribute('data-translate-dir');
      }
    });
    
    // 3. Reset any direction changes on the root elements
    document.documentElement.removeAttribute('dir');
    document.body.removeAttribute('dir');
  }

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
      if (rect.width === 0 || rect.height === 0) return false;

      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

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

  static isSuitableForTranslation(logger) {
    if (window === window.top) return true;
    try {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width < 50 || height < 50) return false;
      const style = window.getComputedStyle(document.documentElement);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return true;
    } catch (e) {
      return window.innerWidth > 150 && window.innerHeight > 150;
    }
  }
}
