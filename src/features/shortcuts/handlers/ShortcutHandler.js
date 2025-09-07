import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { detectPlatform, Platform } from '@/utils/browser/platform.js';

// Lazy logger initialization to prevent TDZ issues
let logger = null;
const getLogger = () => {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ShortcutHandler');
  }
  return logger;
};

export class ShortcutHandler extends ResourceTracker {
  constructor() {
    super('shortcut-handler');
    
    this.isActive = false;
    this.keydownHandler = null;
    this.translationHandler = null;
    
    // Detect platform for proper key combination
    this.platform = detectPlatform();
    this.modifierKey = this.platform === Platform.MAC ? 'metaKey' : 'ctrlKey';
  }

  async activate() {
    if (this.isActive) {
      getLogger().debug('ShortcutHandler already active');
      return;
    }

    try {
      getLogger().debug('Activating ShortcutHandler');
      
      // Setup keyboard shortcut listeners
      this.setupShortcutListeners();
      
      this.isActive = true;
      getLogger().info('ShortcutHandler activated successfully');
      
    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'ShortcutHandler-activate',
        showToast: false
      });
      throw error;
    }
  }

  async deactivate() {
    if (!this.isActive) {
      getLogger().debug('ShortcutHandler not active');
      return;
    }

    try {
      getLogger().debug('Deactivating ShortcutHandler');
      
      // ResourceTracker cleanup will handle all tracked resources
      this.cleanup();
      
      this.isActive = false;
      getLogger().info('ShortcutHandler deactivated successfully');
      
    } catch (error) {
      getLogger().error('Error deactivating ShortcutHandler:', error);
      // Continue with cleanup even if error occurs
      try {
        this.cleanup();
        this.isActive = false;
      } catch (cleanupError) {
        getLogger().error('Critical: ShortcutHandler cleanup failed:', cleanupError);
      }
    }
  }

  setupShortcutListeners() {
    try {
      // Ctrl+/ (or Cmd+/ on Mac) shortcut handler
      this.keydownHandler = (event) => {
        if (!this.isActive) return;
        
        // Check for Ctrl+/ or Cmd+/ combination
        if (event[this.modifierKey] && event.key === '/') {
          getLogger().debug('Translation shortcut detected:', this.modifierKey + ' + /');
          
          // Prevent default behavior
          event.preventDefault();
          event.stopPropagation();
          
          // Handle the shortcut
          this.handleTranslationShortcut(event);
        }
      };

      // Register the keydown listener
      this.addEventListener(document, 'keydown', this.keydownHandler, { capture: true });

      getLogger().debug(`Shortcut listener setup complete (${this.modifierKey} + /)`);
      
    } catch (error) {
      getLogger().error('Failed to setup shortcut listeners:', error);
    }
  }

  handleTranslationShortcut(event) {
    try {
      const activeElement = document.activeElement;
      
      // Check if active element is a text field
      if (this.isEditableElement(activeElement)) {
        getLogger().debug('Shortcut triggered on text field:', activeElement.tagName);
        
        // Get text content
        const text = this.getElementText(activeElement);
        
        if (!text || text.trim().length === 0) {
          getLogger().debug('No text found in active element for translation');
          return;
        }

        // Trigger translation for text field
        this.triggerTextFieldTranslation(activeElement, text);
        
      } else {
        // Check for selected text
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText) {
          getLogger().debug('Shortcut triggered with selected text:', selectedText.substring(0, 50));
          
          // Trigger translation for selected text
          this.triggerSelectionTranslation(selectedText, selection);
          
        } else {
          getLogger().debug('No text field or selection found for shortcut');
          
          // Show a brief notification
          this.showShortcutHint();
        }
      }
      
    } catch (error) {
      getLogger().error('Error handling translation shortcut:', error);
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'ShortcutHandler-handleShortcut',
        showToast: false
      });
    }
  }

  isEditableElement(element) {
    if (!element) return false;
    
    const tagName = element.tagName.toLowerCase();
    const type = element.type?.toLowerCase();
    
    // Check for input elements
    if (tagName === 'input') {
      const textTypes = ['text', 'email', 'password', 'search', 'url', 'tel'];
      return !type || textTypes.includes(type);
    }
    
    // Check for textarea
    if (tagName === 'textarea') return true;
    
    // Check for contenteditable elements
    if (element.contentEditable === 'true') return true;
    
    return false;
  }

  getElementText(element) {
    if (!element) return '';
    
    if (element.value !== undefined) {
      // Input or textarea
      return element.value;
    } else if (element.textContent !== undefined) {
      // Contenteditable
      return element.textContent;
    }
    
    return '';
  }

  triggerTextFieldTranslation(element, text) {
    try {
      // Import translation handler dynamically to avoid circular dependencies
      import('@/core/InstanceManager.js').then(({ getTranslationHandlerInstance }) => {
        const translationHandler = getTranslationHandlerInstance();
        if (translationHandler && typeof translationHandler.processTranslation_with_CtrlSlash === 'function') {
          translationHandler.processTranslation_with_CtrlSlash({
            text: text,
            target: element
          });
        } else {
          getLogger().error('Translation handler not available or missing method');
        }
      }).catch(error => {
        getLogger().error('Failed to load translation handler:', error);
      });
      
    } catch (error) {
      getLogger().error('Error triggering text field translation:', error);
    }
  }

  triggerSelectionTranslation(selectedText, selection) {
    try {
      // Import Windows Manager to show translation window
      import('@/features/windows/managers/WindowsManager.js').then(({ WindowsManager }) => {
        const windowsManager = new WindowsManager();
        
        // Calculate position for translation window
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        const position = {
          x: rect.left + (rect.width / 2),
          y: rect.bottom + 10
        };
        
        // Show translation window
        windowsManager.show(selectedText, position);
        
      }).catch(error => {
        getLogger().error('Failed to load Windows Manager:', error);
      });
      
    } catch (error) {
      getLogger().error('Error triggering selection translation:', error);
    }
  }

  showShortcutHint() {
    try {
      // Import page event bus to show notification
      import('@/core/PageEventBus.js').then(({ pageEventBus }) => {
        pageEventBus.emit('show-notification', {
          message: `Press ${this.modifierKey === 'metaKey' ? 'Cmd' : 'Ctrl'}+/ in a text field or with selected text to translate`,
          type: 'info',
          duration: 3000
        });
      }).catch(error => {
        getLogger().debug('Could not show shortcut hint:', error);
      });
      
    } catch (error) {
      getLogger().debug('Error showing shortcut hint:', error);
    }
  }

  // Public API methods
  getShortcutKey() {
    const modifier = this.modifierKey === 'metaKey' ? 'Cmd' : 'Ctrl';
    return `${modifier}+/`;
  }

  isShortcutSupported() {
    return this.platform !== Platform.UNKNOWN;
  }

  getStatus() {
    return {
      handlerActive: this.isActive,
      shortcutKey: this.getShortcutKey(),
      platform: this.platform,
      supported: this.isShortcutSupported()
    };
  }
}

export default ShortcutHandler;