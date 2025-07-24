// Background script entry point for Vue build
// This is a bridge between the existing background script and Vue build system

// Import webextension-polyfill for browser API compatibility
import 'webextension-polyfill'

// Import and register Vue message handler
import { vueMessageHandler } from './vue-message-handler.js'

// Register the Vue message handler
vueMessageHandler.register()

console.log('Background script loaded via Vue build system')
console.log('Vue message handler registered')