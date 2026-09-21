import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const scssPath = resolve(here, '_popup.scss')

/**
 * The legacy `--icon-filter` inversion is images-only: every popup element
 * needing it is an `<img>`, while mask icons are currentColor-driven.
 * Pins the compiled positive selector contract, not colors.
 */
describe('_popup.scss image filter contract', () => {
  // Relative imports only, so this file compiles standalone.
  const compile = () => sass.compile(scssPath)

  it('routes the legacy filter to image toolbar icons', () => {
    const { css } = compile()

    const imageRule = css.match(
      /body\.popup-context img\.ti-toolbar-icon\s*\{([^}]*)\}/
    )
    expect(imageRule).not.toBeNull()
    expect(imageRule[1]).toContain('filter: var(--icon-filter)')
  })

  it('keeps MaskIcon out of the filter contract', () => {
    const { css } = compile()

    // Any toolbar-icon rule carrying a filter declaration must be the
    // positive image selector (the transition shorthand mentions filter
    // without a colon, so colon-anchored matching ignores it).
    for (const match of css.matchAll(/([^{]*\.ti-toolbar-icon[^{]*)\{([^}]*)\}/g)) {
      const [, selector, body] = match
      if (/(^|[;{])\s*filter\s*:/.test(body)) {
        expect(selector).toMatch(/img\.ti-toolbar-icon/)
      }
    }
  })
})
