import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..', '..')
const scssPath = resolve(here, 'SidepanelMainContent.scss')

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
 * Sidepanel CSS is bundled into shared CSS loaded by other surfaces
 * (cssCodeSplit: false), so Sidepanel toolbar rules must be scoped under
 * the Sidepanel body context — never standalone globals. Pins the compiled
 * contract, not colors.
 */
describe('SidepanelMainContent.scss toolbar scoping', () => {
  it('scopes .ti-toolbar-icon under the sidepanel root', () => {
    const { css } = compile()
    expect(css).toContain('body.sidepanel-context .ti-toolbar-icon')
  })

  it('emits no standalone global .ti-toolbar-icon rule', () => {
    const { css } = compile()
    const stripped = css.replaceAll('body.sidepanel-context .ti-toolbar-icon', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.ti-toolbar-icon\s*\{/)
  })

  it('routes the legacy image filter to img toolbar icons', () => {
    const { css } = compile()
    const imageRule = css.match(
      /body\.sidepanel-context img\.ti-toolbar-icon\s*\{([^}]*)\}/
    )
    expect(imageRule).not.toBeNull()
    expect(imageRule[1]).toContain('filter: var(--icon-filter, none)')
    // Positive contract replaced the negative guard: no :not() needed.
    expect(css).not.toContain(':not(.mask-icon)')
  })
})

describe('SidepanelMainContent.scss selector ownership', () => {
  /* ---------------------------------------------------------------
   *  .ti-icon-button — must be scoped under .sidepanel-wrapper,
   *  never a bare global that could match Popup/shared IconButtons.
   * --------------------------------------------------------------- */
  it('owns .ti-icon-button under .sidepanel-wrapper (not global)', () => {
    const { css } = compile()

    // Scoped rule exists
    expect(css).toContain('.sidepanel-wrapper .ti-icon-button')

    // No bare global `.ti-icon-button {` selector remains.
    // Strip every scoped occurrence, then verify no bare rule-start.
    const stripped = css
      .replace(/\.sidepanel-wrapper\s+\.ti-icon-button/g, 'SCOPE')
      .replace(/body\.sidepanel-context\s+\.ti-icon-button/g, 'SCOPE')
      .replace(/\.theme-dark[^{]*\.ti-icon-button/g, 'SCOPE')
      .replace(/:root\.theme-dark[^{]*\.ti-icon-button/g, 'SCOPE')
    expect(stripped).not.toMatch(/(^|[}\n])\s*\.ti-icon-button\s*[\{,]/m)
  })

  /* ---------------------------------------------------------------
   *  Main layout rules — must all be owned by .sidepanel-wrapper.
   * --------------------------------------------------------------- */
  it('owns .language-controls under .sidepanel-wrapper', () => {
    const { css } = compile()
    expect(css).toContain('.sidepanel-wrapper .language-controls')

    const stripped = css.replace(/\.sidepanel-wrapper\s+\.language-controls/g, '')
    expect(stripped).not.toMatch(/(^|[}\n])\s*\.language-controls\s*\{/)
  })

  it('owns .language-controls--wide under .sidepanel-wrapper', () => {
    const { css } = compile()
    expect(css).toContain('.sidepanel-wrapper .language-controls--wide')
  })

  it('owns .language-selector-row under .sidepanel-wrapper', () => {
    const { css } = compile()
    expect(css).toContain('.sidepanel-wrapper .language-selector-row')
  })

  it('owns .translate-button-row under .sidepanel-wrapper', () => {
    const { css } = compile()
    expect(css).toContain('.sidepanel-wrapper .translate-button-row')
  })

  it('owns .translation-form under .sidepanel-wrapper', () => {
    const { css } = compile()
    expect(css).toContain('.sidepanel-wrapper .translation-form')
  })

  it('owns .output-container under .sidepanel-wrapper', () => {
    const { css } = compile()
    expect(css).toContain('.sidepanel-wrapper .output-container')
  })

  it('owns .center-spacer under .sidepanel-wrapper', () => {
    const { css } = compile()
    expect(css).toContain('.sidepanel-wrapper .center-spacer')
  })

  it('owns .end-spacer under .sidepanel-wrapper', () => {
    const { css } = compile()
    expect(css).toContain('.sidepanel-wrapper .end-spacer')
  })

  /* ---------------------------------------------------------------
   *  Root compound selector: .sidepanel-wrapper.main-content
   *  The root element carries BOTH classes — must use compound form.
   * --------------------------------------------------------------- */
  it('uses compound .sidepanel-wrapper.main-content for root element', () => {
    const { css } = compile()

    // Compound selector present
    expect(css).toMatch(/\.sidepanel-wrapper\.main-content\s*\{/)
    // Descendant form must NOT exist
    expect(css).not.toMatch(/\.sidepanel-wrapper\s+\.main-content\s*\{/)

    // Verify key declarations survive in the compound rule
    const match = css.match(/\.sidepanel-wrapper\.main-content\s*\{([^}]*)\}/)
    expect(match).not.toBeNull()
    expect(match[1]).toContain('display: flex')
    expect(match[1]).toContain('flex: 1')
  })

  /* ---------------------------------------------------------------
   *  body.sidepanel-context protections remain intact.
   * --------------------------------------------------------------- */
  it('preserves body.sidepanel-context toolbar icon protections', () => {
    const { css } = compile()
    expect(css).toContain('body.sidepanel-context .ti-toolbar-icon')
    expect(css).toContain('body.sidepanel-context img.ti-toolbar-icon')
    expect(css).toContain('body.sidepanel-context .ti-icon-button:hover .ti-toolbar-icon')
  })

  /* ---------------------------------------------------------------
   *  Dark theme block stays top-level (not nested under .sidepanel-wrapper)
   *  because .theme-dark is on html/body, an ancestor of .sidepanel-wrapper.
   * --------------------------------------------------------------- */
  it('keeps dark theme block outside .sidepanel-wrapper nesting', () => {
    const { css } = compile()
    // Dark theme selectors must still be present
    expect(css).toContain('.theme-dark .ti-icon-button.row-clear-btn')
    expect(css).toContain('.theme-dark .ti-icon-button.inline-clear-btn')
  })
})
