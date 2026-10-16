import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'
import postcss from 'postcss'

const specificityScore = (selector) => {
  const ids = (selector.match(/#[\w-]+/g) || []).length
  const classes = (selector.match(/\.[\w-]+/g) || []).length
  const pseudoClasses = (selector.match(/:(?!:)[\w-]+/g) || []).length
  return ids * 10000 + (classes + pseudoClasses) * 100
}

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..', '..')
const scssPath = resolve(here, 'SidepanelToolbar.scss')
const providerSelectorScssPath = resolve(srcDir, 'components', 'shared', 'ProviderSelector.scss')

const compile = (path = scssPath) => sass.compile(path, {
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

  it('migrates Select/Revert glyphs to MaskIcon: no img invert, currentColor flips the theme', () => {
    const { css } = compile()
    // MaskIcon spans (ADR-001 currentColor) need no img-invert rule: color
    // tokens on `.toolbar-button` (Select) and the badge flip light/dark.
    expect(css).not.toContain('#selectElementBtn img')
    expect(css).not.toContain('#revertActionBtn img')
    // The remaining <img>-glyph utility invert (restore button) is untouched.
    expect(css).toContain('brightness(0) invert(1)')
    expect(css).not.toMatch(/#historyBtn\s+img/)
    expect(css).not.toMatch(/#settingsBtn\s+img/)
    const maskRule = css.match(/\.side-toolbar\s+\.toolbar-mask-icon\s*\{([^}]*)\}/)
    expect(maskRule).not.toBeNull()
    expect(maskRule[1]).not.toMatch(/filter\s*:/)
  })

  it('lets ProviderSelector dark inversion win over Sidepanel rail styles', () => {
    const sidepanelCss = compile().css
    const providerCss = compile(providerSelectorScssPath).css
    const filters = (css) => {
      const rules = []
      postcss.parse(css).walkRules((rule) => {
        if (rule.parent.type !== 'root') return
        for (const declaration of rule.nodes.filter((node) => node.type === 'decl' && node.prop === 'filter')) {
          rules.push({
            selectors: rule.selectors,
            value: declaration.value,
            important: declaration.important,
          })
        }
      })
      return rules
    }
    const rules = (providerFirst) => {
      return (providerFirst ? [providerCss, sidepanelCss] : [sidepanelCss, providerCss])
        .flatMap(filters)
    }
    const winningFilter = (compiledRules, element) => {
      const matching = compiledRules.flatMap((rule, order) => rule.selectors
        .filter((selector) => element.matches(selector))
        .map((selector) => ({ ...rule, order, specificity: specificityScore(selector) })))
      return matching.sort((a, b) => Number(a.important) - Number(b.important) ||
        a.specificity - b.specificity || a.order - b.order).at(-1)
    }

    const previousRootClass = document.documentElement.className
    const host = document.createElement('div')
    host.innerHTML = '<div class="side-toolbar"><button class="ti-provider-icon-button"><img class="ti-provider-icon-only ti-invert-dark"></button></div><button><img class="ti-api-provider-icon ti-invert-dark"></button>'
    document.body.appendChild(host)
    const iconOnly = host.querySelector('.ti-provider-icon-only')
    const splitIcon = host.querySelector('.ti-api-provider-icon')

    try {
      for (const providerFirst of [true, false]) {
        document.documentElement.classList.add('theme-dark')
        let filter = winningFilter(rules(providerFirst), iconOnly)
        expect(filter?.value).toBe('invert(1) brightness(2)')
        expect(filter?.important).toBe(true)

        iconOnly.classList.remove('ti-invert-dark')
        expect(winningFilter(rules(providerFirst), iconOnly)).toBeUndefined()
        iconOnly.classList.add('ti-invert-dark')

        document.documentElement.classList.remove('theme-dark')
        filter = winningFilter(rules(providerFirst), iconOnly)
        expect(filter).toBeUndefined()

        document.documentElement.classList.add('theme-dark')
        filter = winningFilter(rules(providerFirst), splitIcon)
        expect(filter?.value).toBe('invert(1) brightness(2)')
        expect(filter?.important).toBe(true)
      }
    } finally {
      document.documentElement.className = previousRootClass
      host.remove()
    }
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

/**
 * Desktop FAB toggle additions. The glyph is a MaskIcon (ADR-001) that must
 * never pick up the rail's img filter, and the rail gains ~48px of content it
 * has no overflow handling for — both changes are pinned here.
 */
describe('SidepanelToolbar.scss Desktop FAB toggle contract', () => {
  const compileCss = () => compile().css

  it('styles the mask glyph with the rail opacity and NO filter (no dark double-invert)', () => {
    const { css } = compile()
    const rule = css.match(/\.side-toolbar\s+\.fab-toggle-icon\s*\{[^}]*\}/)
    expect(rule).not.toBeNull()
    expect(rule[0]).toContain('opacity: var(--icon-opacity)')
    // A mask is already currentColor; inverting it in dark would flip it back.
    expect(rule[0]).not.toMatch(/filter\s*:/)
    // It is not the .toolbar-icon rule, whose filter is what we are avoiding.
    expect(css).not.toMatch(/\.fab-toggle-icon[^{}]*\{[^}]*--icon-filter/)
  })

  it('makes the FAB row inherit the rail colour (button UA colour would hide the mask in dark)', () => {
    const { css } = compile()
    const rule = css.match(/\.side-toolbar\s+#fabVisibilityBtn\s*\{[^}]*\}/)
    expect(rule).not.toBeNull()
    expect(rule[0]).toContain('color: inherit')
    // Scoped to the new row only: existing rows keep their current styling.
    expect(css.match(/#fabVisibilityBtn/g)).toHaveLength(1)
  })

  it('compacts row gaps at short heights without touching the 34×34 geometry', () => {
    const css = compileCss()
    const media = css.match(/@media \(max-height:\s*620px\)\s*\{[\s\S]*?\n\}/)
    expect(media).not.toBeNull()
    expect(media[0]).toContain('.side-toolbar .toolbar-group')
    expect(media[0]).toContain('.side-toolbar .toolbar-group-bottom')
    expect(media[0]).toContain('gap: 8px')
    // Compaction is gap-only (the `max-height` condition itself excluded):
    // the button box contract stays exactly 34×34.
    const mediaBody = media[0].replace(/@media[^{]+/, '')
    expect(mediaBody).not.toMatch(/\b(?:width|height)\s*:/)
    expect(css).toContain('width: 34px !important')
    expect(css).toContain('height: 34px !important')
    // Both group rules stay scoped under .side-toolbar (ownership contract).
    expect(css).toContain('.side-toolbar .toolbar-group')
    expect(css).toContain('.side-toolbar .toolbar-group-bottom')
  })

  it('makes only the rail scrollable below the measured content floor', () => {
    const css = compileCss()
    const media = css.match(/@media \(max-height:\s*500px\)\s*\{[\s\S]*?\n\}/)
    expect(media).not.toBeNull()

    // Measured floor: the compacted column needs ~483px, a 520px rail fits
    // and a 480px rail clips — so the scroll rule must stay strictly below
    // 520px, leaving both the normal view and the 520px view untouched.
    const threshold = Number(media[0].match(/max-height:\s*(\d+)px/)[1])
    expect(threshold).toBeLessThan(520)

    expect(media[0]).toContain('.side-toolbar')
    expect(media[0]).toContain('overflow-y: auto')
    // Scrollbar stays usable in a 44–50px column: thin standard property,
    // token colours (light/dark + RTL leading edge), slim WebKit thumb.
    expect(media[0]).toContain('scrollbar-width: thin')
    expect(media[0]).toContain('scrollbar-color: var(--color-text-secondary) transparent')
    expect(media[0]).toContain('::-webkit-scrollbar')
    expect(media[0]).toContain('width: 6px')
    expect(media[0]).toContain('overscroll-behavior: contain')

    // The block may only declare scroll behaviour / scrollbar chrome — the
    // 34×34 geometry and layout are unreachable from here.
    const allowed = new Set([
      'max-height', 'overflow-y', 'overscroll-behavior', 'scrollbar-width',
      'scrollbar-color', 'width', 'background-color', 'border-radius'
    ])
    // `(?!:)` keeps pseudo-elements (`.side-toolbar::-webkit-scrollbar`)
    // out of the declaration scan — only real `property: value` pairs count.
    const declared = [...media[0].matchAll(/([a-z-]+)\s*:\s*(?!:)[^;{}]+/g)]
      .map((match) => match[1])
      .filter((name) => !allowed.has(name))
    expect(declared).toEqual([])

    // At normal heights the rail itself is still a plain non-scrolling box.
    const base = css.match(/\.side-toolbar\s*\{[^}]*\}/)
    expect(base).not.toBeNull()
    expect(base[0]).not.toMatch(/overflow/)
    expect(css).toContain('width: 34px !important')
    expect(css).toContain('height: 34px !important')
  })
})

describe('SidepanelToolbar.scss accessible icon contract', () => {
  it('keeps currentColor mask glyphs unfiltered in dark mode', () => {
    const { css } = compile()
    const maskRule = css.match(/\.side-toolbar\s+\.toolbar-mask-icon\s*\{([^}]*)\}/)

    expect(maskRule).not.toBeNull()
    expect(maskRule[1]).toContain('color: inherit')
    expect(maskRule[1]).toContain('opacity: var(--icon-opacity')
    expect(maskRule[1]).not.toMatch(/filter\s*:/)
    expect(css).not.toMatch(/\.theme-dark[^{}]*\.toolbar-mask-icon\s*\{[^}]*filter\s*:/)
  })

  it('preserves focus-visible over the important outline reset and styles disabled buttons', () => {
    const { css } = compile()
    const focusRule = css.match(/\.side-toolbar\s+\.toolbar-button:focus-visible\s*\{([^}]*)\}/)
    const baseRule = css.match(/\.side-toolbar\s+\.toolbar-button,\s*\.side-toolbar\s+\.ti-provider-icon-button,\s*\.side-toolbar\s+\.ti-btn,\s*\.side-toolbar\s+button\s*\{([^}]*)\}/)

    expect(baseRule?.[1]).toContain('outline: none !important')
    expect(focusRule?.[1]).toMatch(/outline:\s*2px solid .* !important/)
    const baseSpecificity = Math.max(...baseRule[0].split(',').map((selector) => specificityScore(selector)))
    expect(specificityScore(focusRule[0].split('{')[0])).toBeGreaterThan(baseSpecificity)
    expect(css).toMatch(/\.side-toolbar\s+\.toolbar-button:disabled\s*\{[^}]*opacity:\s*0\.[0-9]+ !important/)
  })

  it('keeps brand PDF and Subtitle images unfiltered', () => {
    const { css } = compile()
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]

    for (const button of ['pdfBtn', 'subtitleBtn']) {
      const rule = rules.find(([, selectors]) => selectors.split(',')
        .some((selector) => selector.trim().endsWith(`#${button} img`)))
      expect(rule, `compiled ${button} image rule`).toBeDefined()
      expect(rule[2]).toContain('filter: none !important')
      expect(rule[2]).toContain('opacity: 1 !important')
    }
  })
})

/**
 * Revert badge pair (Phase 3A). Select keeps the shared 34×34 row; its
 * wrapper adds 16px of reserved block space (50px flow box) and the badge
 * is an independent 24×24 native target anchored to the wrapper's
 * inline-end corner. The 16px surface sits centred in that target, so the
 * visible descent lives inside the wrapper — never in the group gap.
 */
describe('SidepanelToolbar.scss revert badge contract', () => {
  const compileCss = () => compile().css
  const badgeSelector = '.side-toolbar .toolbar-select-action button.toolbar-revert-badge'

  it('reserves a 34×50 relative flow box for the Select + badge pair', () => {
    const css = compileCss()
    const rule = css.match(/\.side-toolbar\s+\.toolbar-select-action\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule[1]).toContain('position: relative')
    expect(rule[1]).toContain('width: 34px')
    expect(rule[1]).toContain('height: 50px')
    // Scoped under .side-toolbar (ownership contract).
    expect(css).toContain('.side-toolbar .toolbar-select-action')
  })

  it('keeps the badge a 24×24 target (never shrunk) on logical corner offsets', () => {
    const css = compileCss()
    expect(css).toContain(badgeSelector)
    const rule = css.match(/button\.toolbar-revert-badge\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    // Never shrink the target to fit: every box prop stays 24px.
    for (const declaration of [
      'width: 24px !important',
      'height: 24px !important',
      'min-width: 24px !important',
      'min-height: 24px !important',
      'max-height: 24px !important'
    ]) {
      expect(rule[1]).toContain(declaration)
    }
    expect(rule[1]).toContain('position: absolute')
    expect(rule[1]).toContain('inset-inline-end: 0')
    expect(rule[1]).toContain('inset-block-end: 0')
  })

  it('uses logical properties so RTL mirrors the badge (no physical offsets)', () => {
    const css = compileCss()
    expect(css).toContain('inset-inline-end: 0')
    expect(css).toContain('inset-block-end: 0')
    const rule = css.match(/button\.toolbar-revert-badge\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule[1]).not.toMatch(/(^|[;{]\s*)(right|left|top|bottom)\s*:/)
  })

  it('centers an opaque 16px surface carrying the glyph', () => {
    const css = compileCss()
    const surface = css.match(/\.revert-badge-surface\s*\{([^}]*)\}/)
    expect(surface).not.toBeNull()
    expect(surface[1]).toContain('width: 16px')
    expect(surface[1]).toContain('height: 16px')
    expect(surface[1]).toContain('border-radius: 50%')
    // Opaque theme surface: Select's hover paint can never tint the disc.
    expect(surface[1]).toContain('background-color: var(--color-surface-alt)')
    expect(surface[1]).toMatch(/display:\s*flex/)
    expect(surface[1]).toMatch(/align-items:\s*center/)
    expect(surface[1]).toMatch(/justify-content:\s*center/)

    const icon = css.match(/\.revert-badge-icon\s*\{([^}]*)\}/)
    expect(icon).not.toBeNull()
    expect(icon[1]).toContain('opacity: 0.65')
    expect(icon[1]).not.toMatch(/filter\s*:/)
    expect(css).toMatch(/button\.toolbar-revert-badge:hover\s+\.revert-badge-icon/)
  })

  it('overrides the blanket 34×34 geometry and press transforms at higher specificity', () => {
    const css = compileCss()
    const baseRule = css.match(/\.side-toolbar\s+\.toolbar-button,\s*\.side-toolbar\s+\.ti-provider-icon-button,\s*\.side-toolbar\s+\.ti-btn,\s*\.side-toolbar\s+button\s*\{([^}]*)\}/)
    expect(baseRule?.[1]).toContain('width: 34px !important')

    const badgeRule = css.match(new RegExp(`${badgeSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
    expect(badgeRule).not.toBeNull()
    expect(badgeRule[1]).toContain('width: 24px !important')
    const baseSpecificity = Math.max(...baseRule[0].split(',').map((selector) => specificityScore(selector)))
    expect(specificityScore(badgeSelector)).toBeGreaterThan(baseSpecificity)

    // Native press only: the visible surface never shifts under the cursor.
    expect(badgeRule[0] + css).toContain('transform: none !important')
    expect(css).toMatch(/button\.toolbar-revert-badge:active[^{]*\{[^}]*transform:\s*none !important/)
  })

  it('keeps badge focus-visible beating the outline reset', () => {
    const css = compileCss()
    const focusRule = css.match(/button\.toolbar-revert-badge:focus-visible\s*\{([^}]*)\}/)
    expect(focusRule?.[1]).toMatch(/outline:\s*2px solid .* !important/)
    const baseRule = css.match(/\.side-toolbar\s+\.toolbar-button,\s*\.side-toolbar\s+\.ti-provider-icon-button,\s*\.side-toolbar\s+\.ti-btn,\s*\.side-toolbar\s+button\s*\{([^}]*)\}/)
    expect(baseRule?.[1]).toContain('outline: none !important')
    const baseSpecificity = Math.max(...baseRule[0].split(',').map((selector) => specificityScore(selector)))
    expect(specificityScore(`${badgeSelector}:focus-visible`)).toBeGreaterThan(baseSpecificity)
  })

  it('applies the badge glyph colour via currentColor tokens in both themes', () => {
    const css = compileCss()
    const rule = css.match(/button\.toolbar-revert-badge\s*\{([^}]*)\}/)
    expect(rule[1]).toContain('color: var(--color-text')
    // Dark hover override for the rail is preserved.
    expect(css).toContain('#424242')
    // No dark img-invert rule may target the migrated MaskIcon glyphs.
    expect(css).not.toContain('#selectElementBtn img')
    expect(css).not.toContain('#revertActionBtn img')
  })

  it('matches the real DOM: badge selectors hit the badge, not Select or Mouse Hover', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div class="side-toolbar"><div class="toolbar-group">'
      + '<div class="toolbar-select-action"><button id="selectElementBtn" class="toolbar-button"></button>'
      + '<button id="revertActionBtn" class="toolbar-revert-badge" type="button">'
      + '<span class="revert-badge-surface" aria-hidden="true"></span></button></div>'
      + '<button class="toolbar-button"></button></div></div>'
    document.body.appendChild(host)
    try {
      const badge = host.querySelector('#revertActionBtn')
      const select = host.querySelector('#selectElementBtn')
      const hover = host.querySelector('.toolbar-group > .toolbar-button')
      expect(badge.matches('.side-toolbar .toolbar-select-action button.toolbar-revert-badge')).toBe(true)
      expect(select.matches('.side-toolbar .toolbar-select-action button.toolbar-revert-badge')).toBe(false)
      expect(hover.matches('.side-toolbar .toolbar-select-action button.toolbar-revert-badge')).toBe(false)
      expect(badge.matches('.side-toolbar .toolbar-select-action .revert-badge-surface')).toBe(false)
      expect(host.querySelector('.revert-badge-surface').matches('.side-toolbar .toolbar-select-action .revert-badge-surface')).toBe(true)
    } finally {
      host.remove()
    }
  })

  it('leaves Mouse Hover alone: no wrapper-level hover and a transparent badge hover', () => {
    const css = compileCss()
    expect(css).not.toMatch(/\.toolbar-select-action:hover/)
    const rule = css.match(/button\.toolbar-revert-badge\s*\{([^}]*)\}/)
    expect(rule[1]).toContain('background: transparent !important')
    expect(css).toMatch(/button\.toolbar-revert-badge:hover[^{]*\{[^}]*background-color:\s*transparent !important/)
    // Geometry reasoning: the 24px target at block-end 0 sits inside the
    // 50px wrapper box (24 ≤ 50), so it can never cross the 14px default /
    // 8px compacted group gap onto Mouse Hover.
    expect(css).toContain('gap: 14px')
    expect(css).toContain('gap: 8px')
  })

  it('keeps compact and scroll behavior with the folded heights', () => {
    const css = compileCss()
    // Compaction stays gap-only: the 50px wrapper (34 + 16 reserved) survives.
    const compact = css.match(/@media \(max-height:\s*620px\)\s*\{[\s\S]*?\n\}/)
    expect(compact).not.toBeNull()
    expect(compact[0].replace(/@media[^{]+/, '')).not.toMatch(/\b(?:width|height)\s*:/)
    expect(compact[0]).toContain('gap: 8px')
    // Scroll floor stays strictly below the 520px fit.
    const scroll = css.match(/@media \(max-height:\s*500px\)\s*\{[\s\S]*?\n\}/)
    expect(scroll).not.toBeNull()
    expect(Number(scroll[0].match(/max-height:\s*(\d+)px/)[1])).toBeLessThan(520)
    expect(scroll[0]).toContain('overflow-y: auto')
  })

  it('draws the badge focus ring inside the target (never clipped)', () => {
    const css = compileCss()
    const focusRule = css.match(/button\.toolbar-revert-badge:focus-visible\s*\{([^}]*)\}/)
    expect(focusRule?.[1]).toMatch(/outline:\s*2px solid .* !important/)
    // Negative offset keeps the ring ink inside the 24px box: neither the
    // rail edge nor the @max-height 500px scrollport edge can cut it, in
    // either writing direction.
    expect(focusRule?.[1]).toContain('outline-offset: -2px !important')
  })

  it('keeps the flush-anchored target inside the scrollport in both rail layouts', () => {
    const css = compileCss()
    const badge = css.match(/button\.toolbar-revert-badge\s*\{([^}]*)\}/)
    // Flush anchor: the target's inline-end edge coincides with the wrapper
    // edge, and the target itself is never shrunk below 24px.
    expect(badge[1]).toContain('inset-inline-end: 0')
    expect(badge[1]).toContain('width: 24px !important')
    expect(badge[1]).toContain('height: 24px !important')
    // Row arithmetic from the rail contract: 44px rail minus the 1px border
    // → 43px content; the 34px wrapper centres → 4.5..38.5, so the flush
    // 24px target spans 14.5..38.5 — 4.5px inside the content edge.
    const wrapperWidth = 34
    const targetWidth = 24
    const contentWidth = 44 - 1
    const wrapperStart = (contentWidth - wrapperWidth) / 2
    expect(wrapperStart + wrapperWidth - targetWidth).toBeGreaterThanOrEqual(0)
    expect(wrapperStart + wrapperWidth).toBeLessThanOrEqual(contentWidth)
    // @max-height 500px the rail scrolls: scrollbar-width: thin reserves
    // ~8px, the scrollport becomes ~35px and the wrapper re-centres to
    // 0.5..34.5 → target 10.5..34.5, 0.5px clearance, never clipped.
    const scrollport = contentWidth - 8
    const scrolledStart = (scrollport - wrapperWidth) / 2
    expect(scrolledStart + wrapperWidth - targetWidth).toBeGreaterThanOrEqual(0)
    expect(scrolledStart + wrapperWidth).toBeLessThanOrEqual(scrollport)
  })

  it('keeps badge hover transparent through the dark cascade while preserving dark button and surface hover', () => {
    const css = compileCss()
    const compiledRules = []
    postcss.parse(css).walkRules((rule) => {
      if (rule.parent.type !== 'root') return
      for (const declaration of rule.nodes.filter((node) =>
        node.type === 'decl' && ['background', 'background-color'].includes(node.prop))) {
        compiledRules.push({
          selectors: rule.selectors,
          prop: declaration.prop,
          value: declaration.value,
          important: declaration.important,
          order: compiledRules.length
        })
      }
    })

    const previousRootClass = document.documentElement.className
    const host = document.createElement('div')
    host.innerHTML = '<div class="side-toolbar"><div class="toolbar-select-action">'
      + '<button class="toolbar-revert-badge test-hover">'
      + '<span class="revert-badge-surface"></span></button></div>'
      + '<button class="toolbar-button test-hover"></button></div>'
    document.body.appendChild(host)
    const badge = host.querySelector('.toolbar-revert-badge')
    const surface = host.querySelector('.revert-badge-surface')
    const ordinary = host.querySelector('.toolbar-button')

    const winningBackground = (element) => {
      const matching = compiledRules.flatMap((rule) => rule.selectors
        .filter((selector) => element.matches(selector.replaceAll(':hover', '.test-hover')))
        .map((selector) => ({
          ...rule,
          specificity: specificityScore(selector)
        })))
      return matching.sort((a, b) => Number(a.important) - Number(b.important) ||
        a.specificity - b.specificity || a.order - b.order).at(-1)
    }

    try {
      const assertCascade = (darkSelector) => {
        host.classList.toggle('theme-dark', darkSelector === 'ancestor')
        document.documentElement.classList.toggle('theme-dark', darkSelector === 'root')

        const badgeWinner = winningBackground(badge)
        expect(badgeWinner?.value).toBe('transparent')
        expect(badgeWinner?.important).toBe(true)

        const ordinaryWinner = winningBackground(ordinary)
        expect(ordinaryWinner?.value).toBe(
          darkSelector ? '#424242' : 'rgba(0, 0, 0, 0.08)'
        )
        expect(ordinaryWinner?.important).toBe(true)

        const surfaceWinner = winningBackground(surface)
        expect(surfaceWinner?.value).toBe('var(--toolbar-link-hover-bg-color)')
        expect(surfaceWinner?.important).toBeFalsy()
      }

      // Light state, .theme-dark ancestor selector, and :root.theme-dark
      // selector are all exercised with actual Element.matches checks.
      assertCascade('')
      assertCascade('ancestor')
      assertCascade('root')
    } finally {
      document.documentElement.className = previousRootClass
      host.remove()
    }
  })
})
