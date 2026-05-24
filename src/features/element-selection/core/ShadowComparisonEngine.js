/**
 * ShadowComparisonEngine - Implements the Semantic Equivalence DOM Structural Diffing Contract.
 * Used in Phase 6 to validate the V3 Block Grouping pipeline against the V2 pipeline in memory.
 */





export class ShadowComparisonEngine {
  /**
   * Deeply compares two elements under the semantic equivalence contract.
   *
   * @param {Node} nodeA - The V2 translated node clone
   * @param {Node} nodeB - The V3 translated node clone
   * @returns {Object} { equivalent: boolean, reason: string | null }
   */
  static compare(nodeA, nodeB) {
    // 1. Handle null/missing checks
    if (!nodeA && !nodeB) return { equivalent: true, reason: null };
    if (!nodeA || !nodeB) {
      return { 
        equivalent: false, 
        reason: `Node mismatch: nodeA is ${nodeA ? 'present' : 'absent'}, nodeB is ${nodeB ? 'present' : 'absent'}` 
      };
    }

    // 2. Handle type mismatch
    if (nodeA.nodeType !== nodeB.nodeType) {
      return { 
        equivalent: false, 
        reason: `NodeType mismatch: nodeA is ${nodeA.nodeType}, nodeB is ${nodeB.nodeType}` 
      };
    }

    // 3. Handle Text Nodes
    if (nodeA.nodeType === Node.TEXT_NODE) {
      const textA = this.normalizeText(nodeA.nodeValue);
      const textB = this.normalizeText(nodeB.nodeValue);
      if (textA !== textB) {
        return { 
          equivalent: false, 
          reason: `Text content mismatch:\nNodeA: "${textA}"\nNodeB: "${textB}"` 
        };
      }
      return { equivalent: true, reason: null };
    }

    // 4. Handle Element Nodes
    if (nodeA.nodeType === Node.ELEMENT_NODE) {
      // Compare Tag Name
      if (nodeA.tagName !== nodeB.tagName) {
        return { 
          equivalent: false, 
          reason: `TagName mismatch: nodeA is ${nodeA.tagName}, nodeB is ${nodeB.tagName}` 
        };
      }

      // Compare non-framework Attributes
      const attrsA = this.getCleanAttributes(nodeA);
      const attrsB = this.getCleanAttributes(nodeB);
      
      const attrsMatch = this.compareAttributes(attrsA, attrsB);
      if (!attrsMatch.equal) {
        return { 
          equivalent: false, 
          reason: `Attributes mismatch on tag ${nodeA.tagName}: ${attrsMatch.reason}` 
        };
      }

      // Compare Child Nodes recursively
      const childrenA = Array.from(nodeA.childNodes).filter(n => !this.isIgnorableNode(n));
      const childrenB = Array.from(nodeB.childNodes).filter(n => !this.isIgnorableNode(n));

      if (childrenA.length !== childrenB.length) {
        return { 
          equivalent: false, 
          reason: `Child count mismatch on tag ${nodeA.tagName}: nodeA has ${childrenA.length}, nodeB has ${childrenB.length}` 
        };
      }

      for (let i = 0; i < childrenA.length; i++) {
        const result = this.compare(childrenA[i], childrenB[i]);
        if (!result.equivalent) {
          return result;
        }
      }

      return { equivalent: true, reason: null };
    }

    // Ignore other node types (comments, processing instructions, etc.)
    return { equivalent: true, reason: null };
  }

  /**
   * Normalizes text by removing layout-invisible BiDi/format characters
   * and collapsing whitespace.
   */
  static normalizeText(text) {
    if (!text) return '';
    return text
      .replace(/[\u200b-\u200f\uFEFF\u202c\u200c\u200d]/g, '') // Remove BiDi and invisible formatting marks
      .replace(/\s+/g, ' ')                                  // Collapse consecutive whitespace
      .trim();
  }

  /**
   * Filter out ignorable nodes (like comment nodes or whitespace-only nodes between inline elements)
   */
  static isIgnorableNode(node) {
    if (node.nodeType === Node.COMMENT_NODE) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      // If it's a text node but contains only spaces and is empty after normalization
      return this.normalizeText(node.nodeValue) === '';
    }
    return false;
  }

  /**
   * Cleans a style string by removing transient direction-related properties.
   */
  static cleanStyleString(styleStr) {
    if (!styleStr) return '';
    return styleStr
      .split(';')
      .map(part => part.trim())
      .filter(part => {
        if (!part) return false;
        const colonIdx = part.indexOf(':');
        if (colonIdx === -1) return true;
        const prop = part.substring(0, colonIdx).trim().toLowerCase();
        return !['direction', 'unicode-bidi', 'max-width', 'text-align'].includes(prop);
      })
      .join('; ')
      .trim();
  }

  /**
   * Extracts clean attributes, ignoring framework data-v-* tags and compilers unique keys.
   */
  static getCleanAttributes(element) {
    const attrs = {};
    if (!element.attributes) return attrs;
    
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      const name = attr.name.toLowerCase();
      
      // Ignore framework compiler identifiers (like data-v-xxxx) and reactive indexes/keys/block-ids/direction-attributes
      if (
        name.startsWith('data-v-') || 
        name === 'key' || 
        name === 'ref' || 
        name === 'data-block-id' ||
        name === 'data-translate-dir' ||
        name === 'data-dir-original-saved' ||
        name === 'data-has-original' ||
        name.startsWith('data-original-') ||
        // Ignore internal markers from Whole Page Translation
        name === 'data-page-translated' ||
        name === 'data-translate-ignore' ||
        // Ignore volatile attributes that might be modified by external side-effect observers (e.g. Page Translation)
        ['title', 'alt', 'placeholder'].includes(name)
      ) {
        continue;
      }
      
      // Ignore empty class attribute left by classList.remove in test environments
      if (name === 'class' && attr.value.trim() === '') {
        continue;
      }
      
      if (name === 'style') {
        const cleanedStyle = this.cleanStyleString(attr.value);
        if (cleanedStyle === '') {
          continue;
        }
        attrs[name] = cleanedStyle;
        continue;
      }
      
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }

  /**
   * Compares two sets of clean attributes.
   */
  static compareAttributes(attrsA, attrsB) {
    const keysA = Object.keys(attrsA);
    const keysB = Object.keys(attrsB);

    if (keysA.length !== keysB.length) {
      return { equal: false, reason: `Different attribute count (nodeA: [${keysA.join(', ')}], nodeB: [${keysB.join(', ')}])` };
    }

    for (const key of keysA) {
      if (attrsA[key] !== attrsB[key]) {
        // Tolerates harmless style direction normalization differences
        if (key === 'style') {
          let styleA = attrsA[key].replace(/\s+/g, '').toLowerCase();
          let styleB = attrsB[key].replace(/\s+/g, '').toLowerCase();
          if (styleA.endsWith(';')) styleA = styleA.slice(0, -1);
          if (styleB.endsWith(';')) styleB = styleB.slice(0, -1);
          if (styleA === styleB) continue;
        }
        return { equal: false, reason: `Value mismatch on attribute "${key}": nodeA is "${attrsA[key]}", nodeB is "${attrsB[key]}"` };
      }
    }

    return { equal: true, reason: null };
  }
}
