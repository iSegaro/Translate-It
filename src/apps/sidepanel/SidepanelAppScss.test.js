import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..', '..')
const scssPath = resolve(here, 'SidepanelApp.scss')

/**
 * Sidepanel CSS is bundled into shared CSS loaded by other surfaces
 * (cssCodeSplit: false), so Sidepanel state rules must be scoped under
 * the Sidepanel body context — never standalone globals. Pins the compiled
 * contract, not colors.
 */
describe('SidepanelApp.scss scoping', () => {
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

  it('scopes .loading-container under .extension-sidepanel', () => {
    const { css } = compile()

    expect(css).toContain('.extension-sidepanel .loading-container')
  })

  it('scopes .loading-text under .extension-sidepanel', () => {
    const { css } = compile()

    expect(css).toContain('.extension-sidepanel .loading-text')
  })

  it('scopes .error-container under .extension-sidepanel', () => {
    const { css } = compile()

    expect(css).toContain('.extension-sidepanel .error-container')
  })

  it('scopes .error-icon under .extension-sidepanel', () => {
    const { css } = compile()

    expect(css).toContain('.extension-sidepanel .error-icon')
  })

  it('scopes .error-container h2 under .extension-sidepanel', () => {
    const { css } = compile()

    expect(css).toContain('.extension-sidepanel .error-container h2')
  })

  it('scopes .error-message under .extension-sidepanel', () => {
    const { css } = compile()

    expect(css).toContain('.extension-sidepanel .error-message')
  })

  it('scopes .retry-button under .extension-sidepanel', () => {
    const { css } = compile()

    expect(css).toContain('.extension-sidepanel .retry-button')
  })

  it('scopes .retry-button:hover under .extension-sidepanel', () => {
    const { css } = compile()

    expect(css).toContain('.extension-sidepanel .retry-button:hover')
  })

  it('emits no standalone global .loading-container rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.extension-sidepanel .loading-container', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.loading-container\s*\{/);
  })

  it('emits no standalone global .error-container rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.extension-sidepanel .error-container', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.error-container\s*\{/);
  })

  it('emits no standalone global .retry-button rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.extension-sidepanel .retry-button', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.retry-button\s*\{/);
  })

  it('emits no standalone global .loading-text rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.extension-sidepanel .loading-text', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.loading-text\s*\{/);
  })

  it('emits no standalone global .error-message rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.extension-sidepanel .error-message', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.error-message\s*\{/);
  })

  it('emits no standalone global .error-icon rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.extension-sidepanel .error-icon', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.error-icon\s*\{/);
  })

  it('emits no standalone global .error-container h2 rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.extension-sidepanel .error-container', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.error-container\s+h2\s*\{/);
  })

  it('uses .extension-sidepanel as the root selector for all rules', () => {
    const { css } = compile()

    // .extension-sidepanel has no direct declarations (only nested rules),
    // so Sass compiles the root block away. Verify every emitted selector
    // is prefixed with .extension-sidepanel.
    const selectorPattern = /\.extension-sidepanel\s/g
    const matches = css.match(selectorPattern)
    expect(matches).not.toBeNull()
    expect(matches.length).toBeGreaterThanOrEqual(7)
  })
})
