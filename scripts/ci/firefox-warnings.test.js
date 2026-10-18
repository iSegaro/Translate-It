import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts/validate/firefox-known-warnings.json'), 'utf8'))
const tempDirs = []

afterEach(() => tempDirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })))

function warning({ code, message, file }) {
  return { _type: 'warning', code, message, description: 'fixture', column: 1, file, line: 1 }
}

function fixtureWarnings(entries = baseline) {
  return entries.flatMap(entry => Array.from({ length: entry.count }, () => warning({
    code: entry.code,
    message: entry.message,
    file: entry.file
  })))
}

function run(warnings, { errors = 0, notices = 0, raw, errorCodes, linterExitCode = 0, linterSignal, linterStderr = '', linterErrorMessage, verbose = false, entryBundle, entryName = 'index-main.js' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'firefox-warning-test-'))
  tempDirs.push(dir)
  const build = path.join(dir, 'build')
  fs.mkdirSync(build)
  fs.writeFileSync(path.join(build, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Fixture', version: '1.0', description: 'Fixture', permissions: [],
    browser_specific_settings: { gecko: { id: 'fixture@example.invalid' } }
  }))
  fs.writeFileSync(path.join(build, 'bundle.js'), 'fixture')
  if (entryBundle != null) fs.writeFileSync(path.join(build, entryName), entryBundle)
  const errorItems = Array.from({ length: errors }, (_, index) => ({ code: errorCodes?.[index] ?? 'UNEXPECTED_ERROR', message: 'Fixture error', file: 'src/fixture.js', line: 12, column: 4 }))
  const noticeItems = Array.from({ length: notices }, () => ({ code: 'FIXTURE_NOTICE', message: 'Fixture notice' }))
  const output = raw ?? JSON.stringify({
    summary: { errors: errorItems.length, warnings: warnings.length, notices: noticeItems.length },
    errors: errorItems, warnings, notices: noticeItems
  })
  const preload = path.join(dir, 'linter-preload.cjs')
  fs.writeFileSync(preload, [
    "const childProcess = require('node:child_process')",
    "const { syncBuiltinESMExports } = require('node:module')",
    'const originalExecSync = childProcess.execSync',
    'childProcess.execSync = function (command, options) {',
    "  if (!/^addons-linter(?:\\s|$)/.test(command)) return originalExecSync.call(this, command, options)",
    '  const output = process.env.LINTER_OUTPUT',
    '  const signal = process.env.LINTER_SIGNAL',
    '  const status = Number(process.env.LINTER_EXIT_CODE)',
    '  const stderr = process.env.LINTER_STDERR',
    '  if (status !== 0 || signal) {',
    "    const error = new Error(process.env.LINTER_ERROR_MESSAGE || 'mock addons-linter termination')",
    '    error.stdout = output',
    '    error.stderr = stderr',
    '    error.status = signal ? null : status',
    '    error.signal = signal || null',
    '    throw error',
    '  }',
    '  return options?.encoding ? output : Buffer.from(output)',
    '}',
    'syncBuiltinESMExports()'
  ].join('\n'))
  let stdout = ''
  let status = 0
  try {
    stdout = execFileSync(process.execPath, ['--require', preload, path.join(root, 'scripts/validate/validate-firefox.mjs'), ...(verbose ? ['--verbose'] : [])], {
      encoding: 'utf8', env: { ...process.env, FIREFOX_BUILD_DIR: build, LINTER_OUTPUT: output, LINTER_EXIT_CODE: String(linterExitCode), LINTER_SIGNAL: linterSignal ?? '', LINTER_STDERR: linterStderr, LINTER_ERROR_MESSAGE: linterErrorMessage ?? '' }
    })
  } catch (error) {
    stdout = error.stdout || ''
    status = error.status ?? 1
  }
  return { stdout, status }
}

describe('Firefox known warning inventory', () => {
  it('summarizes the 14-item inventory and does not call ambiguous source matches known', () => {
    const result = run(fixtureWarnings())
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Warnings: 14 (8 known, 6 ambiguous, 0 new)')
    expect(result.stdout.match(/⚠️ AMBIGUOUS/g)).toHaveLength(6)
    expect(result.stdout).not.toContain('· KNOWN ')
    expect(result.stdout).not.toContain('Known warnings match the reviewed baseline')
  })

  it('reports an unknown warning as new and keeps its details visible', () => {
    const item = warning({ code: 'UNEXPECTED_CODE', message: 'Unexpected warning detail', file: 'new.js' })
    const result = run([...fixtureWarnings(), item])
    expect(result.stdout).toContain('Warnings: 15 (8 known, 6 ambiguous, 1 new)')
    expect(result.stdout).toContain('⚠️ NEW UNEXPECTED_CODE new.js: Unexpected warning detail')
  })

  it('classifies an occurrence beyond a known count as new', () => {
    const known = fixtureWarnings()
    const result = run([...known, { ...known[0] }])
    expect(result.stdout).toContain('Warnings: 15 (8 known, 6 ambiguous, 1 new)')
  })

  it('classifies ambiguous occurrences beyond their reviewed count as new', () => {
    const entry = baseline.find(item => item.file === 'core/core-shared.js')
    const item = warning({ code: entry.code, message: entry.message, file: entry.file })
    const result = run(Array.from({ length: entry.count + 1 }, () => ({ ...item })))

    expect(result.stdout).toContain('Warnings: 4 (0 known, 3 ambiguous, 1 new)')
    expect(result.stdout.match(/⚠️ AMBIGUOUS/g)).toHaveLength(entry.count)
    expect(result.stdout.match(/⚠️ NEW/g)).toHaveLength(1)
  })

  it('reports known warnings that are absent without pretending they were seen', () => {
    const result = run(fixtureWarnings(baseline.slice(1)))
    expect(result.stdout).toContain('Warnings: 12 (6 known, 6 ambiguous, 0 new)')
    expect(result.stdout).toContain('expected 2, observed 0')
  })

  it('treats a known warning kind in an unlisted file as new', () => {
    const warnings = fixtureWarnings()
    warnings.push({ ...warnings[0], file: 'unlisted.js' })
    const result = run(warnings)
    expect(result.stdout).toContain('Warnings: 15 (8 known, 6 ambiguous, 1 new)')
    expect(result.stdout).toContain('unlisted.js')
  })

  it('fails safely when the report contains malformed JSON', () => {
    const result = run([], { raw: 'errors 0\nwarnings 2\nnotices 1\n' })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('Untrusted addons-linter report: output is not valid JSON')
  })

  it('rejects an empty JSON object', () => {
    const result = run([], { raw: '{}' })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('Untrusted addons-linter report: expected summary totals')
  })

  it('rejects totals inconsistent with diagnostic arrays', () => {
    const result = run([], { raw: JSON.stringify({
      summary: { errors: 0, warnings: 1, notices: 0 }, errors: [], warnings: [], notices: []
    }) })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('summary.warnings (1) does not match warnings.length (0)')
  })

  it('keeps error, warning, and notice totals and fails on errors', () => {
    const result = run(fixtureWarnings(), { errors: 1, notices: 3 })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('Errors:   1')
    expect(result.stdout).toContain('Warnings: 14')
    expect(result.stdout).toContain('Notices:  3')
  })

  it('prints actionable details for non-ignored errors', () => {
    const result = run([], { errors: 1 })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('❌ ERROR UNEXPECTED_ERROR src/fixture.js:12:4: Fixture error')
  })

  it('keeps ignored-only error success concise without disclosing ignored details', () => {
    const result = run([], { errors: 1, errorCodes: ['DATA_COLLECTION_PERMISSIONS_PROP_RESERVED'], linterExitCode: 1 })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Errors:   0 (1 ignored)')
    expect(result.stdout).not.toContain('❌ ERROR')
    expect(result.stdout).not.toContain('Fixture error')
  })

  it('fails when the linter exits with an unexpected status despite reporting zero errors', () => {
    const result = run([], { linterExitCode: 9 })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('addons-linter exited unexpectedly with status 9')
  })

  it('fails when an exit 1 report includes unignored errors', () => {
    const result = run([], { errors: 1, linterExitCode: 1 })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('addons-linter exited unexpectedly with status 1')
  })

  it('preserves the pass for exit 1 caused exclusively by ignored errors', () => {
    const result = run([], { errors: 1, errorCodes: ['DATA_COLLECTION_PERMISSIONS_PROP_RESERVED'], linterExitCode: 1 })
    expect(result.status, result.stdout).toBe(0)
    expect(result.stdout).toContain('Errors:   0 (1 ignored)')
  })

  it('fails on status 9 even when all reported errors are ignored', () => {
    const result = run([], { errors: 1, errorCodes: ['DATA_COLLECTION_PERMISSIONS_PROP_RESERVED'], linterExitCode: 9 })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('addons-linter exited unexpectedly with status 9')
  })

  it('fails when the linter is terminated by a signal', () => {
    const result = run([], { errors: 1, errorCodes: ['DATA_COLLECTION_PERMISSIONS_PROP_RESERVED'], linterSignal: 'SIGTERM' })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('addons-linter exited unexpectedly after signal SIGTERM')
  })

  it('includes the signal when a terminated linter produced no report', () => {
    const result = run([], { raw: '', linterSignal: 'SIGTERM' })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('addons-linter failed without a report after signal SIGTERM')
  })

  it('shows the install hint for the Windows shell missing-command message', () => {
    const result = run([], {
      raw: '',
      linterExitCode: 1,
      linterErrorMessage: "'addons-linter' is not recognized as an internal or external command, operable program or batch file."
    })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('addons-linter not found. Install with: pnpm add -D addons-linter')
    expect(result.stdout).toContain('addons-linter unavailable; validation was not performed')
  })

  it('preserves malformed JSON failure details and bounds included stderr', () => {
    const stderr = `diagnostic ${'x'.repeat(2500)}`
    const result = run([], { raw: 'not-json', linterExitCode: 1, linterStderr: stderr })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('Untrusted addons-linter report: output is not valid JSON')
    expect(result.stdout).toContain(`addons-linter stderr: ${stderr.slice(0, 2048)} [truncated]`)
    expect(result.stdout).not.toContain(stderr)
  })

  it('succeeds for a zero-exit linter with a valid report', () => {
    const result = run([])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('└─ Mozilla validation completed\n\n')
  })

  it('prints known warning details only with --verbose while new warnings remain visible', () => {
    const item = warning({ code: 'UNEXPECTED_CODE', message: 'Unexpected warning detail', file: 'new.js' })
    const result = run([...fixtureWarnings(), item], { verbose: true })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Warnings: 15 (8 known, 6 ambiguous, 1 new)')
    expect(result.stdout).toContain('· KNOWN ')
    expect(result.stdout).toContain('⚠️ NEW UNEXPECTED_CODE new.js: Unexpected warning detail')
  })

  it('prints plain compatibility rows and closes each successful section with a blank line', () => {
    const result = run([])
    expect(result.stdout).toContain('├─   Firefox-specific settings configured')
    expect(result.stdout).toContain('├─   Extension ID: fixture@example.invalid')
    expect(result.stdout).toContain('└─ Manifest validation completed\n\n')
    expect(result.stdout).toContain('└─ Package size within limits\n\n')
  })

  it.each([
    ['Function constructor', 'const compile = new Function("Vue", "return Vue")', 'index-main.js'],
    ['runtime compiler registration', 'registerRuntimeCompiler(compileToFunction)', 'index-iframe.js'],
    ['compiler function', 'const compile = compileToFunction(template)', 'index-main.js']
  ])('rejects Vue %s in a Firefox content-script entry', (_kind, entryBundle, entryName) => {
    const result = run([], { entryBundle, entryName })
    expect(result.status).toBe(1)
    expect(result.stdout).toContain(`Vue runtime compiler code found in Firefox content-script bundle(s): ${entryName}`)
  })

  it('does not confuse regenerator-runtime Function usage with the Vue compiler', () => {
    const result = run([], { entryBundle: 'return Function("r", "return function() {}")' })
    expect(result.status).toBe(0)
  })

  it('does not identify an ambiguous warning as known even with an unmatched source identity', () => {
    const row = baseline.find(item => item.file === 'core/core-shared.js')
    const item = warning({ code: row.code, message: row.message, file: row.file })
    item.sourceIdentity = 'unreviewed-source'
    const result = run([item])
    expect(result.stdout).toContain('Warnings: 1 (0 known, 0 ambiguous, 1 new)')
    expect(result.stdout).toContain('⚠️ NEW UNSAFE_VAR_ASSIGNMENT core/core-shared.js')
  })

  it('requires a supplied source identity to match the reviewed source', () => {
    const row = baseline.find(item => item.file === 'assets/ocr/worker.min.js')
    const item = warning({ code: row.code, message: row.message, file: row.file })
    item.sourceIdentity = row.sources[0]
    const reviewed = run([item])
    expect(reviewed.stdout).toContain('Warnings: 1 (1 known, 0 ambiguous, 0 new)')

    item.sourceIdentity = 'different-library'
    const unreviewed = run([item])
    expect(unreviewed.stdout).toContain('Warnings: 1 (0 known, 0 ambiguous, 1 new)')
  })

  it('formats the summary status and terminates the box without a separator or redundant success line', () => {
    const passed = run([])
    const summary = passed.stdout.slice(passed.stdout.indexOf('╔════════'))
    expect(summary).toContain('Status: ✅ PASSED')
    expect(summary).toMatch(/Notices:[\s\S]*?\n╚════════[^\n]*╝\n\n$/)
    expect(summary).not.toMatch(/\n╠════════[^\n]*╣\n╚/)
    expect(passed.stdout).not.toContain('Firefox validation completed')

    const failed = run([], { errors: 1 })
    expect(failed.status).toBe(1)
    expect(failed.stdout).toContain('FIREFOX VALIDATION FAILED')
    expect(failed.stdout).toContain('addons-linter found 1 error(s)')
    expect(failed.stdout).not.toContain('Status: ✅ PASSED')
  })
})
