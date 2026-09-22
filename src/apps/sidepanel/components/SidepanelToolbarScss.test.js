import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..', '..')
const scssPath = resolve(here, 'SidepanelToolbar.scss')

const compile = () => sass.compile(scssPath, {
  importers: [{
    findFileUrl(url) {
      if (url.startsWith('@/')) {
        return new URL(`file://${resolve(srcDir, url.slice(2))}`)
      }
      return null
    }
  }]
})

/**
 * Sidepanel toolbar layout rules must be explicitly scoped under
 * .side-toolbar — never standalone globals that could leak into
 * other surfaces. This file pins the compiled selector contract.
 */
describe('SidepanelToolbar.scss selector ownership', () => {
  it('scopes .toolbar-group under .side-toolbar', () => {
    const { css } = compile()
    expect(css).toContain('.side-toolbar .toolbar-group')

    const stripped = css.replace(/\.side-toolbar\s+\.toolbar-group\b/g, '')
    expect(stripped).not.toMatch(/(^|[}\n])\s*\.toolbar-group\s*\{/)
  })

  it('scopes .toolbar-group-bottom under .side-toolbar', () => {
    const { css } = compile()
    expect(css).toContain('.side-toolbar .toolbar-group-bottom')

    const stripped = css.replace(/\.side-toolbar\s+\.toolbar-group-bottom/g, '')
    expect(stripped).not.toMatch(/(^|[}\n])\s*\.toolbar-group-bottom\s*\{/)
  })

  it('scopes .toolbar-separator under .side-toolbar', () => {
    const { css } = compile()
    expect(css).toContain('.side-toolbar .toolbar-separator')

    const stripped = css.replace(/\.side-toolbar\s+\.toolbar-separator/g, '')
    expect(stripped).not.toMatch(/(^|[}\n])\s*\.toolbar-separator\s*\{/)
  })

  it('scopes .toolbar-page-translation under .side-toolbar', () => {
    const { css } = compile()
    expect(css).toContain('.side-toolbar .toolbar-page-translation')

    const stripped = css.replace(/\.side-toolbar\s+\.toolbar-page-translation/g, '')
    expect(stripped).not.toMatch(/(^|[}\n])\s*\.toolbar-page-translation\s*\{/)
  })

  it('scopes .ti-provider-icon-only-container under .side-toolbar', () => {
    const { css } = compile()
    expect(css).toContain('.side-toolbar .ti-provider-icon-only-container')

    const stripped = css.replace(/\.side-toolbar\s+\.ti-provider-icon-only-container/g, '')
    expect(stripped).not.toMatch(/(^|[}\n])\s*\.ti-provider-icon-only-container\s*\{/)
  })

  /* ---------------------------------------------------------------
   *  Geometry and visual behavior must remain unchanged.
   * --------------------------------------------------------------- */
  it('preserves 34×34 button geometry', () => {
    const { css } = compile()
    expect(css).toContain('width: 34px !important')
    expect(css).toContain('height: 34px !important')
    expect(css).toContain('min-width: 34px !important')
    expect(css).toContain('min-height: 34px !important')
    expect(css).toContain('max-height: 34px !important')
  })

  it('preserves dark theme hover override (#424242)', () => {
    const { css } = compile()
    expect(css).toContain('#424242')
  })

  it('preserves icon sizing (22×22)', () => {
    const { css } = compile()
    expect(css).toContain('width: 22px !important')
    expect(css).toContain('height: 22px !important')
  })

  it('preserves light theme hover transform', () => {
    const { css } = compile()
    expect(css).toContain('translateY(-1px)')
  })

  it('preserves active scale transform', () => {
    const { css } = compile()
    expect(css).toContain('scale(0.95)')
  })

  it('keeps dark theme block outside .side-toolbar nesting', () => {
    const { css } = compile()
    expect(css).toContain('.theme-dark .side-toolbar')
    expect(css).toContain(':root.theme-dark .side-toolbar')
  })
})

/**
 * Migrated from legacy _sidepanel.scss (body.sidepanel-context .toolbar-icon).
 * Provides base icon theming: opacity, CSS-variable filter, smooth
 * transitions, and hover brighten. Dark-theme block overrides specific
 * utility icons (filter: invert, opacity: 0.8) and protects
 * provider/page-translation colored icons.
 */
describe('SidepanelToolbar.scss icon behavior (migrated from _sidepanel.scss)', () => {
  it('scopes icon opacity under .side-toolbar', () => {
    const { css } = compile()
    expect(css).toContain('.side-toolbar .toolbar-icon')
    expect(css).toMatch(/\.side-toolbar\s+\.toolbar-icon\s*\{[^}]*opacity:\s*var\(--icon-opacity\)/)
  })

  it('scopes icon filter under .side-toolbar', () => {
    const { css } = compile()
    expect(css).toMatch(/\.side-toolbar\s+\.toolbar-icon\s*\{[^}]*filter:\s*var\(--icon-filter\)/)
  })

  it('scopes icon transition under .side-toolbar', () => {
    const { css } = compile()
    expect(css).toMatch(/\.side-toolbar\s+\.toolbar-icon\s*\{[^}]*transition:\s*opacity 0\.2s ease, filter 0\.2s ease/)
  })

  it('scopes icon hover opacity under .side-toolbar', () => {
    const { css } = compile()
    expect(css).toContain('.side-toolbar .toolbar-icon:hover')
    expect(css).toMatch(/\.side-toolbar\s+\.toolbar-icon:hover\s*\{[^}]*opacity:\s*var\(--icon-hover-opacity\)/)
  })

  it('emits no standalone global .toolbar-icon opacity rule', () => {
    const { css } = compile()
    const stripped = css.replaceAll('.side-toolbar .toolbar-icon', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.toolbar-icon\s*\{/)
  })

  it('preserves dark theme icon inversion for utility buttons', () => {
    const { css } = compile()
    expect(css).toContain('brightness(0) invert(1)')
    expect(css).toContain('#selectElementBtn img')
    expect(css).toContain('#revertActionBtn img')
    expect(css).toContain('#historyBtn img')
    expect(css).toContain('#settingsBtn img')
  })

  it('preserves provider icon protection (no filter in dark theme)', () => {
    const { css } = compile()
    expect(css).toContain('.ti-provider-icon-only')
    // Provider icons should not get the invert filter
    const providerRule = css.match(
      /\.ti-provider-icon-only\s*\{[^}]*\}/
    )
    expect(providerRule).not.toBeNull()
    expect(providerRule[0]).toContain('filter: none')
  })

  it('preserves translate button colored icon protection', () => {
    const { css } = compile()
    expect(css).toContain('.is-translate-btn .ti-btn-status-container img')
    expect(css).toContain('filter: none !important')
  })

  it('does not contain body.sidepanel-context selectors', () => {
    const { css } = compile()
    // Strip CSS comments before checking — the legacy migration comment
    // legitimately mentions the old selector as provenance.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments).not.toMatch(/body\.sidepanel-context\s/)
  })
})
