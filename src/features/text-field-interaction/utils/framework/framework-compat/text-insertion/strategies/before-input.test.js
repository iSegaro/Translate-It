import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  smartDelay: vi.fn(),
}));

vi.mock('../helpers.js', () => ({
  smartDelay: (...args) => mocks.smartDelay(...args),
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
    init: vi.fn(),
  })),
}));

vi.mock('@/shared/logging/logConstants.js', () => ({
  LOG_COMPONENTS: { FRAMEWORK: 'framework' },
}));

import { tryBeforeInputInsertion } from './before-input.js';

function makeField(value, start = null, end = null) {
  const el = document.createElement('textarea');
  el.value = value;
  document.body.appendChild(el);
  if (start !== null) el.setSelectionRange(start, end);
  return el;
}

describe('tryBeforeInputInsertion mutation proof', () => {
  it('returns false with no synthetic input when accepted but unchanged (fallback may proceed)', async () => {
    mocks.smartDelay.mockResolvedValue(undefined);
    const el = makeField('Hello سلام world', 6, 10);
    const inputs = [];
    el.addEventListener('input', (event) => inputs.push(event));

    const result = await tryBeforeInputInsertion(el, 'hello', true, {
      isCurrent: () => true,
    });

    expect(result).toBe(false);
    expect(inputs).toHaveLength(0);
    expect(el.value).toBe('Hello سلام world');

    document.body.removeChild(el);
  });

  it('returns true with exactly one input when the handler performs a full replace', async () => {
    mocks.smartDelay.mockResolvedValue(undefined);
    const el = makeField('foo');
    el.addEventListener('beforeinput', (event) => {
      el.value = event.data;
    });
    const inputs = [];
    el.addEventListener('input', (event) => inputs.push(event));

    const result = await tryBeforeInputInsertion(el, 'bar', false, {
      isCurrent: () => true,
    });

    expect(result).toBe(true);
    expect(el.value).toBe('bar');
    expect(inputs).toHaveLength(1);
    expect(inputs[0].bubbles).toBe(true);

    document.body.removeChild(el);
  });

  it('validates partial replacement without requiring whole-value equality', async () => {
    mocks.smartDelay.mockResolvedValue(undefined);
    const el = makeField('Hello سلام world', 6, 10);
    el.addEventListener('beforeinput', (event) => {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = el.value.slice(0, start) + event.data + el.value.slice(end);
    });
    const inputs = [];
    el.addEventListener('input', (event) => inputs.push(event));

    const result = await tryBeforeInputInsertion(el, 'hello', true, {
      isCurrent: () => true,
    });

    expect(result).toBe(true);
    expect(el.value).toBe('Hello hello world');
    expect(inputs).toHaveLength(1);

    document.body.removeChild(el);
  });

  it('emits nothing and mutates nothing once ownership is cancelled', async () => {
    let current = true;
    mocks.smartDelay.mockImplementation(() => {
      current = false;
      return Promise.resolve();
    });
    const el = makeField('Hello سلام world', 6, 10);
    let beforeinputs = 0;
    el.addEventListener('beforeinput', () => {
      beforeinputs += 1;
    });
    const inputs = [];
    el.addEventListener('input', (event) => inputs.push(event));

    const result = await tryBeforeInputInsertion(el, 'hello', true, {
      isCurrent: () => current,
    });

    expect(result).toBe(false);
    expect(beforeinputs).toBe(0);
    expect(inputs).toHaveLength(0);
    expect(el.value).toBe('Hello سلام world');

    document.body.removeChild(el);
  });
});
