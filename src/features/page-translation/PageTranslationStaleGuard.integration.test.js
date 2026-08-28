import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/config.js', () => ({
  getTranslationApiAsync: vi.fn(async () => 'google'),
  getTargetLanguageAsync: vi.fn(async () => 'fa'),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  })),
}));

vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: { emit: vi.fn() },
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendRegularMessage: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@/shared/messaging/core/ContentScriptIntegration.js', () => ({
  registerTranslation: vi.fn(),
  contentScriptIntegration: {},
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: { getInstance: vi.fn(() => ({ handle: vi.fn() })) },
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: { isValidSync: vi.fn(() => true) },
}));

vi.mock('@/features/shared/hover-preview/HoverPreviewLookup.js', () => ({
  hoverPreviewLookup: {
    add: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('@/utils/dom/DomDirectionManager.js', () => ({
  applyNodeDirection: vi.fn(),
  isRTL: vi.fn((language) => language === 'fa'),
  restoreElementDirection: vi.fn(),
  BIDI_MARKS: { RLM: '\u200f', LRM: '\u200e' },
}));

import { PageTranslationBridge } from './PageTranslationBridge.js';
import { applyNodeDirection } from '@/utils/dom/DomDirectionManager.js';
import { hoverPreviewLookup } from '@/features/shared/hover-preview/HoverPreviewLookup.js';

const settlement = (text, onSettle = vi.fn()) => {
  let state = 'pending';
  return {
    __pageTranslationSettlement: true,
    text,
    get state() {
      return state;
    },
    settle(outcome) {
      if (state !== 'pending') return false;
      state = outcome;
      onSettle(outcome);
      return true;
    },
  };
};

const terminalSettlement = (text, state, settle = vi.fn()) => ({
  __pageTranslationSettlement: true,
  text,
  state,
  settle,
});

const settings = {
  targetLanguage: 'fa',
  lazyLoading: false,
  showOriginalOnHover: false,
  autoTranslateOnDOMChanges: false,
  attributesToTranslate: ['title'],
};

describe('PageTranslationBridge stale settlement integration', () => {
  let bridge;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.removeAttribute('data-page-translated');
    document.body.removeAttribute('data-has-original');
    bridge = new PageTranslationBridge();
  });

  afterEach(() => {
    bridge.cleanup();
  });

  const startDeferredTranslation = async (options = {}) => {
    const pending = [];
    const onTranslate = vi.fn((text, context, score, node) => new Promise(resolve => {
      pending.push({ text, node, resolve });
    }));

    await bridge.initialize({ ...settings, ...options }, onTranslate);
    bridge.translate(document.body);
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
    return { pending, onTranslate };
  };

  it('applies fresh text and leaves settlement accepted', async () => {
    const node = document.createTextNode('Original');
    document.body.appendChild(node);
    const { pending } = await startDeferredTranslation();
    const accepted = vi.fn();
    pending[0].resolve(settlement('Translated', accepted));

    await vi.waitFor(() => expect(node.nodeValue).toContain('Translated'));
    expect(accepted).toHaveBeenCalledWith('accepted');
    expect(applyNodeDirection).toHaveBeenCalled();
  });

  it.each([
    ['edited text', (node) => { node.nodeValue = 'Edited'; }],
    ['detached text', (node) => { node.remove(); }],
    ['replaced text', (node) => { node.replaceWith(document.createTextNode('Replacement')); }],
  ])('rejects stale %s without applying provider output', async (_name, mutate) => {
    const node = document.createTextNode('Original');
    document.body.appendChild(node);
    const { pending } = await startDeferredTranslation();
    const stale = vi.fn();
    mutate(node);
    pending[0].resolve(settlement('Translated', stale));

    await Promise.resolve();
    await Promise.resolve();
    expect(document.body.textContent).not.toContain('Translated');
    expect(stale).toHaveBeenCalledWith('stale');
  });

  it('rejects changed and recreated attributes by identity', async () => {
    const element = document.createElement('div');
    element.setAttribute('title', 'Original');
    document.body.appendChild(element);
    const { pending } = await startDeferredTranslation();
    const stale = vi.fn();

    element.removeAttribute('title');
    element.setAttribute('title', 'Replacement');
    pending[0].resolve(settlement('Translated', stale));

    await Promise.resolve();
    await Promise.resolve();
    expect(element.getAttribute('title')).toBe('Replacement');
    expect(stale).toHaveBeenCalledWith('stale');
  });

  it('cleans storage for stale initial work and allows later translation', async () => {
    const node = document.createTextNode('Original');
    document.body.appendChild(node);
    const { pending } = await startDeferredTranslation();
    const stale = vi.fn();

    node.nodeValue = 'Edited';
    pending[0].resolve(settlement('Translated', stale));
    await vi.waitFor(() => expect(bridge.session.nodesTranslator.has(node)).toBe(false));
    expect(stale).toHaveBeenCalledWith('stale');

    bridge.session.domTranslator.translate(node);
    await vi.waitFor(() => expect(pending.length).toBe(2));
    const accepted = vi.fn();
    pending[1].resolve(settlement('Fresh', accepted));

    await vi.waitFor(() => expect(node.nodeValue).toContain('Fresh'));
    expect(accepted).toHaveBeenCalledWith('accepted');
  });

  it('preserves newer storage when superseded task becomes stale', async () => {
    const node = document.createTextNode('one');
    document.body.appendChild(node);
    const { pending } = await startDeferredTranslation({ autoTranslateOnDOMChanges: true });

    node.nodeValue = 'two';
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(1));
    const stale = vi.fn();
    pending[0].resolve(settlement('old', stale));
    await Promise.resolve();
    await Promise.resolve();

    expect(stale).toHaveBeenCalledWith('stale');
    expect(bridge.session.nodesTranslator.has(node)).toBe(true);

    const accepted = vi.fn();
    pending[1].resolve(settlement('new', accepted));
    await vi.waitFor(() => expect(node.nodeValue).toContain('new'));
    expect(accepted).toHaveBeenCalledWith('accepted');
  });

  it('closes settlement when storage is removed before writer continuation', async () => {
    const node = document.createTextNode('Original');
    document.body.appendChild(node);
    const { pending } = await startDeferredTranslation();
    const stale = vi.fn();

    bridge.session.nodesTranslator.restore(node);
    pending[0].resolve(settlement('Translated', stale));
    await Promise.resolve();
    await Promise.resolve();

    expect(stale).toHaveBeenCalledWith('stale');
    expect(bridge.session.nodesTranslator.has(node)).toBe(false);
  });

  it('preserves active provider-failure storage compatibility', async () => {
    const node = document.createTextNode('Original');
    document.body.appendChild(node);
    const { pending } = await startDeferredTranslation();
    const failed = vi.fn();

    pending[0].resolve(terminalSettlement('Original', 'failed', failed));
    await vi.waitFor(() => expect(bridge.session.nodesTranslator.has(node)).toBe(true));

    expect(node.nodeValue).toBe('Original');
    expect(failed).not.toHaveBeenCalled();
  });

  it('preserves user edit after stale update and restore', async () => {
    const node = document.createTextNode('Original');
    document.body.appendChild(node);
    const { pending } = await startDeferredTranslation();

    pending[0].resolve(settlement('Translated'));
    await vi.waitFor(() => expect(node.nodeValue).toContain('Translated'));

    node.nodeValue = 'Edited';
    bridge.session.nodesTranslator.update(node);
    await vi.waitFor(() => expect(pending.length).toBe(2));
    node.nodeValue = 'Edited again';
    const stale = vi.fn();
    pending[1].resolve(settlement('Stale update', stale));
    await vi.waitFor(() => expect(stale).toHaveBeenCalledWith('stale'));

    bridge.restore(document.body);
    expect(node.nodeValue).toBe('Edited again');
  });

  it.each(['a-first', 'b-first'])('preserves Task B restore baseline when %s settles', async (order) => {
    const node = document.createTextNode('Original');
    document.body.appendChild(node);
    const { pending } = await startDeferredTranslation({ autoTranslateOnDOMChanges: true });

    pending[0].resolve(settlement('Initial'));
    await vi.waitFor(() => expect(node.nodeValue).toContain('Initial'));
    node.nodeValue = 'A';
    await vi.waitFor(() => expect(pending.length).toBe(2));
    node.nodeValue = 'B';
    await vi.waitFor(() => expect(pending.length).toBe(3));

    const stale = vi.fn();
    const accepted = vi.fn();
    if (order === 'a-first') {
      pending[1].resolve(settlement('A translation', stale));
      await vi.waitFor(() => expect(stale).toHaveBeenCalledWith('stale'));
      pending[2].resolve(settlement('B translation', accepted));
    } else {
      pending[2].resolve(settlement('B translation', accepted));
      await vi.waitFor(() => expect(accepted).toHaveBeenCalledWith('accepted'));
      pending[1].resolve(settlement('A translation', stale));
    }

    await vi.waitFor(() => expect(accepted).toHaveBeenCalledWith('accepted'));
    await vi.waitFor(() => expect(node.nodeValue).toContain('B translation'));
    bridge.restore(document.body);
    expect(node.nodeValue).toBe('B');
    expect(stale).toHaveBeenCalledWith('stale');
  });

  it('preserves changed attribute after stale update and restore', async () => {
    const element = document.createElement('div');
    element.setAttribute('title', 'Original');
    document.body.appendChild(element);
    const { pending } = await startDeferredTranslation();

    pending[0].resolve(settlement('Translated title'));
    await vi.waitFor(() => expect(element.getAttribute('title')).toContain('Translated title'));

    element.setAttribute('title', 'Edited');
    const attribute = element.getAttributeNode('title');
    bridge.session.nodesTranslator.update(attribute);
    await vi.waitFor(() => expect(pending.length).toBe(2));
    element.setAttribute('title', 'Edited again');
    const stale = vi.fn();
    pending[1].resolve(settlement('Stale title', stale));
    await vi.waitFor(() => expect(stale).toHaveBeenCalledWith('stale'));

    bridge.restore(document.body);
    expect(element.getAttribute('title')).toBe('Edited again');
  });

  it('skips stale post-processing and hover registration', async () => {
    const node = document.createTextNode('Original');
    document.body.appendChild(node);
    const { pending } = await startDeferredTranslation({ showOriginalOnHover: true });
    const stale = vi.fn();
    applyNodeDirection.mockClear();
    hoverPreviewLookup.add.mockClear();

    node.nodeValue = '\u200fEdited';
    pending[0].resolve(settlement('Translated', stale));
    await Promise.resolve();
    await Promise.resolve();

    expect(node.nodeValue).toBe('\u200fEdited');
    expect(applyNodeDirection).not.toHaveBeenCalled();
    expect(hoverPreviewLookup.add).not.toHaveBeenCalled();
    expect(node.parentElement?.getAttribute('data-page-translated')).toBeNull();
    expect(stale).toHaveBeenCalledWith('stale');
  });

  it('rejects settlement after bridge cleanup as cancelled', async () => {
    const node = document.createTextNode('Original');
    document.body.appendChild(node);
    const { pending } = await startDeferredTranslation();
    const cancelled = vi.fn();

    bridge.cleanup();
    pending[0].resolve(settlement('Translated', cancelled));
    await Promise.resolve();
    await Promise.resolve();

    expect(node.nodeValue).toBe('Original');
    expect(cancelled).toHaveBeenCalledWith('cancelled');
  });

  it('rejects older persistent work after an ABA source change', async () => {
    const node = document.createTextNode('one');
    document.body.appendChild(node);
    const { pending } = await startDeferredTranslation({ autoTranslateOnDOMChanges: true });

    node.nodeValue = 'two';
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(1));
    node.nodeValue = 'one';
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(2));

    const stale = vi.fn();
    pending[0].resolve(settlement('old translation', stale));
    await Promise.resolve();
    await Promise.resolve();

    expect(node.nodeValue).toBe('one');
    expect(stale).toHaveBeenCalledWith('stale');
  });
});
