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

    await createZip(buildDir, zipPath)

    const { entries, contents } = await readZip(zipPath)
    expect(entries).toEqual(expect.arrayContaining(['manifest.json', 'assets/app.js']))
    expect(contents.get('manifest.json')).toBe('{"name":"fixture"}')
    expect(contents.get('assets/app.js')).toBe('browser build contents')
  })

  it('rejects archive errors and removes the incomplete ZIP', async () => {
    const { buildDir, zipPath } = fixture(browser.toLowerCase())
    const archiveError = new Error('archive error')
    vi.spyOn(ZipArchive.prototype, 'finalize').mockImplementation(function () {
      this.emit('error', archiveError)
      return Promise.resolve()
    })

    await expect(createZip(buildDir, zipPath)).rejects.toBe(archiveError)
    expect(fs.existsSync(zipPath)).toBe(false)
    expect(fs.readdirSync(path.dirname(zipPath))).toEqual(['build'])
  })

  it('rejects output stream errors and removes the incomplete ZIP', async () => {
    const { buildDir, zipPath } = fixture(browser.toLowerCase())
    const outputError = new Error('output stream error')
    const createWriteStream = fs.createWriteStream
    vi.spyOn(fs, 'createWriteStream').mockImplementation(function (...args) {
      const output = createWriteStream.apply(this, args)
      queueMicrotask(() => output.emit('error', outputError))
      return output
    })

    await expect(createZip(buildDir, zipPath)).rejects.toBe(outputError)
    expect(fs.existsSync(zipPath)).toBe(false)
    expect(fs.readdirSync(path.dirname(zipPath))).toEqual(['build'])
  })

  it('rejects finalize failures and removes the incomplete ZIP', async () => {
    const { buildDir, zipPath } = fixture(browser.toLowerCase())
    const finalizeError = new Error('finalize rejected')
    vi.spyOn(ZipArchive.prototype, 'finalize').mockRejectedValue(finalizeError)

    await expect(createZip(buildDir, zipPath)).rejects.toBe(finalizeError)
    expect(fs.existsSync(zipPath)).toBe(false)
    expect(fs.readdirSync(path.dirname(zipPath))).toEqual(['build'])
  })
})
