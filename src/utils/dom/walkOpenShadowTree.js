/**
 * Visit elements in light DOM and existing open ShadowRoots under root.
 * Closed roots and nodes outside root's composed subtree are not visited.
 */
export function walkOpenShadowTree(root, callback) {
  if (!root || typeof callback !== 'function') return;

  const visitedRoots = new Set();

  const visit = (currentRoot) => {
    if (!currentRoot || visitedRoots.has(currentRoot)) return;
    visitedRoots.add(currentRoot);

    const walker = document.createTreeWalker(currentRoot, NodeFilter.SHOW_ELEMENT);
    let node = currentRoot.nodeType === Node.ELEMENT_NODE ? currentRoot : walker.nextNode();

    while (node) {
      callback(node);
      if (node.shadowRoot) visit(node.shadowRoot);
      node = walker.nextNode();
    }
  };

  visit(root);
}
