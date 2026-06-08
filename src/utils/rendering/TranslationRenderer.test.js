import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTranslationRenderer } from './TranslationRenderer.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/core/memory/ResourceTracker.js', () => ({
  default: class MockResourceTracker {
    addEventListener(target, eventName, handler) {
      target.addEventListener(eventName, handler);
    }
  },
}));

describe('TranslationRenderer utility', () => {
  let renderer;

  const googleMarkdown = '**Noun**: test, experiment\n\n**Pronunciation**: /tɛst/\n\n**Definitions**:\n- (noun) a test\n\n**Examples**:\n- This is a test';
  const vajehyabMarkdown = '### سلام [salām]\n*اسم*\n\n---\n\n**معنی (لغت‌نامه عمید)**:\nدرود، تحیت';
  const legacyOneLine = 'translation **Noun**: hello, hi';
  const unsafeHtml = '<img src=x onerror=alert(1)><script>alert(2)</script>';

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = createTranslationRenderer({
      enableMarkdown: true,
      enableLabelFormatting: true,
      mode: 'selection',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders normalized Google bold-label markdown through SimpleMarkdown DOM output', () => {
    const element = renderer.createContentElement({
      content: googleMarkdown,
      error: null,
      isLoading: false,
      placeholder: '',
    });

    const markdownRoot = element.querySelector('.simple-markdown');

    expect(element.className).toContain('translation-content');
    expect(element.getAttribute('dir')).toBe('ltr');
    expect(markdownRoot).not.toBeNull();
    expect(markdownRoot.querySelector('strong').textContent).toBe('Noun');
    expect(markdownRoot.textContent).toContain('Pronunciation');
    expect(markdownRoot.querySelector('a')).toBeNull();
  });

  it('renders Vajehyab markdown-like output through SimpleMarkdown DOM output', () => {
    const element = renderer.createContentElement({
      content: vajehyabMarkdown,
      error: null,
      isLoading: false,
      placeholder: '',
    });

    const markdownRoot = element.querySelector('.simple-markdown');

    expect(markdownRoot).not.toBeNull();
    expect(markdownRoot.querySelector('h3').textContent).toBe('سلام [salām]');
    expect(markdownRoot.querySelector('em').textContent).toBe('اسم');
    expect(markdownRoot.querySelector('strong').textContent).toBe('معنی (لغت‌نامه عمید)');
  });

  it('preserves legacy one-line provider triage behavior', () => {
    const element = renderer.createContentElement({
      content: legacyOneLine,
      error: null,
      isLoading: false,
      placeholder: '',
    });

    const markdownRoot = element.querySelector('.simple-markdown');

    expect(markdownRoot).not.toBeNull();
    expect(markdownRoot.textContent).toBe('translation');
    expect(markdownRoot.textContent).not.toContain('Noun');
  });

  it('does not insert raw HTML as active DOM', () => {
    const element = renderer.createContentElement({
      content: unsafeHtml,
      error: null,
      isLoading: false,
      placeholder: '',
    });

    expect(element.querySelector('[onerror]')).toBeNull();
    expect(element.querySelector('script')).toBeNull();
    expect(element.innerHTML).not.toContain('onerror');
    expect(element.innerHTML).not.toContain('<script>');
    expect(element.textContent).not.toContain('alert(1)');
    expect(element.textContent).not.toContain('alert(2)');
  });

  it('keeps safe links with target blank and noopener noreferrer through SimpleMarkdown', () => {
    const element = renderer.createContentElement({
      content: '[Click](https://example.com)',
      error: null,
      isLoading: false,
      placeholder: '',
    });

    const link = element.querySelector('a');

    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
