/**
 * ShadowComparisonEngine - Implements the Semantic Equivalence DOM Structural Diffing Contract.
 * Used in Phase 6 to validate the V3 Block Grouping pipeline against the V2 pipeline in memory.
 */





export class ShadowComparisonEngine {
  /**
   * Deeply compares two nodes under the semantic equivalence contract.
   *
   * @param {Node} nodeA - The V2 translated node clone
   * @param {Node} nodeB - The V3 translated node (live DOM)
   * @param {string[]} warnings - Array to collect non-fatal warnings
   * @param {Object} ctx - Audit context (optional, TEMP instrumentation)
   * @returns {Object} { equivalent: boolean, reason: string | null, warnings: string[] }
   */
  static compare(nodeA, nodeB, warnings = [], ctx = null) {
    // TEMP: Track traversal path for first-mismatch evidence
    const traversalPath = [];
    const result = this._compareRecursive(nodeA, nodeB, warnings, traversalPath, ctx);
    return result;
  }

  /**
   * Recursive comparison with traversal path tracking.
   * @private
   * @param {Node} nodeA
   * @param {Node} nodeB
   * @param {string[]} warnings
   * @param {string[]} traversalPath - Stack of tag names leading to current node
   * @param {Object} ctx - Audit context (optional, TEMP instrumentation)
   * @returns {Object}
   */
  static _compareRecursive(nodeA, nodeB, warnings, traversalPath, ctx) {
    // 1. Handle null/missing checks
    if (!nodeA && !nodeB) return { equivalent: true, reason: null, warnings };
    if (!nodeA || !nodeB) {
      return {
        equivalent: false,
        reason: `Node mismatch: nodeA is ${nodeA ? 'present' : 'absent'}, nodeB is ${nodeB ? 'present' : 'absent'}`,
        warnings,
      };
    }

    // 2. Handle type mismatch
    if (nodeA.nodeType !== nodeB.nodeType) {
      return {
        equivalent: false,
        reason: `NodeType mismatch: nodeA is ${nodeA.nodeType}, nodeB is ${nodeB.nodeType}`,
        warnings,
      };
    }

    // 3. Handle Text Nodes
    if (nodeA.nodeType === Node.TEXT_NODE) {
      const textA = this.normalizeText(nodeA.nodeValue);
      const textB = this.normalizeText(nodeB.nodeValue);
      if (textA !== textB) {
        return {
          equivalent: false,
          reason: `Text content mismatch:\nNodeA: "${textA}"\nNodeB: "${textB}"`,
          warnings,
        };
      }
      return { equivalent: true, reason: null, warnings };
    }

    // 4. Handle Element Nodes
    if (nodeA.nodeType === Node.ELEMENT_NODE) {
      // Track traversal path
      if (traversalPath.length > 0) {
        traversalPath.push(nodeA.tagName);
      } else {
        traversalPath[0] = nodeA.tagName;
      }

      // Compare Tag Name
      if (nodeA.tagName !== nodeB.tagName) {
        return {
          equivalent: false,
          reason: `TagName mismatch: nodeA is ${nodeA.tagName}, nodeB is ${nodeB.tagName}`,
          warnings,
        };
      }

      // Compare non-framework Attributes (Non-fatal)
      const attrsA = this.getCleanAttributes(nodeA);
      const attrsB = this.getCleanAttributes(nodeB);

      const attrsMatch = this.compareAttributes(attrsA, attrsB);
      if (!attrsMatch.equal) {
        warnings.push(`Attributes mismatch on tag ${nodeA.tagName}: ${attrsMatch.reason}`);
      }

      // Compare Child Nodes recursively
      const childrenA = Array.from(nodeA.childNodes).filter((n) => !this.isIgnorableNode(n));
      const childrenB = Array.from(nodeB.childNodes).filter((n) => !this.isIgnorableNode(n));

      if (childrenA.length !== childrenB.length) {
        const mismatch = {
          equivalent: false,
          reason: `Child count mismatch on tag ${nodeA.tagName}: nodeA has ${childrenA.length}, nodeB has ${childrenB.length}`,
          warnings,
        };
        // TEMP: Dump evidence at the exact failure site
        if (ctx && !ctx.mismatchReported) {
          ctx.mismatchReported = true;
          ShadowComparisonEngine._dumpFirstDivergence(nodeA, nodeB, mismatch, traversalPath.slice(), ctx);
        }
        return mismatch;
      }

      for (let i = 0; i < childrenA.length; i++) {
        const result = this._compareRecursive(childrenA[i], childrenB[i], warnings, traversalPath, ctx);
        if (!result.equivalent) {
          return result;
        }
      }

      // Pop traversal path on successful completion of this node's children
      if (traversalPath.length > 1) {
        traversalPath.pop();
      }

      return { equivalent: true, reason: null, warnings };
    }

    return { equivalent: true, reason: null, warnings };
  }

  // --- TEMP: First divergence dumps ---

  /**
   * Dumps full evidence when the first structural mismatch is detected.
   * Called directly from _compareRecursive at the exact failure site.
   * @private
   * @param {Node} nodeA - The actual failing nodeA (same reference used in comparison)
   * @param {Node} nodeB - The actual failing nodeB (same reference used in comparison)
   * @param {Object} result - The mismatch result object
   * @param {string[]} traversalPath - Path from root to the failing node
   * @param {Object} ctx - Audit context with groupMap, translatedSegmentMap, treeWalkerMapping
   */
  static _dumpFirstDivergence(nodeA, nodeB, result, traversalPath, ctx) {
    const rawChildrenA = Array.from(nodeA.childNodes || []);
    const rawChildrenB = Array.from(nodeB.childNodes || []);

    const serialiseRawChild = (child, rawIndex) => ({
      rawIndex,
      nodeType: child.nodeType,
      tagName: child.tagName || undefined,
      textPreview: child.nodeType === 3 ? JSON.stringify(child.nodeValue || '') : undefined,
      rawTextJSON: child.nodeType === 3 ? JSON.stringify(child.nodeValue) : undefined,
      normalizedText: child.nodeType === 3 ? ShadowComparisonEngine.normalizeText(child.nodeValue || '') : undefined,
      ignorable: ShadowComparisonEngine.isIgnorableNode(child),
      childNodesLength: child.childNodes ? child.childNodes.length : 0,
    });

    const rawChildrenASerialised = rawChildrenA.map((n, i) => serialiseRawChild(n, i));
    const rawChildrenBSerialised = rawChildrenB.map((n, i) => serialiseRawChild(n, i));

    const filteredA = rawChildrenA.filter((n) => !ShadowComparisonEngine.isIgnorableNode(n));
    const filteredB = rawChildrenB.filter((n) => !ShadowComparisonEngine.isIgnorableNode(n));

    const serialiseFilteredChild = (child, rawIndex) => ({
      rawIndex,
      nodeType: child.nodeType,
      tagName: child.tagName || (child.nodeType === 3 ? 'TEXT' : 'OTHER'),
      textPreview: child.nodeType === 3 ? JSON.stringify(child.nodeValue || '').substring(0, 40) : undefined,
    });

    const filteredChildrenA = filteredA.map((n, i) => {
      const rawIdx = rawChildrenA.indexOf(n);
      return { filteredIndex: i, ...serialiseFilteredChild(n, rawIdx) };
    });
    const filteredChildrenB = filteredB.map((n, i) => {
      const rawIdx = rawChildrenB.indexOf(n);
      return { filteredIndex: i, ...serialiseFilteredChild(n, rawIdx) };
    });

    // Find first raw difference
    let firstRawDifference = null;
    const maxLen = Math.max(rawChildrenA.length, rawChildrenB.length);
    for (let i = 0; i < maxLen; i++) {
      const a = i < rawChildrenA.length ? rawChildrenA[i] : null;
      const b = i < rawChildrenB.length ? rawChildrenB[i] : null;
      if (!a || !b || a.nodeType !== b.nodeType || a.tagName !== b.tagName) {
        firstRawDifference = {
          index: i,
          nodeA: a ? serialiseRawChild(a, i) : { missing: true },
          nodeB: b ? serialiseRawChild(b, i) : { missing: true },
        };
        break;
      }
    }

    // Find first filtered difference
    let firstFilteredDifference = null;
    const fMaxLen = Math.max(filteredChildrenA.length, filteredChildrenB.length);
    for (let i = 0; i < fMaxLen; i++) {
      const a = i < filteredChildrenA.length ? filteredChildrenA[i] : null;
      const b = i < filteredChildrenB.length ? filteredChildrenB[i] : null;
      if (!a || !b || a.nodeType !== b.nodeType || a.tagName !== b.tagName) {
        firstFilteredDifference = {
          filteredIndex: i,
          nodeA: a || { missing: true },
          nodeB: b || { missing: true },
        };
        break;
      }
    }

    // Compute DOM path with sibling indices for both failing nodes
    const pathA = ShadowComparisonEngine._computeDomPath(nodeA);
    const pathB = ShadowComparisonEngine._computeDomPath(nodeB);

    // Extract related units: direct text-node children of failing nodeB that match unit nodes
    const nodeBRawChildren = Array.from(nodeB.childNodes || []);
    const relatedUnits = ctx?.groupMap && ctx?.translatedSegmentMap
      ? Array.from(ctx.groupMap.entries()).flatMap(([blockId, group]) =>
          group.units
            .filter((u) => {
              // Check if this unit's node is a descendant of nodeB
              let n = u.node?.parentElement;
              while (n) {
                if (n === nodeB) return true;
                n = n.parentElement;
              }
              return false;
            })
            .map((u) => {
              const isDirectChild = nodeBRawChildren.includes(u.node);
              const storedTranslation = ctx.translatedSegmentMap.get(u.id);
              return {
                blockId,
                unitId: u.id,
                sourceText: u.originalText || undefined,
                isDirectChildOfFailingLI: isDirectChild,
                storedInTranslatedSegmentMap: storedTranslation !== undefined,
                translatedSegmentMapValue: storedTranslation !== undefined ? JSON.stringify(storedTranslation) : undefined,
                v3LiveDOMValue: isDirectChild ? JSON.stringify(u.node?.nodeValue || '') : undefined,
                translatedSegmentMapNormalized: ShadowComparisonEngine.normalizeText(storedTranslation || ''),
                v3LiveNormalized: isDirectChild ? ShadowComparisonEngine.normalizeText(u.node?.nodeValue || '') : undefined,
                ignorableInV3: isDirectChild ? ShadowComparisonEngine.isIgnorableNode(u.node) : undefined,
              };
            })
        ).filter(Boolean)
      : null;

    console.error('[SHADOW_EXACT_LI_DIVERGENCE]', JSON.stringify({
      reason: result.reason || 'Unknown',

      pathA,
      pathB,

      rawCountA: rawChildrenA.length,
      rawCountB: rawChildrenB.length,
      filteredCountA: filteredChildrenA.length,
      filteredCountB: filteredChildrenB.length,

      rawChildrenA: rawChildrenASerialised,
      rawChildrenB: rawChildrenBSerialised,

      filteredChildrenA,
      filteredChildrenB,

      firstRawDifference,
      firstFilteredDifference,

      relatedUnits,
    }, null, 2));
  }

  /**
   * Computes a DOM path with sibling indices (nth-child style).
   * @private
   */
  static _computeDomPath(node) {
    const parts = [];
    let curr = node;
    while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.documentElement) {
      let index = 1;
      let sibling = curr.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === curr.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      const idPart = curr.id ? '#' + curr.id : '';
      parts.unshift(`${curr.tagName}${idPart}:nth-child(${index})`);
      curr = curr.parentElement;
    }
    return parts.length ? parts.join(' > ') : (node.tagName || 'DOCUMENT');
  }

  // END TEMP: First divergence dumps

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
    if (!node || !node.nodeType) return false;
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
