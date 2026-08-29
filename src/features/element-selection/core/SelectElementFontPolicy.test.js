import { describe, expect, it, vi } from 'vitest';
import { getSelectElementFontTarget } from './SelectElementFontPolicy.js';

describe('getSelectElementFontTarget', () => {
  it('allows a single meaningful direct TextNode', () => {
    const element = document.createElement('span');
    element.textContent = 'source';

    expect(getSelectElementFontTarget(element.firstChild)).toBe(element);
  });

  it('ignores an extra whitespace-only direct TextNode', () => {
    const element = document.createElement('span');
    const text = document.createTextNode('source');
    element.append(text, document.createTextNode('   '));

    expect(getSelectElementFontTarget(text)).toBe(element);
  });

  it('rejects another meaningful direct TextNode, including technical text', () => {
    const element = document.createElement('span');
    const translated = document.createTextNode('Hello');
    element.append(translated, document.createTextNode('123'));
    const technical = document.createElement('span');
    const technicalText = document.createTextNode('label');
    technical.append(technicalText, document.createTextNode('--data-id--'));

    expect(getSelectElementFontTarget(translated)).toBeNull();
    expect(getSelectElementFontTarget(technicalText)).toBeNull();
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

    expect(getSelectElementFontTarget(mixed.firstChild)).toBeNull();
    expect(getSelectElementFontTarget(button.firstChild)).toBeNull();
    expect(getSelectElementFontTarget(link.firstChild)).toBeNull();
    expect(getSelectElementFontTarget(form.firstChild)).toBeNull();
    expect(getSelectElementFontTarget(custom.firstChild)).toBeNull();
    expect(getSelectElementFontTarget(svg.firstChild)).toBeNull();
    expect(getSelectElementFontTarget(video.firstChild)).toBeNull();
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
    const getComputedStyle = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
      if (pseudoElement === '::before' && element === pseudo) return { content: '"label"' };
      return { content: 'none' };
    });

    expect(getSelectElementFontTarget(roleButton.firstChild)).toBeNull();
    expect(getSelectElementFontTarget(editable.firstChild)).toBeNull();
    expect(getSelectElementFontTarget(important.firstChild)).toBeNull();
    expect(getSelectElementFontTarget(pseudo.firstChild)).toBeNull();
    getComputedStyle.mockRestore();
  });
});
