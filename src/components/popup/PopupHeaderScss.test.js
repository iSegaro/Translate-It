import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..')
const scssPath = resolve(here, 'PopupHeader.scss')

const scssImporters = [{
  findFileUrl(url) {
    if (url.startsWith('@/')) {
      return new URL(`file://${resolve(srcDir, url.slice(2))}`)
    }
    return null
  }
}]

/**
 * PopupHeader.scss is a plain SCSS import (not `<style scoped>`, not
 * CSS-Modules), so theme hooks must be ordinary selectors. This pins the
 * selector contract without asserting computed styles.
 */
describe('PopupHeader.scss dark contract', () => {
  it('uses plain theme hooks (no :global() passthrough)', () => {
    const source = readFileSync(scssPath, 'utf8')

    expect(source).not.toContain(':global(')
    expect(source).toContain('.theme-dark &')
    // The hover token lives only in the base contract; the dark block
    // must not override it (theme value comes from the token itself).
    const hoverDeclarations = source.match(/--ti-action-icon-hover\s*:/g) || []
    expect(hoverDeclarations).toHaveLength(1)
  })

  it('compiles to reachable dark selectors carrying the contract', () => {
    const { css } = sass.compile(scssPath, { importers: scssImporters })

    expect(css).not.toContain(':global(')
    // Dark contract vars are declared on the toolbar root so both
    // .ti-header-left and .ti-header-actions inherit them.
    expect(css).toContain('.theme-dark .ti-header-toolbar')
    expect(css).toContain('--ti-action-icon: #fff')
    expect(css).toContain('--ti-action-icon-hover: var(--color-action-hover-accent)')
    expect(css).not.toContain('--ti-action-icon-hover: var(--color-warning)')
    expect(css).toContain('--ti-action-hover-bg: #424242')
    expect(css).toContain('--ti-action-active-bg: #555555')
    expect(css).toContain('border-inline-start-color: rgba(255, 255, 255, 0.1)')
  })

  it('defines the action hover accent token per theme', () => {
    const tokens = readFileSync(
      resolve(srcDir, 'assets/styles/base/_variables.scss'),
      'utf8'
    )

    expect(tokens).toContain('--color-action-hover-accent: #ff9800;')
    expect(tokens).toContain('--color-action-hover-accent: #ffb74d;')
  })

  it('exposes the action contract at .ti-header-toolbar scope (not only .ti-header-actions)', () => {
    const source = readFileSync(scssPath, 'utf8')
    const { css } = sass.compile(scssPath, { importers: scssImporters })

    // Light contract: the four vars appear at .ti-header-toolbar level.
    // The toolbar root block must declare --ti-action-hover-bg directly.
    const toolbarBlock = source.match(/\.ti-header-toolbar\s*\{([\s\S]*?)\/\*\s*Left group/)
    expect(toolbarBlock).toBeTruthy()
    expect(toolbarBlock[1]).toContain('--ti-action-hover-bg: rgba(0, 0, 0, 0.08)')

    // Compiled: dark contract lands on .theme-dark .ti-header-toolbar,
    // inherited by both .ti-header-left and .ti-header-actions.
    expect(css).toContain('.theme-dark .ti-header-toolbar')
  })

  it('pins the header actions spacing contract in source', () => {
    const source = readFileSync(scssPath, 'utf8')

    // Ordinary action gap + logical end inset on the actions boundary.
    expect(source).toContain('gap: 7px !important;')
    expect(source).toContain('padding-inline-end: 4px !important;')
    // Select split wrapper keeps a LARGER explicit separation (gap + margin).
    expect(source).toContain('.ti-header-actions > .ti-btn-select-split-menu')
    expect(source).toContain('margin-inline-start: 7px;')
  })

  it('Select separation is larger than ordinary gap (hierarchy preserved)', () => {
    const source = readFileSync(scssPath, 'utf8')

    // Ordinary gap inside .ti-header-actions: 7px.
    // Select split margin-inline-start: 7px.
    // Total Select separation = 7 + 7 = 14px > ordinary 7px. Ratio = 2×.
    const actionsBlock = source.match(/\.ti-header-actions\s*\{[\s\S]*?\}/)
    expect(actionsBlock).toBeTruthy()
    const gapMatch = actionsBlock[0].match(/gap:\s*(\d+)px/)
    expect(gapMatch).toBeTruthy()
    const ordinaryGap = parseInt(gapMatch[1], 10)
    expect(ordinaryGap).toBe(7)

    const marginMatch = source.match(/margin-inline-start:\s*(\d+)px/)
    expect(marginMatch).toBeTruthy()
    const selectMargin = parseInt(marginMatch[1], 10)
    expect(selectMargin).toBe(7)

    const selectSeparation = ordinaryGap + selectMargin
    expect(selectSeparation).toBeGreaterThan(ordinaryGap)
    // Ratio ≥ 1.8× to keep hierarchy visible
    expect(selectSeparation / ordinaryGap).toBeGreaterThanOrEqual(1.8)
  })

  it('pins the More-menu hover contract per theme', () => {
    const source = readFileSync(scssPath, 'utf8')
    const { css } = sass.compile(scssPath, { importers: scssImporters })

    // Light hover unchanged: neutral black overlay only (no color shift).
    expect(source).toContain('background-color: rgba(0, 0, 0, 0.06) !important;')

    // Dark hover: reachable selector, distinguishable neutral background,
    // accent for text + currentColor icons.
    expect(css).toContain('.theme-dark .ti-header-toolbar .ti-header-menu-item:hover')
    expect(css).toContain('background-color: var(--ti-action-hover-bg, #424242) !important;')
    expect(css).toContain('color: var(--color-action-hover-accent) !important;')

    // focus-visible remains a separate state (blue ring preserved).
    expect(css).toContain('outline: 2px solid var(--color-primary, #1976d2) !important;')
  })
})

describe('PopupHeader.scss optical sizing contract', () => {
  it('global toolbar icon box remains 22×22 (shared rule intact)', () => {
    const source = readFileSync(scssPath, 'utf8')

    // The shared rule inside .ti-toolbar-button that covers all icon types.
    const sharedRule = source.match(
      /img,\s*\.ti-toolbar-icon,\s*\.ti-icon-button\s*\{[^}]*width:\s*22px\s*![i!]+mportant;[^}]*height:\s*22px\s*![i!]+mportant;[^}]*\}/
    )
    expect(sharedRule).toBeTruthy()
    expect(sharedRule[0]).toContain('width: 22px !important')
    expect(sharedRule[0]).toContain('height: 22px !important')
  })

  it('Settings has per-action optical mask-size override to 20px (box stays 22×22)', () => {
    const source = readFileSync(scssPath, 'utf8')

    // Match the combined selector block (settings + sidepanel) that carries mask-size.
    // The mask-size block is the only rule with .ti-btn-settings + .ti-btn-sidepanel together.
    const maskBlock = source.match(
      /\.ti-header-actions\s+\.ti-btn-settings[\s\S]*?\.ti-header-actions\s+\.ti-btn-sidepanel\s+\.ti-toolbar-icon\s*\{([^}]*)\}/
    )
    expect(maskBlock).toBeTruthy()
    // Glyph shrinks to 20×20 via mask-size only
    expect(maskBlock[1]).toContain('mask-size: 20px 20px')
    expect(maskBlock[1]).toContain('-webkit-mask-size: 20px 20px')
    // Layout box must NOT be overridden — shared 22×22 rule governs width/height
    expect(maskBlock[1]).not.toMatch(/width:\s*20px/)
    expect(maskBlock[1]).not.toMatch(/height:\s*20px/)
  })

  it('Sidepanel has per-action optical mask-size override to 20px (box stays 22×22)', () => {
    const source = readFileSync(scssPath, 'utf8')

    // Same combined block covers sidepanel; verify its properties too.
    const maskBlock = source.match(
      /\.ti-header-actions\s+\.ti-btn-settings[\s\S]*?\.ti-header-actions\s+\.ti-btn-sidepanel\s+\.ti-toolbar-icon\s*\{([^}]*)\}/
    )
    expect(maskBlock).toBeTruthy()
    // Glyph shrinks to 20×20 via mask-size only
    expect(maskBlock[1]).toContain('mask-size: 20px 20px')
    expect(maskBlock[1]).toContain('-webkit-mask-size: 20px 20px')
    // Layout box must NOT be overridden
    expect(maskBlock[1]).not.toMatch(/width:\s*20px/)
    expect(maskBlock[1]).not.toMatch(/height:\s*20px/)
  })

  it('Capture and Mouse Hover have NO per-action size or mask-size override (shared 22px)', () => {
    const source = readFileSync(scssPath, 'utf8')

    // Capture must not have a width override — it relies on the shared 22px.
    const captureOverride = source.match(
      /\.ti-header-actions\s+\.ti-btn-capture\s+\.ti-toolbar-icon\s*\{[^}]*width:/
    )
    expect(captureOverride).toBeFalsy()

    // Capture must not have a mask-size override.
    const captureMaskOverride = source.match(
      /\.ti-header-actions\s+\.ti-btn-capture\s+\.ti-toolbar-icon\s*\{[^}]*mask-size:/
    )
    expect(captureMaskOverride).toBeFalsy()

    // Mouse Hover must not have a width override either.
    const mouseHoverOverride = source.match(
      /\.ti-header-actions\s+\.ti-btn-mouse-hover\s+\.ti-toolbar-icon\s*\{[^}]*width:/
    )
    expect(mouseHoverOverride).toBeFalsy()

    // Mouse Hover must not have a mask-size override either.
    const mouseHoverMaskOverride = source.match(
      /\.ti-header-actions\s+\.ti-btn-mouse-hover\s+\.ti-toolbar-icon\s*\{[^}]*mask-size:/
    )
    expect(mouseHoverMaskOverride).toBeFalsy()
  })

  it('optical translateY correction for Settings/MouseHover/Capture is preserved', () => {
    const source = readFileSync(scssPath, 'utf8')

    const translateRule = source.match(
      /\.ti-header-actions\s+\.ti-btn-settings\s+\.ti-toolbar-icon,\s*\n\s*\.ti-header-actions\s+\.ti-btn-mouse-hover\s+\.ti-toolbar-icon,\s*\n\s*\.ti-header-actions\s+\.ti-btn-capture\s+\.ti-toolbar-icon\s*\{[^}]*translate:\s*0\s+-1px[^}]*\}/
    )
    expect(translateRule).toBeTruthy()
    expect(translateRule[0]).toContain('translate: 0 -1px')
  })

  it('More keeps text ellipsis (⋯), final font-size 20px, letter-spacing 1.5px, line-height 1', () => {
    const source = readFileSync(scssPath, 'utf8')

    // The .ti-btn-more block must declare the expected typography values.
    const moreBlock = source.match(/\.ti-btn-more\s*\{([\s\S]*?)\n\s*\}/)
    expect(moreBlock).toBeTruthy()
    expect(moreBlock[1]).toContain('font-size: 20px !important')
    expect(moreBlock[1]).toContain('letter-spacing: 1.5px !important')
    expect(moreBlock[1]).toContain('line-height: 1 !important')

    // The span inside must keep the 22×22 box.
    expect(moreBlock[1]).toContain('width: 22px !important')
    expect(moreBlock[1]).toContain('height: 22px !important')

    // The Vue template uses the real ⋯ character (U+22EF), not an SVG/img.
    const vuePath = resolve(here, 'PopupHeader.vue')
    const vueSource = readFileSync(vuePath, 'utf8')
    expect(vueSource).toContain('⋯')
    // More specifically: inside the .ti-btn-more button's span.
    expect(vueSource).toContain('<span aria-hidden="true">⋯</span>')
  })
})
