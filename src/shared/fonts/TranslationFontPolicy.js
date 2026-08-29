const UNSAFE_TAGS = new Set([
  'A', 'BUTTON', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SVG', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'EMBED', 'OBJECT',
]);

function hasGeneratedContent(element, pseudo) {
  const content = window.getComputedStyle(element, pseudo).content;
  return content && content !== 'none' && content !== 'normal' && content !== '""' && content !== "''";
}

export function getTranslationFontTarget(textNode) {
  try {
    const parent = textNode?.parentElement;
    if (!parent || parent.childElementCount > 0) return null;
    const meaningfulTextNodes = [...parent.childNodes].filter(
      node => node.nodeType === 3 && node.nodeValue?.trim()
    );
    if (meaningfulTextNodes.length !== 1 || meaningfulTextNodes[0] !== textNode) return null;
    const tagName = parent.tagName.toUpperCase();
    if (tagName.includes('-') || UNSAFE_TAGS.has(tagName)) return null;
    const role = parent.getAttribute('role')?.toLowerCase();
    if (role === 'button' || role === 'link' || parent.onclick !== null || parent.getAttribute('tabindex') === '0') return null;
    if (parent.isContentEditable || parent.hasAttribute('contenteditable')) return null;
    if (parent.style.getPropertyPriority('font-family') === 'important') return null;
    if (hasGeneratedContent(parent, '::before') || hasGeneratedContent(parent, '::after')) return null;
    return parent;
  } catch {
    return null;
  }
}
