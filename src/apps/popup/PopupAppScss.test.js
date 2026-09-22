import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..')
const scssPath = resolve(here, 'PopupApp.scss')

/**
 * Popup CSS is bundled into shared CSS loaded by other surfaces
 * (cssCodeSplit: false), so popup state rules must be scoped under
 * the popup root — never standalone globals. Pins the compiled
 * contract, not colors.
 */
describe('PopupApp.scss scoping', () => {
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

  it('scopes .loading-container under .popup-wrapper', () => {
    const { css } = compile()

    expect(css).toContain('.popup-wrapper .loading-container')
  })

  it('scopes .error-container under .popup-wrapper', () => {
    const { css } = compile()

    expect(css).toContain('.popup-wrapper .error-container')
  })

  it('scopes .loading-text under .popup-wrapper', () => {
    const { css } = compile()

    expect(css).toContain('.popup-wrapper .loading-text')
  })

  it('scopes .error-message under .popup-wrapper', () => {
    const { css } = compile()

    expect(css).toContain('.popup-wrapper .error-message')
  })

  it('scopes .retry-button under .popup-wrapper', () => {
    const { css } = compile()

    expect(css).toContain('.popup-wrapper .retry-button')
  })

  it('scopes .popup-container under .popup-wrapper', () => {
    const { css } = compile()

    expect(css).toContain('.popup-wrapper .popup-container')
  })

  it('scopes .sticky-header under .popup-wrapper', () => {
    const { css } = compile()

    expect(css).toContain('.popup-wrapper .sticky-header')
  })

  it('emits no standalone global .loading-container rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.popup-wrapper .loading-container', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.loading-container\s*\{/);
  })

  it('emits no standalone global .error-container rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.popup-wrapper .error-container', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.error-container\s*\{/);
  })

  it('emits no standalone global .retry-button rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.popup-wrapper .retry-button', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.retry-button\s*\{/);
  })

  it('emits no standalone global .loading-text rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.popup-wrapper .loading-text', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.loading-text\s*\{/);
  })

  it('emits no standalone global .error-message rule', () => {
    const { css } = compile()

    const stripped = css.replaceAll('.popup-wrapper .error-message', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.error-message\s*\{/);
  })

  it('preserves the root .popup-wrapper rule itself', () => {
    const { css } = compile()

    // The root rule targets the element directly — compound form, not descendant
    expect(css).toMatch(/\.popup-wrapper\s*\{/)
  })
})
