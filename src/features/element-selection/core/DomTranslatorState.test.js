import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSelectElementTranslationState,
  pruneDisconnectedSelectElementTranslations,
  revertSelectElementTranslation,
  globalSelectElementState
} from './DomTranslatorState.js';
import { restoreElementDirection } from '@/utils/dom/DomDirectionManager.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    emit: vi.fn()
  }
}));

vi.mock('@/utils/dom/DomDirectionManager.js', () => ({
  restoreElementDirection: vi.fn(),
  restoreNodeDirectionState: vi.fn(() => [])
}));

vi.mock('@/features/page-translation/PageTranslationConstants.js', () => ({
  PAGE_TRANSLATION_ATTRIBUTES: {
    HAS_ORIGINAL: 'data-ti-has-original'
  }
}));

describe('DomTranslatorState', () => {
  const createTranslationEntry = (element, nodes, sessionId = 'session') => ({
    element,
    sessionId,
    originalTextNodesData: nodes.map(({ node, originalText }) => ({ node, originalText }))
  });

  const appendTextNodes = (values) => {
    const container = document.createElement('div');
    const nodes = values.map((value) => document.createTextNode(value));
    nodes.forEach(node => container.appendChild(node));
    document.body.appendChild(container);
    return { container, nodes };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global state
    globalSelectElementState.translationHistory = [];
    globalSelectElementState.isTranslating = false;
    globalSelectElementState.currentTranslation = null;
    globalSelectElementState.snapshots = new Map();
  });

  describe('getSelectElementTranslationState', () => {
    it('should return the global state object', () => {
      const state = getSelectElementTranslationState();
      expect(state).toBeDefined();
      expect(state.translationHistory).toBeInstanceOf(Array);
    });
  });

  describe('revertSelectElementTranslation', () => {
    it('should return 0 if history is empty', async () => {
      const count = await revertSelectElementTranslation();
      expect(count).toBe(0);
    });

    it('should revert translations and restore text nodes', async () => {
      const container = document.createElement('div');
      const textNode = document.createTextNode('Translated Text');
      container.appendChild(textNode);
      document.body.appendChild(container);

      // Setup translation history
      globalSelectElementState.translationHistory = [{
        element: container,
        originalTextNodesData: [
          { node: textNode, originalText: 'Original Text' }
        ]
      }];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(textNode.nodeValue).toBe('Original Text');
      expect(globalSelectElementState.translationHistory).toHaveLength(0);
      
      // Cleanup
      document.body.removeChild(container);
    });

    it('should skip elements no longer in DOM', async () => {
      const detachedEl = document.createElement('div');
      const textNode = document.createTextNode('Translated Text');
      detachedEl.appendChild(textNode);

      globalSelectElementState.translationHistory = [{
        element: detachedEl,
        originalTextNodesData: [
          { node: textNode, originalText: 'Original Text' }
        ]
      }];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(0);
      expect(textNode.nodeValue).toBe('Translated Text'); // No change
    });

    it('should emit hide-translation event', async () => {
      const { pageEventBus } = await import('@/core/PageEventBus.js');
      const container = document.createElement('div');
      document.body.appendChild(container);

      globalSelectElementState.translationHistory = [{
        element: container,
        originalTextNodesData: []
      }];

      await revertSelectElementTranslation();

      expect(pageEventBus.emit).toHaveBeenCalledWith('hide-translation', { element: container });
      
      document.body.removeChild(container);
    });

    it('should verify session ownership and skip revert if session ID is mismatched', async () => {
      const container = document.createElement('div');
      const textNode = document.createTextNode('Translated');
      container.appendChild(textNode);
      document.body.appendChild(container);

      globalSelectElementState.snapshots = new Map();
      globalSelectElementState.translationHistory = [{
        element: container,
        sessionId: 's_owner',
        originalTextNodesData: [
          { node: textNode, originalText: 'Original' }
        ]
      }];

      // Call revert with mismatched session
      const count1 = await revertSelectElementTranslation('s_wrong');
      expect(count1).toBe(0);
      expect(textNode.nodeValue).toBe('Translated'); // Mismatched session did not revert
      expect(globalSelectElementState.translationHistory).toHaveLength(1);

      // Call revert with correct session
      const count2 = await revertSelectElementTranslation('s_owner');
      expect(count2).toBe(1);
      expect(textNode.nodeValue).toBe('Original'); // Reverted successfully
      expect(globalSelectElementState.translationHistory).toHaveLength(0);

      document.body.removeChild(container);
    });

    it('restores remaining text nodes when the first setter throws', async () => {
      const { container, nodes } = appendTextNodes(['A', 'B', 'C']);
      nodes.forEach(node => { node.nodeValue = 'Translated'; });
      vi.spyOn(nodes[0], 'nodeValue', 'set').mockImplementation(() => {
        throw new Error('first node failed');
      });

      globalSelectElementState.translationHistory = [createTranslationEntry(container, [
        { node: nodes[0], originalText: 'A' },
        { node: nodes[1], originalText: 'B' },
        { node: nodes[2], originalText: 'C' },
      ])];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(nodes[0].nodeValue).toBe('Translated');
      expect(nodes[1].nodeValue).toBe('B');
      expect(nodes[2].nodeValue).toBe('C');
      expect(globalSelectElementState.translationHistory).toHaveLength(0);
      document.body.removeChild(container);
    });

    it('restores first and last text nodes when a middle setter throws', async () => {
      const { container, nodes } = appendTextNodes(['A', 'B', 'C']);
      nodes.forEach(node => { node.nodeValue = 'Translated'; });
      vi.spyOn(nodes[1], 'nodeValue', 'set').mockImplementation(() => {
        throw new Error('middle node failed');
      });

      globalSelectElementState.translationHistory = [createTranslationEntry(container, [
        { node: nodes[0], originalText: 'A' },
        { node: nodes[1], originalText: 'B' },
        { node: nodes[2], originalText: 'C' },
      ])];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(nodes[0].nodeValue).toBe('A');
      expect(nodes[1].nodeValue).toBe('Translated');
      expect(nodes[2].nodeValue).toBe('C');
      document.body.removeChild(container);
    });

    it('attempts every text node when multiple setters throw', async () => {
      const { container, nodes } = appendTextNodes(['A', 'B', 'C']);
      nodes.forEach(node => { node.nodeValue = 'Translated'; });
      const setters = nodes.map(node => vi.spyOn(node, 'nodeValue', 'set'));
      setters[0].mockImplementation(() => { throw new Error('first node failed'); });
      setters[2].mockImplementation(() => { throw new Error('last node failed'); });

      globalSelectElementState.translationHistory = [createTranslationEntry(container, [
        { node: nodes[0], originalText: 'A' },
        { node: nodes[1], originalText: 'B' },
        { node: nodes[2], originalText: 'C' },
      ])];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(nodes[0].nodeValue).toBe('Translated');
      expect(nodes[1].nodeValue).toBe('B');
      expect(nodes[2].nodeValue).toBe('Translated');
      expect(globalSelectElementState.translationHistory).toHaveLength(0);
      document.body.removeChild(container);
    });

    it('counts one history entry when all text nodes restore', async () => {
      const { container, nodes } = appendTextNodes(['A', 'B', 'C']);
      nodes.forEach(node => { node.nodeValue = 'Translated'; });
      globalSelectElementState.translationHistory = [createTranslationEntry(container, [
        { node: nodes[0], originalText: 'A' },
        { node: nodes[1], originalText: 'B' },
        { node: nodes[2], originalText: 'C' },
      ])];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(nodes.map(node => node.nodeValue)).toEqual(['A', 'B', 'C']);
      document.body.removeChild(container);
    });

    it('counts zero when every text restoration fails', async () => {
      const { container, nodes } = appendTextNodes(['A', 'B', 'C']);
      nodes.forEach(node => { node.nodeValue = 'Translated'; });
      nodes.forEach((node, index) => {
        vi.spyOn(node, 'nodeValue', 'set').mockImplementation(() => {
          throw new Error(`node ${index} failed`);
        });
      });
      globalSelectElementState.translationHistory = [createTranslationEntry(container, [
        { node: nodes[0], originalText: 'A' },
        { node: nodes[1], originalText: 'B' },
        { node: nodes[2], originalText: 'C' },
      ])];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(0);
      expect(nodes.map(node => node.nodeValue)).toEqual(['Translated', 'Translated', 'Translated']);
      document.body.removeChild(container);
    });

    it('attempts direction restoration after text restoration failure', async () => {
      const { container, nodes } = appendTextNodes(['A']);
      nodes[0].nodeValue = 'Translated';
      vi.spyOn(nodes[0], 'nodeValue', 'set').mockImplementation(() => {
        throw new Error('text failed');
      });
      globalSelectElementState.translationHistory = [createTranslationEntry(container, [
        { node: nodes[0], originalText: 'A' },
      ])];

      await revertSelectElementTranslation();

      expect(restoreElementDirection).toHaveBeenCalledWith(container);
      document.body.removeChild(container);
    });

    it('continues later history entries when direction restoration throws', async () => {
      const newest = appendTextNodes(['new-original']);
      const oldest = appendTextNodes(['old-original']);
      newest.nodes[0].nodeValue = 'new-translated';
      oldest.nodes[0].nodeValue = 'old-translated';
      restoreElementDirection
        .mockImplementationOnce(() => { throw new Error('direction failed'); })
        .mockImplementation(() => {});

      globalSelectElementState.translationHistory = [
        createTranslationEntry(oldest.container, [{ node: oldest.nodes[0], originalText: 'old-original' }], 'old'),
        createTranslationEntry(newest.container, [{ node: newest.nodes[0], originalText: 'new-original' }], 'new'),
      ];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(2);
      expect(newest.nodes[0].nodeValue).toBe('new-original');
      expect(oldest.nodes[0].nodeValue).toBe('old-original');
      expect(globalSelectElementState.translationHistory).toHaveLength(0);
      document.body.removeChild(newest.container);
      document.body.removeChild(oldest.container);
    });

    it('continues direction restoration when metadata cleanup throws', async () => {
      const { container, nodes } = appendTextNodes(['Original']);
      const removeAttribute = vi.spyOn(container, 'removeAttribute').mockImplementationOnce(() => {
        throw new Error('metadata failed');
      });
      globalSelectElementState.translationHistory = [createTranslationEntry(container, [
        { node: nodes[0], originalText: 'Original' },
      ])];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(removeAttribute).toHaveBeenCalled();
      expect(restoreElementDirection).toHaveBeenCalledWith(container);
      expect(globalSelectElementState.translationHistory).toHaveLength(0);
      document.body.removeChild(container);
    });

    it('continues older history entries after newest text restoration fails', async () => {
      const newest = appendTextNodes(['new-original']);
      const oldest = appendTextNodes(['old-original']);
      newest.nodes[0].nodeValue = 'new-translated';
      oldest.nodes[0].nodeValue = 'old-translated';
      vi.spyOn(newest.nodes[0], 'nodeValue', 'set').mockImplementation(() => {
        throw new Error('newest failed');
      });

      globalSelectElementState.translationHistory = [
        createTranslationEntry(oldest.container, [{ node: oldest.nodes[0], originalText: 'old-original' }], 'old'),
        createTranslationEntry(newest.container, [{ node: newest.nodes[0], originalText: 'new-original' }], 'new'),
      ];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(newest.nodes[0].nodeValue).toBe('new-translated');
      expect(oldest.nodes[0].nodeValue).toBe('old-original');
      document.body.removeChild(newest.container);
      document.body.removeChild(oldest.container);
    });

    it('reaches the original source after repeated translation snapshots', async () => {
      const { container, nodes } = appendTextNodes(['Original']);
      nodes[0].nodeValue = 'A';
      nodes[0].nodeValue = 'B';
      globalSelectElementState.translationHistory = [
        createTranslationEntry(container, [{ node: nodes[0], originalText: 'Original' }], 'original'),
        createTranslationEntry(container, [{ node: nodes[0], originalText: 'A' }], 'a'),
      ];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(2);
      expect(nodes[0].nodeValue).toBe('Original');
      document.body.removeChild(container);
    });

    it('skips detached captured children while restoring connected siblings', async () => {
      const { container, nodes } = appendTextNodes(['A', 'B', 'C']);
      const detached = nodes[1];
      container.removeChild(detached);
      nodes[0].nodeValue = 'Translated A';
      nodes[2].nodeValue = 'Translated C';
      globalSelectElementState.translationHistory = [createTranslationEntry(container, [
        { node: nodes[0], originalText: 'A' },
        { node: detached, originalText: 'B' },
        { node: nodes[2], originalText: 'C' },
      ])];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(nodes[0].nodeValue).toBe('A');
      expect(detached.nodeValue).toBe('B');
      expect(nodes[2].nodeValue).toBe('C');
      document.body.removeChild(container);
    });

    it('restores connected text inside an open shadow root and its exact metadata owner', async () => {
      const host = document.createElement('x-host');
      const shadow = host.attachShadow({ mode: 'open' });
      const owner = document.createElement('span');
      const textNode = document.createTextNode('Translated shadow text');
      owner.appendChild(textNode);
      owner.setAttribute('data-ti-has-original', 'true');
      shadow.appendChild(owner);
      document.body.appendChild(host);

      globalSelectElementState.translationHistory = [{
        element: owner,
        originalTextNodesData: [{ node: textNode, originalText: 'Original shadow text' }],
        originalMetadataSnapshots: [{ element: owner, present: false, value: null }],
      }];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(textNode.nodeValue).toBe('Original shadow text');
      expect(owner.hasAttribute('data-ti-has-original')).toBe(false);
      document.body.removeChild(host);
    });

    it('skips detached shadow history roots and text nodes', async () => {
      const host = document.createElement('x-host');
      const shadow = host.attachShadow({ mode: 'open' });
      const owner = document.createElement('span');
      const textNode = document.createTextNode('Translated');
      owner.appendChild(textNode);
      shadow.appendChild(owner);
      document.body.appendChild(host);
      host.remove();

      globalSelectElementState.translationHistory = [{
        element: owner,
        originalTextNodesData: [{ node: textNode, originalText: 'Original' }],
        originalMetadataSnapshots: [{ element: owner, present: false, value: null }],
      }];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(0);
      expect(textNode.nodeValue).toBe('Translated');
    });

    it('does not mutate replacement shadow content during identity-based metadata revert', async () => {
      const host = document.createElement('x-host');
      const shadow = host.attachShadow({ mode: 'open' });
      const oldOwner = document.createElement('span');
      const oldText = document.createTextNode('Translated old');
      oldOwner.appendChild(oldText);
      oldOwner.setAttribute('data-ti-has-original', 'true');
      shadow.appendChild(oldOwner);
      document.body.appendChild(host);

      globalSelectElementState.translationHistory = [{
        element: host,
        originalTextNodesData: [{ node: oldText, originalText: 'Original old' }],
        originalMetadataSnapshots: [{ element: oldOwner, present: false, value: null }],
      }];

      const replacement = document.createElement('span');
      replacement.textContent = 'Replacement';
      replacement.setAttribute('data-ti-has-original', 'replacement');
      shadow.replaceChildren(replacement);

      const count = await revertSelectElementTranslation();

      expect(count).toBe(0);
      expect(oldText.nodeValue).toBe('Translated old');
      expect(replacement.getAttribute('data-ti-has-original')).toBe('replacement');
      document.body.removeChild(host);
    });

    it('restores only connected captured shadow direction Elements', async () => {
      const { restoreNodeDirectionState } = await import('@/utils/dom/DomDirectionManager.js');
      const host = document.createElement('x-host');
      const shadow = host.attachShadow({ mode: 'open' });
      const oldOwner = document.createElement('span');
      const oldText = document.createTextNode('Translated');
      oldOwner.appendChild(oldText);
      shadow.appendChild(oldOwner);
      document.body.appendChild(host);

      globalSelectElementState.translationHistory = [{
        element: host,
        shadowSpanning: true,
        originalTextNodesData: [{ node: oldText, originalText: 'Original' }],
        originalMetadataSnapshots: [],
        originalDirectionSnapshots: [{ element: oldOwner }],
      }];
      const replacement = document.createElement('span');
      replacement.setAttribute('data-dir-original-saved', 'true');
      shadow.replaceChildren(replacement);

      await revertSelectElementTranslation();

      expect(restoreNodeDirectionState).toHaveBeenCalledWith([]);
      expect(replacement.hasAttribute('data-dir-original-saved')).toBe(true);
      document.body.removeChild(host);
    });

    it('restores nested shadow metadata once and continues after one failure', async () => {
      const host = document.createElement('x-host');
      const outerShadow = host.attachShadow({ mode: 'open' });
      const failingOwner = document.createElement('span');
      const nestedHost = document.createElement('x-nested');
      const nestedShadow = nestedHost.attachShadow({ mode: 'open' });
      const owner = document.createElement('span');
      const textNode = document.createTextNode('Translated');
      owner.appendChild(textNode);
      failingOwner.setAttribute('data-ti-has-original', 'true');
      owner.setAttribute('data-ti-has-original', 'true');
      nestedShadow.appendChild(owner);
      outerShadow.append(failingOwner, nestedHost);
      document.body.appendChild(host);

      const failingRemoveAttribute = vi.spyOn(failingOwner, 'removeAttribute').mockImplementationOnce(() => {
        throw new Error('metadata failure');
      });
      globalSelectElementState.translationHistory = [{
        element: host,
        originalTextNodesData: [{ node: textNode, originalText: 'Original' }],
        originalMetadataSnapshots: [
          { element: failingOwner, present: false, value: null },
          { element: owner, present: false, value: null },
          { element: owner, present: false, value: null },
        ],
      }];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(failingRemoveAttribute).toHaveBeenCalledOnce();
      expect(failingOwner.hasAttribute('data-ti-has-original')).toBe(true);
      expect(owner.hasAttribute('data-ti-has-original')).toBe(false);
      document.body.removeChild(host);
    });

    it('does not mutate a replacement node', async () => {
      const { container, nodes } = appendTextNodes(['Original']);
      const replacement = document.createTextNode('Replacement');
      container.replaceChild(replacement, nodes[0]);
      globalSelectElementState.translationHistory = [createTranslationEntry(container, [
        { node: nodes[0], originalText: 'Original' },
      ])];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(0);
      expect(replacement.nodeValue).toBe('Replacement');
      document.body.removeChild(container);
    });

    it('restores captured source over connected external changes', async () => {
      const { container, nodes } = appendTextNodes(['External change']);
      globalSelectElementState.translationHistory = [createTranslationEntry(container, [
        { node: nodes[0], originalText: 'Captured source' },
      ])];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(1);
      expect(nodes[0].nodeValue).toBe('Captured source');
      document.body.removeChild(container);
    });

    it('clears history and snapshots after restoration failures', async () => {
      const { container, nodes } = appendTextNodes(['Original']);
      vi.spyOn(nodes[0], 'nodeValue', 'set').mockImplementation(() => {
        throw new Error('restore failed');
      });
      globalSelectElementState.snapshots.set('session:g1', [{ node: nodes[0] }]);
      globalSelectElementState.translationHistory = [createTranslationEntry(container, [
        { node: nodes[0], originalText: 'Original' },
      ], 'session')];

      const count = await revertSelectElementTranslation();

      expect(count).toBe(0);
      expect(globalSelectElementState.translationHistory).toHaveLength(0);
      expect(globalSelectElementState.snapshots.size).toBe(0);
      document.body.removeChild(container);
    });
  });

  describe('pruneDisconnectedSelectElementTranslations', () => {
    it('removes disconnected session state while preserving connected revert state', () => {
      const connected = document.createElement('div');
      const detached = document.createElement('div');
      document.body.appendChild(connected);
      globalSelectElementState.translationHistory = [
        { element: connected, sessionId: 'connected' },
        { element: detached, sessionId: 'detached' },
      ];
      globalSelectElementState.snapshots.set('detached:g1', [{ node: detached }]);

      expect(pruneDisconnectedSelectElementTranslations()).toBe(1);
      expect(globalSelectElementState.translationHistory).toEqual([
        expect.objectContaining({ sessionId: 'connected' })
      ]);
      expect(globalSelectElementState.snapshots.has('detached:g1')).toBe(false);

      document.body.removeChild(connected);
    });
  });
});
