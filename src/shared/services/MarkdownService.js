import { SimpleMarkdown } from '@/shared/utils/text/markdown.js';
import DOMPurify from 'dompurify';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'MarkdownService');

/**
 * Centralized service for markdown rendering across the extension
 * Provides secure, consistent markdown processing with different modes
 */
export class MarkdownService {
  constructor() {
    this.defaultConfig = {
      basic: {
        enableTables: false,
        enableGfm: false,
        preserveSpacing: true,
        sanitize: true,
        target: 'dom' // 'dom' or 'html'
      },
      full: {
        enableTables: true,
        enableGfm: true,
        preserveSpacing: true,
        sanitize: true,
        target: 'html'
      }
    };
  }

  /**
   * Render markdown content with specified configuration
   * @param {string} content - Markdown content to render
   * @param {Object} options - Rendering options
   * @param {'basic'|'full'} [options.mode='basic'] - Rendering mode
   * @param {boolean} [options.sanitize=true] - Whether to sanitize output
   * @param {'dom'|'html'} [options.target='dom'] - Output format
   * @returns {string|HTMLElement} Rendered content
   */
  render(content, options = {}) {
    const {
      mode = 'basic',
      sanitize = true,
      target = 'dom'
    } = options;

    // Merge with default config
    const config = { ...this.defaultConfig[mode], ...options };

    try {
      logger.debug('Rendering markdown', { mode, contentLength: content?.length });

      // For full mode, use enhanced markdown with GFM support
      if (mode === 'full') {
        return this._renderFullMarkdown(content, config, target, sanitize);
      }

      // For basic mode, use SimpleMarkdown
      return this._renderBasicMarkdown(content, config, target, sanitize);
    } catch (error) {
      logger.error('Error rendering markdown:', error);
      // Fallback to plain text with line breaks
      return this._fallbackRender(content, target);
    }
  }

  /**
   * Render basic markdown (for translations)
   * @private
   */
  _renderBasicMarkdown(content, config, target, sanitize) {
    // Use SimpleMarkdown for basic rendering
    const element = SimpleMarkdown.render(content);

    if (target === 'html') {
      if (!element) return content.replace(/\n/g, '<br>');
      
      // Use a temporary div to safely get the HTML content
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(element.cloneNode(true));
      const html = tempDiv.innerHTML;
      
      return sanitize ? DOMPurify.sanitize(html) : html;
    }

    return element;
  }

  /**
   * Render full markdown with GFM support (for docs/changelog)
   * @private
   */
  _renderFullMarkdown(content, config, target, sanitize) {
    // For now, enhance SimpleMarkdown with additional processing
    let processedContent = content;

    // Enhanced spacing for better readability
    if (config.preserveSpacing) {
      processedContent = this._processSpacing(processedContent);
    }

    // Use SimpleMarkdown as base
    const element = SimpleMarkdown.render(processedContent);

    // Add table support if enabled
    if (config.enableTables) {
      this._processTables(element);
    }

    if (target === 'html') {
      if (!element) return processedContent.replace(/\n/g, '<br>');
      
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(element.cloneNode(true));
      let html = tempDiv.innerHTML;

      if (sanitize) {
        html = DOMPurify.sanitize(html, {
          ALLOWED_TAGS: [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'br', 'hr',
            'ul', 'ol', 'li',
            'strong', 'em', 'b', 'i',
            'code', 'pre',
            'a', 'blockquote',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'span', 'div'
          ],
          ALLOWED_ATTR: ['href', 'class', 'target', 'rel', 'id']
        });
      }

      return html;
    }

    return element;
  }

  /**
   * Decode HTML entities in content
   * @private
   */
  _decodeHtmlEntities(content) {
    try {
      // Use DOMParser for safe entity decoding instead of innerHTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      const decoded = doc.documentElement.textContent || "";

      // Additionally handle specific entities that might not be decoded properly
      return decoded.replace(/&nbsp;/g, ' ')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
    } catch {
      logger.warn('Failed to decode HTML entities using DOMParser, using basic fallback');
      return content.replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
    }
  }

  /**
   * Process spacing for better markdown rendering
   * @private
   */
  _processSpacing(content) {
    return content
      // Add proper spacing after headers
      .replace(/(#{1,6}\s+[^\n]+)/g, '$1\n<br>')
      // Ensure proper spacing for changelog format
      .replace(/(#{1,6}\s+[^\n]+)\n\n(#{1,6})/g, '$1\n<br><br>$2')
      // Handle single empty lines
      .replace(/\n([^\n#])/g, '\n<br>$1');
  }

  /**
   * Basic table processing (can be enhanced later)
   * @private
   */
  _processTables(element) {
    // For now, we'll add basic table structure support
    // This can be expanded with full table parsing in the future
    const tables = element.querySelectorAll('table');
    tables.forEach(table => {
      table.classList.add('markdown-table');
    });
  }

  /**
   * Fallback rendering for errors
   * @private
   */
  _fallbackRender(content, target) {
    if (target === 'html') {
      return DOMPurify.sanitize(content.replace(/\n/g, '<br>'));
    }

    const div = document.createElement('div');
    div.className = 'markdown-fallback';
    
    // Safely set content using text nodes and br elements instead of innerHTML
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) {
        div.appendChild(document.createElement('br'));
      }
      div.appendChild(document.createTextNode(line));
    });
    
    return div;
  }

  /**
   * Create a renderer with specific presets
   */
  static create() {
    return new MarkdownService();
  }

  /**
   * Quick render method for basic content
   */
  static renderBasic(content, options = {}) {
    const service = new MarkdownService();
    return service.render(content, { ...options, mode: 'basic' });
  }

  /**
   * Quick render method for full content
   */
  static renderFull(content, options = {}) {
    const service = new MarkdownService();
    return service.render(content, { ...options, mode: 'full' });
  }
}

// Export singleton instance
export const markdownService = new MarkdownService();
