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
    this.currentText = null;
    
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
    this.currentText = null;
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

    // SMART DETECTION: Find the specific text node under the cursor
    const x = event.clientX;
    const y = event.clientY;
    const specificNode = this._getSpecificNodeAt(x, y);

    const originalText = this._getOriginalText(element, specificNode);
    if (originalText) {
      this.currentText = originalText;
      this.logger.debug('Hover detected, emitting showTooltip event');
      PageTranslationEvents.showTooltip({
        text: originalText,
        position: { x, y }
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
      this.currentText = null;
    }
  }

  handleMouseMove(event) {
    const x = event.clientX;
    const y = event.clientY;

    // 1. Update Position (Immediate feedback)
    PageTranslationEvents.updateTooltipPosition({ x, y });

    // 2. Detect Segment Change (Dynamic update)
    // Even if we are in the same element, the text segment might have changed
    if (this.currentElement) {
      const specificNode = this._getSpecificNodeAt(x, y);
      const newText = this._getOriginalText(this.currentElement, specificNode);
      
      if (newText && newText !== this.currentText) {
        this.currentText = newText;
        this.logger.debug('Segment change detected, updating tooltip content');
        PageTranslationEvents.showTooltip({
          text: newText,
          position: { x, y }
        });
      }
    }
  }

  /**
   * Identifies the specific text node at the given screen coordinates.
   * @private
   */
  _getSpecificNodeAt(x, y) {
    try {
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        return range ? range.startContainer : null;
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        return pos ? pos.offsetNode : null;
      }
    } catch {
      // Silent fail
    }
    return null;
  }

  /**
   * Retrieves original text for an element, optionally focusing on a specific node.
   * Implementation: Uses "Smart Segmentation" - it breaks the container's content 
   * into logical segments (delimited by BR or block tags) and returns only the segment 
   * containing the specificNode if provided.
   * 
   * @param {HTMLElement} element - The translated container element
   * @param {Node|null} specificNode - The exact node under the cursor
   * @returns {string|null}
   */
  _getOriginalText(element, specificNode = null) {
    const segments = [[]]; // Array of text part arrays
    let currentSegmentIndex = 0;

    // Standard block-level elements that should trigger a line break or segment split
    const BLOCK_TAGS = new Set([
      'P', 'DIV', 'LI', 'TR', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 
      'HEADER', 'FOOTER', 'DT', 'DD', 'BLOCKQUOTE', 'FIGURE', 'TABLE', 'MAIN'
    ]);

    // 1. Gather text nodes and handle BR/BLOCK tags for segmentation
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
          if (node.nodeName === 'BR' || BLOCK_TAGS.has(node.nodeName)) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
      },
      false
    );

    let node;
    const nodeToSegmentMap = new Map();

    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const original = hoverPreviewLookup.get(node);
        const content = original !== undefined ? original : node.textContent;
        
        if (content) {
          const normalized = content.replace(/\s+/g, ' ');
          if (normalized.trim() || normalized === ' ') {
            segments[currentSegmentIndex].push(normalized);
            nodeToSegmentMap.set(node, currentSegmentIndex);
          }
        }
      } else {
        // It's a BR or a BLOCK_TAG. Start a new segment if current one isn't empty.
        if (segments[currentSegmentIndex].length > 0) {
          currentSegmentIndex++;
          segments[currentSegmentIndex] = [];
        }
      }
    }

    // 2. Select the relevant segment(s)
    let selectedText = '';
    
    if (specificNode && nodeToSegmentMap.has(specificNode)) {
      // SMART MODE: Only return the segment containing the hovered node
      const segmentIndex = nodeToSegmentMap.get(specificNode);
      selectedText = segments[segmentIndex].join('').trim();
    } else {
      // FALLBACK MODE: Join all segments with newlines (standard behavior for small elements)
      selectedText = segments
        .map(seg => seg.join('').trim())
        .filter(text => text.length > 0)
        .join('\n');
    }

    const finalLines = [];
    if (selectedText) {
      finalLines.push(selectedText);
    }

    // 3. Check attributes (e.g., title, alt) - these always remain on separate lines
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        const original = hoverPreviewLookup.get(attr);
        
        if (original && original !== stripBiDiMarks(attr.value)) {
          finalLines.push(`[${attr.name}]: ${original}`);
        }
      }
    }

    return finalLines.join('\n');
  }
}

export const hoverPreviewManager = new HoverPreviewManager();
