import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { pageTranslationLookup } from './utils/PageTranslationLookup.js';
import { PAGE_TRANSLATION_ATTRIBUTES } from './PageTranslationConstants.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { PageTranslationEvents } from '@/core/PageEventBus.js';

/**
 * PageTranslationHoverManager - Lightweight tooltip to show original text on hover.
 * Refactored to use Shadow DOM (Vue UI Host) via PageEventBus.
 */
export class PageTranslationHoverManager extends ResourceTracker {
  constructor() {
    super('page-translation-hover-manager');
    this.logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'HoverManager');
    this.isActive = false;
    this.currentElement = null;
    
    // Bind handlers
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
  }

  initialize() {
    if (this.isActive) return;
    
    // Use ResourceTracker's addEventListener for automatic cleanup
    this.addEventListener(document, 'mouseover', this.handleMouseOver, { capture: true });
    this.addEventListener(document, 'mouseout', this.handleMouseOut, { capture: true });
    
    this.isActive = true;
    this.logger.init('Hover manager initialized (Shadow DOM Mode)');
  }

  destroy() {
    if (!this.isActive) return;
    
    // Standard ResourceTracker cleanup handles all event listeners
    this.cleanup();
    
    // Ensure tooltip is hidden on destroy
    PageTranslationEvents.hideTooltip();
    
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
      this.logger.debug('Hover detected, emitting showTooltip event');
      PageTranslationEvents.showTooltip({
        text: originalText,
        position: { x: event.clientX, y: event.clientY }
      });
      // Track mousemove only while hovering using ResourceTracker
      this.addEventListener(document, 'mousemove', this.handleMouseMove, true);
    }
  }

  handleMouseOut(event) {
    if (this.currentElement && !this.currentElement.contains(event.relatedTarget)) {
      this.logger.debug('Mouse out, emitting hideTooltip event');
      PageTranslationEvents.hideTooltip();
      this.removeEventListener(document, 'mousemove', this.handleMouseMove, true);
      this.currentElement = null;
    }
  }

  handleMouseMove(event) {
    PageTranslationEvents.updateTooltipPosition({
      x: event.clientX,
      y: event.clientY
    });
  }

  _getOriginalText(element) {
    const textParts = [];

    // 1. Gather text nodes and handle BR tags for line breaks
    // We use a custom filter to catch both Text nodes and BR elements.
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
          if (node.nodeName === 'BR') return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      },
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const original = pageTranslationLookup.get(node);
        // Use original text if translated, otherwise use current text to keep continuity
        const content = original !== undefined ? original : node.textContent;
        if (content) {
          // Normalize internal whitespace of each node to avoid HTML formatting noise
          textParts.push(content.replace(/\s+/g, ' '));
        }
      } else if (node.nodeName === 'BR') {
        // Explicitly handle line breaks from the original page
        textParts.push('\n');
      }
    }

    // 2. Join parts and perform final cleanup
    // Collapse multiple spaces but preserve the newlines we explicitly added for BRs
    const mainText = textParts.join('')
      .replace(/ +/g, ' ')
      .trim();
    
    const finalLines = [];
    if (mainText) {
      finalLines.push(mainText);
    }

    // 3. Check attributes (e.g., title, alt) - these should remain on separate lines
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        const original = pageTranslationLookup.get(attr);
        if (original) {
          finalLines.push(`[${attr.name}]: ${original}`);
        }
      }
    }

    return finalLines.join('\n');
  }
}

export const pageTranslationHoverManager = new PageTranslationHoverManager();
