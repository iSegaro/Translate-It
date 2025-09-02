/**
 * useUITransition - Universal Composable for UI State Transitions
 * 
 * Provides smooth animations for UI state changes like language, theme, or settings updates.
 * Supports customizable timing, animation types, and callbacks.
 * 
 * @example
 * // For language changes
 * const transition = useUITransition({
 *   watchSource: () => locale.value,
 *   transitionType: 'language',
 *   duration: 600
 * })
 * 
 * // For theme changes  
 * const transition = useUITransition({
 *   watchSource: () => settingsStore.settings.THEME,
 *   transitionType: 'theme'
 * })
 */

import { ref, computed, watch, nextTick } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useUITransition')

export function useUITransition(options = {}) {
  const {
    watchSource,
    transitionType = 'generic',
    duration = 600,
    containerSelector = null,
    onTransitionStart = () => {},
    onTransitionMid = () => {},
    onTransitionEnd = () => {},
    autoApplyClasses = true,
    customShimmerColor = null
  } = options

  // Transition state
  const isTransitioning = ref(false)
  const pendingValue = ref(null)
  const displayValue = ref(null)
  const transitionId = ref(0)

  // Initialize display value if watchSource is provided
  if (watchSource && typeof watchSource === 'function') {
    try {
      displayValue.value = watchSource()
    } catch (error) {
      logger.warn('Failed to initialize display value:', error.message)
    }
  }

  // Get container element
  const getContainer = () => {
    if (containerSelector) {
      const element = document.querySelector(containerSelector)
      if (!element) {
        logger.warn(`Container not found: ${containerSelector}`)
      }
      return element
    }
    return document.documentElement
  }

  // Apply CSS classes for transition state
  const applyTransitionClasses = (container, add = true) => {
    if (!container) return
    
    const baseClass = 'ui-transition-container'
    const typeClass = `${transitionType}-transition`
    const transitioningClass = 'transitioning'
    
    if (add) {
      container.classList.add(baseClass, typeClass, transitioningClass)
      
      // Apply custom shimmer color if provided
      if (customShimmerColor) {
        container.style.setProperty('--ui-transition-shimmer-color', customShimmerColor)
      }
    } else {
      container.classList.remove(transitioningClass)
      
      // Clean up custom properties
      if (customShimmerColor) {
        container.style.removeProperty('--ui-transition-shimmer-color')
      }
    }
  }

  // Start transition animation
  const startTransition = async (newValue = null) => {
    if (isTransitioning.value) {
      logger.debug('Transition already in progress, queuing new transition')
      return
    }

    const currentId = ++transitionId.value
    const container = getContainer()
    
    try {
      logger.debug(`Starting ${transitionType} transition`, { newValue, duration })
      
      // Set transition state
      isTransitioning.value = true
      pendingValue.value = newValue
      
      // Apply CSS classes
      applyTransitionClasses(container, true)
      
      // Call start callback
      await nextTick()
      onTransitionStart(newValue)
      
      // Mid-transition: update display value
      setTimeout(async () => {
        if (transitionId.value !== currentId) return // Prevent race conditions
        
        logger.debug(`Mid-transition: applying value change for ${transitionType}`)
        displayValue.value = pendingValue.value
        
        await nextTick()
        onTransitionMid(pendingValue.value)
      }, duration / 2)
      
      // End transition
      setTimeout(async () => {
        if (transitionId.value !== currentId) return // Prevent race conditions
        
        logger.debug(`Completed ${transitionType} transition`)
        
        // Reset state
        isTransitioning.value = false
        pendingValue.value = null
        
        // Remove CSS classes
        applyTransitionClasses(container, false)
        
        await nextTick()
        onTransitionEnd(displayValue.value)
      }, duration)
      
    } catch (error) {
      logger.error(`Failed to start ${transitionType} transition:`, error)
      
      // Reset state on error
      isTransitioning.value = false
      pendingValue.value = null
      applyTransitionClasses(container, false)
    }
  }

  // Stop current transition
  const stopTransition = () => {
    if (!isTransitioning.value) return
    
    logger.debug(`Stopping ${transitionType} transition`)
    
    const container = getContainer()
    
    // Reset state immediately
    isTransitioning.value = false
    pendingValue.value = null
    transitionId.value++
    
    // Remove CSS classes
    applyTransitionClasses(container, false)
  }

  // Reset transition to initial state
  const resetTransition = () => {
    stopTransition()
    if (watchSource && typeof watchSource === 'function') {
      try {
        displayValue.value = watchSource()
      } catch (error) {
        logger.warn('Failed to reset display value:', error.message)
      }
    }
  }

  // Watch for source changes and trigger transition
  if (watchSource && typeof watchSource === 'function') {
    watch(watchSource, async (newValue, oldValue) => {
      if (oldValue !== undefined && newValue !== oldValue) {
        await startTransition(newValue)
      }
    }, { immediate: false })
  }

  // Computed properties
  const currentValue = computed(() => displayValue.value)
  const transitionState = computed(() => ({
    isTransitioning: isTransitioning.value,
    pendingValue: pendingValue.value,
    currentValue: displayValue.value
  }))

  // CSS class helpers
  const getTransitionClasses = computed(() => ({
    'ui-transition-container': true,
    [`${transitionType}-transition`]: true,
    'transitioning': isTransitioning.value
  }))

  return {
    // State
    isTransitioning,
    currentValue,
    transitionState,
    
    // Methods
    startTransition,
    stopTransition,
    resetTransition,
    
    // Helpers
    getTransitionClasses,
    
    // For Vue transition components
    transitionProps: computed(() => ({
      name: 'ui-transition',
      mode: 'out-in',
      duration: duration
    }))
  }
}

// Preset configurations for common use cases
export const createLanguageTransition = (watchSource, options = {}) => {
  return useUITransition({
    watchSource,
    transitionType: 'language',
    duration: 600,
    customShimmerColor: 'var(--color-primary-rgb, 59, 130, 246)',
    ...options
  })
}

export const createThemeTransition = (watchSource, options = {}) => {
  return useUITransition({
    watchSource,
    transitionType: 'theme',
    duration: 500,
    customShimmerColor: 'var(--color-accent-rgb, 99, 102, 241)',
    ...options
  })
}

export const createSettingsTransition = (watchSource, options = {}) => {
  return useUITransition({
    watchSource,
    transitionType: 'settings',
    duration: 400,
    customShimmerColor: 'var(--color-success-rgb, 34, 197, 94)',
    ...options
  })
}