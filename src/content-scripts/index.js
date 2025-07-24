// Content script entry point for Vue build
// This is a bridge between the existing content script and Vue build system

// Import webextension-polyfill for browser API compatibility
import 'webextension-polyfill'

// Import and initialize Vue bridge
import { vueBridge } from './vue-bridge.js'

console.log('Content script loaded via Vue build system')
console.log('Vue bridge initialized:', vueBridge.isInitialized)