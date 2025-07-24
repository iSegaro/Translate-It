#!/usr/bin/env node

import { execSync } from 'child_process'
import { logStep, logSuccess, logError } from '../shared/logger.mjs'

/**
 * Validate all browser extensions
 */
async function validateAll() {
  try {
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log('║               🔍 VALIDATING ALL EXTENSIONS                     ║')
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
    
    const startTime = Date.now()
    let totalErrors = 0
    
    // Step 1: Validate Chrome
    logStep('Validating Chrome extension...')
    try {
      execSync('node scripts/validate/validate-chrome.mjs', { 
        stdio: 'inherit',
        cwd: process.cwd()
      })
      logSuccess('Chrome validation completed successfully')
    } catch (error) {
      logError('Chrome validation failed')
      totalErrors++
    }
    
    console.log('\n' + '─'.repeat(66) + '\n')
    
    // Step 2: Validate Firefox
    logStep('Validating Firefox extension...')
    try {
      execSync('node scripts/validate/validate-firefox.mjs', {
        stdio: 'inherit',
        cwd: process.cwd()
      })
      logSuccess('Firefox validation completed successfully')
    } catch (error) {
      logError('Firefox validation failed')
      totalErrors++
    }
    
    // Step 3: Final summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗')
    if (totalErrors === 0) {
      console.log('║                    ✅ ALL VALIDATIONS PASSED                   ║')
      console.log('╠════════════════════════════════════════════════════════════════╣')
      console.log('║  🕸️ Chrome Extension: Ready for Web Store                      ║')
      console.log('║  🦊 Firefox Extension: Ready for Add-ons Store                ║')
      console.log('╠════════════════════════════════════════════════════════════════╣')
      console.log(`║  ⏱️ Total validation time: ${duration}s${' '.repeat(32 - duration.length)}║`)
      console.log('║  🚀 Extensions ready for submission!                          ║')
    } else {
      console.log('║                     ❌ VALIDATION FAILED                       ║')
      console.log('╠════════════════════════════════════════════════════════════════╣')
      console.log(`║  Failed validations: ${totalErrors}${' '.repeat(38)}║`)
      console.log('║  Please fix the issues above and re-run validation.           ║')
    }
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
    
    if (totalErrors > 0) {
      logError(`${totalErrors} validation(s) failed`)
      process.exit(1)
    } else {
      logSuccess('All extensions validated successfully!')
    }
    
  } catch (error) {
    console.log('\n╔════════════════════════════════════════════════════════════════╗')
    console.log('║                    ❌ VALIDATION ERROR                         ║')
    console.log('╠════════════════════════════════════════════════════════════════╣')
    console.log(`║  Error: ${error.message.slice(0, 51).padEnd(51, ' ')}║`)
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
    
    logError('Validation process failed:', error.message)
    process.exit(1)
  }
}

// Run validation
validateAll()