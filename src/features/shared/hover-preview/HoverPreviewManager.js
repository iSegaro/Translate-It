import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { hoverPreviewLookup } from './HoverPreviewLookup.js';
import { PAGE_TRANSLATION_ATTRIBUTES } from '@/features/page-translation/PageTranslationConstants.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { PageTranslationEvents } from '@/core/PageEventBus.js';
import { stripBiDiMarks } from '@/utils/dom/DomDirectionManager.js';

/**
 * HoverPreviewManager - Lightweight tooltip to show original text on hover.
 * Refactored to use Shadow DOM (Vue UI Host) via PageEventBus.
 * Shared between Whole Page Translation and Select Element modes.
 */
export class HoverPreviewManager extends ResourceTracker {
  constructor() {
    super('hover-preview-manager');
    this.logger = getScopedLogger(LOG_COMPONENTS.UI, 'HoverPreviewManager');
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
    this.logger.init('Hover preview manager initialized (Shadow DOM Mode)');
  }

  destroy() {
    if (!this.isActive) return;
    
    // Standard ResourceTracker cleanup handles all event listeners
    this.cleanup();
    
    // Ensure tooltip is hidden on destroy
    PageTranslationEvents.hideTooltip();
    
    this.isActive = false;
    this.currentElement = null;
    this.logger.debug('Hover preview manager destroyed');
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
    // Standard block-level elements that should trigger a line break in the tooltip
    const BLOCK_TAGS = new Set([
      'P', 'DIV', 'LI', 'TR', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 
      'HEADER', 'FOOTER', 'DT', 'DD', 'BLOCKQUOTE', 'FIGURE', 'TABLE', 'MAIN'
    ]);

    // 1. Gather text nodes and handle BR tags for line breaks
    // We use a custom filter to catch both Text nodes and BR elements.
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
          // Accept BR and all block-level tags to handle layout breaks
          if (node.nodeName === 'BR' || BLOCK_TAGS.has(node.nodeName)) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      },
      false
    );

    let node;
    let hasText = false;

    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const original = hoverPreviewLookup.get(node);
        // Use original text if translated, otherwise use current text to keep continuity
        const content = original !== undefined ? original : node.textContent;
        if (content) {
          // Normalize internal whitespace to avoid HTML formatting noise
          const normalized = content.replace(/\s+/g, ' ');
          if (normalized.trim() || normalized === ' ') {
            textParts.push(normalized);
            hasText = true;
          }
        }
      } else {
        // It's a BR or a BLOCK_TAG. Add a newline if we already have content to separate.
        if (hasText && textParts[textParts.length - 1] !== '\n') {
          textParts.push('\n');
        }
      }
    }

    // Join and perform final cleanup: trim lines and remove redundant empty lines
    const mainText = textParts.join('')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
    
    const finalLines = [];
    if (mainText) {
      finalLines.push(mainText);
    }

    // 2. Check attributes (e.g., title, alt) - these always remain on separate lines
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        const original = hoverPreviewLookup.get(attr);
        
        // FIX: Only show original text for attributes if it was actually translated.
        // We strip BiDi marks (RLM/LRM) from the current value before comparison to detect if
        // the core content has changed.
        if (original && original !== stripBiDiMarks(attr.value)) {
          finalLines.push(`[${attr.name}]: ${original}`);
        }
      }
    }

    return finalLines.join('\n');
  }
}

export const hoverPreviewManager = new HoverPreviewManager();
