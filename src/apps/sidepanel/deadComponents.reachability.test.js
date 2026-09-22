import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..')
const srcDir = resolve(repoRoot, 'src')

const SELF = 'deadComponents.reachability.test.js'

// Files deleted as dead code: importing any of them is a regression.
const DELETED_FILES = [
  'src/apps/sidepanel/components/SidepanelApiDropdown.vue',
  'src/apps/sidepanel/components/SidepanelApiDropdown.scss',
  'src/apps/sidepanel/components/ApiProviderItem.vue',
  'src/apps/sidepanel/components/ApiProviderItem.scss',
  'src/apps/sidepanel/components/HistoryItem.vue',
  'src/apps/sidepanel/components/HistoryItem.scss',
  'src/composables/shared/useApiProvider.js',
]

// Matches only real module references: static/side-effect/dynamic imports
// and require() calls whose specifier names a deleted module.
// Deliberately ignores camelCase identifiers (deleteHistoryItem,
// handleHistoryItemSelect, selectHistoryItem) and comments.
const IMPORT_REF = /(?:import\s+(?:[^'"]*?\sfrom\s+)?['"][^'"]*(?:SidepanelApiDropdown|ApiProviderItem|useApiProvider|HistoryItem\.vue)[^'"]*['"]|import\s*\(\s*['"][^'"]*(?:SidepanelApiDropdown|ApiProviderItem|useApiProvider|HistoryItem\.vue)[^'"]*['"]\s*\)|require\s*\(\s*['"][^'"]*(?:SidepanelApiDropdown|ApiProviderItem|useApiProvider|HistoryItem\.vue)[^'"]*['"]\s*\))/
// Matches component tag usage: <SidepanelApiDropdown, <ApiProviderItem, <HistoryItem
const TAG_REF = /<(?:SidepanelApiDropdown|ApiProviderItem|HistoryItem)\b/

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(js|vue|ts)$/.test(entry) && !full.endsWith(SELF)) out.push(full)
  }
  return out
}

// Textual scan covers every file under src/ (comments, warning strings,
// JSON, SCSS included), excluding this test itself.
function walkAll(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walkAll(full, out)
    else if (!full.endsWith(SELF)) out.push(full)
  }
  return out
}

const sourceFiles = walk(srcDir)
const allSrcFiles = walkAll(srcDir)

function findRefs(pattern) {
  const hits = []
  for (const file of sourceFiles) {
    const content = readFileSync(file, 'utf8')
    if (pattern.test(content)) hits.push(file.replace(`${repoRoot}/`, ''))
  }
  return hits
}

describe('dead sidepanel components stay deleted', () => {
  for (const rel of DELETED_FILES) {
    it(`does not exist: ${rel}`, () => {
      expect(existsSync(resolve(repoRoot, rel))).toBe(false)
    })
  }

  it('no source file imports a deleted module', () => {
    expect(findRefs(IMPORT_REF)).toEqual([])
  })

  it('no source file renders a deleted component tag', () => {
    expect(findRefs(TAG_REF)).toEqual([])
  })

  it('no textual useApiProvider reference remains under src/', () => {
    const hits = []
    for (const file of allSrcFiles) {
      if (readFileSync(file, 'utf8').includes('useApiProvider')) {
        hits.push(file.replace(`${repoRoot}/`, ''))
      }
    }
    expect(hits).toEqual([])
  })
})

describe('active provider/history paths intact', () => {
  it('SidepanelToolbar still uses ProviderSelector', () => {
    const content = readFileSync(
      resolve(srcDir, 'apps/sidepanel/components/SidepanelToolbar.vue'),
      'utf8',
    )
    expect(content).toContain('<ProviderSelector')
    expect(content).toContain(
      "import ProviderSelector from '@/components/shared/ProviderSelector.vue'",
    )
  })

  it('SidepanelLayout still renders/imports SidepanelHistory', () => {
    const content = readFileSync(
      resolve(srcDir, 'apps/sidepanel/SidepanelLayout.vue'),
      'utf8',
    )
    expect(content).toContain('<SidepanelHistory')
    expect(content).toContain('SidepanelHistory.vue')
  })

  it('SidepanelHistory still owns inline item rendering', () => {
    const content = readFileSync(
      resolve(srcDir, 'apps/sidepanel/components/SidepanelHistory.vue'),
      'utf8',
    )
    expect(content).toContain('v-for="item in formattedHistoryItems"')
  })
})

describe('useUI.js has no API-dropdown dead code', () => {
  const useUIPath = resolve(srcDir, 'composables/ui/useUI.js')
  const content = readFileSync(useUIPath, 'utf8')

  it('contains no ApiDropdown references at all', () => {
    expect(content).not.toMatch(/ApiDropdown/)
  })

  it('keeps every consumer-facing export', () => {
    for (const name of [
      'isHistoryPanelOpen',
      'toggleHistoryPanel',
      'openHistoryPanel',
      'closeHistoryPanel',
      'isSelectElementModeActive',
      'toggleElementSelection',
      'activateElementSelection',
      'deactivateElementSelection',
      'toggleInlineToolbarVisibility',
      'showVisualFeedback',
      'updateToolbarVisibilities',
      'focusElement',
      'scrollToElement',
    ]) {
      expect(content).toContain(name)
    }
  })
})
