/**
 * HoverPreviewLookup - Specialized memory-efficient lookup for original texts.
 * Uses WeakMap to link DOM nodes to their original content without polluting the DOM.
 */
export class HoverPreviewLookup {
  constructor() {
    // WeakMap ensures that when a Node is removed from DOM, its original text is garbage collected.
    this.lookup = new WeakMap();
  }

  /**
   * Register original text for a node before it gets translated.
   * @param {Node} node - The TextNode or Attr node
   * @param {string} originalText - The original untranslated text
   */
  add(node, originalText) {
    if (!node || !originalText) return;
    this.lookup.set(node, originalText);
  }

  /**
   * Retrieve original text for a node or its children.
   * @param {Node} node - The node to check
   * @returns {string|null} - Original text or null
   */
  get(node) {
    if (!node) return null;
    return this.lookup.get(node);
  }

  /**
   * Clear all lookups (manual cleanup if needed)
   */
  clear() {
    this.lookup = new WeakMap();
  }
}

export const hoverPreviewLookup = new HoverPreviewLookup();
