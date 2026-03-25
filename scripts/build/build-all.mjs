#!/usr/bin/env node

import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logStep, logSuccess, logError } from '../shared/logger.mjs'
import { centerText, createBox, createSuccessBox, createErrorBox } from '../shared/box-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')

// Check if parallel mode is enabled
const isParallel = process.argv.includes('--parallel') || process.argv.includes('--p')
// Check if mobile mode is enabled
const isMobile = process.argv.includes('--mobile') || process.argv.includes('--m')

/**
 * Build Chrome extension asynchronously
 */
async function buildChromeAsync() {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    const args = ['scripts/build/build-chrome.mjs']
    if (isMobile) args.push('--mobile')

    const child = spawn('node', args, {
      cwd: rootDir,
      stdio: 'pipe'
    })

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr })
      } else {
        reject(new Error(`Chrome build failed with exit code ${code}`))
      }
    })

    child.on('error', (error) => {
      reject(new Error(`Chrome build process error: ${error.message}`))
    })
  })
}

/**
 * Build Firefox extension asynchronously
 */
async function buildFirefoxAsync() {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    const args = ['scripts/build/build-firefox.mjs']
    if (isMobile) args.push('--mobile')

    const child = spawn('node', args, {
      cwd: rootDir,
      stdio: 'pipe'
    })

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr })
      } else {
        reject(new Error(`Firefox build failed with exit code ${code}`))
      }
    })

    child.on('error', (error) => {
      reject(new Error(`Firefox build process error: ${error.message}`))
    })
  })
}

/**
 * Build all browser extensions and create publish packages
 */
async function buildAll() {
  try {
    console.log(createBox('🗳️ BUILDING ALL EXTENSIONS') + '\n')

    const startTime = Date.now()

    // Build extensions (parallel or sequential based on flag)
    if (isParallel) {
      logStep(`Building Chrome and Firefox extensions in parallel${isMobile ? ' (Mobile)' : ''}...`)

      // Run builds in parallel and capture outputs
      const [chromeResult, firefoxResult] = await Promise.all([
        buildChromeAsync(),
        buildFirefoxAsync()
      ])

      // Display Chrome output first
      if (chromeResult.success) {
        process.stdout.write(chromeResult.stdout)
        if (chromeResult.stderr) {
          process.stderr.write(chromeResult.stderr)
        }
      }

      // Display Firefox output second
      if (firefoxResult.success) {
        process.stdout.write(firefoxResult.stdout)
        if (firefoxResult.stderr) {
          process.stderr.write(firefoxResult.stderr)
        }
      }
    } else {
      // Step 1: Build Chrome
      logStep(`Building Chrome extension${isMobile ? ' (Mobile)' : ''}...`)
      execSync(`node scripts/build/build-chrome.mjs ${isMobile ? '--mobile' : ''}`, {
        cwd: rootDir,
        stdio: 'inherit'
      })

      // Step 2: Build Firefox
      logStep(`Building Firefox extension${isMobile ? ' (Mobile)' : ''}...`)
      execSync(`node scripts/build/build-firefox.mjs ${isMobile ? '--mobile' : ''}`, {
        cwd: rootDir,
        stdio: 'inherit'
      })
    }
    
    // Step 3: Create publish packages
    logStep('Creating publish packages...')
    const publishDir = path.join(rootDir, 'dist/Publish')
    if (!fs.existsSync(publishDir)) {
      fs.mkdirSync(publishDir, { recursive: true })
    }
    
    // Copy packages to Publish directory
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
    const version = pkg.version
    
    const chromeZip = path.join(rootDir, `dist/chrome/Translate-It-v${version}.zip`)
    const firefoxZip = path.join(rootDir, `dist/firefox/Translate-It-v${version}.zip`)
    
    if (fs.existsSync(chromeZip)) {
      fs.copyFileSync(chromeZip, path.join(publishDir, `Translate-It-v${version}-for-Chrome.zip`))
    }
    
    if (fs.existsSync(firefoxZip)) {
      fs.copyFileSync(firefoxZip, path.join(publishDir, `Translate-It-v${version}-for-Firefox.zip`))
    }
    
    // Step 4: Generate release notes
    const releaseNotes = `# Translate It v${version} Release

## Chrome Extension
- **File**: Translate-It-v${version}-for-Chrome.zip
- **Manifest**: Version 3
- **Compatible**: Chrome 88+

## Firefox Extension
- **File**: Translate-It-v${version}-for-Firefox.zip
- **Manifest**: Version 3
- **Compatible**: Firefox 112+

## Installation
1. Download the appropriate file for your browser
2. Extract and load as unpacked extension for testing
3. Or submit to respective web stores

Generated on: ${new Date().toISOString()}
Build time: ${((Date.now() - startTime) / 1000).toFixed(1)}s
`
    
    fs.writeFileSync(path.join(publishDir, 'release-notes.md'), releaseNotes)
    
    // Step 5: Success summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    
    const horizontalLine = '═'.repeat(64)
    console.log('\n╔' + horizontalLine + '╗')
    console.log(`║${centerText('🎉 ALL BUILDS COMPLETED')}║`)
    console.log(`╠${horizontalLine}╣`)
    console.log(`║${centerText('✅ Chrome Extension Ready')}║`)
    console.log(`║${centerText('✅ Firefox Extension Ready')}║`)
    console.log(`║${centerText('✅ Publish Packages Created')}║`)
    console.log(`╠${horizontalLine}╣`)
    console.log(`║${centerText(`⏱️ Total build time: ${duration}s`)}║`)
    console.log(`║${centerText('📦 Ready for Web Store submission!')}║`)
    console.log(`╚${horizontalLine}╝\n`)
    
    logSuccess('All extensions built successfully!')
    logStep('Publish packages location: dist/Publish/')
    
  } catch (error) {
    console.log('\n' + createErrorBox('❌ BUILD FAILED'))
    const horizontalLine = '═'.repeat(64)
    console.log(`╠${horizontalLine}╣`)
    console.log(`║${centerText(`Error: ${error.message.slice(0, 51)}`)}║`)
    console.log(`╚${horizontalLine}╝\n`)
    
    logError('Build failed:', error.message)
    process.exit(1)
  }
}

// Run build
buildAll()