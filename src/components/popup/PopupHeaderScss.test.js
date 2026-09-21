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
    expect(source).toContain('gap: 6px !important;')
    expect(source).toContain('padding-inline-end: 4px !important;')
    // Select split wrapper keeps a LARGER explicit separation (gap + margin).
    expect(source).toContain('.ti-header-actions > .ti-btn-select-split-menu')
    expect(source).toContain('margin-inline-start: 6px;')
  })
})
