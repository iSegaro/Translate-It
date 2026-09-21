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
