import { describe, expect, it } from 'vitest';
import {
  getSelectEventElements,
  iterateSelectElementAncestors,
  isComposedDescendant,
  resolveSelectInteractionElement,
} from './shadowDom.js';

describe('Select Element Shadow DOM helpers', () => {
  it('resolves the deepest element from an open-shadow composed path', () => {
    const host = document.createElement('x-host');
    const shadow = host.attachShadow({ mode: 'open' });
    const outer = document.createElement('div');
    const inner = document.createElement('span');
    outer.appendChild(inner);
    shadow.appendChild(outer);

    const event = { target: host, composedPath: () => [inner, outer, shadow, host, document, window] };

    expect(resolveSelectInteractionElement(event)).toBe(inner);
    expect(getSelectEventElements(event)).toEqual([inner, outer, host]);
  });

  it('falls back to retargeted host when shadow resolution is disabled', () => {
    const host = document.createElement('x-host');
    const shadow = host.attachShadow({ mode: 'open' });
    const internal = document.createElement('span');
    shadow.appendChild(internal);

    expect(resolveSelectInteractionElement(
      { target: host, composedPath: () => [internal, shadow, host, document, window] },
      () => false,
      { allowShadowDom: false }
    )).toBe(host);
  });

  it('resolves deepest nested open-shadow element and falls back to a retargeted host', () => {
    const outerHost = document.createElement('x-outer');
    const outerShadow = outerHost.attachShadow({ mode: 'open' });
    const innerHost = document.createElement('x-inner');
    const innerShadow = innerHost.attachShadow({ mode: 'open' });
    const target = document.createElement('button');
    innerShadow.appendChild(target);
    outerShadow.appendChild(innerHost);

    expect(resolveSelectInteractionElement({
      target: outerHost,
      composedPath: () => [target, innerShadow, innerHost, outerShadow, outerHost, document, window],
    })).toBe(target);
    expect(resolveSelectInteractionElement({ target: outerHost })).toBe(outerHost);
  });

  it('rejects paths containing extension-owned UI', () => {
    const host = document.createElement('x-host');
    const shadow = host.attachShadow({ mode: 'open' });
    const internal = document.createElement('span');
    shadow.appendChild(internal);

    expect(resolveSelectInteractionElement(
      { target: host, composedPath: () => [internal, host, document, window] },
      element => element === host
    )).toBeNull();
  });

  it('crosses open shadow boundaries without duplicating ancestors', () => {
    const host = document.createElement('x-host');
    const shadow = host.attachShadow({ mode: 'open' });
    const internal = document.createElement('span');
    shadow.appendChild(internal);
    document.body.appendChild(host);

    expect([...iterateSelectElementAncestors(internal)]).toEqual([internal, host, document.body, document.documentElement]);
  });

  it('checks composed ownership without crossing into sibling trees or upward', () => {
    const outerHost = document.createElement('x-outer');
    const outerShadow = outerHost.attachShadow({ mode: 'open' });
    const innerHost = document.createElement('x-inner');
    const innerShadow = innerHost.attachShadow({ mode: 'open' });
    const internal = document.createElement('span');
    innerShadow.appendChild(internal);
    outerShadow.appendChild(innerHost);
    const siblingHost = document.createElement('x-sibling');
    document.body.append(outerHost, siblingHost);

    expect(isComposedDescendant(outerHost, internal)).toBe(true);
    expect(isComposedDescendant(innerHost, internal)).toBe(true);
    expect(isComposedDescendant(internal, outerHost)).toBe(false);
    expect(isComposedDescendant(siblingHost, internal)).toBe(false);
    expect(isComposedDescendant(outerHost, outerHost)).toBe(true);
  });
});
