import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { pageTranslationLookup } from './utils/PageTranslationLookup.js';
import { PAGE_TRANSLATION_ATTRIBUTES, PAGE_TRANSLATION_SELECTORS } from './PageTranslationConstants.js';
import { detectDirectionFromContent } from '@/utils/dom/DomDirectionManager.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * PageTranslationHoverManager - Lightweight tooltip to show original text on hover.
 * Uses ResourceTracker for standard memory management.
 */
export class PageTranslationHoverManager extends ResourceTracker {
  constructor() {
    super('page-translation-hover-manager');
    this.logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'HoverManager');
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
    
    // Use ResourceTracker's addEventListener for automatic cleanup
    this.addEventListener(document, 'mouseover', this.handleMouseOver, { capture: true });
    this.addEventListener(document, 'mouseout', this.handleMouseOut, { capture: true });
    
    this.isActive = true;
    this.logger.init('Hover manager initialized');
  }

  destroy() {
    if (!this.isActive) return;
    
    // Standard ResourceTracker cleanup handles all event listeners
    this.cleanup();
    
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
    
    this.tooltip = null;
    this.isActive = false;
    this.currentElement = null;
    this.logger.debug('Hover manager destroyed');
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
      this.logger.debug('Hover detected, showing original text');
      this._showTooltip(originalText, event);
      // Track mousemove only while hovering using ResourceTracker
      this.addEventListener(document, 'mousemove', this.handleMouseMove, true);
    }
  }

  handleMouseOut(event) {
    if (this.currentElement && !this.currentElement.contains(event.relatedTarget)) {
      this._hideTooltip();
      this.removeEventListener(document, 'mousemove', this.handleMouseMove, true);
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

    return texts.filter(t => t.trim()).join('\n');
  }

  _createTooltip() {
    if (this.tooltip) return;

    const { TOOLTIP_ID, INTERNAL_IGNORE_CLASS, STANDARD_NO_TRANSLATE_CLASS, TRANSLATE_NO_VALUE } = PAGE_TRANSLATION_SELECTORS;
    const { TRANSLATE_IGNORE, TRANSLATE_NO_ATTR } = PAGE_TRANSLATION_ATTRIBUTES;

    this.tooltip = document.createElement('div');
    this.tooltip.id = TOOLTIP_ID;
    
    this.tooltip.setAttribute(TRANSLATE_IGNORE, 'true');
    this.tooltip.setAttribute(TRANSLATE_NO_ATTR, TRANSLATE_NO_VALUE);
    this.tooltip.classList.add(STANDARD_NO_TRANSLATE_CLASS, INTERNAL_IGNORE_CLASS);
    
    Object.assign(this.tooltip.style, {
      position: 'fixed',
      zIndex: '2147483647',
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
      pointerEvents: 'none',
      display: 'none',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      border: '1px solid rgba(255,255,255,0.1)',
      visibility: 'visible',
      opacity: '1'
    });

    // Ensure style priority
    this.tooltip.style.setProperty('z-index', '2147483647', 'important');
    this.tooltip.style.setProperty('position', 'fixed', 'important');
    this.tooltip.style.setProperty('display', 'none', 'important');

    document.body.appendChild(this.tooltip);
  }

  _showTooltip(text, event) {
    if (!this.tooltip) return;
    
    this.tooltip.textContent = text;
    
    // Set direction based on content analysis using shared utility
    const direction = detectDirectionFromContent(text);
    const isRtl = direction === 'rtl';
    
    this.tooltip.style.direction = direction;
    this.tooltip.style.textAlign = isRtl ? 'right' : 'left';

    this.tooltip.style.setProperty('display', 'block', 'important');
    this._positionTooltip(event);
  }

  _hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.setProperty('display', 'none', 'important');
    }
  }

  _positionTooltip(event) {
    if (!this.tooltip) return;

    const offset = 15;
    const rect = this.tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    let x = event.clientX + offset;
    // Show ABOVE the cursor to avoid native tooltips (which usually show below)
    let y = event.clientY - rect.height - offset;

    // Flip to below if there's no space above
    if (y < 0) {
      y = event.clientY + offset + 20; // Extra offset to clear the cursor
    }

    // Boundary check for X
    if (x + rect.width > viewportWidth) {
      x = event.clientX - rect.width - offset;
    }

    this.tooltip.style.setProperty('left', `${x}px`, 'important');
    this.tooltip.style.setProperty('top', `${y}px`, 'important');
  }
}

export const pageTranslationHoverManager = new PageTranslationHoverManager();
