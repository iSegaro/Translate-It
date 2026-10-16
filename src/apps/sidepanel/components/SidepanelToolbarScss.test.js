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

  it('preserves dark theme icon inversion for utility buttons', () => {
    const { css } = compile()
    expect(css).toContain('brightness(0) invert(1)')
    expect(css).toContain('#selectElementBtn img')
    expect(css).toContain('#revertActionBtn img')
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
