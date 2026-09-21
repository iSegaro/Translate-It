import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..', '..')
const scssPath = resolve(here, 'SidepanelMainContent.scss')

/**
 * Sidepanel CSS is bundled into shared CSS loaded by other surfaces
 * (cssCodeSplit: false), so Sidepanel toolbar rules must be scoped under
 * the Sidepanel body context — never standalone globals. Pins the compiled
 * contract, not colors.
 */
describe('SidepanelMainContent.scss toolbar scoping', () => {
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

  it('scopes .ti-toolbar-icon under the sidepanel root', () => {
    const { css } = compile()

    expect(css).toContain('body.sidepanel-context .ti-toolbar-icon')
  })

  it('emits no standalone global .ti-toolbar-icon rule', () => {
    const { css } = compile()

    // Strip every sidepanel-rooted occurrence; no bare
    // `.ti-toolbar-icon { ... }` selector may remain (the gated clear-btn
    // rule ends with `.ti-toolbar-icon {` but is prefixed, so it survives
    // the strip without matching the bare-selector pattern).
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
