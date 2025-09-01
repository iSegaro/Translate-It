// src/composables/useUI.js
// Vue composable for UI state management in sidepanel
import { ref, nextTick } from "vue";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useUI');

export function useUI() {
  // State
  const isHistoryPanelOpen = ref(false);
  const isApiDropdownOpen = ref(false);
  const isSelectElementModeActive = ref(false);
  const feedbackStates = ref({});

  // Toggle history panel
  const toggleHistoryPanel = () => {
    isHistoryPanelOpen.value = !isHistoryPanelOpen.value;
  };

  // Open history panel
  const openHistoryPanel = () => {
    isHistoryPanelOpen.value = true;
  };

  // Close history panel
  const closeHistoryPanel = () => {
    isHistoryPanelOpen.value = false;
  };

  // Toggle API dropdown
  const toggleApiDropdown = () => {
    isApiDropdownOpen.value = !isApiDropdownOpen.value;
  };

  // Open API dropdown
  const openApiDropdown = () => {
    isApiDropdownOpen.value = true;
  };

  // Close API dropdown
  const closeApiDropdown = () => {
    isApiDropdownOpen.value = false;
  };

  // Toggle inline toolbar visibility based on content (matches uiManager.js)
  const toggleInlineToolbarVisibility = (container) => {
    if (!container) return;

    const textElement = container.querySelector("textarea, .result");
    if (!textElement) return;

    const text = (textElement.value || textElement.textContent || "").trim();
    container.classList.toggle("has-content", !!text);
  };

  // Show visual feedback on an element (matches uiManager.js)
  const showVisualFeedback = (
    element,
    feedbackType = "success",
    duration = 800,
  ) => {
    if (!element) return;

    const feedbackClass = `feedback-${feedbackType}`;
    element.classList.add(feedbackClass);

    // Track feedback state
    const elementId = element.id || element.className || "unknown";
    feedbackStates.value[elementId] = feedbackType;

    setTimeout(() => {
      element.classList.remove(feedbackClass);
      delete feedbackStates.value[elementId];
    }, duration);
  };

  // Update toolbar visibility for multiple containers
  const updateToolbarVisibilities = (containers) => {
    containers.forEach((container) => {
      if (container) {
        toggleInlineToolbarVisibility(container);
      }
    });
  };

  // Handle element selection mode toggle
  const toggleElementSelection = () => {
    isSelectElementModeActive.value = !isSelectElementModeActive.value;
  };

  // Activate element selection mode
  const activateElementSelection = () => {
    isSelectElementModeActive.value = true;
  };

  // Deactivate element selection mode
  const deactivateElementSelection = () => {
    isSelectElementModeActive.value = false;
  };

  // Close all dropdowns and panels
  const closeAllOverlays = () => {
    isApiDropdownOpen.value = false;
    // Note: History panel usually stays open when clicked elsewhere
  };

  // Handle global click outside
  const handleGlobalClick = (event) => {
    // Close API dropdown if clicking outside
    if (isApiDropdownOpen.value) {
      const apiDropdown = document.querySelector(".api-dropdown");
      const apiButton = document.querySelector("#apiProviderBtn");

      if (
        apiDropdown &&
        apiButton &&
        !apiDropdown.contains(event.target) &&
        !apiButton.contains(event.target)
      ) {
        closeApiDropdown();
      }
    }
  };

  // Setup global event listeners
  const setupGlobalListeners = () => {
    document.addEventListener("click", handleGlobalClick);
  };

  // Cleanup global event listeners
  const cleanupGlobalListeners = () => {
    document.removeEventListener("click", handleGlobalClick);
  };

  // Focus management
  const focusElement = async (element) => {
    if (!element) return false;

    await nextTick();
    try {
      element.focus();
      return true;
    } catch (error) {
      logger.warn("Could not focus element:", error);
      return false;
    }
  };

  // Scroll to element
  const scrollToElement = (element, behavior = "smooth") => {
    if (!element) return false;

    try {
      element.scrollIntoView({ behavior, block: "nearest" });
      return true;
    } catch (error) {
      logger.warn("Could not scroll to element:", error);
      return false;
    }
  };

  return {
    // State
    isHistoryPanelOpen,
    isApiDropdownOpen,
    isSelectElementModeActive,
    feedbackStates,

    // History Panel
    toggleHistoryPanel,
    openHistoryPanel,
    closeHistoryPanel,

    // API Dropdown
    toggleApiDropdown,
    openApiDropdown,
    closeApiDropdown,

    // Element Selection
    toggleElementSelection,
    activateElementSelection,
    deactivateElementSelection,

    // UI Utilities
    toggleInlineToolbarVisibility,
    showVisualFeedback,
    updateToolbarVisibilities,
    closeAllOverlays,

    // Global Events
    setupGlobalListeners,
    cleanupGlobalListeners,

    // Focus & Scroll
    focusElement,
    scrollToElement,
  };
}