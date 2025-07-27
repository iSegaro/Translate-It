// src/content-scripts/select-element-manager.js
// Vue-compatible Select Element Manager
// Integrated with existing services and error handling

import { getBrowserAsync } from '@/utils/browser-polyfill.js'
import { logME } from '@/utils/helpers.js'
import { ErrorHandler } from '@/services/ErrorService.js'
import { ErrorTypes } from '@/services/ErrorTypes.js'
import NotificationManager from '@/managers/NotificationManager.js'

/**
 * SelectElementManager - Vue-compatible element selection system
 * 
 * Features:
 * - Element highlighting on hover
 * - Click to select and extract text
 * - ESC key cancellation
 * - Service integration (ErrorService, NotificationManager)
 * - Cross-browser compatibility
 */
export class SelectElementManager {
  constructor() {
    this.isActive = false
    this.overlayElements = new Set()
    this.originalTexts = new Map()
    this.currentHighlighted = null
    this.Browser = null
    this.translatedElements = new Set() // Track translated elements for revert
    
    // Service instances
    this.errorHandler = new ErrorHandler()
    this.notificationManager = new NotificationManager(this.errorHandler)
    
    // Event handlers (bound to this)
    this.handleMouseOver = this.handleMouseOver.bind(this)
    this.handleMouseOut = this.handleMouseOut.bind(this)
    this.handleClick = this.handleClick.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
    
    // State tracking
    this.messageListener = null
    this.abortController = null
    
    console.log('[SelectElementManager] Initialized with service integration')
  }

  /**
   * Initialize browser API and setup message listener
   */
  async initialize() {
    try {
      this.Browser = await getBrowserAsync()
      this.setupMessageListener()
      
      // Initialize services
      this.notificationManager.initialize()
      
      console.log('[SelectElementManager] Browser API initialized')
    } catch (error) {
      console.error('[SelectElementManager] Initialization failed:', error)
      await this.errorHandler.handle(error, {
        type: ErrorTypes.INTEGRATION,
        context: 'select-element-manager-init'
      })
    }
  }

  /**
   * Setup message listener for background communication
   */
  setupMessageListener() {
    if (!this.Browser || this.messageListener) return
    
    this.messageListener = this.handleMessage
    this.Browser.runtime.onMessage.addListener(this.messageListener)
    console.log('[SelectElementManager] Message listener registered')
  }

  /**
   * Handle messages from background script
   */
  async handleMessage(message, sender, sendResponse) {
    if (message.action === 'TOGGLE_SELECT_ELEMENT_MODE') {
      const shouldActivate = message.data
      
      try {
        if (shouldActivate) {
          await this.activate()
        } else {
          await this.deactivate()
        }
        
        // Send success response to background
        sendResponse({ success: true, isActive: this.isActive })
        console.log(`[SelectElementManager] Mode ${shouldActivate ? 'activated' : 'deactivated'} successfully`)
        
      } catch (error) {
        console.error('[SelectElementManager] Toggle error:', error)
        
        // Handle error via ErrorService
        await this.errorHandler.handle(error, {
          type: ErrorTypes.INTEGRATION,
          context: 'select-element-toggle'
        })
        
        sendResponse({ success: false, error: error.message })
      }
      
      return true // Keep response channel open
    }
    
    return false // Let other handlers process the message
  }

  /**
   * Activate select element mode
   */
  async activate() {
    if (this.isActive) {
      console.log('[SelectElementManager] Already active')
      return
    }

    console.log('[SelectElementManager] Activating select element mode')
    
    this.isActive = true
    this.abortController = new AbortController()
    
    // Add event listeners with abort signal
    const options = { signal: this.abortController.signal, capture: true }
    const keyOptions = { signal: this.abortController.signal, capture: true, passive: false }
    
    document.addEventListener('mouseover', this.handleMouseOver, options)
    document.addEventListener('mouseout', this.handleMouseOut, options)
    document.addEventListener('click', this.handleClick, options)
    document.addEventListener('keydown', this.handleKeyDown, keyOptions)
    
    // Also add keydown to window for better ESC capture
    window.addEventListener('keydown', this.handleKeyDown, keyOptions)
    
    // Visual feedback
    this.addGlobalStyles()
    // await this.showActivationNotification() // Removed: UI will handle notification
    
    // Disable page interactions
    this.disablePageInteractions()
    
    console.log('[SelectElementManager] Select element mode activated')
  }

  /**
   * Deactivate select element mode
   */
  async deactivate() {
    if (!this.isActive) {
      console.log('[SelectElementManager] Already inactive')
      return
    }

    console.log('[SelectElementManager] Deactivating select element mode')
    
    this.isActive = false
    
    // Remove event listeners
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    
    // Clean up highlights
    this.clearHighlight()
    this.clearOverlays()
    
    // Remove global styles
    this.removeGlobalStyles()
    
    // Re-enable page interactions
    this.enablePageInteractions()
    
    // Send cancellation message to background/sidepanel
    try {
      await this.Browser.runtime.sendMessage({
        action: 'elementSelectionCancelled',
        data: {
          reason: 'deactivated',
          timestamp: Date.now()
        }
      })
    } catch (error) {
      console.warn('[SelectElementManager] Failed to send cancellation message:', error)
    }
    
    console.log('[SelectElementManager] Select element mode deactivated')
  }

  /**
   * Handle mouse over event - highlight element
   */
  handleMouseOver(event) {
    if (!this.isActive) return
    
    const element = event.target
    
    // Skip non-text elements
    if (!this.isValidTextElement(element)) return
    
    // Skip if already highlighted
    if (element === this.currentHighlighted) return
    
    // Clear previous highlight
    this.clearHighlight()
    
    // Highlight current element
    this.highlightElement(element)
    this.currentHighlighted = element
  }

  /**
   * Handle mouse out event - remove highlight
   */
  handleMouseOut(event) {
    if (!this.isActive) return
    
    const element = event.target
    
    // Only clear if leaving the highlighted element
    if (element === this.currentHighlighted) {
      // Small delay to prevent flicker when moving between child elements
      setTimeout(() => {
        if (this.currentHighlighted === element) {
          this.clearHighlight()
          this.currentHighlighted = null
        }
      }, 50)
    }
  }

  /**
   * Handle click event - select element for translation
   */
  async handleClick(event) {
    if (!this.isActive) return
    
    event.preventDefault()
    event.stopPropagation()
    
    const element = event.target
    
    if (!this.isValidTextElement(element)) {
      console.log('[SelectElementManager] Invalid element for translation')
      await this.showErrorNotification('Please select an element that contains text')
      return
    }
    
    console.log('[SelectElementManager] Element selected:', element)
    
    try {
      // Extract text from element
      const extractedText = this.extractTextFromElement(element)
      
      if (!extractedText || extractedText.trim().length === 0) {
        console.log('[SelectElementManager] No text found in selected element')
        await this.showNoTextNotification()
        return
      }
      
      console.log('[SelectElementManager] Text extracted:', extractedText.substring(0, 100) + '...')
      
      // Send extracted text to background for translation
      await this.processSelectedElement(element, extractedText)
      
      // Deactivate mode after successful selection
      await this.deactivate()
      
    } catch (error) {
      console.error('[SelectElementManager] Element selection error:', error)
      
      // Handle error via ErrorService
      await this.errorHandler.handle(error, {
        type: ErrorTypes.INTEGRATION,
        context: 'select-element-click'
      })
      
      await this.showErrorNotification(error.message)
    }
  }

  /**
   * Handle keyboard events
   */
  async handleKeyDown(event) {
    if (!this.isActive) return
    
    console.log('[SelectElementManager] KeyDown event received:', {
      key: event.key,
      code: event.code,
      target: event.target?.tagName,
      isActive: this.isActive
    })
    
    if (event.key === 'Escape' || event.code === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      
      console.log('[SelectElementManager] ESC pressed - cancelling selection')
      
      // If there are translated elements, revert them
      if (this.translatedElements.size > 0) {
        console.log('[SelectElementManager] Reverting translations before deactivation')
        await this.revertTranslations()
      }
      
      await this.deactivate()
      return false
    }
  }

  /**
   * Check if element is valid for text extraction
   */
  isValidTextElement(element) {
    // Skip script, style, and other non-text elements
    const invalidTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK']
    if (invalidTags.includes(element.tagName)) return false
    
    // Skip invisible elements
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    if (style.opacity === '0') return false
    
    // Must have text content or be a text input
    const hasText = element.textContent && element.textContent.trim().length > 0
    const isTextInput = element.tagName === 'INPUT' && element.type === 'text'
    const isTextArea = element.tagName === 'TEXTAREA'
    
    return hasText || isTextInput || isTextArea
  }

  /**
   * Highlight element with visual overlay
   */
  highlightElement(element) {
    // Add highlight class
    element.classList.add('translate-it-select-highlight')
    
    // Create overlay for better visibility
    const overlay = document.createElement('div')
    overlay.className = 'translate-it-select-overlay'
    
    const rect = element.getBoundingClientRect()
    Object.assign(overlay.style, {
      position: 'fixed',
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      backgroundColor: 'rgba(74, 144, 226, 0.3)',
      border: '2px solid #4a90e2',
      borderRadius: '4px',
      pointerEvents: 'none',
      zIndex: '2147483646',
      transition: 'all 0.2s ease'
    })
    
    document.body.appendChild(overlay)
    this.overlayElements.add(overlay)
  }

  /**
   * Clear current highlight
   */
  clearHighlight() {
    // Remove highlight classes
    document.querySelectorAll('.translate-it-select-highlight').forEach(el => {
      el.classList.remove('translate-it-select-highlight')
    })
    
    // Remove overlay elements
    this.clearOverlays()
  }

  /**
   * Clear all overlay elements
   */
  clearOverlays() {
    this.overlayElements.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay)
      }
    })
    this.overlayElements.clear()
  }

  /**
   * Extract text from selected element
   */
  extractTextFromElement(element) {
    // Handle input elements
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return element.value
    }
    
    // Handle regular elements
    let text = ''
    
    // Try to get visible text content
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip text in hidden elements
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          
          const style = window.getComputedStyle(parent)
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT
          }
          
          // Skip empty text nodes
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT
          
          return NodeFilter.FILTER_ACCEPT
        }
      }
    )
    
    let node
    while (node = walker.nextNode()) {
      text += node.textContent + ' '
    }
    
    return text.trim()
  }

  /**
   * Process selected element - send to background for translation
   */
  async processSelectedElement(element, text) {
    if (!this.Browser) return
    
    try {
      console.log('[SelectElementManager] Sending text to background for processing')
      
      // Send extracted text to background for translation
      const response = await this.Browser.runtime.sendMessage({
        action: 'elementSelected',
        data: {
          text: text,
          element: {
            tagName: element.tagName,
            className: element.className,
            id: element.id
          },
          timestamp: Date.now()
        }
      })
      
      if (response && response.success) {
        console.log('[SelectElementManager] Element processed successfully')
      } else {
        console.error('[SelectElementManager] Background processing failed:', response?.error)
      }
      
    } catch (error) {
      console.error('[SelectElementManager] Failed to send element data:', error)
      throw error
    }
  }

  /**
   * Add global styles for select element mode
   */
  addGlobalStyles() {
    if (document.getElementById('translate-it-select-styles')) return
    
    const styles = document.createElement('style')
    styles.id = 'translate-it-select-styles'
    styles.textContent = `
      .translate-it-select-highlight {
        outline: 2px solid #4a90e2 !important;
        outline-offset: 2px !important;
        background-color: rgba(74, 144, 226, 0.1) !important;
      }
      
      .translate-it-select-overlay {
        animation: translateItSelectPulse 2s infinite;
      }
      
      @keyframes translateItSelectPulse {
        0%, 100% { 
          background-color: rgba(74, 144, 226, 0.3);
          border-color: #4a90e2;
        }
        50% { 
          background-color: rgba(74, 144, 226, 0.5);
          border-color: #2171b5;
        }
      }
      
      .translate-it-cursor-select {
        cursor: crosshair !important;
      }
    `
    
    document.head.appendChild(styles)
  }

  /**
   * Remove global styles
   */
  removeGlobalStyles() {
    const styles = document.getElementById('translate-it-select-styles')
    if (styles) {
      styles.remove()
    }
  }

  /**
   * Disable page interactions during selection
   */
  disablePageInteractions() {
    document.body.classList.add('translate-it-cursor-select')
    
    // Disable text selection
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
    document.body.style.msUserSelect = 'none'
  }

  /**
   * Re-enable page interactions
   */
  enablePageInteractions() {
    document.body.classList.remove('translate-it-cursor-select')
    
    // Re-enable text selection
    document.body.style.userSelect = ''
    document.body.style.webkitUserSelect = ''
    document.body.style.msUserSelect = ''
  }

  /**
   * Show activation notification
   */
  async showActivationNotification() {
    try {
      await this.notificationManager.show(
        'Select Element mode activated. Hover over elements to highlight them, click to translate.',
        'info',
        true,
        3000
      )
    } catch (error) {
      console.log('[SelectElementManager] Select element mode activated - hover over elements to highlight')
    }
  }

  /**
   * Show error notification
   */
  async showErrorNotification(message) {
    try {
      await this.notificationManager.show(
        `Selection error: ${message}`,
        'error',
        true,
        4000
      )
    } catch (error) {
      console.error('[SelectElementManager] Error:', message)
    }
  }

  /**
   * Show no text found notification
   */
  async showNoTextNotification() {
    try {
      await this.notificationManager.show(
        'No text found in selected element. Please select an element with text content.',
        'warning',
        true,
        3000
      )
    } catch (error) {
      console.log('[SelectElementManager] No text found in selected element')
    }
  }

  /**
   * Show success notification
   */
  async showSuccessNotification(message) {
    try {
      await this.notificationManager.show(
        message,
        'success',
        true,
        2000
      )
    } catch (error) {
      console.log('[SelectElementManager] Success:', message)
    }
  }

  /**
   * Revert all translations made during this session
   * Based on OLD implementation in textExtraction.js
   */
  async revertTranslations() {
    try {
      let successfulReverts = 0
      
      // Find all span elements with translation data
      const containers = document.querySelectorAll('span[data-translate-it-original-text]')
      
      for (const container of containers) {
        const originalText = container.getAttribute('data-translate-it-original-text')
        if (originalText !== null) {
          try {
            // Get parent element
            const parentElement = container.parentNode
            if (!parentElement) continue
            
            // Create original text node
            const originalTextNode = document.createTextNode(originalText)
            
            // Replace translated content with original
            parentElement.replaceChild(originalTextNode, container)
            successfulReverts++
            
            // Remove any added break elements
            let nextNode = originalTextNode.nextSibling
            while (nextNode && 
                   nextNode.nodeName === 'BR' && 
                   nextNode.getAttribute('data-translate-it-br') === 'true') {
              const nodeToRemove = nextNode
              nextNode = nextNode.nextSibling
              if (nodeToRemove.parentNode) {
                nodeToRemove.parentNode.removeChild(nodeToRemove)
              }
            }
            
          } catch (error) {
            console.error('[SelectElementManager] Failed to revert individual element:', error)
          }
        }
      }
      
      // Clear tracking sets
      this.translatedElements.clear()
      this.originalTexts.clear()
      
      // Show notification
      if (successfulReverts > 0) {
        await this.showSuccessNotification(`${successfulReverts} translation(s) reverted successfully`)
        console.log(`[SelectElementManager] Successfully reverted ${successfulReverts} translations`)
      } else {
        console.log('[SelectElementManager] No translations found to revert')
      }
      
      return successfulReverts
      
    } catch (error) {
      console.error('[SelectElementManager] Error during revert:', error)
      
      await this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: 'select-element-revert'
      })
      
      await this.showErrorNotification('Failed to revert translations')
      return 0
    }
  }

  /**
   * Add translated element tracking for revert functionality
   */
  trackTranslatedElement(element, originalText) {
    this.translatedElements.add(element)
    this.originalTexts.set(element, originalText)
    
    // Add data attributes for revert tracking
    if (element.nodeType === Node.ELEMENT_NODE) {
      element.setAttribute('data-translate-it-original-text', originalText)
      element.setAttribute('data-translate-it-translated', 'true')
    }
  }

  /**
   * Cleanup - remove all listeners and overlays
   */
  async cleanup() {
    console.log('[SelectElementManager] Cleaning up')
    
    // Revert any active translations
    if (this.translatedElements.size > 0) {
      await this.revertTranslations()
    }
    
    await this.deactivate()
    
    // Remove message listener
    if (this.Browser && this.messageListener) {
      this.Browser.runtime.onMessage.removeListener(this.messageListener)
      this.messageListener = null
    }
    
    this.overlayElements.clear()
    this.originalTexts.clear()
    this.translatedElements.clear()
    this.currentHighlighted = null
  }
}

// Export singleton instance
export const selectElementManager = new SelectElementManager()

// Auto-initialize when script loads
if (typeof document !== 'undefined') {
  selectElementManager.initialize()
}