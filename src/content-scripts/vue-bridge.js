// Content Script Vue Bridge
// Enables Vue components to be dynamically injected into web pages

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { getBrowserAsync } from "@/utils/browser-polyfill.js";
import DOMPurify from 'dompurify'

class ContentScriptVueBridge {
  constructor() {
    this.vueInstances = new Map()
    this.pinia = createPinia()
    this.isInitialized = false
    this.componentRegistry = new Map()
    this.messageHandler = null
    this.Browser = null // Initialize Browser property
  }

  /**
   * Initialize the Vue bridge
   */
  async initialize() {
    if (this.isInitialized) return

    try {
      this.Browser = await getBrowserAsync(); // Assign Browser here

      // Register available components
      await this.registerComponents()
      
      // Setup message listener for commands from extension
      this.setupMessageListener()
      
      this.isInitialized = true
      console.log('[Vue Bridge] Initialized successfully')
    } catch (error) {
      console.error('[Vue Bridge] Failed to initialize:', error)
    }
  }

  /**
   * Register Vue components that can be injected
   */
  async registerComponents() {
    // Dynamic imports for components
    this.componentRegistry.set('TranslationTooltip', async () => {
      const { default: component } = await import('../components/content/TranslationTooltip.vue')
      return component
    })
    
    this.componentRegistry.set('ScreenSelector', async () => {
      const { default: component } = await import('../components/content/ScreenSelector.vue')
      return component
    })
    
    this.componentRegistry.set('CapturePreview', async () => {
      const { default: component } = await import('../components/content/CapturePreview.vue')
      return component
    })
    
    // Register screen capture overlay component
    this.componentRegistry.set('ScreenCaptureOverlay', async () => {
      const component = {
        template: `
          <div class="screen-capture-overlay">
            <ScreenSelector 
              :onSelect="handleSelection"
              :onCancel="handleCancel"
              :onError="handleError"
            />
          </div>
        `,
        components: {
          ScreenSelector: await this.getComponent('ScreenSelector')
        },
        props: ['onSelect', 'onCancel', 'onError'],
        methods: {
          handleSelection(result) {
            this.onSelect?.(result)
          },
          handleCancel() {
            this.onCancel?.()
          },
          handleError(error) {
            this.onError?.(error)
          }
        }
      }
      return component
    })
  }

  /**
   * Setup message listener for extension commands
   */
  async setupMessageListener() {
    const Browser = await getBrowserAsync();
    this.messageHandler = (message, sender, sendResponse) => {
      if (message.source !== 'vue-app') return

      const { action, data } = message

      switch (action) {
        case 'CREATE_VUE_MICRO_APP':
          this.handleCreateMicroApp(data, sendResponse)
          break
        case 'DESTROY_VUE_MICRO_APP':
          this.handleDestroyMicroApp(data, sendResponse)
          break
        case 'SHOW_TRANSLATION_TOOLTIP':
          this.handleShowTooltip(data, sendResponse)
          break
        case 'HIDE_TRANSLATION_TOOLTIP':
          this.handleHideTooltip(data, sendResponse)
          break
        case 'START_SCREEN_CAPTURE':
          this.handleStartScreenCapture(data, sendResponse)
          break
        case 'ADVANCED_SCREEN_CAPTURE':
          this.handleAdvancedScreenCapture(data, sendResponse)
          break
        case 'SHOW_CAPTURE_PREVIEW':
          this.handleShowCapturePreview(data, sendResponse)
          break
        case 'SHOW_TEXT_REGIONS':
          this.handleShowTextRegions(data, sendResponse)
          break
        default:
          sendResponse({ success: false, error: `Unknown action: ${action}` })
      }

      return true // Keep channel open for async response
    }

    this.Browser.runtime.onMessage.addListener(this.messageHandler)
  }

  /**
   * Create a micro Vue app with a specific component
   */
  async createMicroApp(componentName, props = {}, target = null) {
    try {
      const componentLoader = this.componentRegistry.get(componentName)
      if (!componentLoader) {
        throw new Error(`Component ${componentName} not found`)
      }

      const component = await componentLoader()
      const container = target || this.createContainer()
      
      const app = createApp(component, props)
      app.use(this.pinia)
      
      // Add global properties if needed
      app.config.globalProperties.$bridge = this
      
      app.mount(container)
      
      const instanceId = `vue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      this.vueInstances.set(instanceId, { 
        app, 
        container, 
        componentName,
        props 
      })
      
      console.log(`[Vue Bridge] Created micro app: ${componentName} (${instanceId})`)
      return instanceId
    } catch (error) {
      console.error(`[Vue Bridge] Failed to create micro app:`, error)
      throw error
    }
  }

  /**
   * Destroy a micro Vue app
   */
  destroyMicroApp(instanceId) {
    const instance = this.vueInstances.get(instanceId)
    if (!instance) {
      console.warn(`[Vue Bridge] Instance ${instanceId} not found`)
      return false
    }

    try {
      instance.app.unmount()
      instance.container.remove()
      this.vueInstances.delete(instanceId)
      
      console.log(`[Vue Bridge] Destroyed micro app: ${instanceId}`)
      return true
    } catch (error) {
      console.error(`[Vue Bridge] Failed to destroy micro app:`, error)
      return false
    }
  }

  /**
   * Create a container element for Vue components
   */
  createContainer() {
    const container = document.createElement('div')
    container.className = 'translate-it-vue-container'
    container.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #333;
      background: transparent;
    `
    
    document.body.appendChild(container)
    return container
  }

  /**
   * Create a tooltip container with specific positioning
   */
  createTooltipContainer(position) {
    const container = this.createContainer()
    container.style.cssText += `
      top: ${position.y}px;
      left: ${position.x}px;
      pointer-events: auto;
    `
    return container
  }

  /**
   * Message handlers
   */
  async handleCreateMicroApp(data, sendResponse) {
    try {
      const { componentName, props, position } = data
      const target = position ? this.createTooltipContainer(position) : null
      const instanceId = await this.createMicroApp(componentName, props, target)
      sendResponse({ success: true, instanceId })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  handleDestroyMicroApp(data, sendResponse) {
    try {
      const { instanceId } = data
      const success = this.destroyMicroApp(instanceId)
      sendResponse({ success })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  async handleShowTooltip(data, sendResponse) {
    try {
      const { text, position } = data
      
      // Hide any existing tooltip first
      this.hideAllTooltips()
      
      const instanceId = await this.createMicroApp('TranslationTooltip', {
        text,
        position,
        onClose: () => this.destroyMicroApp(instanceId)
      }, this.createTooltipContainer(position))
      
      sendResponse({ success: true, instanceId })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  handleHideTooltip(data, sendResponse) {
    try {
      this.hideAllTooltips()
      sendResponse({ success: true })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  async handleStartScreenCapture(data, sendResponse) {
    try {
      // Hide any existing overlays
      this.hideAllOverlays()
      
      const instanceId = await this.createMicroApp('ScreenSelector', {
        onSelect: async (result) => {
          try {
            // Send selection result to background script
            const response = await this.Browser.runtime.sendMessage({
              action: 'PROCESS_SCREEN_CAPTURE',
              data: { 
                coordinates: result.coordinates,
                imageData: result.imageData 
              },
              source: 'content-script'
            })
            
            if (response.success) {
              // Show capture preview if enabled
              if (data.showPreview !== false) {
                await this.showCapturePreview(result, instanceId)
              } else {
                this.destroyMicroApp(instanceId)
              }
            } else {
              throw new Error(response.error || 'Failed to process capture')
            }
          } catch (error) {
            console.error('Screen capture processing failed:', error)
            this.showCaptureError(error.message, instanceId)
          }
        },
        onCancel: () => {
          this.destroyMicroApp(instanceId)
          
          // Notify background script of cancellation
          this.Browser.runtime.sendMessage({
            action: 'SCREEN_CAPTURE_CANCELLED',
            source: 'content-script'
          })
        },
        onError: (error) => {
          console.error('Screen capture error:', error)
          this.showCaptureError(error.message, instanceId)
        },
        showInstructions: data.showInstructions !== false,
        allowFullScreen: data.allowFullScreen !== false
      })
      
      sendResponse({ success: true, instanceId })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  /**
   * Show capture preview modal
   */
  async showCapturePreview(captureResult, selectorInstanceId) {
    try {
      // Destroy the selector first
      this.destroyMicroApp(selectorInstanceId)
      
      // Create preview modal
      const previewInstanceId = await this.createMicroApp('CapturePreview', {
        imageData: captureResult.imageData,
        coordinates: captureResult.coordinates,
        onClose: () => {
          this.destroyMicroApp(previewInstanceId)
        },
        onRetake: () => {
          this.destroyMicroApp(previewInstanceId)
          // Restart capture process
          this.handleStartScreenCapture({ showPreview: true }, () => {})
        },
        onTranslate: (result) => {
          // Handle translation result
          this.Browser.runtime.sendMessage({
            action: 'TRANSLATION_COMPLETED',
            data: result,
            source: 'content-script'
          })
        },
        onSave: (result) => {
          // Handle save to history
          this.Browser.runtime.sendMessage({
            action: 'SAVE_TRANSLATION',
            data: result,
            source: 'content-script'
          })
        }
      })
      
      return previewInstanceId
    } catch (error) {
      console.error('Failed to show capture preview:', error)
      this.showCaptureError(error.message)
    }
  }

  /**
   * Show capture error message
   */
  showCaptureError(message, instanceId = null) {
    if (instanceId) {
      this.destroyMicroApp(instanceId)
    }
    
    // Create error notification
    const errorContainer = this.createContainer()
    errorContainer.innerHTML = DOMPurify.sanitize(`
      <div style="
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #f44336;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-size: 14px;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideDown 0.3s ease;
      ">
        <span style="margin-right: 8px;">⚠️</span>
        <span>Screen Capture Error: ${message}</span>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: none;
          border: none;
          color: white;
          margin-left: 12px;
          cursor: pointer;
          font-size: 16px;
        ">×</button>
      </div>
    `)
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (errorContainer.parentNode) {
        errorContainer.remove()
      }
    }, 5000)
  }

  /**
   * Enhanced screen capture with region detection
   */
  async handleAdvancedScreenCapture(data, sendResponse) {
    try {
      const { mode = 'manual', detectText = false, autoTranslate = false } = data
      
      if (mode === 'auto') {
        // Automatic text region detection
        await this.performAutoCapture(detectText, autoTranslate, sendResponse)
      } else {
        // Manual selection mode
        await this.handleStartScreenCapture(data, sendResponse)
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  /**
   * Perform automatic screen capture with text detection
   */
  async performAutoCapture(detectText, autoTranslate, sendResponse) {
    try {
      // Send request to background for full screen capture
      const captureResponse = await this.Browser.runtime.sendMessage({
        action: 'CAPTURE_FULL_SCREEN',
        source: 'content-script'
      })
      
      if (!captureResponse.success) {
        throw new Error(captureResponse.error || 'Failed to capture screen')
      }
      
      if (detectText) {
        // Analyze image for text regions
        const analysisResponse = await this.Browser.runtime.sendMessage({
          action: 'ANALYZE_IMAGE_TEXT',
          data: { imageData: captureResponse.data.imageData },
          source: 'content-script'
        })
        
        if (analysisResponse.success && analysisResponse.data.textRegions?.length > 0) {
          // Show detected regions for user selection
          await this.showTextRegionSelector(captureResponse.data.imageData, analysisResponse.data.textRegions, autoTranslate)
          sendResponse({ success: true, mode: 'text-regions' })
        } else {
          // Fallback to manual selection
          await this.handleStartScreenCapture({ showPreview: true }, sendResponse)
        }
      } else {
        // Direct translation of full screen
        if (autoTranslate) {
          await this.performDirectTranslation(captureResponse.data.imageData, sendResponse)
        } else {
          await this.showCapturePreview(captureResponse.data, null)
          sendResponse({ success: true, mode: 'preview' })
        }
      }
    } catch (error) {
      console.error('Auto capture failed:', error)
      sendResponse({ success: false, error: error.message })
    }
  }

  /**
   * Show text region selector
   */
  async showTextRegionSelector(imageData, textRegions, autoTranslate) {
    try {
      const instanceId = await this.createMicroApp('TextRegionSelector', {
        imageData,
        textRegions,
        onRegionSelect: async (region) => {
          if (autoTranslate) {
            // Crop image to selected region and translate
            const croppedImageData = await this.cropImage(imageData, region)
            await this.performDirectTranslation(croppedImageData)
          } else {
            // Show preview for selected region
            const croppedImageData = await this.cropImage(imageData, region)
            await this.showCapturePreview({ imageData: croppedImageData, coordinates: region }, instanceId)
          }
        },
        onCancel: () => {
          this.destroyMicroApp(instanceId)
        }
      })
      
      return instanceId
    } catch (error) {
      console.error('Failed to show text region selector:', error)
      throw error
    }
  }

  /**
   * Perform direct translation without preview
   */
  async performDirectTranslation(imageData, sendResponse = null) {
    try {
      const translationResponse = await this.Browser.runtime.sendMessage({
        action: 'TRANSLATE_IMAGE_DIRECT',
        data: { imageData },
        source: 'content-script'
      })
      
      if (translationResponse.success) {
        // Show translation result as tooltip
        await this.showTranslationResult(translationResponse.data)
        sendResponse?.({ success: true, translation: translationResponse.data })
      } else {
        throw new Error(translationResponse.error || 'Translation failed')
      }
    } catch (error) {
      console.error('Direct translation failed:', error)
      sendResponse?.({ success: false, error: error.message })
      throw error
    }
  }

  /**
   * Show translation result as floating tooltip
   */
  async showTranslationResult(translationData) {
    try {
      const position = {
        x: window.innerWidth / 2 - 150,
        y: 50
      }
      
      const instanceId = await this.createMicroApp('TranslationTooltip', {
        text: translationData.text,
        sourceText: translationData.sourceText || '[Image]',
        fromLanguage: translationData.fromLanguage,
        toLanguage: translationData.toLanguage,
        provider: translationData.provider,
        position,
        onClose: () => {
          this.destroyMicroApp(instanceId)
        }
      }, this.createTooltipContainer(position))
      
      return instanceId
    } catch (error) {
      console.error('Failed to show translation result:', error)
      throw error
    }
  }

  /**
   * Handle show capture preview request
   */
  async handleShowCapturePreview(data, sendResponse) {
    try {
      const { imageData, coordinates } = data
      const instanceId = await this.showCapturePreview({ imageData, coordinates }, null)
      sendResponse({ success: true, instanceId })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  /**
   * Handle show text regions request
   */
  async handleShowTextRegions(data, sendResponse) {
    try {
      const { imageData, textRegions, autoTranslate = false } = data
      const instanceId = await this.showTextRegionSelector(imageData, textRegions, autoTranslate)
      sendResponse({ success: true, instanceId })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  /**
   * Crop image to specified region (mock implementation)
   */
  async cropImage(imageData, region) {
    // This would need actual image processing
    // For now, return the original image
    // In a real implementation, this would use Canvas API to crop
    return imageData
  }

  /**
   * Utility methods
   */
  hideAllTooltips() {
    for (const [instanceId, instance] of this.vueInstances) {
      if (instance.componentName === 'TranslationTooltip') {
        this.destroyMicroApp(instanceId)
      }
    }
  }

  hideAllOverlays() {
    for (const [instanceId, instance] of this.vueInstances) {
      if (['ScreenSelector', 'CapturePreview'].includes(instance.componentName)) {
        this.destroyMicroApp(instanceId)
      }
    }
  }

  /**
   * Get instance information
   */
  getInstanceInfo(instanceId) {
    return this.vueInstances.get(instanceId) || null
  }

  /**
   * Get all active instances
   */
  getAllInstances() {
    return Array.from(this.vueInstances.entries()).map(([id, instance]) => ({
      id,
      componentName: instance.componentName,
      props: instance.props
    }))
  }

  /**
   * Cleanup all instances
   */
  async cleanup() {
    console.log('[Vue Bridge] Cleaning up all instances...')
    
    for (const instanceId of this.vueInstances.keys()) {
      this.destroyMicroApp(instanceId)
    }
    
    if (this.messageHandler) {
      this.Browser.runtime.onMessage.removeListener(this.messageHandler)
      this.messageHandler = null
    }
    
    this.isInitialized = false
  }

  /**
   * Check if page is suitable for Vue injection
   */
  isPageSuitable() {
    // Skip certain pages/domains
    const unsuitableHosts = ['chrome:', 'moz-extension:', 'chrome-extension:']
    const currentHost = window.location.protocol
    
    return !unsuitableHosts.some(host => currentHost.startsWith(host))
  }
}

// Create and export the bridge instance
export const vueBridge = new ContentScriptVueBridge()

// Auto-initialize if page is suitable
if (vueBridge.isPageSuitable()) {
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => vueBridge.initialize())
  } else {
    vueBridge.initialize()
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => vueBridge.cleanup())

// Make bridge available globally for debugging
if (typeof window !== 'undefined') {
  window.__translateItVueBridge = vueBridge
}