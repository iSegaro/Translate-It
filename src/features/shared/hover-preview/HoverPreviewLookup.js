/**
 * HoverPreviewLookup - Specialized memory-efficient lookup for original texts.
 * Uses WeakMap to link DOM nodes to their original content without polluting the DOM.
 */
const TEXT_NODE = 3;
const ATTRIBUTE_NODE = 2;

const getNodeValue = (node) => {
  if (node?.nodeType === ATTRIBUTE_NODE) return node.value ?? node.nodeValue ?? null;
  if (node?.nodeType === TEXT_NODE) return node.nodeValue;
  return null;
};

export class HoverPreviewLookup {
  constructor() {
    // WeakMap ensures that when a Node is removed from DOM, its original text is garbage collected.
    this.lookup = new WeakMap();
  }

  /**
   * Register original text after a node has been translated successfully.
   * @param {Node} node - The TextNode or Attr node
   * @param {string} originalText - The original untranslated text
   * @param {string} appliedText - The actual value written to the node
   */
  add(node, originalText, appliedText) {
    if (
      !node
      || ![TEXT_NODE, ATTRIBUTE_NODE].includes(node.nodeType)
      || typeof originalText !== 'string'
      || !originalText
      || typeof appliedText !== 'string'
    ) return;

    this.lookup.set(node, { originalText, appliedText });
  }

  /**
   * Retrieve original text for a node or its children.
   * @param {Node} node - The node to check
   * @returns {string|null} - Original text or null
   */
  get(node) {
    if (!node) return null;

    const record = this.lookup.get(node);
    if (!record) return undefined;

    if (getNodeValue(node) !== record.appliedText) {
      this.lookup.delete(node);
      return undefined;
    }

    return record.originalText;
  }

  delete(node) {
    if (node) this.lookup.delete(node);
  }

  /**
   * Clear all lookups (manual cleanup if needed)
   */
  clear() {
    this.lookup = new WeakMap();
  }
}

export const hoverPreviewLookup = new HoverPreviewLookup();
