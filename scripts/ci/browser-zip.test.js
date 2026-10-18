import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZipArchive } from 'archiver'
import yauzl from 'yauzl'
import { createChromeZip } from '../build/build-chrome.mjs'
import { createFirefoxZip } from '../build/build-firefox.mjs'

const temporaryDirectories = []

function fixture(browser) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `${browser}-zip-test-`))
  temporaryDirectories.push(rootDir)
  const buildDir = path.join(rootDir, 'build')
  fs.mkdirSync(path.join(buildDir, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(buildDir, 'manifest.json'), '{"name":"fixture"}')
  fs.writeFileSync(path.join(buildDir, 'assets', 'app.js'), 'browser build contents')
  return { buildDir, zipPath: path.join(rootDir, `${browser}.zip`) }
}

function readZip(zipPath) {
  return new Promise((resolve, reject) => {
    const entries = []
    const contents = new Map()
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipfile) => {
      if (error) return reject(error)

      zipfile.on('error', reject)
      zipfile.on('end', () => resolve({ entries, contents }))
      zipfile.on('entry', (entry) => {
        entries.push(entry.fileName)
        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError)
          const chunks = []
          stream.on('data', (chunk) => chunks.push(chunk))
          stream.on('error', reject)
          stream.on('end', () => {
            contents.set(entry.fileName, Buffer.concat(chunks).toString('utf8'))
            zipfile.readEntry()
          })
        })
      })

      zipfile.readEntry()
    })
  })
}

async function seedExistingZip(createZip, buildDir, zipPath) {
  await createZip(buildDir, zipPath)
  return fs.readFileSync(zipPath)
}

async function expectExistingZipPreserved(zipPath, originalBytes, error, expectedError) {
  await expect(error).rejects.toBe(expectedError)
  expect(fs.readFileSync(zipPath)).toEqual(originalBytes)
  const { entries, contents } = await readZip(zipPath)
  expect(entries).toEqual(expect.arrayContaining(['manifest.json', 'assets/app.js']))
  expect(contents.get('manifest.json')).toBe('{"name":"fixture"}')
  expect(fs.readdirSync(path.dirname(zipPath)).sort()).toEqual(['build', path.basename(zipPath)].sort())
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

const browserZipHelpers = [
  ['Chrome', createChromeZip],
  ['Firefox', createFirefoxZip],
]

describe.each(browserZipHelpers)('%s ZIP creation', (browser, createZip) => {
  it('creates a ZIP from the build directory', async () => {
    const { buildDir, zipPath } = fixture(browser.toLowerCase())
    const originalBytes = await seedExistingZip(createZip, buildDir, zipPath)
    fs.writeFileSync(path.join(buildDir, 'assets', 'app.js'), 'updated browser build contents')

    await createZip(buildDir, zipPath)

    const { entries, contents } = await readZip(zipPath)
    expect(entries).toEqual(expect.arrayContaining(['manifest.json', 'assets/app.js']))
    expect(fs.readFileSync(zipPath)).not.toEqual(originalBytes)
    expect(contents.get('manifest.json')).toBe('{"name":"fixture"}')
    expect(contents.get('assets/app.js')).toBe('updated browser build contents')
    expect(fs.readdirSync(path.dirname(zipPath)).sort()).toEqual(['build', path.basename(zipPath)].sort())
  })

  it('preserves an existing valid ZIP after archive errors', async () => {
    const { buildDir, zipPath } = fixture(browser.toLowerCase())
    const originalBytes = await seedExistingZip(createZip, buildDir, zipPath)
    const archiveError = new Error('archive error')
    vi.spyOn(ZipArchive.prototype, 'finalize').mockImplementation(function () {
      this.emit('error', archiveError)
      return Promise.resolve()
    })

    await expectExistingZipPreserved(zipPath, originalBytes, createZip(buildDir, zipPath), archiveError)
  })

  it('preserves an existing valid ZIP after output stream errors', async () => {
    const { buildDir, zipPath } = fixture(browser.toLowerCase())
    const originalBytes = await seedExistingZip(createZip, buildDir, zipPath)
    const outputError = new Error('output stream error')
    const createWriteStream = fs.createWriteStream
    vi.spyOn(fs, 'createWriteStream').mockImplementation(function (...args) {
      const output = createWriteStream.apply(this, args)
      queueMicrotask(() => output.emit('error', outputError))
      return output
    })

    await expectExistingZipPreserved(zipPath, originalBytes, createZip(buildDir, zipPath), outputError)
  })

  it('preserves an existing valid ZIP after finalize failures', async () => {
    const { buildDir, zipPath } = fixture(browser.toLowerCase())
    const originalBytes = await seedExistingZip(createZip, buildDir, zipPath)
    const finalizeError = new Error('finalize rejected')
    vi.spyOn(ZipArchive.prototype, 'finalize').mockRejectedValue(finalizeError)

    await expectExistingZipPreserved(zipPath, originalBytes, createZip(buildDir, zipPath), finalizeError)
  })

  it('preserves an existing valid ZIP when atomic replacement fails', async () => {
    const { buildDir, zipPath } = fixture(browser.toLowerCase())
    const originalBytes = await seedExistingZip(createZip, buildDir, zipPath)
    const renameError = new Error('rename failed')
    vi.spyOn(fs.promises, 'rename').mockRejectedValue(renameError)

    await expectExistingZipPreserved(zipPath, originalBytes, createZip(buildDir, zipPath), renameError)
  })
})
