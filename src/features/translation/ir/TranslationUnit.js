/**
 * TranslationUnit represents a single text node's translation metadata and structural context.
 * It is completely JSON-serializable and maintains immutable properties during the translation process.
 */
export class TranslationUnit {
  /**
   * @param {Object} params
   * @param {string} params.id              - Node UID. Format: "nN" (e.g. "n1", "n42"). Position-derived, not random.
   * @param {string} params.blockId         - Block group ID format "gN". Shared among all nodes in the same block ancestor.
   * @param {string} params.text            - Trimmed text content. Escaped for printable segment delimiters.
   * @param {string} [params.leadingWS=""]  - Original leading whitespace (pipeline-owned, not sent to LLM).
   * @param {string} [params.trailingWS=""] - Original trailing whitespace (pipeline-owned, not sent to LLM).
   * @param {boolean} [params.preWhitespace=false] - true if node belongs to a preformatted element (excludes from block group).
   * @param {'rtl'|'ltr'|null} [params.directionHint=null] - Detected layout direction of text content.
   * @param {string[]} [params.inlineParentTags=[]] - Ordered list of inline ancestor tag names between node and block ancestor.
   * @param {'standard'|'V2_PASSTHROUGH'} [params.mode='standard'] - Routing mode (V2 bypass).
   */
  constructor({
    id,
    blockId,
    text,
    leadingWS = '',
    trailingWS = '',
    preWhitespace = false,
    directionHint = null,
    inlineParentTags = [],
    mode = 'standard'
  }) {
    if (!id || typeof id !== 'string') {
      throw new Error('TranslationUnit requires a unique string id');
    }
    if (!blockId || typeof blockId !== 'string') {
      throw new Error('TranslationUnit requires a string blockId');
    }
    if (text === undefined || text === null) {
      throw new Error('TranslationUnit requires text content');
    }

    this.id = id;
    this.blockId = blockId;
    this.text = text;
    this.leadingWS = leadingWS;
    this.trailingWS = trailingWS;
    this.preWhitespace = preWhitespace;
    this.directionHint = directionHint;
    this.inlineParentTags = [...inlineParentTags];
    this.mode = mode;
  }

  /**
   * Serializes the unit to a JSON-safe plain object
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      blockId: this.blockId,
      text: this.text,
      leadingWS: this.leadingWS,
      trailingWS: this.trailingWS,
      preWhitespace: this.preWhitespace,
      directionHint: this.directionHint,
      inlineParentTags: [...this.inlineParentTags],
      mode: this.mode
    };
  }
}
