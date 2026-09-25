import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..')
const scssPath = resolve(here, 'ProviderSelector.scss')

const scssImporters = [{
  findFileUrl(url) {
    if (url.startsWith('@/')) {
      return new URL(`file://${resolve(srcDir, url.slice(2))}`)
    }
    return null
  }
}]

const compile = () => sass.compile(scssPath, { importers: scssImporters })

/* ── Dead Popup override removal (Finding #4) ─────────────────────────
   `:global(.popup-wrapper)` was emitted literally by Sass (plain
   script-imported SCSS, no CSS-Modules step), so the browser dropped it.
   The block is removed; Popup intentionally uses the live base sizing
   (split button 32px, label 13px). The deferred `:global(.rtl)` block
   is intentionally still present. */

describe('ProviderSelector.scss dead Popup override', () => {
  const source = readFileSync(scssPath, 'utf8')

  it('no longer contains `:global(.popup-wrapper)`', () => {
    expect(source).not.toContain(':global(.popup-wrapper)')
  })

  it('no Popup-specific 28px split-button override remains', () => {
    expect(source).not.toContain('height: 28px')
  })

  it('no Popup-specific 12px translate-label override remains', () => {
    expect(source).not.toContain('font-size: 12px')
  })

  it('live base split-button height remains 32px', () => {
    const { css } = compile()
    expect(css).toMatch(/\.ti-split-translate-button\s*\{[^}]*height:\s*32px/)
  })

  it('live base translate-label size remains 13px', () => {
    const { css } = compile()
    expect(css).toMatch(/\.ti-translate-main-area\s+span\s*\{[^}]*font-size:\s*13px/)
  })

  it('compiled CSS contains no `:global(.popup-wrapper)`', () => {
    const { css } = compile()
    expect(css).not.toContain(':global(.popup-wrapper)')
  })

  it('deferred `:global(.rtl)` block is intentionally still present', () => {
    expect(source).toContain(':global(.rtl)')
    const { css } = compile()
    expect(css).toContain(':global(.rtl)')
  })
})
