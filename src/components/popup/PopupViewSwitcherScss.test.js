import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..')
const scssPath = resolve(here, 'PopupViewSwitcher.scss')

const scssImporters = [{
  findFileUrl(url) {
    if (url.startsWith('@/')) {
      return new URL(`file://${resolve(srcDir, url.slice(2))}`)
    }
    return null
  }
}]

/**
 * PopupViewSwitcher.scss is a plain SCSS import (not `<style scoped>`, not
 * CSS-Modules), so theme hooks must be ordinary selectors. This pins the
 * dark-theme color contract and the selector shape without computed styles.
 */
describe('PopupViewSwitcher.scss dark contract', () => {
  it('uses plain theme hooks (no :global() passthrough)', () => {
    const source = readFileSync(scssPath, 'utf8')

    expect(source).not.toContain(':global(')
    expect(source).toContain('.theme-dark &')
    expect(source).toContain('.ti-dark-mode &')
  })

  it('compiles to reachable dark selectors carrying the tab colors', () => {
    const { css } = sass.compile(scssPath, { importers: scssImporters })

    expect(css).not.toContain(':global(')
    expect(css).toContain('.theme-dark .ti-popup-view-switcher')
    // Both theme hooks reach the dark tab-color block.
    expect(css).toContain('.theme-dark .ti-popup-view-switcher .ti-popup-view-switcher__tab')
    expect(css).toContain('.ti-dark-mode .ti-popup-view-switcher .ti-popup-view-switcher__tab')
    // Inactive tabs are muted (secondary), weaker than the active tab.
    expect(css).toContain('color: var(--color-text-secondary);')
    // Hover shifts to the shared action-hover accent.
    expect(css).toContain('color: var(--color-action-hover-accent) !important;')
    // Active uses the LIGHT primary token (dark's --color-primary lost hierarchy).
    expect(css).toContain('color: var(--color-primary-light) !important;')
    expect(css).toContain('background-color: #2d2d2d !important;')
    expect(css).toMatch(/\.theme-dark[^{]*\.ti-popup-view-switcher__pill[^}]*background-color:\s*#2d2d2d/s)
  })

  it('dark theme: inactive secondary, active light-primary, hover/pill unchanged', () => {
    const source = readFileSync(scssPath, 'utf8')
    const { css } = sass.compile(scssPath, { importers: scssImporters })

    // Extract the @at-root dark block (both hooks, never :global()).
    const darkBlock = source.match(
      /@at-root\s+\.theme-dark\s+&,\s*\n\s*\.ti-dark-mode\s+&\s*\{([\s\S]*?)\n\s*\}\s*\n\}/
    )
    expect(darkBlock).toBeTruthy()
    const dark = darkBlock[1]

    // 1. Dark inactive tab uses the muted secondary text token.
    const inactive = dark.match(/\.ti-popup-view-switcher__tab\s*\{([^}]*)\}/)
    expect(inactive).toBeTruthy()
    expect(inactive[1]).toContain('color: var(--color-text-secondary);')
    expect(inactive[1]).not.toContain('var(--color-text)')

    // 2. Dark active tab uses the light primary token.
    const active = dark.match(/&\.is-active\s*\{([^}]*)\}/)
    expect(active).toBeTruthy()
    expect(active[1]).toContain('color: var(--color-primary-light) !important;')
    // Not the darker default primary (bare or with fallback).
    expect(active[1]).not.toContain('var(--color-primary)')
    expect(active[1]).not.toContain('--color-primary,')

    // 3. Dark inactive hover keeps the exact white overlay + accent color.
    const hover = dark.match(/&:not\(\.is-active\):hover\s*\{([^}]*)\}/)
    expect(hover).toBeTruthy()
    expect(hover[1]).toContain('background-color: rgba(255, 255, 255, 0.08) !important;')
    expect(hover[1]).toContain('color: var(--color-action-hover-accent) !important;')

    // 4. Dark pill keeps bg + shadow exactly.
    const pill = dark.match(/\.ti-popup-view-switcher__pill\s*\{([^}]*)\}/)
    expect(pill).toBeTruthy()
    expect(pill[1]).toContain('background-color: #2d2d2d !important;')
    expect(pill[1]).toContain('box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4) !important;')

    // 5. Both theme hooks reachable in compiled CSS for inactive + active.
    for (const hook of ['.theme-dark', '.ti-dark-mode']) {
      expect(css).toContain(`${hook} .ti-popup-view-switcher .ti-popup-view-switcher__tab`)
      expect(css).toMatch(new RegExp(`${hook}[^{]*\\.ti-popup-view-switcher__tab\\.is-active[^}]*color:\\s*var\\(--color-primary-light\\)`))
    }
    expect(css).not.toContain(':global(')

    // 6. Light theme contract unchanged: inactive secondary, inactive hover
    //    normal-text, active primary (base rules outside the dark block).
    const sourceWithoutDark = source.replace(darkBlock[0], '')
    expect(sourceWithoutDark).toMatch(/\.ti-popup-view-switcher__tab\s*\{[^}]*color:\s*var\(--color-text-secondary\);/s)
    expect(sourceWithoutDark).toMatch(/&:not\(\.is-active\):hover\s*\{[^}]*color:\s*var\(--color-text\);/s)
    expect(sourceWithoutDark).toMatch(/&\.is-active\s*\{[^}]*color:\s*var\(--color-primary\);/s)

    // Tokens resolve in both themes (_variables.scss).
    const variables = readFileSync(resolve(srcDir, 'assets/styles/base/_variables.scss'), 'utf8')
    expect(variables).toContain('--color-text-secondary:')
    expect(variables).toContain('--color-primary-light: #42a5f5;')
  })

  it('keeps the light theme tab colors unchanged', () => {
    const source = readFileSync(scssPath, 'utf8')

    // Base (light) rule: muted inactive, normal-text hover (inactive-only),
    // primary active.
    expect(source).toContain('color: var(--color-text-secondary);')
    expect(source).toMatch(/&:not\(\.is-active\):hover\s*\{[^}]*color:\s*var\(--color-text\);/s)
    expect(source).toMatch(/&\.is-active\s*\{[^}]*color:\s*var\(--color-primary\);/s)
  })

  it('applies tab hover background only to inactive tabs (pill owns active surface)', () => {
    const source = readFileSync(scssPath, 'utf8')
    const { css } = sass.compile(scssPath, { importers: scssImporters })

    // Inactive-only hover in both the base (light) and dark contracts.
    expect(source).toMatch(/&:not\(\.is-active\):hover\s*\{[^}]*background-color:\s*rgba\(0,\s*0,\s*0,\s*0\.08\)/s)
    expect(source).toMatch(/&:not\(\.is-active\):hover\s*\{[^}]*background-color:\s*rgba\(255,\s*255,\s*255,\s*0\.08\)\s*!important/s)

    // Reachable compiled selectors for light + dark.
    expect(css).toContain('.ti-popup-view-switcher__tab:not(.is-active):hover')
    expect(css).toContain('.theme-dark .ti-popup-view-switcher .ti-popup-view-switcher__tab:not(.is-active):hover')

    // No unqualified tab :hover rule paints a background over the pill.
    const tabBlock = source.match(/\.ti-popup-view-switcher__tab\s*\{[\s\S]*?^\}/m)?.[0] ?? ''
    expect(tabBlock).toBeTruthy()
    expect(tabBlock).not.toMatch(/(^|\s)&:hover\s*\{/)

    // The pill remains the sole owner of the active background/shadow.
    const isActiveBlocks = [...source.matchAll(/&\.is-active\s*\{([^}]*)\}/g)].map((m) => m[1])
    expect(isActiveBlocks.length).toBeGreaterThan(0)
    for (const block of isActiveBlocks) {
      expect(block).not.toMatch(/background-color/)
      expect(block).not.toMatch(/box-shadow/)
    }
  })

  it('moves the active background to the sliding pill (tabs keep only color)', () => {
    const source = readFileSync(scssPath, 'utf8')
    const { css } = sass.compile(scssPath, { importers: scssImporters })

    // Pill carries the light + dark active surfaces with the static shadow.
    expect(source).toMatch(/\.ti-popup-view-switcher__pill\s*\{[^}]*background-color:\s*var\(--color-surface,\s*#ffffff\)/s)
    expect(css).toContain('background-color: var(--color-surface, #ffffff);')
    // The tab .is-active rule no longer sets its own background or shadow;
    // the pill provides the surface so it can slide between tabs.
    const tabBlock = source.match(/\.ti-popup-view-switcher__tab\s*\{[\s\S]*?^\}/m)?.[0] ?? source
    expect(tabBlock).toBeTruthy()
    const isActiveBlocks = [...source.matchAll(/&\.is-active\s*\{([^}]*)\}/g)].map((m) => m[1])
    expect(isActiveBlocks.length).toBeGreaterThan(0)
    for (const block of isActiveBlocks) {
      expect(block).not.toMatch(/background-color/)
      expect(block).not.toMatch(/box-shadow/)
    }
  })

  it('animates the pill with the requested easing and crossfades tab color', () => {
    const source = readFileSync(scssPath, 'utf8')

    expect(source).toContain('cubic-bezier(0.65, 0, 0.35, 1)')
    expect(source).toMatch(
      /\.ti-popup-view-switcher__pill\s*\{[^}]*transition:\s*left\s+0\.2s\s+cubic-bezier\(0\.65,\s*0,\s*0\.35,\s*1\),\s*width\s+0\.2s\s+cubic-bezier\(0\.65,\s*0,\s*0\.35,\s*1\)/s
    )
    // No scale/bounce/spring or animated glow/shadow on the pill.
    expect(source).not.toMatch(/\.ti-popup-view-switcher__pill[^}]*scale\(/s)
    // Tab content crossfades color quickly (0.15s).
    expect(source).toMatch(/\.ti-popup-view-switcher__tab\s*\{[\s\S]*?transition:[^;]*color\s+0\.15s/s)
  })

  it('keeps the responsive contract (icon-only tabs at <=380px)', () => {
    const source = readFileSync(scssPath, 'utf8')

    expect(source).toMatch(/@media\s*\(max-width:\s*380px\)\s*\{[^}]*\.ti-popup-view-switcher__tab\s*\{[^}]*width:\s*28px;[^}]*padding:\s*0;/s)
    expect(source).toMatch(/@media\s*\(max-width:\s*380px\)[\s\S]*?\.ti-popup-view-switcher__label\s*\{[^}]*display:\s*none;/s)
  })

  it('disables pill motion and tab transitions under reduced motion', () => {
    const source = readFileSync(scssPath, 'utf8')

    expect(source).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.ti-popup-view-switcher__pill\s*\{[^}]*transition:\s*none;[\s\S]*?\.ti-popup-view-switcher__tab\s*\{[^}]*transition-duration:\s*0s;/s
    )
  })
})
