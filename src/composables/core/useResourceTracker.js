// src/composables/core/useResourceTracker.js
import { onUnmounted } from 'vue'
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

  onUnmounted(() => {
    tracker.cleanup()
    console.log(`🧹 Resources for group '${groupId}' cleaned up automatically`)
  })

  return tracker
}
