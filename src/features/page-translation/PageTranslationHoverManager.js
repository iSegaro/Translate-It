import { pageTranslationLookup } from './utils/PageTranslationLookup.js';
import { PAGE_TRANSLATION_ATTRIBUTES, PAGE_TRANSLATION_SELECTORS } from './PageTranslationConstants.js';

/**
 * PageTranslationHoverManager - Lightweight tooltip to show original text on hover.
 */
export class PageTranslationHoverManager {
  constructor() {
    this.tooltip = null;
    this.isActive = false;
    this.currentElement = null;
    
    // Bind handlers
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
  }

  initialize() {
    if (this.isActive) return;
    
    this._createTooltip();
    document.addEventListener('mouseover', this.handleMouseOver, true);
    document.addEventListener('mouseout', this.handleMouseOut, true);
    
    this.isActive = true;
  }

  destroy() {
    if (!this.isActive) return;
    
    document.removeEventListener('mouseover', this.handleMouseOver, true);
    document.removeEventListener('mouseout', this.handleMouseOut, true);
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
    
    this.tooltip = null;
    this.isActive = false;
    this.currentElement = null;
  }

  handleMouseOver(event) {
    const target = event.target;
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return;

    // Find the closest element that was marked as having original text
    const { HAS_ORIGINAL } = PAGE_TRANSLATION_ATTRIBUTES;
    const element = target.closest(`[${HAS_ORIGINAL}="true"]`);
    if (!element) return;

    if (this.currentElement === element) return;
    this.currentElement = element;

    const originalText = this._getOriginalText(element);
    if (originalText) {
      this._showTooltip(originalText, event);
      document.addEventListener('mousemove', this.handleMouseMove, true);
    }
  }

  handleMouseOut(event) {
    if (this.currentElement && !this.currentElement.contains(event.relatedTarget)) {
      this._hideTooltip();
      document.removeEventListener('mousemove', this.handleMouseMove, true);
      this.currentElement = null;
    }
  }

  handleMouseMove(event) {
    if (this.tooltip && this.tooltip.style.display !== 'none') {
      this._positionTooltip(event);
    }
  }

  _getOriginalText(element) {
    let texts = [];

    // 1. Check child text nodes
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      const original = pageTranslationLookup.get(node);
      if (original) {
        texts.push(original);
      }
    }

    // 2. Check attributes
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        const original = pageTranslationLookup.get(attr);
        if (original) {
          texts.push(`[${attr.name}]: ${original}`);
        }
      }
    }

    // Join with line breaks, limit length if needed
    return texts.filter(t => t.trim()).join('\n');
  }

  _createTooltip() {
    if (this.tooltip) return;

    const { TOOLTIP_ID, INTERNAL_IGNORE_CLASS, STANDARD_NO_TRANSLATE_CLASS, TRANSLATE_NO_VALUE } = PAGE_TRANSLATION_SELECTORS;
    const { TRANSLATE_IGNORE, TRANSLATE_NO_ATTR } = PAGE_TRANSLATION_ATTRIBUTES;

    this.tooltip = document.createElement('div');
    this.tooltip.id = TOOLTIP_ID;
    
    // EXCLUSION: Prevent translation engine from touching this tooltip
    // We use attributes + a dedicated internal class that is hardcoded in the bridge
    this.tooltip.setAttribute(TRANSLATE_IGNORE, 'true');
    this.tooltip.setAttribute(TRANSLATE_NO_ATTR, TRANSLATE_NO_VALUE);
    this.tooltip.classList.add(STANDARD_NO_TRANSLATE_CLASS, INTERNAL_IGNORE_CLASS);
    
    // Style it to be extremely lightweight and out of the way
    Object.assign(this.tooltip.style, {
      position: 'fixed',
      zIndex: '2147483647', // Max z-index
      padding: '8px 12px',
      background: '#333',
      color: '#fff',
      borderRadius: '4px',
      fontSize: '13px',
      lineHeight: '1.4',
      maxWidth: '350px',
      wordWrap: 'break-word',
      whiteSpace: 'pre-wrap',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      pointerEvents: 'none', // Critical: mouse events pass through
      display: 'none',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      border: '1px solid rgba(255,255,255,0.1)'
    });

    document.body.appendChild(this.tooltip);
  }

  _showTooltip(text, event) {
    if (!this.tooltip) return;
    
    this.tooltip.textContent = text;
    
    // Set direction based on content
    const isRtl = /[\u0591-\u07FF\u0600-\u06FF]/.test(text);
    this.tooltip.style.direction = isRtl ? 'rtl' : 'ltr';
    this.tooltip.style.textAlign = isRtl ? 'right' : 'left';

    this.tooltip.style.display = 'block';
    this._positionTooltip(event);
  }

  _hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }

  _positionTooltip(event) {
    if (!this.tooltip) return;

    const offset = 15;
    let x = event.clientX + offset;
    let y = event.clientY + offset;

    // Boundary check (keep tooltip inside viewport)
    const rect = this.tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (x + rect.width > viewportWidth) {
      x = event.clientX - rect.width - offset;
    }

    if (y + rect.height > viewportHeight) {
      y = event.clientY - rect.height - offset;
    }

    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }
}

export const pageTranslationHoverManager = new PageTranslationHoverManager();
