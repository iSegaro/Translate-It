// src/utils/rendering/TranslationRenderer.js
// Unified translation content renderer for both Vue and vanilla JS contexts

import { SimpleMarkdown } from '@/utils/text/markdown.js'
import { shouldApplyRtl } from '@/utils/text/textDetection.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationRenderer')

/**
 * Universal Translation Content Renderer
 * Used by both Vue components and vanilla JS (like SelectionWindows)
 */
export class TranslationRenderer extends ResourceTracker {
  constructor(options = {}) {
    super(); // Initialize ResourceTracker first
    this.options = {
      enableMarkdown: true,
      enableLabelFormatting: true,
      mode: 'standard', // standard, selection, compact
      ...options
    }
  }

  /**
   * Render translation content to HTML string
   * @param {Object} params
   * @param {string} params.content - Translation content
   * @param {string} params.error - Error message
   * @param {boolean} params.isLoading - Loading state
   * @param {string} params.placeholder - Placeholder text
   * @returns {string} Rendered HTML
   */
  renderContent({ content, error, isLoading, placeholder = 'Translation will appear here...' }) {
    if (error) {
      return this._renderError(error)
    }
    
    if (isLoading) {
      return this._renderLoading()
    }
    
    if (!content || !content.trim()) {
      return this._renderPlaceholder(placeholder)
    }
    
    return this._renderTranslationContent(content)
  }

  /**
   * Create DOM element with rendered content
   * @param {Object} params - Same as renderContent
   * @returns {HTMLElement} DOM element
   */
  createContentElement(params) {
    const div = document.createElement('div')
    div.className = this._getContentClasses()
    
    // Apply text direction BEFORE setting innerHTML to prevent layout shift
    if (params.content) {
      const isRtl = shouldApplyRtl(params.content)
      div.setAttribute('dir', isRtl ? 'rtl' : 'ltr')
      div.style.textAlign = isRtl ? 'right' : 'left'
    }
    
    div.innerHTML = this.renderContent(params)
    
    return div
  }

  /**
   * Update existing DOM element with new content
   * @param {HTMLElement} element - Target element
   * @param {Object} params - Content parameters
   */
  updateContentElement(element, params) {
    if (!element) return
    
    element.className = this._getContentClasses()
    
    // Apply text direction BEFORE setting innerHTML to prevent layout shift
    if (params.content) {
      const isRtl = shouldApplyRtl(params.content)
      element.setAttribute('dir', isRtl ? 'rtl' : 'ltr')
      element.style.textAlign = isRtl ? 'right' : 'left'
    }
    
    element.innerHTML = this.renderContent(params)
  }

  /**
   * Create toolbar element with copy and TTS buttons
   * @param {Object} handlers - Event handlers
   * @param {Function} handlers.onCopy - Copy handler
   * @param {Function} handlers.onTTS - TTS handler
   * @returns {HTMLElement} Toolbar element
   */
  createToolbar({ onCopy, onTTS }) {
    const toolbar = document.createElement('div')
    toolbar.className = 'translation-toolbar'
    
    if (onCopy) {
      const copyBtn = this._createToolbarButton('copy.png', 'Copy result', onCopy)
      toolbar.appendChild(copyBtn)
    }
    
    if (onTTS) {
      const ttsBtn = this._createToolbarButton('speaker.png', 'Play result', onTTS)
      toolbar.appendChild(ttsBtn)
    }
    
    return toolbar
  }

  // Private methods
  _renderError(error) {
    return `<div class="error-message">⚠️ ${this._escapeHtml(error)}</div>`
  }

  _renderLoading() {
    return `<div class="loading-message">در حال ترجمه...</div>`
  }

  _renderPlaceholder(placeholder) {
    return `<div class="placeholder-message">${this._escapeHtml(placeholder)}</div>`
  }

  _renderTranslationContent(content) {
    if (!this.options.enableMarkdown) {
      return this._escapeHtml(content).replace(/\n/g, '<br>')
    }

    try {
      const markdownElement = SimpleMarkdown.render(content)
      return markdownElement ? markdownElement.innerHTML : this._escapeHtml(content).replace(/\n/g, '<br>')
    } catch (error) {
      logger.warn('[TranslationRenderer] Markdown rendering failed:', error)
      return this._escapeHtml(content).replace(/\n/g, '<br>')
    }
  }

  _getContentClasses() {
    const classes = ['translation-content']
    
    if (this.options.mode === 'selection') {
      classes.push('selection-mode')
    } else if (this.options.mode === 'compact') {
      classes.push('compact-mode')
    }
    
    return classes.join(' ')
  }

  _createToolbarButton(icon, title, handler) {
    const button = document.createElement('button')
    button.className = 'toolbar-button'
    button.title = title
    button.innerHTML = `<img src="/assets/icons/${icon}" alt="${title}" class="toolbar-icon" />`
    this.addEventListener(button, 'click', handler)
    return button
  }

  _escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

/**
 * Factory function to create renderer instances
 */
export function createTranslationRenderer(options = {}) {
  return new TranslationRenderer(options)
}

/**
 * Quick render function for simple use cases
 */
export function renderTranslationContent(content, options = {}) {
  const renderer = new TranslationRenderer(options)
  return renderer.renderContent({ content })
}

/**
 * Get CSS styles for translation display
 * This ensures consistent styling across Vue and vanilla JS contexts
 */
export function getTranslationDisplayStyles() {
  return `
/* Translation Content Base Styles */
.translation-content {
  /* width: 100%; */
  padding: 12px;
  font-family: Vazirmatn, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: var(--sw-text-color, #333);
  background-color: var(--sw-bg-color, #f8f8f8);
  white-space: normal;
  word-wrap: break-word;
  word-break: break-word;
  overflow-wrap: break-word;
  direction: ltr;
  text-align: left;
}

.translation-content.selection-mode {
  font-size: 13px;
  padding: 8px 12px;
}

.translation-content.compact-mode {
  font-size: 12px;
  padding: 6px 8px;
}

/* Message States */
.translation-content .error-message {
  color: #dc3545;
  font-style: italic;
  padding: 8px;
  border-left: 3px solid #dc3545;
  background-color: rgba(220, 53, 69, 0.1);
  border-radius: 3px;
}

.translation-content .loading-message {
  color: #007bff;
  font-style: italic;
  opacity: 0.8;
  text-align: center;
  padding: 12px;
  animation: pulse 1.5s ease-in-out infinite;
}

.translation-content .placeholder-message {
  color: #6c757d;
  font-style: italic;
  opacity: 0.7;
  text-align: center;
  padding: 12px;
}

/* Markdown Elements */
.translation-content h1,
.translation-content h2,
.translation-content h3 {
  margin-top: 12px;
  margin-bottom: 6px;
  font-weight: 600;
}

.translation-content h1 { font-size: 16px; }
.translation-content h2 { font-size: 15px; }
.translation-content h3 { font-size: 14px; }

.translation-content p {
  margin-bottom: 6px;
}

.translation-content ul,
.translation-content ol {
  margin: 6px 0;
  padding-left: 18px;
  padding-right: 6px;
}

.translation-content li {
  margin-bottom: 3px;
  line-height: 1.4;
}

.translation-content code {
  background: rgba(0,0,0,0.05);
  padding: 1px 3px;
  border-radius: 2px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.translation-content pre {
  background: rgba(0,0,0,0.05);
  padding: 8px;
  border-radius: 3px;
  overflow-x: auto;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  margin: 6px 0;
}

.translation-content blockquote {
  border-left: 2px solid var(--sw-link-color, #0066cc);
  padding-left: 8px;
  margin-left: 0;
  color: var(--sw-text-color, #666);
  font-style: italic;
}

.translation-content a {
  color: var(--sw-link-color, #0066cc);
  text-decoration: none;
}

.translation-content a:hover {
  text-decoration: underline;
}

/* Toolbar Styles */
.translation-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  background: transparent;
}

.toolbar-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  border-radius: 2px;
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.toolbar-button:hover {
  opacity: 1;
}

.toolbar-icon {
  width: 14px;
  height: 14px;
  filter: var(--icon-filter, none);
}

/* Animations */
@keyframes pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.4; }
}

/* Dark theme support */
:host(.theme-dark) .translation-content {
  color: var(--sw-text-color, #e0e0e0);
  background-color: var(--sw-bg-color, #2d2d2d);
}

:host(.theme-dark) .toolbar-icon {
  filter: invert(90%) brightness(1.1);
}
`
}