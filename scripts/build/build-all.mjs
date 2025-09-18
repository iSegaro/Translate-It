#!/usr/bin/env node

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logStep, logSuccess, logError } from '../shared/logger.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')

/**
 * Build all browser extensions and create publish packages
 */
async function buildAll() {
  try {
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log('║                 🚀 BUILDING ALL EXTENSIONS                     ║')  
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
    
    const startTime = Date.now()
    
    // Step 1: Build Chrome
    logStep('Building Chrome extension...')
    execSync('node scripts/build/build-chrome.mjs', { 
      cwd: rootDir,
      stdio: 'inherit'
    })
    
    // Step 2: Build Firefox  
    logStep('Building Firefox extension...')
    execSync('node scripts/build/build-firefox.mjs', {
      cwd: rootDir, 
      stdio: 'inherit'
    })
    
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
- **Manifest**: Version 2
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
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗')
    console.log('║                    🎉 ALL BUILDS COMPLETED                     ║')
    console.log('╠════════════════════════════════════════════════════════════════╣')
    console.log('║  ✅ Chrome Extension Ready                                     ║')
    console.log('║  ✅ Firefox Extension Ready                                    ║') 
    console.log('║  ✅ Publish Packages Created                                   ║')
    console.log('╠════════════════════════════════════════════════════════════════╣')
    console.log(`║  ⏱️ Total build time: ${duration}s${' '.repeat(38 - duration.length)}║`)
    console.log('║  📦 Ready for Web Store submission!                           ║')
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
    
    logSuccess('All extensions built successfully!')
    logStep('Publish packages location: dist/Publish/')
    
  } catch (error) {
    console.log('\n╔════════════════════════════════════════════════════════════════╗')
    console.log('║                      ❌ BUILD FAILED                           ║')
    console.log('╠════════════════════════════════════════════════════════════════╣')
    console.log(`║  Error: ${error.message.slice(0, 51).padEnd(51, ' ')}║`)
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
    
    logError('Build failed:', error.message)
    process.exit(1)
  }
}

// Run build
buildAll()