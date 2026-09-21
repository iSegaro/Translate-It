import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scssPath = resolve(here, 'PageTranslationButton.scss')

/**
 * PageTranslationButton.scss contract tests.
 *
 * Verifies that the popup-only compact override targets ONLY the Popup
 * Header instance (via .ti-page-translate-btn) and does NOT leak into
 * Sidepanel or other compact usages.
 */
describe('PageTranslationButton.scss compact scope contract', () => {
  const source = readFileSync(scssPath, 'utf8')

  it('uses a popup-scoped selector for compact icon asymmetric padding', () => {
    // The popup-scoped rule MUST be present with left:2 / right:20 to
    // reclaim header width while keeping ~3px glyph clearance from the
    // Auto-Translate star (22×22 box, absolute right-aligned).
    expect(source).toContain('.ti-page-translate-btn.compact-wrapper .is-compact-icon')
    expect(source).toContain('padding-left: 2px !important;')
    expect(source).toContain('padding-right: 20px !important;')
  })

  it('does NOT use a bare .compact-wrapper .is-compact-icon rule', () => {
    // There must be NO bare .compact-wrapper .is-compact-icon rule that
    // would leak the compact padding to Sidepanel or other surfaces.
    const bareRuleRegex = /^\.compact-wrapper\s+\.is-compact-icon\b/m
    expect(source).not.toMatch(bareRuleRegex)
  })

  it('does NOT have a popup-only status container shrink override', () => {
    // The popup-only 20×20 override must be removed; only the generic
    // 22×22 rule (inside .ti-btn-status-container with .compact-wrapper &)
    // remains. This keeps Sidepanel layout box at 22px.
    const popupStatusRegex = /^\.ti-page-translate-btn\.compact-wrapper\s+\.ti-btn-status-container\b/m
    expect(source).not.toMatch(popupStatusRegex)
  })

  it('preserves the generic compact-wrapper status container for Sidepanel', () => {
    // The generic 22px rule must still exist so Sidepanel compact instances
    // retain their layout.
    expect(source).toContain('.compact-wrapper &')
    expect(source).toContain('width: 22px !important;')
    expect(source).toContain('height: 22px !important;')
  })
})
