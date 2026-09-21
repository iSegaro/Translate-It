import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scssPath = resolve(here, 'PageTranslationButton.scss')

/**
 * PageTranslationButton.scss contract tests.
 *
 * Verifies:
 * - Popup-only compact override targets ONLY the Popup Header instance
 * - Star hover/focus is fully decoupled from the main button
 * - Star has independent hover styling and correct geometry
 * - Dark-mode selectors use valid plain patterns (no :global())
 */
describe('PageTranslationButton.scss compact scope contract', () => {
  const source = readFileSync(scssPath, 'utf8')

  it('uses a popup-scoped selector for compact icon asymmetric padding', () => {
    expect(source).toContain('.ti-page-translate-btn.compact-wrapper .is-compact-icon')
    expect(source).toContain('padding-left: 2px !important;')
    expect(source).toContain('padding-right: 22px !important;')
  })

  it('does NOT use a bare .compact-wrapper .is-compact-icon rule', () => {
    const bareRuleRegex = /^\.compact-wrapper\s+\.is-compact-icon\b/m
    expect(source).not.toMatch(bareRuleRegex)
  })

  it('does NOT have a popup-only status container shrink override', () => {
    const popupStatusRegex = /^\.ti-page-translate-btn\.compact-wrapper\s+\.ti-btn-status-container\b/m
    expect(source).not.toMatch(popupStatusRegex)
  })

  it('preserves the generic compact-wrapper status container for Sidepanel', () => {
    expect(source).toContain('.compact-wrapper &')
    expect(source).toContain('width: 22px !important;')
    expect(source).toContain('height: 22px !important;')
  })
})

describe('PageTranslationButton.scss hover/focus decoupling', () => {
  const source = readFileSync(scssPath, 'utf8')

  it('does NOT couple .compact-wrapper:hover to .is-compact-icon background', () => {
    expect(source).not.toContain('.compact-wrapper:hover .is-compact-icon')
  })

  it('does NOT couple .compact-wrapper:focus-within to .is-compact-icon background', () => {
    expect(source).not.toContain('.compact-wrapper:focus-within .is-compact-icon')
  })

  it('star button has its own independent hover styling', () => {
    expect(source).toMatch(/\.page-translate-star-btn\s*\{[\s\S]*&:hover\s*\{/)
  })
})

describe('PageTranslationButton.scss star geometry', () => {
  const source = readFileSync(scssPath, 'utf8')

  it('star button has padding: 5px for a 24×24 interactive box (14px glyph + 10px)', () => {
    const starSection = source.slice(
      source.indexOf('.page-translate-star-btn'),
    )
    expect(starSection).toContain('padding: 5px !important;')
  })

  it('star button is absolutely positioned at bottom: -6px; right: 0', () => {
    const starSection = source.slice(
      source.indexOf('.page-translate-star-btn'),
    )
    expect(starSection).toContain('bottom: -6px !important;')
    expect(starSection).toContain('right: 0 !important;')
  })

  it('popup compact width budget = 46px (2 + 22 + 22)', () => {
    // padding-left: 2px + status container: 22px + padding-right: 22px = 46px
    expect(source).toContain('padding-left: 2px !important;')
    expect(source).toContain('padding-right: 22px !important;')
  })
})

describe('PageTranslationButton.scss dark-mode selectors', () => {
  const source = readFileSync(scssPath, 'utf8')

  it('uses plain .theme-dark / .ti-dark-mode selectors (no :global())', () => {
    expect(source).toContain('@at-root .theme-dark &,')
    expect(source).toContain('.ti-dark-mode &')
  })

  it('does NOT contain any :global() selectors anywhere in the file', () => {
    expect(source).not.toMatch(/:global\(/)
  })
})
