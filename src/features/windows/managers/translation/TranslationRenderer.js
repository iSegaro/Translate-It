// src/managers/content/windows/translation/TranslationRenderer.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { createTranslationRenderer } from "../../../../utils/rendering/TranslationRenderer.js";
import { TranslationMode, CONFIG } from "@/shared/config/config.js";
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { isRTLLanguage } from '@/features/element-selection/utils/textDirection.js';
import { UI_LOCALE_TO_CODE_MAP } from '@/shared/config/languageConstants.js';
import { SimpleMarkdown } from '@/shared/utils/text/markdown.js';

let logger = null;
const getLogger = () => {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, 'TranslationRenderer');
  }
  return logger;
};

/**
 * Renders translation content for WindowsManager
 */
export class TranslationRenderer {
  constructor(factory, ttsManager) {
    this.logger = getLogger();
    this.factory = factory;
    this.ttsManager = ttsManager;
  }

  /**
   * Create and render translation content
   */
  renderTranslationContent(container, translatedText, originalText, translationMode, onClose) {
    if (!container) {
      this.logger.error('No container provided for translation rendering');
      return;
    }

    // Clear existing content
    container.textContent = "";

    // Create first line (header)
    const firstLine = this._createFirstLine(originalText, translatedText, translationMode, onClose);
    container.appendChild(firstLine);

    // Create second line (content)
    const secondLine = this._createSecondLine(translatedText);
    container.appendChild(secondLine);

    this.logger.debug('Translation content rendered successfully');
    return { firstLine, secondLine };
  }

  /**
   * Create first line (header with controls)
   */
  _createFirstLine(originalText, translatedText, translationMode, onClose) {
    const firstLine = this.factory.createFirstLine();

    // Create TTS icon for original text
    const ttsIconOriginal = this.ttsManager.createTTSIcon(
      originalText,
      CONFIG.SOURCE_LANGUAGE || "listen",
      this.factory
    );
    firstLine.appendChild(ttsIconOriginal);

    // Create copy icon
    const copyIcon = this._createCopyIcon(translatedText);
    firstLine.appendChild(copyIcon);

    // Create drag handle
    const dragHandle = this.factory.createDragHandle();
    
    // Add original text to drag handle if in dictionary mode
    if (translationMode === TranslationMode.Dictionary_Translation) {
      const originalTextSpan = this.factory.createOriginalTextSpan(originalText);
      dragHandle.appendChild(originalTextSpan);
    }
    firstLine.appendChild(dragHandle);

    // Create close button
    const closeButton = this.factory.createCloseButton();
    closeButton.addEventListener("click", (e) => {
      e.stopPropagation();
      
      // Log close event
      this.logger.debug('Close button clicked!');
      
      if (onClose) onClose();
    });
    firstLine.appendChild(closeButton);

    return firstLine;
  }

  /**
   * Create second line (translation content)
   */
  _createSecondLine(translatedText) {
    const secondLine = this.factory.createSecondLine();
    
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
   * Create copy icon with functionality
   */
  _createCopyIcon(textToCopy, title = "Copy") {
    const icon = this.factory.createCopyIcon(title);
    
    icon.addEventListener("click", async (e) => {
      e.stopPropagation();
      
      // Clean translation for a clean copy
      const cleanText = SimpleMarkdown.getCleanTranslation(textToCopy);
      
      // Log click event
      this.logger.debug('📋 Copy icon clicked!', { 
        text: cleanText.slice(0, 20) + (cleanText.length > 20 ? '...' : ''), 
        title: title 
      });
      
      try {
        await navigator.clipboard.writeText(cleanText);
        
        // Visual feedback
        const originalOpacity = icon.style.opacity;
        icon.style.opacity = "0.5";
        setTimeout(() => {
          icon.style.opacity = originalOpacity;
        }, 150);
        
        this.logger.debug('Text copied to clipboard');
      } catch (error) {
        this.logger.warn("Failed to copy text", error);
      }
    });
    
    return icon;
  }

  /**
   * Apply appropriate text direction based on content
   */
  _applyTextDirection(element, text) {
    if (!element || !text) return;

    // Check if element has style property before accessing it
    if (!element.style || typeof element.style !== 'object') {
      this.logger.warn('Element style not available for text direction application');
      // Fallback: add CSS classes only
      if (element.classList) {
        const isRtl = CONFIG.RTL_REGEX.test(text);
        element.classList.add(isRtl ? 'ti-rtl-text' : 'ti-ltr-text');
      }
      return;
    }

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
   * Render error message with retry functionality
   */
  renderError(container, errorMessage) {
    if (!container) return;

    container.textContent = "";
    
    // Create error container
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-display-container';
    
    // Determine UI language direction for errors
    const uiLocale = settingsManager.get('APPLICATION_LOCALIZE', CONFIG.APPLICATION_LOCALIZE || 'en');
    const langCode = UI_LOCALE_TO_CODE_MAP[uiLocale] || uiLocale;
    const isRtlUI = isRTLLanguage(langCode);
    
    errorContainer.style.cssText = `
      padding: 12px;
      border-left: ${isRtlUI ? 'none' : '3px solid #dc3545'};
      border-right: ${isRtlUI ? '3px solid #dc3545' : 'none'};
      background-color: rgba(220, 53, 69, 0.1);
      border-radius: 6px;
      line-height: 1.4;
      color: #dc3545;
      font-size: 14px;
      margin: 8px;
      direction: ${isRtlUI ? 'rtl' : 'ltr'};
      text-align: ${isRtlUI ? 'right' : 'left'};
    `;
    
    // Error message text
    const errorText = document.createElement('div');
    errorText.className = 'error-text';
    errorText.textContent = errorMessage;
    errorText.style.marginBottom = '12px';
    errorContainer.appendChild(errorText);
    
    container.appendChild(errorContainer);
    
    this.logger.debug('Enhanced error message rendered with UI direction', { 
      errorMessage, 
      isRtlUI, 
      uiLocale 
    });
  }

  /**
   * Render loading state
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
   * Update existing content
   */
  updateContent(secondLine, newContent) {
    if (!secondLine) return;

    // Clear existing content
    secondLine.textContent = "";
    
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
    
    secondLine.appendChild(contentElement);
    this._applyTextDirection(secondLine, newContent);
    
    this.logger.debug('Content updated successfully');
  }

  /**
   * Clear all content from container
   */
  clearContent(container) {
    if (!container) return;
    container.textContent = "";
  }

  /**
   * Get drag handle from rendered content
   */
  getDragHandle(firstLine) {
    if (!firstLine) return null;
    
    // Find element with cursor: move style
    const elements = firstLine.querySelectorAll('*');
    for (const element of elements) {
      if (element.style.cursor === 'move') {
        return element;
      }
    }
    
    return null;
  }

  /**
   * Highlight specific content in translation
   */
  highlightContent(element, searchText) {
    if (!element || !searchText) return;

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    textNodes.forEach(textNode => {
      const content = textNode.textContent;
      if (content.toLowerCase().includes(searchText.toLowerCase())) {
        const parent = textNode.parentNode;
        // Create wrapper with safe DOM methods instead of innerHTML
        const wrapper = document.createElement('span');
        const regex = new RegExp(searchText, 'gi');
        const parts = content.split(regex);
        const matches = content.match(regex) || [];

        parts.forEach((part, index) => {
          if (part) {
            const textNode = document.createTextNode(part);
            wrapper.appendChild(textNode);
          }

          if (index < matches.length) {
            const mark = document.createElement('mark');
            mark.textContent = matches[index];
            wrapper.appendChild(mark);
          }
        });

        parent.replaceChild(wrapper, textNode);
      }
    });
  }

  /**
   * Remove highlighting from content
   */
  removeHighlighting(element) {
    if (!element) return;

    const marks = element.querySelectorAll('mark');
    marks.forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        // Safe way to unwrap: move all children of 'mark' to its parent, then remove 'mark'
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
      }
    });
  }

  /**
   * Get text content from rendered element
   */
  getTextContent(element) {
    if (!element) return '';
    return element.textContent || element.innerText || '';
  }

  /**
   * Check if content is RTL
   */
  isRTLContent(text) {
    return CONFIG.RTL_REGEX.test(text);
  }
}