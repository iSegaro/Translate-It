// src/managers/content/windows/translation/TranslationRenderer.js

import { createLogger } from "../../../../utils/core/logger.js";
import { WindowsConfig } from "../core/WindowsConfig.js";
import { createTranslationRenderer } from "../../../../utils/rendering/TranslationRenderer.js";
import { TranslationMode, CONFIG } from "../../../../config.js";

/**
 * Renders translation content for WindowsManager
 */
export class TranslationRenderer {
  constructor(factory, ttsManager) {
    this.logger = createLogger('Content', 'TranslationRenderer');
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
      try {
        await navigator.clipboard.writeText(textToCopy);
        
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
   * Render error message
   */
  renderError(container, errorMessage) {
    if (!container) return;

    container.textContent = "";
    const errorElement = this.factory.createErrorElement(CONFIG.ICON_ERROR + errorMessage);
    container.appendChild(errorElement);
    
    this.logger.debug('Error message rendered', { errorMessage });
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
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    textNodes.forEach(textNode => {
      const content = textNode.textContent;
      if (content.toLowerCase().includes(searchText.toLowerCase())) {
        const parent = textNode.parentNode;
        const highlightedHTML = content.replace(
          new RegExp(searchText, 'gi'),
          '<mark>$&</mark>'
        );
        
        const wrapper = document.createElement('span');
        wrapper.innerHTML = highlightedHTML;
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
      mark.outerHTML = mark.innerHTML;
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