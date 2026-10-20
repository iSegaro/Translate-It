import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scssPath = resolve(here, 'TranslationWindow.scss');
const source = readFileSync(scssPath, 'utf8');

// Extract the body of the first rule that starts with `selector`, matching
// braces so nested blocks are captured in full.
const extractBlock = (text, selector) => {
  const start = text.indexOf(selector);
  if (start === -1) return '';
  const open = text.indexOf('{', start);
  if (open === -1) return '';
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, index);
    }
  }
  return '';
};

const reducedMotionBlock = extractBlock(source, '@media (prefers-reduced-motion: reduce)');
const wrapperBlock = extractBlock(source, '.ti-original-text-wrapper');
// The wrapper's own declarations (before any nested rule) decide whether the
// collapsed content is hidden outright.
const wrapperDeclarations = (() => {
  const nested = wrapperBlock.search(/&|[.#][a-zA-Z-]+\s*\{/);
  return nested === -1 ? wrapperBlock : wrapperBlock.slice(0, nested);
})();

/* The Original section collapses and fades as one coordinated animation:
   the wrapper's grid row shrinks while the section fades, both over 250ms.
   The contract is asserted on the stylesheet because the behavior lives in
   CSS (jsdom cannot run transitions). */
describe('TranslationWindow.scss original section collapse animation', () => {
  it('collapses the grid row and the content fade over the same 250ms duration', () => {
    expect(source).toMatch(/grid-template-rows 250ms cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/);
    expect(source).toMatch(/margin-bottom 250ms cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/);
    expect(source).toMatch(/ti-original-collapse-enter-active[\s\S]*?transition:\s*opacity 250ms cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/);
    expect(source).toMatch(/ti-original-collapse-leave-active[\s\S]*?transition:\s*opacity 250ms cubic-bezier\(0\.4,\s*0,\s*0\.2,\s*1\)/);
    expect(source).toMatch(/ti-original-collapse-enter-from[\s\S]*?opacity:\s*0/);
    expect(source).toMatch(/ti-original-collapse-leave-to[\s\S]*?opacity:\s*0/);
  });

  it('no longer hides the collapsed content instantly', () => {
    expect(wrapperDeclarations).not.toContain('visibility: hidden');
    expect(wrapperDeclarations).not.toContain('opacity: 0');
    // The collapse itself is still driven by the grid row.
    expect(wrapperDeclarations).toContain('grid-template-rows: 0fr');
  });

  it('disables the collapse and fade motion under prefers-reduced-motion', () => {
    expect(reducedMotionBlock).not.toBe('');
    expect(reducedMotionBlock).toMatch(/\.ti-original-text-wrapper\s*\{[^}]*transition:\s*none/);
    expect(reducedMotionBlock).toMatch(/ti-original-collapse-enter-active[\s\S]*?transition:\s*none/);
    expect(reducedMotionBlock).toMatch(/ti-original-collapse-leave-active[\s\S]*?transition:\s*none/);
  });
});
