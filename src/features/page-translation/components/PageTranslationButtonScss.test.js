import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..', '..')
const scssPath = resolve(here, 'PageTranslationButton.scss')

const scssImporters = [{
  findFileUrl(url) {
    if (url.startsWith('@/')) {
      return new URL(`file://${resolve(srcDir, url.slice(2))}`)
    }
    return null
  }
}]

const compile = () => sass.compile(scssPath, { importers: scssImporters })

/**
 * Compute CSS specificity as [id, class, type].
 * Simplified — handles selectors used in this file (no complex :has/:is).
 */
function specificity(selector) {
  let ids = 0, classes = 0, types = 0
  // Strip :where(...) — contributes 0
  let s = selector.replace(/:where\([^)]*\)/g, '')
  // Strip the :not() pseudo-class name — :not itself contributes 0; only its
  // argument contributes specificity (counted via its own selectors below).
  s = s.replace(/:not\(/g, '(')
  // Count IDs
  ids += (s.match(/#[\w-]+/g) || []).length
  // Count classes, pseudo-classes, attribute selectors
  classes += (s.match(/\.[\w-]+/g) || []).length
  classes += (s.match(/:[\w-]+/g) || []).length
  // Count type selectors and pseudo-elements
  types += (s.match(/(?:^|[\s>+~])(?:div|span|a|button|img|svg|input|label|p|h[1-6]|ul|li|ol|table|tr|td|th|section|article|aside|nav|header|footer|main|body|html)\b/g) || []).length
  types += (s.match(/::[\w-]+/g) || []).length
  return [ids, classes, types]
}

/* ── Zero-specificity boundary ─────────────────────────────────────── */

describe('PageTranslationButton.scss :where() zero-specificity boundary', () => {
  it('uses :where(.page-translation-controls) for .toolbar-icon (specificity 0,1,0)', () => {
    const { css } = compile()
    const match = css.match(/:where\(\.page-translation-controls\)\s+\.toolbar-icon\s*\{/)
    expect(match).toBeTruthy()
    // Specificity of `:where(.page-translation-controls) .toolbar-icon` = [0,1,0]
    // because :where() contributes 0 and .toolbar-icon contributes 1 class.
    const spec = specificity(match[0])
    expect(spec).toEqual([0, 1, 0])
  })

  it('.side-toolbar .toolbar-icon has specificity (0,2,0) > PTB (0,1,0)', () => {
    // SidepanelToolbar uses `.side-toolbar .toolbar-icon` (no :where).
    // This is an external contract — PTB must not raise its own specificity.
    const sideSpec = specificity('.side-toolbar .toolbar-icon')
    expect(sideSpec).toEqual([0, 2, 0])
    const ptbSpec = specificity(':where(.page-translation-controls) .toolbar-icon')
    expect(ptbSpec).toEqual([0, 1, 0])
    // Sidepanel wins order-independently: 2 > 1 in the class tier
    expect(sideSpec[1]).toBeGreaterThan(ptbSpec[1])
  })

  it('uses :where() for .error-message', () => {
    const { css } = compile()
    expect(css).toContain(':where(.page-translation-controls) .error-message')
    const stripped = css.replaceAll(':where(.page-translation-controls) .error-message', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.error-message\s*\{/)
  })

  it('uses :where() for .toolbar-link and its pseudo-classes', () => {
    const { css } = compile()
    expect(css).toContain(':where(.page-translation-controls) .toolbar-link')
    expect(css).toContain(':where(.page-translation-controls) .toolbar-link:hover')
    expect(css).toContain(':where(.page-translation-controls) .toolbar-link.disabled')
    expect(css).toContain(':where(.page-translation-controls) .toolbar-link.loading')
    expect(css).toContain(':where(.page-translation-controls) .toolbar-link.is-active')
  })

  it('uses :where() for .ti-btn-status-container', () => {
    const { css } = compile()
    expect(css).toContain(':where(.page-translation-controls) .ti-btn-status-container')
    expect(css).toContain(':where(.page-translation-controls) .ti-btn-status-container .ti-base-loading-spinner')
  })

  it('uses :where() for .is-compact-icon', () => {
    const { css } = compile()
    expect(css).toContain(':where(.page-translation-controls) .is-compact-icon')
    expect(css).toContain(':where(.page-translation-controls) .is-compact-icon .ti-btn__text')
    expect(css).toContain(':where(.page-translation-controls) .is-compact-icon:disabled')
  })

  it('uses :where() for progress rules', () => {
    const { css } = compile()
    expect(css).toContain(':where(.page-translation-controls) .progress-bar')
    expect(css).toContain(':where(.page-translation-controls) .progress-bar.compact')
    expect(css).toContain(':where(.page-translation-controls) .progress-fill')
    expect(css).toContain(':where(.page-translation-controls) .progress-text')
  })

  it('uses :where() for .page-translate-star-btn', () => {
    const { css } = compile()
    expect(css).toContain(':where(.page-translation-controls) .page-translate-star-btn')
    expect(css).toContain(':where(.page-translation-controls) .page-translate-star-btn:hover')
    expect(css).toContain(':where(.page-translation-controls) .page-translate-star-btn.is-active')
    expect(css).toContain(':where(.page-translation-controls) .page-translate-star-btn.is-disabled')
  })

  it('uses :where() for .ti-btn-status-badge (base rule)', () => {
    const { css } = compile()
    expect(css).toContain(':where(.page-translation-controls) .ti-btn-status-badge')
  })

  it('uses :where() for .ti-text-status-wrapper', () => {
    const { css } = compile()
    expect(css).toContain(':where(.page-translation-controls) .ti-text-status-wrapper')
  })

  it('uses :where() for hover-related toolbar-icon rules', () => {
    const { css } = compile()
    expect(css).toContain(':where(.page-translation-controls) .ti-btn:hover .toolbar-icon')
    expect(css).toContain(':where(.page-translation-controls) .ti-btn.is-active .toolbar-icon')
  })

  it('emits no bare standalone rule for any scoped class', () => {
    const { css } = compile()
    const scopedClasses = [
      '.error-message',
      '.toolbar-icon',
      '.toolbar-link',
      '.ti-btn-status-container',
      '.is-compact-icon',
      '.progress-bar',
      '.progress-fill',
      '.progress-text',
      '.page-translate-star-btn',
      '.ti-text-status-wrapper',
    ]
    for (const cls of scopedClasses) {
      const re = new RegExp(`(^|[},])\\s*${cls.replace('.', '\\.')}\\s*\\{`)
      const stripped = css.replaceAll(`:where(.page-translation-controls) ${cls}`, '')
      // Also strip compound compact-wrapper rules for status classes
      const cleaned = stripped
        .replaceAll(':where(.page-translation-controls).compact-wrapper .ti-btn-status-container', '')
        .replaceAll(':where(.page-translation-controls).compact-wrapper .ti-btn-status-badge', '')
      expect(cleaned).not.toMatch(re)
    }
  })
})

/* ── Compact-mode status compound rules ────────────────────────────── */

describe('PageTranslationButton.scss compact-mode status rules', () => {
  const source = readFileSync(scssPath, 'utf8')

  it('no top-level bare .compact-wrapper .ti-btn-status-* rule exists in source', () => {
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments).not.toMatch(/^\.compact-wrapper\s+\.ti-btn-status-container\s*\{/m)
    expect(withoutComments).not.toMatch(/^\.compact-wrapper\s+\.ti-btn-status-badge\s*\{/m)
  })

  it('uses compound :where(.page-translation-controls).compact-wrapper form', () => {
    expect(source).toContain(':where(.page-translation-controls).compact-wrapper .ti-btn-status-container')
    expect(source).toContain(':where(.page-translation-controls).compact-wrapper .ti-btn-status-badge')
  })

  it('compiled status container has 22×22 dimensions', () => {
    const { css } = compile()
    const match = css.match(
      /:where\(\.page-translation-controls\)\.compact-wrapper\s+\.ti-btn-status-container\s*\{[^}]*width:\s*22px[^}]*height:\s*22px/
    )
    expect(match).toBeTruthy()
  })

  it('compiled status badge has -1px offsets', () => {
    const { css } = compile()
    const match = css.match(
      /:where\(\.page-translation-controls\)\.compact-wrapper\s+\.ti-btn-status-badge\s*\{[^}]*bottom:\s*-1px[^}]*right:\s*-1px/
    )
    expect(match).toBeTruthy()
  })

  it('no bare .compact-wrapper .ti-btn-status-* in compiled output', () => {
    const { css } = compile()
    // Strip all :where() compound occurrences
    const stripped = css
      .replace(/:where\(\.page-translation-controls\)\.compact-wrapper\s+\.ti-btn-status-\w+/g, '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.compact-wrapper\s+\.ti-btn-status-\w+\s*\{/)
  })

  it('compound rules have specificity (0,2,0) = old top-level form', () => {
    const compoundSpec = specificity(':where(.page-translation-controls).compact-wrapper .ti-btn-status-container')
    expect(compoundSpec).toEqual([0, 2, 0])
    // Same as old `.compact-wrapper .ti-btn-status-container`
    const oldSpec = specificity('.compact-wrapper .ti-btn-status-container')
    expect(oldSpec).toEqual([0, 2, 0])
    expect(compoundSpec).toEqual(oldSpec)
  })
})

/* ── Popup compact geometry ───────────────────────────────────────── */

describe('PageTranslationButton.scss popup compact geometry', () => {
  const source = readFileSync(scssPath, 'utf8')

  it('popup compact padding is compound-root-scoped with :where()', () => {
    expect(source).toContain(':where(.page-translation-controls).ti-page-translate-btn.compact-wrapper .is-compact-icon')
    expect(source).toContain('padding-left: 2px !important;')
    expect(source).toContain('padding-right: 22px !important;')
  })

  it('popup hover rule uses Header action contract var', () => {
    expect(source).toContain(':where(.page-translation-controls).ti-page-translate-btn.compact-wrapper .is-compact-icon:hover:not(.ti-btn--disabled)')
    expect(source).toContain('background-color: var(--ti-action-hover-bg) !important;')
  })

  it('popup hover selector has specificity (0,5,0) — :not() contributes only its argument', () => {
    const { css } = compile()
    const match = css.match(
      /:where\(\.page-translation-controls\)\.ti-page-translate-btn\.compact-wrapper\s+\.is-compact-icon:hover:not\(\.ti-btn--disabled\)\s*\{/
    )
    expect(match).toBeTruthy()
    // :where()=0, .ti-page-translate-btn=1, .compact-wrapper=1,
    // .is-compact-icon=1, :hover=1, :not(.ti-btn--disabled)=1 (argument only)
    expect(specificity(match[0])).toEqual([0, 5, 0])
  })

  it('hover rule does NOT set standalone color (colored image icon stays unchanged)', () => {
    const hoverRule = source.match(
      /:where\(\.page-translation-controls\)\.ti-page-translate-btn\.compact-wrapper\s+\.is-compact-icon:hover:not\(\.ti-btn--disabled\)\s*\{[^}]*\}/
    )
    expect(hoverRule).toBeTruthy()
    const lines = hoverRule[0].split('\n').map(l => l.trim())
    const hasStandaloneColor = lines.some(l => /^color:/.test(l))
    expect(hasStandaloneColor).toBe(false)
    expect(hoverRule[0]).not.toContain('--ti-action-icon-hover')
  })

  it('popup compact padding compiles to correct selector', () => {
    const { css } = compile()
    const match = css.match(
      /:where\(\.page-translation-controls\)\.ti-page-translate-btn\.compact-wrapper\s+\.is-compact-icon\s*\{[^}]*padding-left:\s*2px[^}]*padding-right:\s*22px/
    )
    expect(match).toBeTruthy()
  })

  it('popup compound rule has specificity (0,3,0) — beats generic (0,1,0)', () => {
    const popupSpec = specificity(':where(.page-translation-controls).ti-page-translate-btn.compact-wrapper .is-compact-icon')
    expect(popupSpec).toEqual([0, 3, 0])
    const genericSpec = specificity(':where(.page-translation-controls) .is-compact-icon')
    expect(genericSpec).toEqual([0, 1, 0])
    expect(popupSpec[1]).toBeGreaterThan(genericSpec[1])
  })
})

/* ── Star geometry ─────────────────────────────────────────────────── */

describe('PageTranslationButton.scss star geometry', () => {
  const source = readFileSync(scssPath, 'utf8')

  it('star button has padding: 5px for a 24×24 interactive box', () => {
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
})

/* ── Hover/focus decoupling ────────────────────────────────────────── */

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

/* ── Dark-mode selectors ───────────────────────────────────────────── */

describe('PageTranslationButton.scss dark-mode selectors', () => {
  const source = readFileSync(scssPath, 'utf8')
  const { css } = compile()

  it('does NOT contain any :global() selectors anywhere in the file', () => {
    expect(source).not.toMatch(/:global\(/)
  })

  it('dark theme star selectors compile through :where() zero-specificity root', () => {
    expect(css).toContain('.theme-dark :where(.page-translation-controls) .page-translate-star-btn')
    expect(css).toContain('.ti-dark-mode :where(.page-translation-controls) .page-translate-star-btn')
  })

  it('dark star selector has specificity (0,2,0) — same as pre-Patch-A .theme-dark .page-translate-star-btn', () => {
    const darkSpec = specificity('.theme-dark :where(.page-translation-controls) .page-translate-star-btn')
    expect(darkSpec).toEqual([0, 2, 0])
    const oldDarkSpec = specificity('.theme-dark .page-translate-star-btn')
    expect(oldDarkSpec).toEqual([0, 2, 0])
    expect(darkSpec).toEqual(oldDarkSpec)
  })
})

/* ── No :where() on root element's own rules ───────────────────────── */

describe('PageTranslationButton.scss root element rules', () => {
  const source = readFileSync(scssPath, 'utf8')

  it('root element layout uses bare .page-translation-controls (not :where())', () => {
    // The root element's OWN layout properties (position, display, etc.)
    // must use the real class, not :where(), so they have normal specificity.
    expect(source).toMatch(/^\.page-translation-controls\s*\{/m)
  })

  it('root compound variants use bare class (not :where())', () => {
    expect(source).toContain('&.compact-wrapper {')
    expect(source).toContain('&.text-only {')
  })
})
