#!/usr/bin/env node

import { execSync } from 'child_process'
import { logStep, logSuccess, logError } from '../shared/logger.mjs'
import { createBox, centerText, emptyBoxLine } from '../shared/box-utils.mjs'

/**
 * Validate all browser extensions
 */
async function validateAll() {
  try {
    console.log(createBox('🔍 VALIDATING ALL EXTENSIONS') + '\n')
    
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
      console.log(`║${centerText('✅ ALL VALIDATIONS PASSED')}║`)
      console.log('╠════════════════════════════════════════════════════════════════╣')
      console.log(emptyBoxLine())
      console.log(`║${centerText('🕸 Chrome Extension: Ready for Web Store')}║`)
      console.log(`║${centerText('🦊 Firefox Extension: Ready for Add-ons Store')}║`)
      console.log(emptyBoxLine())
      console.log('╠════════════════════════════════════════════════════════════════╣')
      console.log(`║${centerText(`⏱️ Total validation time: ${duration}s`)}║`)
      console.log(`║${centerText('🚀 Extensions ready for submission!')}║`)
    } else {
      console.log(`║${centerText('❌ VALIDATION FAILED')}║`)
      console.log('╠════════════════════════════════════════════════════════════════╣')
      console.log(emptyBoxLine())
      console.log(`║${centerText(`Failed validations: ${totalErrors}`)}║`)
      console.log(`║${centerText('Please fix the issues above and re-run validation.')}║`)
      console.log(emptyBoxLine())
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
    console.log(`║${centerText('❌ VALIDATION ERROR')}║`)
    console.log('╠════════════════════════════════════════════════════════════════╣')
    console.log(`║${centerText(`Error: ${error.message.slice(0, 45)}`)}║`)
    console.log('╚════════════════════════════════════════════════════════════════╝\n')
    
    logError('Validation process failed:', error.message)
    process.exit(1)
  }
}

// Run validation
validateAll()