// src/composables/core/useResourceTracker.js
import { onUnmounted, getCurrentInstance } from 'vue'
import ResourceTracker from '../../core/memory/ResourceTracker.js'

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
      console.log(`🧹 Resources for group '${groupId}' cleaned up automatically`)
    })
  } else {
    console.warn(`⚠️ useResourceTracker('${groupId}') called outside component context. Manual cleanup required.`)
  }

  return tracker
}
