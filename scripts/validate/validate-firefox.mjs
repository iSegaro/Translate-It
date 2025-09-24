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

const FIREFOX_BUILD_DIR = path.join(rootDir, `dist/firefox/Translate-It-v${pkg.version}`)

/**
 * Validate Firefox extension build
 */
async function validateFirefoxExtension() {
  try {
    console.log(createBox('🦊 FIREFOX EXTENSION VALIDATOR') + '\n')
    
    const results = {
      errors: 0,
      warnings: 0,
      notices: 0
    }
    
    // Step 1: Check if build exists
    logStep('Checking Firefox build directory...')
    if (!fs.existsSync(FIREFOX_BUILD_DIR)) {
      throw new Error(`Firefox build directory not found: ${FIREFOX_BUILD_DIR}`)
    }
    console.log('├─ ✅ Firefox build directory found')
    console.log(`└─ Path: ${FIREFOX_BUILD_DIR}\n`)
    
    // Step 2: Validate manifest
    logStep('Validating manifest.json...')
    const manifestPath = path.join(FIREFOX_BUILD_DIR, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      throw new Error('manifest.json not found in Firefox build')
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    // Substitute extension name
    const substitutedManifest = await substituteMessages(manifest)

    // Firefox-specific manifest checks
    if (!substitutedManifest.manifest_version || (substitutedManifest.manifest_version !== 2 && substitutedManifest.manifest_version !== 3)) {
      throw new Error('Firefox extension must use Manifest V2 or V3')
    }
    console.log(`├─ ✅ Manifest Version: V${substitutedManifest.manifest_version}`)

    if (!substitutedManifest.name || !substitutedManifest.version || !substitutedManifest.description) {
      throw new Error('Missing required manifest fields')
    }
    console.log(`├─ ✅ Extension Name: ${substitutedManifest.name}`)
    console.log(`├─ ✅ Extension Version: ${substitutedManifest.version}`)
    console.log(`└─ ✅ Manifest validation completed\n`)
    
    // Step 3: Mozilla addons-linter validation
    try {
      logStep('Running Mozilla addons-linter...')
      
      const addonLinterCommand = `addons-linter "${FIREFOX_BUILD_DIR}"`
      const output = execSync(addonLinterCommand, { encoding: 'utf8' })
      
      // Parse addons-linter output
      const lines = output.split('\n')
      
      let errors = 0, warnings = 0, notices = 0
      for (const line of lines) {
        if (line.includes('errors') && line.trim().match(/^errors\s+\d+/)) {
          errors = parseInt(line.trim().split(/\s+/)[1])
        }
        if (line.includes('warnings') && line.trim().match(/^warnings\s+\d+/)) {
          warnings = parseInt(line.trim().split(/\s+/)[1])  
        }
        if (line.includes('notices') && line.trim().match(/^notices\s+\d+/)) {
          notices = parseInt(line.trim().split(/\s+/)[1])
        }
      }
      
      results.errors += errors
      results.warnings += warnings  
      results.notices += notices
      
      console.log('├─ VALIDATION RESULTS:')
      console.log(`├─   Errors:   ${errors === 0 ? '✅ ' + errors : '❌ ' + errors}`)
      console.log(`├─   Warnings: ${warnings === 0 ? '✅ ' + warnings : '⚠️ ' + warnings}`)
      console.log(`├─   Notices:  ${notices === 0 ? '✅ ' + notices : 'ℹ️ ' + notices}`)
      
      if (errors > 0) {
        console.log('└─ ❌ addons-linter found critical errors\n')
        throw new Error(`addons-linter found ${errors} error(s)`)
      } else {
        console.log('└─ ✅ Mozilla validation successful\n')
      }
      
    } catch (error) {
      if (error.stdout && error.stdout.includes('Validation Summary:')) {
        console.log('├─ DETAILED OUTPUT:')
        console.log(error.stdout.split('\n').map(line => '│  ' + line).join('\n'))
        console.log('└─ ❌ addons-linter validation failed\n')
        throw new Error('addons-linter validation failed with issues')
      } else if (!error.message.includes('addons-linter')) {
        console.log('⚠️  addons-linter not found. Install with: pnpm add -D addons-linter\n')
        results.warnings++
      } else {
        throw error
      }
    }
    
    // Step 4: Firefox-specific analysis
    logStep('Analyzing Firefox compatibility...')
    const issues = []
    const warnings = []
    const info = []
    
    // Check Firefox-specific settings
    if (manifest.browser_specific_settings?.gecko) {
      info.push('Firefox-specific settings configured')
      if (manifest.browser_specific_settings.gecko.id) {
        info.push(`Extension ID: ${manifest.browser_specific_settings.gecko.id}`)
      }
    }
    
    // Check background implementation
    if (manifest.background) {
      if (manifest.background.scripts && manifest.manifest_version === 3) {
        info.push('Uses background.scripts (Firefox MV3 compatible)')
      } else if (manifest.background.service_worker && manifest.manifest_version === 3) {
        info.push('Uses service_worker (Manifest V3 standard)')
      } else if (manifest.background.scripts && manifest.manifest_version === 2) {
        info.push('Uses background.scripts (Manifest V2 standard)')
      }
    }
    
    // Check permissions
    if (manifest.permissions?.includes('<all_urls>')) {
      info.push('Uses <all_urls> permission (required for translation)')
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
    console.log('└─ Firefox analysis completed\n')
    
    // Step 5: Package size analysis
    logStep('Analyzing package size...')
    const stats = getDirectoryStats(FIREFOX_BUILD_DIR)
    const sizeMB = (stats.totalSize / 1024 / 1024).toFixed(2)
    const sizeLimit = 200 // Firefox limit in MB
    
    console.log('├─ PACKAGE STATISTICS:')
    console.log(`├─   Total Files: ${stats.fileCount}`)
    console.log(`├─   Total Size:  ${sizeMB} MB`)
    console.log(`├─   Size Limit:  ${sizeLimit} MB (Firefox Add-ons)`)
    
    if (stats.totalSize > sizeLimit * 1024 * 1024) {
      console.log('└─ ❌ Package size exceeds Firefox limit\n')
      throw new Error(`Extension size (${sizeMB}MB) exceeds Firefox limit (${sizeLimit}MB)`)
    } else {
      const percentageUsed = ((stats.totalSize / (sizeLimit * 1024 * 1024)) * 100).toFixed(1)
      console.log(`├─   Usage:       ${percentageUsed}% of allowed size`)
      console.log('└─ ✅ Package size within limits\n')
    }
    
    // Final summary
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log(`║${centerText('🦊 FIREFOX VALIDATION SUMMARY')}║`)
    console.log('╠════════════════════════════════════════════════════════════════╣')
    const statusText = results.errors === 0 ? '✅ PASSED' : '❌ FAILED'
    const statusLine = `Status:  ${statusText}`
    const errorLine = `Errors:    ${results.errors.toString().padStart(3, ' ')}`
    const warningLine = `Warnings:  ${results.warnings.toString().padStart(3, ' ')}`
    const noticeLine = `Notices:   ${results.notices.toString().padStart(3, ' ')}`

    console.log(`║${' '.repeat(64)}║`)
    console.log(`║${centerText(statusLine)}║`)
    console.log(`║${centerText(errorLine)}║`)
    console.log(`║${centerText(warningLine)}║`)
    console.log(`║${centerText(noticeLine)}║`)
    console.log(`║${' '.repeat(64)}║`)
    console.log('╠════════════════════════════════════════════════════════════════╣')
    console.log(`║${centerText('🦊 Firefox Extension Ready for Add-ons Store Submission!')}║`)
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
    
    if (results.errors > 0) {
      process.exit(1)
    }
    
  } catch (error) {
    console.log(createErrorBox('🦊 FIREFOX VALIDATION FAILED') + '\n')
    const horizontalLine = '═'.repeat(64)
    console.log(`╠${horizontalLine}╣`)
    console.log(`║${centerText(`❌ Error: ${error.message.slice(0, 51)}`)}║`)
    console.log(`╠${horizontalLine}╣`)
    console.log(`║${centerText('Please fix the above issues and run validation again.')}║`)
    console.log(`╚${horizontalLine}╝\n`)
    
    logError('Firefox validation failed:', error.message)
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
validateFirefoxExtension()