#!/usr/bin/env node

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { BuildReporter } from '../shared/build-reporter.mjs'
import { logStep, logSuccess, logError } from '../shared/logger.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))

const CHROME_BUILD_DIR = `dist/Chrome/Translate-It-v${pkg.version}`
const CHROME_ZIP_PATH = `dist/Chrome/Translate-It-v${pkg.version}.zip`

/**
 * Build Chrome extension with Vue
 */
async function buildChromeExtension() {
  const reporter = new BuildReporter('chrome')
  
  try {
    reporter.start()
    
    // Step 1: Clean previous build
    logStep('Cleaning previous Chrome build...')
    if (fs.existsSync(path.join(rootDir, 'dist/Chrome'))) {
      fs.rmSync(path.join(rootDir, 'dist/Chrome'), { recursive: true, force: true })
    }
    fs.mkdirSync(path.join(rootDir, 'dist/Chrome'), { recursive: true })
    
    // Step 2: Run Vite build
    reporter.logBuildStep('Vite compilation...', 'in-progress')
    process.chdir(rootDir)
    
    process.env.NODE_ENV = 'production'
    const buildCommand = `npx vite build --config config/vite/vite.config.chrome.js`
    execSync(buildCommand, { stdio: 'pipe' })
    
    reporter.logBuildStep('Vite compilation...', 'completed')
    
    // Step 3: Generate manifest dynamically
    logStep('Generating Chrome manifest...')
    const { generateValidatedManifest } = await import('../../config/manifest-generator.js')
    const manifest = generateValidatedManifest('chrome')
    
    // Ensure build directory exists
    const buildDir = path.join(rootDir, CHROME_BUILD_DIR)
    fs.mkdirSync(buildDir, { recursive: true })
    
    const manifestDest = path.join(buildDir, 'manifest.json')
    fs.writeFileSync(manifestDest, JSON.stringify(manifest, null, 2))
    
    // Step 4: Copy static assets
    logStep('Copying static assets...')
    const assetsToCopy = [
      { src: 'icons', dest: 'icons' },
      { src: '_locales', dest: '_locales' }
    ]
    
    for (const { src, dest } of assetsToCopy) {
      const srcPath = path.join(rootDir, src)
      const destPath = path.join(rootDir, CHROME_BUILD_DIR, dest)
      
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, destPath, { recursive: true })
      }
    }
    
    // Step 5: Copy background and content scripts
    logStep('Setting up extension scripts...')
    const scriptsDir = path.join(rootDir, CHROME_BUILD_DIR, 'js')
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true })
    }
    
    // Copy background script
    const backgroundSrc = path.join(rootDir, 'src/background/index.js')
    const backgroundDest = path.join(scriptsDir, 'background.js')
    if (fs.existsSync(backgroundSrc)) {
      fs.copyFileSync(backgroundSrc, backgroundDest)
    }
    
    // Copy content script  
    const contentSrc = path.join(rootDir, 'src/content-scripts/index.js')
    const contentDest = path.join(scriptsDir, 'content.js')
    if (fs.existsSync(contentSrc)) {
      fs.copyFileSync(contentSrc, contentDest)
    }
    
    // Step 6: Analyze build
    const buildStats = reporter.analyzeBuild(path.join(rootDir, CHROME_BUILD_DIR))
    
    // Step 7: Create ZIP package
    logStep('Creating Chrome extension package...')
    const archiver = await import('archiver')
    const archive = archiver.default('zip', { zlib: { level: 9 } })
    const output = fs.createWriteStream(path.join(rootDir, CHROME_ZIP_PATH))
    
    await new Promise((resolve, reject) => {
      output.on('close', resolve)
      archive.on('error', reject)
      
      archive.pipe(output)
      archive.directory(path.join(rootDir, CHROME_BUILD_DIR), false)
      archive.finalize()
    })
    
    const zipStats = fs.statSync(path.join(rootDir, CHROME_ZIP_PATH))
    logSuccess(`Chrome package created: ${(zipStats.size / 1024).toFixed(0)}KB`)
    
    // Step 8: Success
    reporter.success(buildStats)
    
    logSuccess('Chrome extension build completed successfully!')
    logStep(`Build location: ${CHROME_BUILD_DIR}`)
    logStep(`Package location: ${CHROME_ZIP_PATH}`)
    
  } catch (error) {
    reporter.error(error.message)
    logError('Chrome build failed:', error.message)
    process.exit(1)
  }
}

// Run build
buildChromeExtension()