/**
 * useTextFieldIcon - Vue composable for text field icon management
 * Provides reactive state and methods for handling text field icons
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useTextFieldInteractionStore } from '../stores/textFieldInteraction.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';

export function useTextFieldIcon() {
  // Use the new Vue composable for automatic cleanup
  const tracker = useResourceTracker('text-field-icon-composable')
  const store = useTextFieldInteractionStore();
  const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'useTextFieldIcon');  // Local reactive state
  const isInitialized = ref(false);
  const pageEventBus = ref(null);
  
  // Computed properties from store
  const activeIcons = computed(() => store.activeIcons);
  const isIconActive = computed(() => store.isIconActive);
  const iconCount = computed(() => store.iconCount);
  
  /**
   * Initialize the text field icon system
   * @param {Object} eventBus - Page event bus instance
   */
  const initialize = (eventBus) => {
    if (isInitialized.value) {
      logger.debug('Already initialized');
      return;
    }
    
    pageEventBus.value = eventBus;
    setupEventListeners();
    isInitialized.value = true;
    
    logger.debug('Text field icon system initialized');
  };
  
  /**
   * Setup event listeners for icon management
   */
  const setupEventListeners = () => {
    if (!pageEventBus.value) {
      logger.error('No event bus available for setup');
      return;
    }
    
    // Listen for icon addition requests (using ResourceTracker)
    tracker.addEventListener(pageEventBus.value, 'add-field-icon', handleAddIcon);
    
    // Listen for icon removal requests (using ResourceTracker)
    tracker.addEventListener(pageEventBus.value, 'remove-field-icon', handleRemoveIcon);
    
    // Listen for remove all icons requests (using ResourceTracker)
    tracker.addEventListener(pageEventBus.value, 'remove-all-field-icons', handleRemoveAllIcons);
    
    logger.debug('Event listeners setup completed');
  };
  
  /**
   * Handle adding a new text field icon
   * @param {Object} iconData - Icon data { id, position }
   */
  const handleAddIcon = (iconData) => {
    logger.debug('Adding text field icon:', iconData.id);
    
    // Validate icon data
    if (!iconData.id || !iconData.position) {
      logger.error('Invalid icon data provided:', iconData);
      return;
    }
    
    // Add to store
    store.addIcon(iconData);
    
    logger.debug('Text field icon added successfully');
  };
  
  /**
   * Handle removing a specific text field icon
   * @param {Object} data - Remove data { id }
   */
  const handleRemoveIcon = (data) => {
    if (!data.id) {
      logger.error('No icon ID provided for removal');
      return;
    }
    
    logger.debug('Removing text field icon:', data.id);
    store.removeIcon(data.id);
  };
  
  /**
   * Handle removing all text field icons
   */
  const handleRemoveAllIcons = () => {
    logger.debug('Removing all text field icons');
    store.clearAllIcons();
  };
  
  /**
   * Handle icon click event
   * @param {string} iconId - ID of the clicked icon
   */
  const handleIconClick = (iconId) => {
    logger.debug('Text field icon clicked:', iconId);
    
    // Emit click event back to content script
    if (pageEventBus.value) {
      pageEventBus.value.emit('text-field-icon-clicked', { id: iconId });
    } else {
      logger.error('No event bus available for icon click event');
    }
    
    // Mark icon as clicked in store
    store.markIconClicked(iconId);
  };
  
  /**
   * Get icon by ID
   * @param {string} iconId - Icon ID
   * @returns {Object|null} Icon data or null
   */
  const getIcon = (iconId) => {
    return store.getIcon(iconId);
  };
  
  /**
   * Check if an icon exists
   * @param {string} iconId - Icon ID
   * @returns {boolean} Whether icon exists
   */
  const hasIcon = (iconId) => {
    return store.hasIcon(iconId);
  };
  
  /**
   * Get all icon information for debugging
   * @returns {Object} Icon information
   */
  const getIconsInfo = () => {
    return {
      initialized: isInitialized.value,
      activeIcons: activeIcons.value,
      iconCount: iconCount.value,
      storeInfo: store.getInfo()
    };
  };
  
  // Lifecycle hooks
  onMounted(() => {
    logger.debug('Text field icon composable mounted');
  });

  // Note: cleanup is now automatic via useResourceTracker

  return {
    // State
    isInitialized,
    activeIcons,
    isIconActive,
    iconCount,

    // Methods
    initialize,
    handleIconClick,
    getIcon,
    hasIcon,
    getIconsInfo
    // cleanup removed - now automatic
  };
}