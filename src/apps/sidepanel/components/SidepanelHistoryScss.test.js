import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..', '..')
const scssPath = resolve(here, 'SidepanelHistory.scss')

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
 * SidepanelHistory.scss rules must be scoped through
 * :where(.extension-sidepanel) so they never leak to Popup/other surfaces.
 * :where() contributes 0 specificity, preserving the cascade precedence
 * of the original bare selectors.
 */
describe('SidepanelHistory.scss ownership scoping', () => {
  /** Top-level structural selectors — must all carry the :where() prefix. */
  const scopedSelectors = [
    '.history-panel',
    '.history-header',
    '.history-list',
    '.history-footer',
    '.export-btn',
    '.clear-all-btn',
    '.history-item',
    '.history-item-header',
    '.language-info',
    '.history-item-actions',
    '.history-item-content',
    '.error-message',
    '.empty-message'
  ]

  for (const sel of scopedSelectors) {
    it(`scopes ${sel} under :where(.extension-sidepanel)`, () => {
      const { css } = compile()
      expect(css).toContain(`:where(.extension-sidepanel) ${sel}`)
    })

    it(`emits no bare ${sel} rule-start`, () => {
      const { css } = compile()
      // Strip every scoped occurrence, then verify no bare rule-start remains
      const escaped = sel.replace('.', '\\.')
      const stripped = css.replace(
        new RegExp(`:where\\(\\.extension-sidepanel\\)\\s+${escaped}`, 'g'),
        ''
      )
      expect(stripped).not.toMatch(new RegExp(`(^|[}\\n])\\s*${escaped}\\s*[\\{,]`, 'm'))
    })
  }

  it('scopes the compound .history-panel.ti-active under :where(.extension-sidepanel)', () => {
    const { css } = compile()
    expect(css).toContain(':where(.extension-sidepanel) .history-panel.ti-active')
  })

  it('scopes .history-header nested children (h3, .close-btn)', () => {
    const { css } = compile()
    // h3 and .close-btn are nested inside .history-header, which is itself
    // nested under :where(.extension-sidepanel), so the compiled selectors
    // must be fully qualified.
    expect(css).toContain(':where(.extension-sidepanel) .history-header h3')
    expect(css).toContain(':where(.extension-sidepanel) .history-header .close-btn')
    expect(css).toContain(':where(.extension-sidepanel) .history-header .close-btn:hover')
  })

  it('scopes the combined .loading-message, .error-message, .empty-message rule', () => {
    const { css } = compile()
    // The comma-separated selector must be fully scoped
    expect(css).toContain(
      ':where(.extension-sidepanel) .loading-message, :where(.extension-sidepanel) .error-message, :where(.extension-sidepanel) .empty-message'
    )
  })
})

describe('SidepanelHistory.scss specificity', () => {
  it(':where() adds zero specificity — scoped .history-panel matches bare class tier', () => {
    const { css } = compile()

    // Extract the selector for .history-panel from the compiled output
    const match = css.match(/(:where\(\.extension-sidepanel\)\s+\.history-panel)\s*\{/)
    expect(match).not.toBeNull()

    // :where() always has specificity 0,0,0 — so the effective specificity
    // of :where(.extension-sidepanel) .history-panel equals that of bare .history-panel (0,1,0).
    // We verify the selector exists in the expected form; the CSS spec
    // guarantees :where() = 0 specificity, so we assert the form rather
    // than computing numeric specificity.
    expect(match[1]).toMatch(/^:where\(\.extension-sidepanel\)\s+\.history-panel$/)
  })

  it('no declaration values were altered by scoping', () => {
    const { css } = compile()

    // Spot-check key declarations that must survive unchanged
    expect(css).toContain('transform: translateX(100%)')
    expect(css).toContain('z-index: 100')
    expect(css).toContain('background-color: #d32f2f')
    expect(css).toContain('filter: invert(1)')
    expect(css).toContain('border-inline-start: 3px solid var(--color-primary)')
    expect(css).toContain('border-inline-start: 3px solid var(--color-success)')
  })
})

/**
 * Pre-Patch-B cascade contract.
 *
 * Legacy layout/_sidepanel.scss and this component file declared the SAME
 * selectors with DIFFERENT values. Patch B deleted the legacy partial on the
 * assumption the component stylesheet already won the cascade.
 *
 * Empirically verified against the SHIPPING build (build-chrome.mjs →
 * vite.config.chrome.js, NODE_ENV=production → cssCodeSplit merged into a
 * single style.css linked by the built sidepanel.html): the legacy cluster
 * emits at byte ~6,400 and the component cluster at byte ~373,000 — the
 * component declarations come LAST, so at equal specificity (0,1,0) the
 * COMPONENT value wins every tie.
 *
 * These tests pin that resolved visual contract: component values must not
 * drift, and legacy values must not reappear here.
 */
describe('SidepanelHistory.scss pre-Patch-B cascade contract (component won)', () => {
  // [selector block, pinned winning declaration, legacy value that must NOT appear]
  const conflicts = [
    {
      sel: ':where(.extension-sidepanel) .history-header {',
      prop: 'padding: 12px',
      legacy: 'padding: 15px'
    },
    {
      sel: ':where(.extension-sidepanel) .history-header h3 {',
      prop: 'font-size: 16px',
      legacy: 'font-size: 18px'
    },
    {
      sel: ':where(.extension-sidepanel) .history-header .close-btn {',
      prop: 'font-size: 18px',
      legacy: 'font-size: 24px'
    },
    {
      sel: ':where(.extension-sidepanel) .history-header .close-btn {',
      prop: 'transition: color 0.15s ease',
      legacy: 'transition: color 0.2s'
    },
    {
      sel: ':where(.extension-sidepanel) .history-list {',
      prop: 'padding: 12px',
      legacy: 'padding: 15px'
    },
    {
      sel: ':where(.extension-sidepanel) .history-footer {',
      prop: 'padding: 12px',
      legacy: 'padding: 15px'
    },
    {
      sel: ':where(.extension-sidepanel) .history-footer {',
      prop: 'justify-content: center',
      legacy: 'justify-content: space-between'
    },
    {
      sel: ':where(.extension-sidepanel) .clear-all-btn {',
      prop: 'background-color: #f44336',
      legacy: 'background-color: var(--color-error)'
    },
    {
      sel: ':where(.extension-sidepanel) .clear-all-btn {',
      prop: 'padding: 4px 12px',
      legacy: 'padding: 5px 15px'
    },
    {
      sel: ':where(.extension-sidepanel) .clear-all-btn {',
      prop: 'gap: 4px',
      legacy: 'gap: 5px'
    },
    {
      sel: ':where(.extension-sidepanel) .clear-all-btn {',
      prop: 'font-size: 14px',
      legacy: 'font-size: 16px'
    },
    {
      sel: ':where(.extension-sidepanel) .clear-all-btn {',
      prop: 'transition: background-color 0.15s ease',
      legacy: 'transition: background-color 0.2s'
    },
    {
      sel: ':where(.extension-sidepanel) .clear-all-btn .clear-all-icon {',
      prop: 'filter: invert(1)',
      legacy: 'filter: var(--icon-filter)'
    }
  ]

  for (const { sel, prop, legacy } of conflicts) {
    it(`pins ${sel.slice(28, -2).trim()} → ${prop}`, () => {
      const { css } = compile()
      const start = css.indexOf(sel)
      expect(start).toBeGreaterThanOrEqual(0)
      const block = css.slice(start, css.indexOf('}', start) + 1)
      expect(block).toContain(prop)
      // The legacy value must not have been adopted
      expect(block).not.toContain(legacy)
    })
  }

  it('pins .history-panel transition to the component 3-part transition (component won over legacy ease-in-out transform-only)', () => {
    const { css } = compile()
    const sel = ':where(.extension-sidepanel) .history-panel {'
    const start = css.indexOf(sel)
    expect(start).toBeGreaterThanOrEqual(0)
    const block = css.slice(start, css.indexOf('}', start) + 1)
    // Component value: transform/visibility/opacity each $transition-slow (0.3s ease).
    // Legacy value was `transition: transform 0.3s ease-in-out` (transform only).
    expect(block).toContain('transition: transform 0.3s ease, visibility 0.3s ease, opacity 0.3s ease')
    expect(block).not.toContain('ease-in-out')
  })

  it('.history-panel.ti-active keeps component visibility/opacity activation state', () => {
    const { css } = compile()
    expect(css).toMatch(
      /\.history-panel\.ti-active\s*\{[^}]*transform:\s*translateX\(0\)[^}]*visibility:\s*visible[^}]*opacity:\s*1/
    )
  })
})
