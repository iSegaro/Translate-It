// src/content-scripts/selection-windows-bridge.js
// Bridge between OLD EventHandler and Vue SelectionWindows system
// This file can be imported in content scripts that need SelectionWindows

import { useSelectionWindows } from '@/composables/useSelectionWindows.js';
import { createLogger } from '@/utils/core/logger.js';
import { checkContentScriptAccess } from '@/utils/core/tabPermissions.js';

const logger = createLogger('Core', 'selection-windows-bridge');

let selectionWindowsComposable = null;

/**
 * Initialize SelectionWindows Vue bridge
 * Call this in content scripts that need SelectionWindows functionality
 */
export function initializeSelectionWindowsBridge() {
  const access = checkContentScriptAccess();
  if (!access.isAccessible) {
    logger.warn('[SelectionWindowsBridge] Cannot initialize on a restricted page.');
    return null;
  }

  if (selectionWindowsComposable) {
    logger.debug('[SelectionWindowsBridge] Already initialized');
    return selectionWindowsComposable;
  }

  logger.debug('[SelectionWindowsBridge] Initializing Vue SelectionWindows bridge...');
  
  try {
    // Create the composable instance
    // Note: This is a bit unusual as we're creating a composable outside Vue component
    // But it works for bridging with OLD system
    selectionWindowsComposable = useSelectionWindows();
    
    logger.debug('[SelectionWindowsBridge] Vue SelectionWindows bridge initialized successfully');
    return selectionWindowsComposable;
  } catch (error) {
    logger.error('[SelectionWindowsBridge] Failed to initialize:', error);
    return null;
  }
}

/**
 * Get the SelectionWindows composable instance
 * Returns null if not initialized
 */
export function getSelectionWindowsComposable() {
  return selectionWindowsComposable;
}

/**
 * Show selection window (convenience function)
 */
export async function showSelectionWindow(selectedText, position) {
  const composable = selectionWindowsComposable || initializeSelectionWindowsBridge();
  if (!composable) {
    logger.error('[SelectionWindowsBridge] Cannot show - bridge not available');
    return false;
  }

  return await composable.showSelectionWindow(selectedText, position);
}

/**
 * Dismiss selection window (convenience function)
 */
export function dismissSelectionWindow(immediate = true) {
  if (!selectionWindowsComposable) {
    logger.debug('[SelectionWindowsBridge] Cannot dismiss - bridge not initialized');
    return;
  }

  selectionWindowsComposable.dismissSelectionWindow(immediate);
}

/**
 * Check if selection window should be shown based on current settings
 */
export async function shouldShowSelectionWindow() {
  const composable = selectionWindowsComposable || initializeSelectionWindowsBridge();
  if (!composable) {
    logger.error('[SelectionWindowsBridge] Cannot check settings - bridge not available');
    return false;
  }

  return await composable.shouldShowSelectionWindow();
}

/**
 * Cancel current translation (convenience function)
 */
export function cancelCurrentTranslation() {
  if (!selectionWindowsComposable) {
    logger.debug('[SelectionWindowsBridge] Cannot cancel - bridge not initialized');
    return;
  }

  selectionWindowsComposable.cancelCurrentTranslation();
}

/**
 * Cleanup the bridge (call when content script unloads)
 */
export function cleanupSelectionWindowsBridge() {
  if (selectionWindowsComposable) {
    logger.debug('[SelectionWindowsBridge] Cleaning up...');
    
    try {
      // If there's a cleanup method in the composable, call it
      if (selectionWindowsComposable.cleanup) {
        selectionWindowsComposable.cleanup();
      }
      
      // Dismiss any visible windows
      selectionWindowsComposable.dismissSelectionWindow(true);
    } catch (error) {
      logger.warn('[SelectionWindowsBridge] Error during cleanup:', error);
    }
    
    selectionWindowsComposable = null;
  }
}

// Auto-cleanup on page unload
if (typeof window !== 'undefined') {
  const access = checkContentScriptAccess();
  if (access.isAccessible) {
    window.addEventListener('beforeunload', cleanupSelectionWindowsBridge);
  }
}