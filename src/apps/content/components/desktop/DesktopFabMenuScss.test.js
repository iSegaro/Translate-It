import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scssPath = resolve(dirname(fileURLToPath(import.meta.url)), 'DesktopFabMenu.scss');
const source = readFileSync(scssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector) {
  const match = selector.exec(source);
  expect(match, `missing SCSS block: ${selector}`).toBeTruthy();
  const start = match.index + match[0].lastIndexOf('{') + 1;
  let depth = 1;
  for (let end = start; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, end);
  }
  throw new Error(`Unclosed SCSS block: ${selector}`);
}

function declaration(rule, property) {
  return rule.match(new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`))?.[1].trim();
}

const menu = block(/\.desktop-fab-container\s*\{[\s\S]*?\.desktop-fab-menu\s*\{/);
const item = block(/\.fab-menu-item\s*\{/);

describe('DesktopFabMenu SCSS layout contract', () => {
  it('keeps menu icon geometry independent of FAB scaling', () => {
    const wrapper = block(/\.menu-icon-wrapper\s*\{/);
    const icon = block(/\.fab-menu-icon\s*\{/);
    const progress = block(/\.fab-circle-progress\s*\{/);

    expect(declaration(wrapper, 'width')).toBe('var(--menu-icon-box) !important');
    expect(declaration(wrapper, 'height')).toBe('var(--menu-icon-box) !important');
    expect(declaration(icon, 'width')).toBe('var(--menu-icon-size) !important');
    expect(declaration(icon, 'height')).toBe('var(--menu-icon-size) !important');
    expect(declaration(progress, 'width')).toMatch(/var\(--menu-icon-box\)/);
    expect(declaration(progress, 'height')).toMatch(/var\(--menu-icon-box\)/);
    expect(`${wrapper}${icon}${progress}`).not.toContain('--fab-size');
  });

  it('lets long labels wrap inside the row without forcing the star onto another line', () => {
    const label = block(/\.fab-menu-item-text\s*\{/);

    expect(declaration(label, 'min-width')).toBe('0 !important');
    expect(declaration(label, 'overflow-wrap')).toBe('anywhere !important');
    expect(label).not.toMatch(/(?:white-space|text-wrap)\s*:\s*nowrap/);
    expect(declaration(item, 'display')).toBe('flex !important');
    expect(declaration(item, 'flex-wrap')).toBe('wrap !important');
    expect(declaration(item, 'column-gap')).toBe('var(--menu-gap) !important');
    expect(declaration(block(/\.fab-auto-translate-scopes\s*\{/), 'flex'))
      .toBe('0 0 100% !important');
  });

  it('sizes the menu to content within the available viewport and contains the scope panel', () => {
    expect(declaration(menu, 'width')).toBe('max-content !important');
    const minWidth = declaration(menu, 'min-width') ?? '';
    const minWidthVariable = source.match(/--menu-min-width\s*:\s*([^;]+);/)?.[1] ?? '';
    const boundedMinimum = `${minWidth} ${minWidthVariable}`;
    expect(boundedMinimum).toMatch(/min\([^;]*(?:190px|var\(--menu-min-width\))[^;]*var\(--menu-(?:avail|available)-width\)|min\([^;]*var\(--menu-(?:avail|available)-width\)[^;]*(?:190px|var\(--menu-min-width\))/);

    const maxWidth = declaration(menu, 'max-width') ?? '';
    expect(maxWidth).toMatch(/min\([^;]*(?:260px|var\(--menu-max-width\))/);
    expect(maxWidth).toMatch(/var\(--menu-(?:avail|available)-width\)/);
    const availableWidth = declaration(menu, '--menu-avail-width')
      ?? declaration(menu, '--menu-available-width')
      ?? '';
    expect(availableWidth).toMatch(/100vw/);

    const scopes = block(/\.fab-auto-translate-scopes\s*\{/);
    const panelDeclarations = scopes.slice(0, scopes.indexOf('{'));
    expect(declaration(panelDeclarations, 'contain')).toBe('inline-size !important');
    expect(declaration(panelDeclarations, 'width')).toBe('100% !important');
    expect(declaration(panelDeclarations, 'flex')).toBe('0 0 100% !important');
    expect(declaration(panelDeclarations, 'padding-inline-start')).toBeUndefined();

    const scopeButton = block(/\.fab-auto-translate-scopes\s*\{[\s\S]*?button\s*\{/);
    const scopeInfo = block(/\.fab-auto-translate-scopes\s*\{[\s\S]*?div\s*\{/);
    const labelColumnIndent = /calc\(var\(--menu-icon-box\)\s*\+\s*var\(--menu-gap\)\)/;
    expect(declaration(scopeButton, 'margin-inline-start')).toMatch(labelColumnIndent);
    expect(declaration(scopeButton, 'width')).toBe('auto !important');
    expect(declaration(scopeInfo, 'font-size')).toBe('0.85em !important');
    expect(declaration(scopeInfo, 'margin-inline-start')).toMatch(labelColumnIndent);

    const separator = block(/\.fab-auto-translate-scopes\s*\{[\s\S]*?\.fab-scope-separator\s*\{/);
    const separatorOpacity = Number.parseFloat(declaration(separator, 'opacity'));
    const separatorAlpha = Number.parseFloat(
      declaration(separator, 'border-color')?.match(/,\s*(0?\.\d+)\s*\)/)?.[1],
    );
    expect(separatorOpacity <= 0.5 || separatorAlpha <= 0.5).toBe(true);
    expect(declaration(separator, 'margin') ?? declaration(separator, 'margin-inline-start'))
      .toMatch(labelColumnIndent);

    const note = block(/\.fab-auto-translate-scopes\s*\{[\s\S]*?\.fab-scope-note\s*\{/);
    expect(declaration(note, 'color')).toBe('#5b6472 !important');
    expect(declaration(note, 'overflow-wrap')).toMatch(/anywhere/);
    expect(declaration(note, 'margin-inline-start')).toBeUndefined();
    expect(declaration(note, 'font-size')).toBeUndefined();
    const darkNote = block(/&\.theme-dark\s*\{[\s\S]*?\.fab-scope-note\s*\{/);
    expect(declaration(darkNote, 'color')).toBe('rgba(255, 255, 255, 0.6) !important');

    const manageLink = block(/\.fab-auto-translate-scopes\s*\{[\s\S]*?\.fab-scope-link\s*\{/);
    const linkFontSize = declaration(manageLink, 'font-size') ?? '';
    const linkPadding = declaration(manageLink, 'padding') ?? '';
    const fontSizeValue = Number.parseFloat(linkFontSize);
    const compactFont = (linkFontSize.endsWith('px') && fontSizeValue < 13)
      || ((linkFontSize.endsWith('em') || linkFontSize.endsWith('rem')) && fontSizeValue < 1);
    const paddingValue = Number.parseFloat(linkPadding);
    expect(compactFont || paddingValue < 5).toBe(true);
    const focusVisible = block(/\.fab-scope-link\s*\{[\s\S]*?&:focus-visible\s*\{/);
    expect(declaration(focusVisible, 'outline')).toMatch(/\S/);
    expect(declaration(manageLink, 'margin-inline-start')).toBeUndefined();

    const lightLink = block(/&\.theme-light\s*\{[\s\S]*?\.fab-scope-link\s*\{/);
    const darkLink = block(/&\.theme-dark\s*\{[\s\S]*?\.fab-scope-link\s*\{/);
    const lightIdleColor = declaration(manageLink, 'color') ?? declaration(lightLink, 'color');
    expect(lightIdleColor).toBe('#1a5fb4 !important');
    expect(declaration(darkLink, 'color')).toMatch(/(?:#60a5fa|rgb\(96,\s*165,\s*250\))\s*!important/);
    expect(lightIdleColor).not.toBe(declaration(note, 'color'));
    expect(declaration(darkLink, 'color')).not.toBe(declaration(darkNote, 'color'));

    const linkAlignment = declaration(manageLink, 'align-self') ?? '';
    const linkWidth = declaration(manageLink, 'width') ?? declaration(manageLink, 'inline-size') ?? '';
    const linkFlex = declaration(manageLink, 'flex') ?? '';
    expect(/(?:flex-start|start)/.test(linkAlignment)
      || /(?:fit-content|max-content)/.test(linkWidth)
      || /0\s+0\s+auto/.test(linkFlex)).toBe(true);
    expect(declaration(manageLink, 'min-width')).toBe('0 !important');
    expect(declaration(manageLink, 'overflow-wrap')).toBe('anywhere !important');
    const linkMaxWidth = declaration(manageLink, 'max-width')
      ?? declaration(manageLink, 'max-inline-size')
      ?? '';
    expect(linkMaxWidth).toMatch(/calc\(/);
    expect(/--menu-icon-box/.test(linkMaxWidth) && /--menu-gap/.test(linkMaxWidth)
      || /var\(--menu-(?:label-)?indent/.test(linkMaxWidth)).toBe(true);
  });

  it('renders the hide trigger as a compact trailing-edge toolbar strip', () => {
    const toolbar = block(/\.fab-menu-toolbar\s*\{/);
    expect(declaration(toolbar, 'display')).toBe('flex !important');
    expect(declaration(toolbar, 'justify-content')).toBe('flex-end !important');
    expect(declaration(toolbar, 'align-items')).toBe('center !important');
    expect(declaration(toolbar, 'min-height')).toBe('30px !important');
    expect(declaration(toolbar, 'padding')).toBe('2px 4px !important');
    expect(declaration(toolbar, 'border-bottom')).toMatch(/1px solid/);

    const trigger = block(/\.fab-toolbar-hide-btn\s*\{/);
    expect(declaration(trigger, 'display')).toBe('flex !important');
    expect(declaration(trigger, 'align-items')).toBe('center !important');
    expect(declaration(trigger, 'justify-content')).toBe('center !important');
    expect(declaration(trigger, 'width')).toBe('var(--menu-icon-box) !important');
    expect(declaration(trigger, 'height')).toBe('var(--menu-icon-box) !important');
    expect(declaration(trigger, 'padding')).toBe('0 !important');
    expect(declaration(trigger, 'border')).toBe('0 !important');
    expect(declaration(trigger, 'background')).toBe('none !important');
    expect(declaration(trigger, 'cursor')).toBe('pointer !important');
    expect(declaration(trigger, 'border-radius')).toBe('7px !important');
    expect(declaration(block(/\.fab-toolbar-hide-btn\s*\{[\s\S]*?&:focus-visible\s*\{/), 'outline'))
      .toBe('2px solid #1a5fb4 !important');

    const darkToolbar = block(/&\.theme-dark\s*\{[\s\S]*?\.fab-menu-toolbar\s*\{/);
    expect(declaration(darkToolbar, 'border-bottom-color'))
      .toBe('rgba(255, 255, 255, 0.12) !important');
    const darkTrigger = block(/&\.theme-dark\s*\{[\s\S]*?\.fab-toolbar-hide-btn\s*\{/);
    expect(declaration(darkTrigger, 'outline-color')).toBe('#60a5fa !important');
  });

  it('detaches the hide popover as a width-capped sibling panel', () => {
    const popover = block(/\.fab-hide-popover\s*\{/);
    expect(declaration(popover, 'position')).toBe('absolute !important');

    // Same content-driven width contract as the menu.
    expect(declaration(popover, 'width')).toBe('max-content !important');
    expect(declaration(popover, 'min-width'))
      .toBe('min(var(--menu-min-width), var(--menu-avail-width)) !important');
    expect(declaration(popover, 'max-width'))
      .toBe('min(var(--menu-max-width), var(--menu-avail-width)) !important');
    expect(declaration(popover, '--menu-avail-width')).toMatch(/100vw/);

    expect(declaration(popover, 'display')).toBe('flex !important');
    expect(declaration(popover, 'flex-direction')).toBe('column !important');
    expect(declaration(popover, 'border-radius')).toBe('14px !important');
    expect(declaration(popover, 'backdrop-filter')).toBe('blur(16px) saturate(180%) !important');
    expect(declaration(popover, 'contain')).toBe('inline-size !important');
    expect(declaration(popover, 'box-sizing')).toBe('border-box !important');

    // Short viewports: cap to the viewport (minus the 8px margin on both
    // sides) and scroll internally; the capped height is what the
    // positioner flips and clamps against.
    expect(declaration(popover, 'max-height')).toBe('calc(100vh - 16px) !important');
    expect(declaration(popover, 'overflow-y')).toBe('auto !important');
    expect(declaration(popover, 'overflow-x')).toBe('hidden !important');
    expect(declaration(popover, 'overscroll-behavior')).toBe('contain !important');

    // Hairline separators between rendered actions only: the adjacent
    // selector skips unrendered scopes, and border-box keeps the 1px
    // inside the compact rows.
    const separator = block(/\.fab-hide-popover\s*\{[\s\S]*?button\s*\+\s*button\s*\{/);
    expect(declaration(separator, 'border-top')).toBe('1px solid rgba(0, 0, 0, 0.06) !important');
    expect(source).not.toMatch(/white-space\s*:\s*nowrap/);

    // Long localized labels wrap inside the panel instead of widening it.
    const action = block(/\.fab-hide-popover\s*\{[\s\S]*?button\s*\{/);
    expect(declaration(action, 'display')).toBe('flex !important');
    expect(declaration(action, 'box-sizing')).toBe('border-box !important');
    expect(declaration(action, 'min-width')).toBe('0 !important');
    expect(declaration(action, 'overflow-wrap')).toBe('anywhere !important');
    expect(declaration(action, 'text-align')).toBe('start !important');
    expect(declaration(action, 'font-weight')).toBe('600 !important');
    expect(declaration(block(/\.fab-hide-popover\s*\{[\s\S]*?button\s*\{[\s\S]*?&:focus-visible\s*\{/), 'outline'))
      .toBe('2px solid #1a5fb4 !important');

    // Logical props keep the warning readable in both directions.
    const warning = block(/\.fab-hide-popover\s*\{[\s\S]*?\.fab-hide-warning\s*\{/);
    expect(declaration(warning, 'font-size')).toBe('0.85em !important');
    expect(declaration(warning, 'overflow-wrap')).toMatch(/anywhere/);
    expect(declaration(warning, 'border-inline-start')).toBe('2px solid #b45309 !important');
    expect(declaration(warning, 'padding-inline-start')).toBe('6px !important');

    const error = block(/\.fab-hide-popover\s*\{[\s\S]*?\.fab-hide-error\s*\{/);
    expect(declaration(error, 'font-weight')).toBe('600 !important');
    expect(declaration(error, 'overflow-wrap')).toMatch(/anywhere/);
  });

  it('keeps the popover readable in light and dark themes', () => {
    const lightPopover = block(/&\.theme-light\s*\{[\s\S]*?\.fab-hide-popover\s*\{/);
    expect(declaration(lightPopover, 'background-color'))
      .toBe('rgba(255, 255, 255, 0.92) !important');
    expect(declaration(lightPopover, 'color')).toBe('#1e293b !important');
    const lightWarning = block(/&\.theme-light\s*\{[\s\S]*?\.fab-hide-warning\s*\{/);
    expect(declaration(lightWarning, 'color')).toBe('#7c4a03 !important');
    const lightError = block(/&\.theme-light\s*\{[\s\S]*?\.fab-hide-error\s*\{/);
    expect(declaration(lightError, 'color')).toBe('#c92a2a !important');

    const darkPopover = block(/&\.theme-dark\s*\{[\s\S]*?\.fab-hide-popover\s*\{/);
    expect(declaration(darkPopover, 'background-color'))
      .toBe('rgba(40, 40, 40, 0.95) !important');
    expect(declaration(darkPopover, 'color')).toBe('#f8fafc !important');
    expect(darkPopover).toMatch(/outline-color:\s*#60a5fa\s*!important/);
    const darkSeparator = block(/&\.theme-dark\s*\{[\s\S]*?\.fab-hide-popover\s*\{[\s\S]*?button\s*\+\s*button\s*\{/);
    expect(declaration(darkSeparator, 'border-top-color')).toBe('rgba(255, 255, 255, 0.1) !important');
    const darkWarning = block(/&\.theme-dark\s*\{[\s\S]*?\.fab-hide-warning\s*\{/);
    expect(declaration(darkWarning, 'color')).toBe('rgba(255, 255, 255, 0.75) !important');
    const darkError = block(/&\.theme-dark\s*\{[\s\S]*?\.fab-hide-error\s*\{/);
    expect(declaration(darkError, 'color')).toBe('#ff8787 !important');

    // Theme overrides recolor only — no conflicting overflow or height caps.
    expect(lightPopover).not.toMatch(/overflow/);
    expect(lightPopover).not.toMatch(/max-height/);
    expect(darkPopover).not.toMatch(/overflow/);
    expect(darkPopover).not.toMatch(/max-height/);
  });

  it('removes the in-flow hide disclosure selectors', () => {
    expect(source).not.toMatch(/\.fab-hide-row-trigger/);
    expect(source).not.toMatch(/\.fab-hide-options/);
    expect(source).not.toMatch(/\.fab-hide-disclosure-btn/);
    expect(source).not.toMatch(/is-disclosure/);
    expect(source).not.toMatch(/#fab-hide-options/);
  });

  it('keeps the hide row icon inside the fixed menu-icon geometry', () => {
    const hideIcon = block(/\.fab-hide-menu-icon\s*\{/);
    expect(declaration(hideIcon, 'width')).toBe('var(--menu-icon-size) !important');
    expect(declaration(hideIcon, 'height')).toBe('var(--menu-icon-size) !important');
    expect(hideIcon).not.toContain('--fab-size');
    const lightIcon = block(/&\.theme-light\s*\{[\s\S]*?\.fab-hide-menu-icon\s*\{/);
    expect(declaration(lightIcon, 'color')).toBe('#1e293b !important');
    const darkIcon = block(/&\.theme-dark\s*\{[\s\S]*?\.fab-hide-menu-icon\s*\{/);
    expect(declaration(darkIcon, 'color')).toBe('#f8fafc !important');
  });
});
