import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = resolve(here, '..', '..')
const scssPath = resolve(srcDir, 'assets/styles/main.scss')

/**
 * main.scss is the shared entry point for Popup, Sidepanel, and Options.
 * The legacy layout/sidepanel and components/popup partials have been
 * deleted — this file pins the import contract to prevent accidental
 * re-introduction.
 */
describe('main.scss import contract', () => {
  const source = () => readFileSync(scssPath, 'utf8')

  it('does not import layout/sidepanel', () => {
    expect(source()).not.toMatch(/@use\s+["']\.\/layout\/sidepanel/)
  })

  it('does not import components/popup', () => {
    expect(source()).not.toMatch(/@use\s+["']\.\/components\/popup/)
  })

  it('still imports layout/options', () => {
    expect(source()).toMatch(/@use\s+["']\.\/layout\/options/)
  })

  it('still imports base styles', () => {
    const src = source()
    expect(src).toMatch(/@use\s+["']\.\/base\/reset/)
    expect(src).toMatch(/@use\s+["']\.\/base\/variables/)
    expect(src).toMatch(/@use\s+["']\.\/base\/mixins/)
  })
})

/**
 * Compile main.scss end-to-end to verify no dead CSS leaks from
 * deleted partials (e.g. body.sidepanel-context .toolbar-icon from
 * the old _sidepanel.scss).
 */
describe('main.scss compilation', () => {
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

  it('compiles without errors', () => {
    const { css } = compile()
    expect(css).toBeTruthy()
  })

  it('contains no body.sidepanel-context .toolbar-icon rule (from deleted _sidepanel.scss)', () => {
    const { css } = compile()
    expect(css).not.toMatch(/body\.sidepanel-context\s+\.toolbar-icon\s*\{/)
  })

  it('contains no legacy .toolbar-separator global rule (from deleted _sidepanel.scss)', () => {
    const { css } = compile()
    // The SidepanelToolbar.scss owns .side-toolbar .toolbar-separator;
    // no bare global .toolbar-separator should exist from main.scss.
    const stripped = css.replaceAll('.side-toolbar .toolbar-separator', '')
    expect(stripped).not.toMatch(/(^|[},])\s*\.toolbar-separator\s*\{/)
  })
})

/**
 * CORRECTION to the Patch B report: the legacy global `textarea` /
 * `textarea:focus` rules in the deleted layout/_sidepanel.scss were NOT dead
 * code — the Sidepanel DOES render a <textarea> (TranslationInputField.vue
 * via BaseTextarea / SidepanelMainContent).
 *
 * They were removable because they were OVERRIDDEN, not unused: the sidepanel
 * textarea carries `.ti-translation-textarea` (specificity 0,1,0 + !important,
 * emitted later in the shipping style.css), which beats the legacy bare
 * `textarea` element selector (0,0,1) on every property. Classification:
 * REDUNDANT/OVERRIDDEN — every legacy property is covered by the component
 * owner, so deleting the legacy rules loses nothing.
 */
describe('legacy textarea contract is covered by component owner (REDUNDANT/OVERRIDDEN, not dead)', () => {
  const textareaScssPath = resolve(srcDir, 'components/shared/TranslationInputField.scss')
  const compileTextarea = () => sass.compile(textareaScssPath, {
    importers: [{
      findFileUrl(url) {
        if (url.startsWith('@/')) {
          return new URL(`file://${resolve(srcDir, url.slice(2))}`)
        }
        return null
      }
    }]
  })

  it('.ti-translation-textarea covers every legacy textarea property', () => {
    const { css } = compileTextarea()
    const start = css.indexOf('.ti-translation-textarea {')
    expect(start).toBeGreaterThanOrEqual(0)
    const block = css.slice(start, css.indexOf('}', start) + 1)

    // Legacy `textarea` properties → component coverage
    expect(block).toMatch(/width:\s*100%/)            // was width: 100%
    expect(block).toMatch(/border:\s*none/)           // was border: none
    expect(block).toMatch(/background-color:\s*transparent/) // was background: none
    expect(block).toMatch(/resize:\s*vertical/)       // was resize: vertical
    expect(block).toMatch(/min-height:\s*\d+px/)      // was min-height: 80px (component: 120px, intentional)
    expect(block).toMatch(/font-size:/)               // was font-size: 16px (component-owned value)
    expect(block).toMatch(/color:/)                   // was color: var(--color-text)
    expect(block).toMatch(/padding:\s*\d+px/)         // was padding: 5px / padding-top: 25px (component: toolbar space)
  })

  it('.ti-translation-textarea:focus covers the legacy textarea:focus outline reset', () => {
    const { css } = compileTextarea()
    const start = css.indexOf('.ti-translation-textarea:focus {')
    expect(start).toBeGreaterThanOrEqual(0)
    const block = css.slice(start, css.indexOf('}', start) + 1)
    expect(block).toMatch(/outline:\s*(0|none)/)       // was outline: none
  })

  it('component coverage is strictly overriding: !important on layout-critical props', () => {
    const { css } = compileTextarea()
    const start = css.indexOf('.ti-translation-textarea {')
    const block = css.slice(start, css.indexOf('}', start) + 1)
    // !important guarantees the override holds regardless of emission order
    // vs. any bare element selector.
    expect(block).toMatch(/width:\s*100%\s*!important/)
    expect(block).toMatch(/border:\s*none\s*!important/)
    expect(block).toMatch(/resize:\s*vertical\s*!important/)
  })
})
