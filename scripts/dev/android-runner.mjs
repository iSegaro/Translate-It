#!/usr/bin/env node

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logStep, logSuccess, logError } from '../shared/logger.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))

const args = process.argv.slice(2)
const shouldBuild = args.includes('--build')

// Allow overriding device IP via --device=IP or ANDROID_DEVICE env var
const deviceArg = args.find(arg => arg.startsWith('--device='))
const deviceIp = deviceArg ? deviceArg.split('=')[1] : (process.env.ANDROID_DEVICE || '192.168.240.112:5555')

const FIREFOX_BUILD_DIR = `dist/firefox/Translate-It-v${pkg.version}`

/**
 * Run extension on Firefox Android using web-ext
 */
async function runAndroid() {
  try {
    if (shouldBuild) {
      logStep('Building Firefox extension for Android...')
      // dev:firefox is used for development builds as per package.json
      execSync('pnpm run dev:firefox', { stdio: 'inherit', cwd: rootDir })
      logSuccess('Firefox build completed')
    }

    logStep(`Starting Android deployment on device: ${deviceIp}...`)
    
    const buildPath = path.join(rootDir, FIREFOX_BUILD_DIR)
    if (!fs.existsSync(buildPath)) {
      logError(`Build directory not found: ${FIREFOX_BUILD_DIR}`)
      console.log('💡 Tip: Run with --build flag to create the build first: pnpm run dev:android')
      process.exit(1)
    }

    // Construct web-ext command
    // Using double quotes for paths to handle spaces or special characters
    const webExtCommand = `web-ext run -t firefox-android --source-dir "${FIREFOX_BUILD_DIR}" --android-device "${deviceIp}"`
    
    logStep('Executing web-ext run...')
    
    // web-ext run is a persistent process that handles its own logging
    execSync(webExtCommand, { stdio: 'inherit', cwd: rootDir })
    
  } catch (error) {
    // execSync throws if the process exits with non-zero code or is interrupted (e.g., Ctrl+C)
    if (error.status === null) {
      logSuccess('Android runner stopped (SIGINT)')
    } else {
      logError('Android deployment failed:', error.message)
      process.exit(1)
    }
  }
}

runAndroid()
