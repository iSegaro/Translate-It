// src/composables/core/useResourceTracker.js
import { onUnmounted, getCurrentInstance } from 'vue'
import ResourceTracker from '../../core/memory/ResourceTracker.js'

// Environment detection
const isDevelopment = import.meta.env.DEV;

// Helper function to check if logging should be enabled
const shouldEnableLogging = () => {
  // In production, only enable logging if explicitly requested
  if (!isDevelopment) {
    return typeof globalThis !== 'undefined' && globalThis.__MEMORY_DEBUG__ === true;
  }
  // In development, always enable logging
  return true;
};

/**
 * Vue Composable for automatic resource management
 * Automatically cleans up resources when Vue component is unmounted
 *
 * @param {string} groupId - Group identifier for batch cleanup
 * @returns {ResourceTracker} Resource tracker instance
 */
export function useResourceTracker(groupId) {
  const tracker = new ResourceTracker(groupId)

  // Only register onUnmounted if we're inside a component context
  const instance = getCurrentInstance()
  if (instance) {
    onUnmounted(() => {
      tracker.cleanup()
      
      // Only log in development or when explicitly enabled
      if (shouldEnableLogging()) {
        console.log(`🧹 Resources for group '${groupId}' cleaned up automatically`)
      }
    })
  } else {
    // Only warn in development or when debugging is enabled
    if (shouldEnableLogging()) {
      console.warn(`⚠️ useResourceTracker('${groupId}') called outside component context. Manual cleanup required.`)
    }
  }

  return tracker
}
