#!/usr/bin/env node

import { execSync } from 'child_process'
import { ZipArchive } from 'archiver'
import { randomUUID } from 'node:crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { BuildReporter } from '../shared/build-reporter.mjs'
import { logStep, logError } from '../shared/logger.mjs'
import { formatPackageSize } from '../shared/box-utils.mjs'
import projectNaming from '../shared/project-names.cjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const { artifactPrefix } = projectNaming.getProjectNames(pkg.name)

const CHROME_BUILD_DIR = `dist/chrome/${artifactPrefix}-v${pkg.version}`
const CHROME_ZIP_PATH = `dist/chrome/${artifactPrefix}-v${pkg.version}.zip`

export async function createChromeZip(
  buildDir = path.join(rootDir, CHROME_BUILD_DIR),
  zipPath = path.join(rootDir, CHROME_ZIP_PATH),
) {
  const temporaryZipPath = path.join(
    path.dirname(zipPath),
    `.${path.basename(zipPath)}.${randomUUID()}.tmp`,
  )
  const archive = new ZipArchive({ zlib: { level: 9 } })
  const output = fs.createWriteStream(temporaryZipPath, { flags: 'wx' })

  try {
    await new Promise((resolve, reject) => {
      let finalized = false
      let closed = false
      let settled = false

      const fail = (error) => {
        if (settled) return
        settled = true
        if (closed) reject(error)
        else output.once('close', () => reject(error))
        try {
          archive.abort()
        } catch {}
        if (!closed) output.destroy()
      }
      const completeIfReady = () => {
        if (finalized && closed && !settled) {
          settled = true
          resolve()
        }
      }

      output.on('close', () => {
        closed = true
        completeIfReady()
      })
      output.on('error', fail)
      archive.on('error', fail)
      archive.on('warning', fail)

      try {
        archive.pipe(output)
        archive.directory(buildDir, false)
        archive.finalize().then(
          () => {
            finalized = true
            completeIfReady()
          },
          fail,
        )
      } catch (error) {
        fail(error)
      }
    })
    await fs.promises.rename(temporaryZipPath, zipPath)
  } catch (error) {
    await fs.promises.rm(temporaryZipPath, { force: true })
    throw error
  }
}

/**
 * Build Chrome extension with Vue
 */
async function buildChromeExtension() {
  const reporter = new BuildReporter('chrome')
  
  try {
    reporter.start()
    
    // Step 1: Clean previous build
    logStep('Cleaning previous Chrome build...')
    if (fs.existsSync(path.join(rootDir, CHROME_BUILD_DIR))) {
      fs.rmSync(path.join(rootDir, CHROME_BUILD_DIR), { recursive: true, force: true })
    }
    fs.mkdirSync(path.join(rootDir, CHROME_BUILD_DIR), { recursive: true })
    
    // Step 2: Run Vite build
    reporter.logBuildStep('Vite compilation...', 'in-progress')
    process.chdir(rootDir)
    
    process.env.NODE_ENV = 'production'
    process.env.BROWSER = 'chrome'

    const buildCommand = `npx vite build --config config/vite/vite.config.chrome.js`
    execSync(buildCommand, { stdio: 'pipe' })
    
    reporter.logBuildStep('Vite compilation...', 'completed')
    
    // Step 3: Create ZIP package
    logStep('Creating Chrome extension package...')
    await createChromeZip()
    
    const zipStats = fs.statSync(path.join(rootDir, CHROME_ZIP_PATH))
    const sizeStr = formatPackageSize(zipStats.size)
    logStep(`ZIP created: ${CHROME_ZIP_PATH} (${sizeStr})`)

    // Step 4: Analyze build output
    const buildStats = reporter.analyzeBuild(path.join(rootDir, CHROME_BUILD_DIR))

    // Step 5: Success
    reporter.success(buildStats)
    
  } catch (error) {
    reporter.error(error.message)
    logError('Chrome build failed:', error.message)
    process.exit(1)
  }
}

// Run build when invoked directly
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildChromeExtension()
}
