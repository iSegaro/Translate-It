// src/managers/content/windows/translation/EnhancedTranslationRenderer.js

import browser from "webextension-polyfill";
import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";
import { WindowsConfig } from "../core/WindowsConfig.js";
import { createTranslationRenderer } from "../../../../utils/rendering/TranslationRenderer.js";
import { TranslationMode, CONFIG } from "../../../../config.js";

// Import our new Text Actions System
import { useTextActions } from "../../../../composables/actions/useTextActions.js";
import { useCopyAction } from "../../../../composables/actions/useCopyAction.js";
import { useTTSAction } from "../../../../composables/actions/useTTSAction.js";

/**
 * Enhanced TranslationRenderer using the new Text Actions System
 * Provides unified copy/TTS functionality consistent with popup/sidepanel
 */
export class EnhancedTranslationRenderer {
  constructor(factory, ttsManager) {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'EnhancedTranslationRenderer');
    this.factory = factory;
    this.ttsManager = ttsManager;
    
    // Initialize Text Actions composables
    this.copyAction = useCopyAction();
    this.ttsAction = useTTSAction();
    this.textActions = useTextActions();
    
    this.logger.debug('Enhanced TranslationRenderer initialized with Text Actions System');
  }

  /**
   * Create and render translation content with enhanced actions
   */
  renderTranslationContent(container, translatedText, originalText, translationMode, onClose) {
    if (!container) {
      this.logger.error('No container provided for translation rendering');
      return;
    }

    // Clear existing content
    container.textContent = "";

    // Add development toggle if in dev mode
    const isDevelopment = this._isDevelopmentMode();
    if (isDevelopment) {
      const devToggle = this._createDevelopmentToggle();
      container.appendChild(devToggle);
    }

    // Create enhanced first line (header with unified actions)
    const firstLine = this._createEnhancedFirstLine(originalText, translatedText, translationMode, onClose);
    container.appendChild(firstLine);

    // Create second line (content)
    const secondLine = this._createSecondLine(translatedText);
    container.appendChild(secondLine);

    // Add result actions toolbar
    const resultActionsToolbar = this._createResultActionsToolbar(translatedText);
    container.appendChild(resultActionsToolbar);

    this.logger.debug('Enhanced translation content rendered successfully');
    return { firstLine, secondLine, resultActionsToolbar };
  }

  /**
   * Create enhanced first line with unified action buttons
   */
  _createEnhancedFirstLine(originalText, translatedText, translationMode, onClose) {
    const firstLine = this.factory.createFirstLine();
    firstLine.classList.add('enhanced-first-line');

    // Create source text actions group
    const sourceActions = this._createSourceActionsGroup(originalText);
    firstLine.appendChild(sourceActions);

    // Create drag handle
    const dragHandle = this.factory.createDragHandle();
    dragHandle.classList.add('enhanced-drag-handle');
    
    // Add original text to drag handle if in dictionary mode
    if (translationMode === TranslationMode.Dictionary_Translation) {
      const originalTextSpan = this.factory.createOriginalTextSpan(originalText);
      dragHandle.appendChild(originalTextSpan);
    }
    firstLine.appendChild(dragHandle);

    // Create close button
    const closeButton = this._createEnhancedCloseButton(onClose);
    firstLine.appendChild(closeButton);

    return firstLine;
  }

  /**
   * Create source text actions group (TTS for original text)
   */
  _createSourceActionsGroup(originalText) {
    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'source-actions-group';
    actionsGroup.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px;
    `;

    // Create TTS button for source text
    const sourceTTSButton = this._createEnhancedTTSButton(originalText, 'source');
    actionsGroup.appendChild(sourceTTSButton);

    return actionsGroup;
  }

  /**
   * Create result actions toolbar (copy and TTS for translated text)
   */
  _createResultActionsToolbar(translatedText) {
    const toolbar = document.createElement('div');
    toolbar.className = 'result-actions-toolbar';
    toolbar.style.cssText = `
      position: absolute;
      top: 4px;
      right: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(var(--color-bg-secondary-rgb, 255, 255, 255), 0.9);
      border: 1px solid rgba(var(--color-border-rgb, 200, 200, 200), 0.5);
      border-radius: 6px;
      padding: 2px;
      backdrop-filter: blur(4px);
      z-index: 1000;
    `;

    // Create copy button for translated text
    const copyButton = this._createEnhancedCopyButton(translatedText);
    toolbar.appendChild(copyButton);

    // Create TTS button for translated text
    const ttsButton = this._createEnhancedTTSButton(translatedText, 'target');
    toolbar.appendChild(ttsButton);

    return toolbar;
  }

  /**
   * Create enhanced copy button using Text Actions System
   */
  _createEnhancedCopyButton(textToCopy, title = "Copy translation") {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = title;
    button.className = 'enhanced-copy-button action-button';
    button.style.cssText = `
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      opacity: 0.7;
    `;

    // Create copy icon
    const icon = document.createElement('img');
    icon.src = browser.runtime.getURL('copy.png');
    icon.alt = 'Copy';
    icon.style.cssText = `
      width: 16px;
      height: 16px;
      display: block;
    `;
    button.appendChild(icon);

    // Enhanced copy functionality
    button.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        this.logger.debug('[EnhancedTranslationRenderer] Copying text:', textToCopy.substring(0, 30) + '...');
        
        const success = await this.copyAction.copyText(textToCopy);
        if (success) {
          // Visual feedback
          this._showButtonFeedback(button, '✓', 'success');
          this.logger.debug('[EnhancedTranslationRenderer] Text copied successfully');
        } else {
          this._showButtonFeedback(button, '✗', 'error');
          this.logger.warn('[EnhancedTranslationRenderer] Copy failed');
        }
      } catch (error) {
        this._showButtonFeedback(button, '✗', 'error');
        this.logger.error('[EnhancedTranslationRenderer] Copy error:', error);
      }
    });

    // Hover effects
    button.addEventListener('mouseenter', () => {
      button.style.opacity = '1';
      button.style.background = 'rgba(var(--color-primary-rgb, 0, 120, 215), 0.1)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.opacity = '0.7';
      button.style.background = 'none';
    });

    return button;
  }

  /**
   * Create enhanced TTS button using Text Actions System
   */
  _createEnhancedTTSButton(textToSpeak, type = 'target', title = null) {
    const defaultTitle = type === 'source' ? 'Listen to original text' : 'Listen to translation';
    
    const button = document.createElement('button');
    button.type = 'button';
    button.title = title || defaultTitle;
    button.className = `enhanced-tts-button action-button tts-${type}`;
    button.style.cssText = `
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      opacity: 0.7;
    `;

    // Create TTS icon
    const icon = document.createElement('img');
    icon.src = browser.runtime.getURL('speaker.png');
    icon.alt = type === 'source' ? 'Listen to source' : 'Listen to translation';
    icon.style.cssText = `
      width: 16px;
      height: 16px;
      display: block;
    `;
    button.appendChild(icon);

    // Enhanced TTS functionality
    button.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        this.logger.debug(`[EnhancedTranslationRenderer] Speaking ${type} text:`, textToSpeak.substring(0, 30) + '...');
        
        // Detect language based on type
        const language = type === 'source' ? 'auto' : CONFIG.TARGET_LANGUAGE || 'en';
        
        const success = await this.ttsAction.speakText(textToSpeak, language);
        if (success) {
          // Visual feedback for speaking
          this._showButtonFeedback(button, '🔊', 'speaking');
          this.logger.debug(`[EnhancedTranslationRenderer] ${type} TTS started successfully`);
        } else {
          this._showButtonFeedback(button, '✗', 'error');
          this.logger.warn(`[EnhancedTranslationRenderer] ${type} TTS failed`);
        }
      } catch (error) {
        this._showButtonFeedback(button, '✗', 'error');
        this.logger.error(`[EnhancedTranslationRenderer] ${type} TTS error:`, error);
      }
    });

    // Hover effects
    button.addEventListener('mouseenter', () => {
      button.style.opacity = '1';
      button.style.background = 'rgba(var(--color-primary-rgb, 0, 120, 215), 0.1)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.opacity = '0.7';
      button.style.background = 'none';
    });

    return button;
  }

  /**
   * Create enhanced close button
   */
  _createEnhancedCloseButton(onClose) {
    const closeButton = this.factory.createCloseButton();
    closeButton.classList.add('enhanced-close-button');
    
    closeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      
      // Log close event
      this.logger.debug('❌ Enhanced close button clicked!');
      
      if (onClose) onClose();
    });
    
    // Enhanced hover effects
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.transform = 'scale(1.1)';
    });
    
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.transform = 'scale(1)';
    });

    return closeButton;
  }

  /**
   * Show visual feedback on action buttons
   */
  _showButtonFeedback(button, symbol, type = 'success') {
    const originalContent = button.innerHTML;
    
    // Create feedback element
    const feedback = document.createElement('span');
    feedback.textContent = symbol;
    feedback.style.cssText = `
      font-size: 12px;
      font-weight: bold;
      color: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#FF9800'};
    `;
    
    // Replace content temporarily
    button.innerHTML = '';
    button.appendChild(feedback);
    
    // Restore original content after delay
    setTimeout(() => {
      button.innerHTML = originalContent;
    }, type === 'speaking' ? 3000 : 1500);
  }

  /**
   * Create second line (translation content) - same as original
   */
  _createSecondLine(translatedText) {
    const secondLine = this.factory.createSecondLine();
    secondLine.style.position = 'relative'; // For absolute positioning of toolbar
    
    // Use unified TranslationRenderer for consistent rendering
    const renderer = createTranslationRenderer({
      enableMarkdown: true,
      enableLabelFormatting: true,
      mode: 'selection'
    });
    
    const contentElement = renderer.createContentElement({
      content: translatedText,
      error: null,
      isLoading: false,
      placeholder: ''
    });
    
    secondLine.appendChild(contentElement);
    
    // Apply text direction based on content
    this._applyTextDirection(secondLine, translatedText);
    
    return secondLine;
  }

  /**
   * Apply appropriate text direction based on content - same as original
   */
  _applyTextDirection(element, text) {
    if (!element || !text) return;
    
    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
    
    this.logger.debug('Applied text direction', { 
      isRtl, 
      direction: element.style.direction,
      textAlign: element.style.textAlign 
    });
  }

  /**
   * Render error message - same as original
   */
  renderError(container, errorMessage) {
    if (!container) return;

    container.textContent = "";
    const errorElement = this.factory.createErrorElement(CONFIG.ICON_ERROR + errorMessage);
    container.appendChild(errorElement);
    
    this.logger.debug('Error message rendered', { errorMessage });
  }

  /**
   * Render loading state - same as original
   */
  renderLoading(container) {
    if (!container) return null;

    container.textContent = "";
    const loadingElement = this.factory.createLoadingDots();
    container.appendChild(loadingElement);
    
    this.logger.debug('Loading state rendered');
    return loadingElement;
  }

  /**
   * Update existing content - same as original
   */
  updateContent(secondLine, newContent) {
    if (!secondLine) return;

    // Clear existing content but preserve toolbar
    const contentElements = secondLine.querySelectorAll(':not(.result-actions-toolbar)');
    contentElements.forEach(el => el.remove());
    
    // Create new content
    const renderer = createTranslationRenderer({
      enableMarkdown: true,
      enableLabelFormatting: true,
      mode: 'selection'
    });
    
    const contentElement = renderer.createContentElement({
      content: newContent,
      error: null,
      isLoading: false,
      placeholder: ''
    });
    
    // Insert before toolbar if it exists
    const toolbar = secondLine.querySelector('.result-actions-toolbar');
    if (toolbar) {
      secondLine.insertBefore(contentElement, toolbar);
    } else {
      secondLine.appendChild(contentElement);
    }
    
    // Apply text direction
    this._applyTextDirection(secondLine, newContent);
    
    this.logger.debug('Content updated with enhanced actions preserved');
  }

  /**
   * Check if in development mode
   */
  _isDevelopmentMode() {
    return (
      window.location.hostname === 'localhost' ||
      window.location.hostname.includes('dev') ||
      localStorage.getItem('dev-mode') === 'true'
    );
  }

  /**
   * Create development toggle for switching renderers
   */
  _createDevelopmentToggle() {
    const toggle = document.createElement('div');
    toggle.className = 'dev-renderer-toggle';
    toggle.style.cssText = `
      position: absolute;
      top: -20px;
      right: 0;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      z-index: 1001;
      user-select: none;
      transition: all 0.2s ease;
    `;

    const isEnhanced = localStorage.getItem('windows-manager-enhanced-version') !== 'false';
    toggle.textContent = `🔧 ${isEnhanced ? 'Enhanced' : 'Classic'}`;
    toggle.title = 'Click to toggle renderer (Dev Mode)';

    // Toggle functionality
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Send message to toggle renderer globally
      const event = new CustomEvent('toggle-windows-manager-renderer', {
        detail: { source: 'dev-toggle' }
      });
      window.dispatchEvent(event);
      
      // Update toggle display
      setTimeout(() => {
        const newIsEnhanced = localStorage.getItem('windows-manager-enhanced-version') !== 'false';
        toggle.textContent = `🔧 ${newIsEnhanced ? 'Enhanced' : 'Classic'}`;
      }, 100);
    });

    // Hover effects
    toggle.addEventListener('mouseenter', () => {
      toggle.style.background = 'rgba(0, 0, 0, 0.9)';
      toggle.style.transform = 'scale(1.05)';
    });

    toggle.addEventListener('mouseleave', () => {
      toggle.style.background = 'rgba(0, 0, 0, 0.8)';
      toggle.style.transform = 'scale(1)';
    });

    return toggle;
  }
}

export default EnhancedTranslationRenderer;
