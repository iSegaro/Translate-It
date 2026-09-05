import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslationFontTarget } from './TranslationFontPolicy.js';

const nativeGetComputedStyle = window.getComputedStyle.bind(window);
let computedStyleSpy;
let pseudoContentOverrides;

const setPseudoContent = (element, pseudo, content) => {
  let overrides = pseudoContentOverrides.get(element);
  if (!overrides) {
    overrides = new Map();
    pseudoContentOverrides.set(element, overrides);
  }
  overrides.set(pseudo, content);
};

describe('getTranslationFontTarget', () => {
  beforeEach(() => {
    pseudoContentOverrides = new WeakMap();
    computedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      if (pseudo) {
        return { content: pseudoContentOverrides.get(element)?.get(pseudo) ?? 'none' };
      }
      return nativeGetComputedStyle(element, pseudo);
    });
  });

  afterEach(() => {
    computedStyleSpy.mockRestore();
    computedStyleSpy = null;
  });

  it('allows a single meaningful direct TextNode', () => {
    const element = document.createElement('span');
    element.textContent = 'source';

    expect(getTranslationFontTarget(element.firstChild)).toBe(element);
  });

  it('ignores an extra whitespace-only direct TextNode', () => {
    const element = document.createElement('span');
    const text = document.createTextNode('source');
    element.append(text, document.createTextNode('   '));

    expect(getTranslationFontTarget(text)).toBe(element);
  });

  it('rejects another meaningful direct TextNode, including technical text', () => {
    const element = document.createElement('span');
    const translated = document.createTextNode('Hello');
    element.append(translated, document.createTextNode('123'));
    const technical = document.createElement('span');
    const technicalText = document.createTextNode('label');
    technical.append(technicalText, document.createTextNode('--data-id--'));

    expect(getTranslationFontTarget(translated)).toBeNull();
    expect(getTranslationFontTarget(technicalText)).toBeNull();
  });

  it('rejects element children and unsafe interactive, form, custom, SVG, and media parents', () => {
    const mixed = document.createElement('span');
    mixed.append('source', document.createElement('strong'));
    const button = document.createElement('button');
    button.textContent = 'source';
    const link = document.createElement('a');
    link.textContent = 'source';
    const form = document.createElement('form');
    form.textContent = 'source';
    const custom = document.createElement('x-custom');
    custom.textContent = 'source';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.appendChild(document.createTextNode('source'));
    const video = document.createElement('video');
    video.appendChild(document.createTextNode('source'));

    expect(getTranslationFontTarget(mixed.firstChild)).toBeNull();
    expect(getTranslationFontTarget(button.firstChild)).toBeNull();
    expect(getTranslationFontTarget(link.firstChild)).toBeNull();
    expect(getTranslationFontTarget(form.firstChild)).toBeNull();
    expect(getTranslationFontTarget(custom.firstChild)).toBeNull();
    expect(getTranslationFontTarget(svg.firstChild)).toBeNull();
    expect(getTranslationFontTarget(video.firstChild)).toBeNull();
  });

  it('rejects interactive roles, editable parents, pseudo content, and important font families', () => {
    const roleButton = document.createElement('span');
    roleButton.setAttribute('role', 'button');
    roleButton.textContent = 'source';
    const editable = document.createElement('span');
    editable.setAttribute('contenteditable', 'true');
    editable.textContent = 'source';
    const important = document.createElement('span');
    important.textContent = 'source';
    important.style.setProperty('font-family', 'serif', 'important');
    const pseudo = document.createElement('span');
    pseudo.textContent = 'source';
    setPseudoContent(pseudo, '::before', '"label"');

    expect(getTranslationFontTarget(roleButton.firstChild)).toBeNull();
    expect(getTranslationFontTarget(editable.firstChild)).toBeNull();
    expect(getTranslationFontTarget(important.firstChild)).toBeNull();
    expect(getTranslationFontTarget(pseudo.firstChild)).toBeNull();
  });
});
