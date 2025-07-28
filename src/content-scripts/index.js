// Content script entry point for Vue build
// This is a bridge between the existing content script and Vue build system

// Import polyfill for browser API compatibility
import '../utils/browser-polyfill.js'

// Import and initialize Vue bridge
import { vueBridge } from './vue-bridge.js'

// Import Select Element Manager for element selection functionality
import { selectElementManager } from './select-element-manager.js'

// Import and initialize content script TTS handler
import { contentTTSHandler } from './content-tts-handler.js'

console.log('Content script loaded via Vue build system')
console.log('Vue bridge initialized:', vueBridge.isInitialized)
console.log('Select Element Manager loaded:', !!selectElementManager)
console.log('Content TTS Handler loaded:', !!contentTTSHandler)
