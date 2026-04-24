import { ref, onMounted } from 'vue';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from '@/core/PageEventBus.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'useContentAppTextFieldIcons');

/**
 * Composable for managing TextFieldIcon components in the ContentApp.
 * Handles their registration, positioning updates, and visibility.
 * 
 * @param {Object} tracker - Resource tracker for event listeners
 * @returns {Object} State and methods for icon management
 */
export function useContentAppTextFieldIcons(tracker) {
  const activeIcons = ref([]); // Stores { id, position, visible, targetElement, attachmentMode } for each icon
  const iconRefs = ref(new Map()); // Stores Vue component references

  /**
   * Icon reference management helper
   * 
   * @param {string} iconId - Unique ID of the icon
   * @param {HTMLElement|null} el - Component instance or null
   */
  const setIconRef = (iconId, el) => {
    if (el) {
      iconRefs.value.set(iconId, el);
    } else {
      iconRefs.value.delete(iconId);
    }
  };

  /**
   * Retrieves a component reference for an icon
   * 
   * @param {string} iconId - Unique ID of the icon
   * @returns {Object|undefined} Component reference
   */
  const getIconRef = (iconId) => {
    return iconRefs.value.get(iconId);
  };

  /**
   * Handler for icon click events
   */
  const onIconClick = (id) => {
    logger.info(`TextFieldIcon clicked: ${id}`);
    if (pageEventBus) {
      pageEventBus.emit('text-field-icon-clicked', { id });
    }
  };

  /**
   * Handler for icon position update events from the component
   */
  const onIconPositionUpdated = (data) => {
    logger.debug(`TextFieldIcon position updated:`, data);
  };

  onMounted(() => {
    const pageEventBus = window.pageEventBus;
    if (!pageEventBus) return;

    // Listen for TextFieldIcon registration
    tracker.addEventListener(pageEventBus, 'add-field-icon', (detail) => {
      // SECURITY/DUPLICATION FIX: Only handle the icon if it's meant for this specific frame.
      const isForThisFrame = detail.targetElement && document.contains(detail.targetElement);
      
      if (!isForThisFrame) {
        logger.debug('Field icon requested, but target element is not in this frame. Skipping.');
        return;
      }

      logger.info('Event: add-field-icon', detail);
      if (!activeIcons.value.some(icon => icon.id === detail.id)) {
        activeIcons.value.push({
          id: detail.id,
          position: detail.position,
          visible: detail.visible !== false,
          targetElement: detail.targetElement,
          attachmentMode: detail.attachmentMode || 'smart',
          positioningMode: detail.positioningMode || 'absolute'
        });
      }
    });

    // Listen for icon removal
    tracker.addEventListener(pageEventBus, 'remove-field-icon', (detail) => {
      logger.info('Event: remove-field-icon', detail);
      const iconIndex = activeIcons.value.findIndex(icon => icon.id === detail.id);
      if (iconIndex !== -1) {
        iconRefs.value.delete(detail.id);
        activeIcons.value.splice(iconIndex, 1);
      }
    });

    // Listen for batch removal
    tracker.addEventListener(pageEventBus, 'remove-all-field-icons', () => {
      logger.info('Event: remove-all-field-icons');
      iconRefs.value.clear();
      activeIcons.value = [];
    });

    // Listen for position updates
    tracker.addEventListener(pageEventBus, 'update-field-icon-position', (detail) => {
      logger.debug('Event: update-field-icon-position', detail);
      const icon = activeIcons.value.find(icon => icon.id === detail.id);
      if (icon) {
        icon.position = detail.position;
        icon.visible = detail.visible !== false;
        
        const iconComponent = getIconRef(detail.id);
        if (iconComponent) {
          if (iconComponent.updatePositionImmediate) {
            iconComponent.updatePositionImmediate(detail.position);
          } else if (iconComponent.updatePosition) {
            iconComponent.updatePosition(detail.position);
          }

          if (!iconComponent.isSmoothFollowing?.()) {
            iconComponent.enableSmoothFollowing?.();
          }
        }
      }
    });

    // Listen for visibility updates
    tracker.addEventListener(pageEventBus, 'update-field-icon-visibility', (detail) => {
      const icon = activeIcons.value.find(icon => icon.id === detail.id);
      if (icon) {
        icon.visible = detail.visible;

        const iconComponent = getIconRef(detail.id);
        if (iconComponent) {
          if (detail.visible && iconComponent.show) {
            iconComponent.show();
          } else if (!detail.visible && iconComponent.hide) {
            iconComponent.hide();
          }
        }
      }
    });
  });

  return {
    activeIcons,
    setIconRef,
    getIconRef,
    onIconClick,
    onIconPositionUpdated
  };
}
