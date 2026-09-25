import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as sass from 'sass'

const here = dirname(fileURLToPath(import.meta.url))
const scssPath = resolve(here, 'TranslationInputField.scss')
const actionToolbarScssPath = resolve(
  here,
  '../../features/text-actions/components/ActionToolbar.scss'
)
const srcDir = resolve(here, '..', '..')

const scssImporters = [{
  findFileUrl(url) {
    if (url.startsWith('@/')) {
      return new URL(`file://${resolve(srcDir, url.slice(2))}`)
    }
    return null
  }
}]

const source = readFileSync(scssPath, 'utf8')
const actionToolbarSource = readFileSync(actionToolbarScssPath, 'utf8')
const compiledCss = sass.compile(scssPath, { importers: scssImporters }).css

describe('TranslationInputField input toolbar idle-hide contract', () => {
  it('owns the toolbar behavior in TranslationInputField.scss', () => {
    expect(source).toContain('@media (hover: hover) and (pointer: fine)')
    expect(source).toContain('.ti-input-toolbar')
    expect(actionToolbarSource).not.toContain('.ti-input-toolbar')
  })

  it('hides the mounted toolbar on hover-capable pointer devices', () => {
    expect(compiledCss).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*\.ti-input-toolbar \{\s*opacity: 0 !important;\s*pointer-events: none !important;/
    )
  })

  it('reveals from wrapper hover or toolbar focus without textarea focus-within', () => {
    expect(source).toContain('.ti-textarea-container:hover .ti-input-toolbar')
    expect(source).toContain('.ti-textarea-container .ti-input-toolbar:focus-within')
    expect(source).toContain('.ti-textarea-container .ti-input-toolbar:focus')
    expect(source).not.toContain('.ti-textarea-container:focus-within')
    expect(compiledCss).toMatch(
      /\.ti-textarea-container:hover \.ti-input-toolbar,[\s\S]*opacity: 1 !important;\s*pointer-events: auto !important;/
    )
  })

  it('keeps the toolbar visible while TTS is loading, playing, or in error', () => {
    expect(source).toMatch(
      /\.ti-input-toolbar:has\(\s*\.ti-tts-button--loading,\s*\.ti-tts-button--playing,\s*\.ti-tts-button--error\s*\)\s*\{\s*opacity: 1 !important;\s*pointer-events: auto !important;/
    )
    expect(compiledCss).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*\.ti-input-toolbar:has\(\.ti-tts-button--loading,\s*\.ti-tts-button--playing,\s*\.ti-tts-button--error\)\s*\{\s*opacity: 1 !important;\s*pointer-events: auto !important;/
    )
  })

  it('keeps geometry while providing a compositor-friendly opacity transition', () => {
    expect(source).not.toMatch(/\.ti-input-toolbar[\s\S]*display:\s*none/)
    expect(source).not.toMatch(/\.ti-input-toolbar[\s\S]*visibility:\s*hidden/)
    expect(source).toContain('transition: opacity 0.14s ease !important')
  })
})
