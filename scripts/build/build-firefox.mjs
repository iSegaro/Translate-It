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

const FIREFOX_BUILD_DIR = `dist/Firefox/Translate-It-v${pkg.version}`
const FIREFOX_ZIP_PATH = `dist/Firefox/Translate-It-v${pkg.version}.zip`

/**
 * Build Firefox extension with Vue
 */
async function buildFirefoxExtension() {
  const reporter = new BuildReporter('firefox')
  
  try {
    reporter.start()
    
    // Step 1: Clean previous build
    logStep('Cleaning previous Firefox build...')
    if (fs.existsSync(path.join(rootDir, 'dist/Firefox'))) {
      fs.rmSync(path.join(rootDir, 'dist/Firefox'), { recursive: true, force: true })
    }
    fs.mkdirSync(path.join(rootDir, 'dist/Firefox'), { recursive: true })
    
    // Step 2: Run Vite build
    reporter.logBuildStep('Vite compilation...', 'in-progress')
    process.chdir(rootDir)
    
    process.env.NODE_ENV = 'production'
    const buildCommand = `npx vite build --config config/vite/vite.config.firefox.js`
    execSync(buildCommand, { stdio: 'pipe' })
    
    reporter.logBuildStep('Vite compilation...', 'completed')
    
    // Step 3: Copy manifest
    logStep('Generating Firefox manifest...')
    const manifestSource = path.join(rootDir, 'config/build/manifest.firefox.json')
    const manifestDest = path.join(rootDir, FIREFOX_BUILD_DIR, 'manifest.json')
    
    if (!fs.existsSync(manifestSource)) {
      throw new Error('Firefox manifest template not found')
    }
    
    fs.copyFileSync(manifestSource, manifestDest)
    
    // Step 4: Copy static assets
    logStep('Copying static assets...')
    const assetsToCopy = [
      { src: 'icons', dest: 'icons' },
      { src: '_locales', dest: '_locales' }
    ]
    
    for (const { src, dest } of assetsToCopy) {
      const srcPath = path.join(rootDir, src)
      const destPath = path.join(rootDir, FIREFOX_BUILD_DIR, dest)
      
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, destPath, { recursive: true })
      }
    }
    
    // Step 5: Copy background and content scripts
    logStep('Setting up extension scripts...')
    const scriptsDir = path.join(rootDir, FIREFOX_BUILD_DIR, 'js')
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
    const buildStats = reporter.analyzeBuild(path.join(rootDir, FIREFOX_BUILD_DIR))
    
    // Step 7: Create ZIP package
    logStep('Creating Firefox extension package...')
    const archiver = await import('archiver')
    const archive = archiver.default('zip', { zlib: { level: 9 } })
    const output = fs.createWriteStream(path.join(rootDir, FIREFOX_ZIP_PATH))
    
    await new Promise((resolve, reject) => {
      output.on('close', resolve)
      archive.on('error', reject)
      
      archive.pipe(output)
      archive.directory(path.join(rootDir, FIREFOX_BUILD_DIR), false)
      archive.finalize()
    })
    
    const zipStats = fs.statSync(path.join(rootDir, FIREFOX_ZIP_PATH))
    logSuccess(`Firefox package created: ${(zipStats.size / 1024).toFixed(0)}KB`)
    
    // Step 8: Success
    reporter.success(buildStats)
    
    logSuccess('Firefox extension build completed successfully!')
    logStep(`Build location: ${FIREFOX_BUILD_DIR}`)
    logStep(`Package location: ${FIREFOX_ZIP_PATH}`)
    
  } catch (error) {
    reporter.error(error.message)
    logError('Firefox build failed:', error.message)
    process.exit(1)
  }
}

// Run build
buildFirefoxExtension()