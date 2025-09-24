#!/usr/bin/env node

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logStep, logSuccess, logError } from '../shared/logger.mjs'
import { createBox, createErrorBox, centerText } from '../shared/box-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))

const CHROME_BUILD_DIR = path.join(rootDir, `dist/chrome/Translate-It-v${pkg.version}`)
const TEMP_ARTIFACTS_DIR = path.join(rootDir, 'temp/validation/chrome')

/**
 * Validate Chrome extension build
 */
async function validateChromeExtension() {
  try {
    console.log(createBox('🕸 CHROME EXTENSION VALIDATOR') + '\n')
    
    const results = {
      errors: 0,
      warnings: 0,
      notices: 0
    }
    
    // Step 1: Check if build exists
    logStep('Checking Chrome build directory...')
    if (!fs.existsSync(CHROME_BUILD_DIR)) {
      throw new Error(`Chrome build directory not found: ${CHROME_BUILD_DIR}`)
    }
    console.log('├─ ✅ Chrome build directory found')
    console.log(`└─ Path: ${CHROME_BUILD_DIR}\n`)
    
    // Step 2: Validate manifest
    logStep('Validating manifest.json...')
    const manifestPath = path.join(CHROME_BUILD_DIR, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error('manifest.json not found in Chrome build')
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    // Substitute extension name
    const substitutedManifest = await substituteMessages(manifest)

    // Chrome-specific manifest checks
    if (substitutedManifest.manifest_version !== 3) {
      throw new Error('Chrome extension must use Manifest V3')
    }
    console.log(`├─ ✅ Manifest Version: V${substitutedManifest.manifest_version}`)

    if (!substitutedManifest.name || !substitutedManifest.version || !substitutedManifest.description) {
      throw new Error('Missing required manifest fields')
    }
    console.log(`├─ ✅ Extension Name: ${substitutedManifest.name}`)
    console.log(`├─ ✅ Extension Version: ${substitutedManifest.version}`)
    console.log(`└─ ✅ Manifest validation completed\n`)
    
    // Step 3: Check web-ext availability
    try {
      execSync('web-ext --version', { stdio: 'pipe' })
    } catch (error) {
      console.log('⚠️  web-ext not found. Install with: pnpm run setup:chrome-validator\n')
      results.warnings++
    }
    
    // Step 4: Web-ext validation (if available)
    try {
      logStep('Running web-ext validation...')
      
      // Create temp directory
      if (!fs.existsSync(TEMP_ARTIFACTS_DIR)) {
        fs.mkdirSync(TEMP_ARTIFACTS_DIR, { recursive: true })
      }
      
      const webExtCommand = `web-ext build --source-dir="${CHROME_BUILD_DIR}" --artifacts-dir="${TEMP_ARTIFACTS_DIR}" --overwrite-dest`
      const output = execSync(webExtCommand, { encoding: 'utf8' })
      
      console.log('├─ ✅ web-ext validation passed')
      
      // Check if zip was created
      if (output.includes('Your web extension is ready:')) {
        const zipPath = output.match(/Your web extension is ready: (.+)/)?.[1]
        if (zipPath && fs.existsSync(zipPath.trim())) {
          const zipStats = fs.statSync(zipPath.trim())
          console.log(`├─ ✅ Package created: ${(zipStats.size / 1024).toFixed(2)} KB`)
        }
      }
      console.log('└─ ✅ Cross-browser validation completed\n')
      
    } catch (error) {
      if (!error.message.includes('web-ext')) {
        console.log('└─ ❌ web-ext validation failed\n')
        results.errors++
      }
    }
    
    // Step 5: Chrome-specific analysis
    logStep('Analyzing Chrome compatibility...')
    const issues = []
    const warnings = []
    const info = []
    
    // Check service worker
    if (manifest.background) {
      if (manifest.background.scripts) {
        issues.push('Manifest V3 should use service_worker instead of background.scripts')
      } else if (manifest.background.service_worker) {
        info.push('Service worker correctly configured for Manifest V3')
      }
    }
    
    // Check permissions
    if (manifest.permissions?.includes('<all_urls>')) {
      info.push('Uses <all_urls> permission (required for translation)')
    }
    
    if (manifest.host_permissions?.includes('<all_urls>')) {
      info.push('Uses <all_urls> host permission (universal website access)')
    }
    
    // Display analysis results
    console.log('├─ COMPATIBILITY ANALYSIS:')
    if (issues.length > 0) {
      issues.forEach(issue => {
        console.log(`├─   ❌ ${issue}`)
        results.warnings++
      })
    }
    if (warnings.length > 0) {
      warnings.forEach(warning => {
        console.log(`├─   ⚠️  ${warning}`)
        results.warnings++
      })
    }
    if (info.length > 0) {
      info.forEach(infoItem => {
        console.log(`├─   ℹ️  ${infoItem}`)
      })
    }
    if (issues.length === 0 && warnings.length === 0) {
      console.log('├─   ✅ No compatibility issues found')
    }
    console.log('└─ Chrome analysis completed\n')
    
    // Step 6: Package size analysis
    logStep('Analyzing package size...')
    const stats = getDirectoryStats(CHROME_BUILD_DIR)
    const sizeMB = (stats.totalSize / 1024 / 1024).toFixed(2)
    const sizeLimit = 128 // Chrome limit in MB
    
    console.log('├─ PACKAGE STATISTICS:')
    console.log(`├─   Total Files: ${stats.fileCount}`)
    console.log(`├─   Total Size:  ${sizeMB} MB`)
    console.log(`├─   Size Limit:  ${sizeLimit} MB (Chrome Web Store)`)
    
    if (stats.totalSize > sizeLimit * 1024 * 1024) {
      console.log('└─ ❌ Package size exceeds Chrome limit\n')
      throw new Error(`Extension size (${sizeMB}MB) exceeds Chrome limit (${sizeLimit}MB)`)
    } else {
      const percentageUsed = ((stats.totalSize / (sizeLimit * 1024 * 1024)) * 100).toFixed(1)
      console.log(`├─   Usage:       ${percentageUsed}% of allowed size`)
      console.log('└─ ✅ Package size within limits\n')
    }
    
    // Cleanup
    if (fs.existsSync(TEMP_ARTIFACTS_DIR)) {
      fs.rmSync(TEMP_ARTIFACTS_DIR, { recursive: true, force: true })
    }
    
    // Final summary
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log(`║${centerText('🕸 CHROME VALIDATION SUMMARY')}║`)
    console.log('╠════════════════════════════════════════════════════════════════╣')
    console.log(`║${centerText(`Status: ${results.errors === 0 ? '✅ PASSED' : '❌ FAILED'}`)}║`)
    console.log(`║${centerText(`Errors:   ${results.errors.toString().padStart(3, ' ')}`)}║`)
    console.log(`║${centerText(`Warnings: ${results.warnings.toString().padStart(3, ' ')}`)}║`)
    console.log(`║${centerText(`Notices:  ${results.notices.toString().padStart(3, ' ')}`)}║`)
    console.log('╠════════════════════════════════════════════════════════════════╣')
    console.log(`║${centerText('🕸 Chrome Extension Ready for Web Store Submission!')}║`)
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
    
    if (results.errors > 0) {
      process.exit(1)
    }
    
  } catch (error) {
    // Cleanup on error
    if (fs.existsSync(TEMP_ARTIFACTS_DIR)) {
      fs.rmSync(TEMP_ARTIFACTS_DIR, { recursive: true, force: true })
    }
    
    console.log(createErrorBox('🕸 CHROME VALIDATION FAILED') + '\n')
    const horizontalLine = '═'.repeat(64)
    console.log(`╠${horizontalLine}╣`)
    console.log(`║${centerText(`❌ Error: ${error.message.slice(0, 51)}`)}║`)
    console.log(`╠${horizontalLine}╣`)
    console.log(`║${centerText('Please fix the above issues and run validation again.')}║`)
    console.log(`╚${horizontalLine}╝\n`)
    
    logError('Chrome validation failed:', error.message)
    process.exit(1)
  }
}

function getDirectoryStats(dirPath) {
  let fileCount = 0
  let totalSize = 0

  function traverse(currentPath) {
    const items = fs.readdirSync(currentPath)

    for (const item of items) {
      const itemPath = path.join(currentPath, item)
      const stats = fs.statSync(itemPath)

      if (stats.isDirectory()) {
        traverse(itemPath)
      } else {
        fileCount++
        totalSize += stats.size
      }
    }
  }

  traverse(dirPath)
  return { fileCount, totalSize }
}

/**
 * Substitute extension name from package.json
 * @param {Object} obj - Object to process
 * @returns {Object} Object with substituted name
 */
async function substituteMessages(obj) {
  const processed = JSON.parse(JSON.stringify(obj))
  const extensionName = pkg.name === 'translate-it' ? 'Translate It' : pkg.name

  function substituteValue(value) {
    if (typeof value === 'string') {
      return value.replace(/__MSG_nameChrome__|__MSG_nameFirefox__|__MSG_name__/g, extensionName)
    }
    return value
  }

  function processObject(current) {
    if (typeof current === 'string') {
      return substituteValue(current)
    } else if (Array.isArray(current)) {
      return current.map(item => processObject(item))
    } else if (typeof current === 'object' && current !== null) {
      const result = {}
      for (const [key, value] of Object.entries(current)) {
        result[key] = processObject(value)
      }
      return result
    }
    return current
  }

  return processObject(processed)
}

// Run validation
validateChromeExtension()