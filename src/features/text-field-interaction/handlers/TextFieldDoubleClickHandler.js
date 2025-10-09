import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { INPUT_TYPES } from '@/shared/config/constants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'TextFieldDoubleClickHandler');

/**
 * Text Field Double Click Handler
 *
 * Handles double-click events specifically for text fields and editable elements.
 * This is separate from page text selection to keep concerns separated.
 *
 * Features:
 * - Double-click detection in text fields
 * - Professional editor support (Google Docs, etc.)
 * - Text selection and position calculation
 * - Integration with WindowsManager
 */
export class TextFieldDoubleClickHandler extends ResourceTracker {
  constructor(options = {}) {
    super('text-field-double-click-handler');

    this.isActive = false;
    this.featureManager = options.featureManager;

    // Mark this instance as critical to prevent cleanup during memory management
    this.trackResource('text-field-double-click-handler-critical', () => {
      // This is the core text field double click handler - should not be cleaned up
      logger.debug('Critical TextFieldDoubleClickHandler cleanup skipped');
    }, { isCritical: true });

    // Double-click state management
    this.doubleClickProcessing = false;
    this.lastDoubleClickTime = 0;
    this.doubleClickWindow = 500; // 500ms window

    // Bind methods
    this.handleDoubleClick = this.handleDoubleClick.bind(this);

    // Store last clicked element for position estimation
    this.lastClickedElement = null;

    // Store last mouse event for position estimation
    this.lastMouseEvent = null;

    // Track mouse position continuously for accurate iframe conversion
    this.trackedMousePosition = null;
    this.mouseTrackingEnabled = false;

    // Store pending position requests
    this.pendingPositionRequests = new Map();
  }

  async activate() {
    if (this.isActive) {
      logger.debug('TextFieldDoubleClickHandler already active');
      return true;
    }

    try {
      logger.debug('Activating TextFieldDoubleClickHandler');

      // Setup double-click listeners
      this.setupDoubleClickListeners();

      // Setup postMessage listener for iframe requests
      this.setupPostMessageListener();

      // Setup mouse tracking for iframe position conversion
      this.setupMouseTracking();

      this.isActive = true;
      logger.info('TextFieldDoubleClickHandler activated successfully');
      return true;

    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'TextFieldDoubleClickHandler-activate',
        showToast: false
      });
      return false;
    }
  }

  async deactivate() {
    if (!this.isActive) {
      logger.debug('TextFieldDoubleClickHandler not active');
      return true;
    }

    try {
      logger.debug('Deactivating TextFieldDoubleClickHandler');

      // Clear any processing flags
      this.doubleClickProcessing = false;

      // Manually cleanup postMessage listener
      if (this.postMessageHandler) {
        window.removeEventListener('message', this.postMessageHandler);
        this.postMessageHandler = null;
      }

      // Cleanup mouse tracking
      this.disableMouseTracking();

      // ResourceTracker will handle event listener cleanup
      this.cleanup();

      this.isActive = false;
      logger.info('TextFieldDoubleClickHandler deactivated successfully');
      return true;

    } catch (error) {
      logger.error('Error deactivating TextFieldDoubleClickHandler:', error);
      try {
        if (this.postMessageHandler) {
          window.removeEventListener('message', this.postMessageHandler);
          this.postMessageHandler = null;
        }
        this.cleanup();
        this.isActive = false;
        return true;
      } catch (cleanupError) {
        logger.error('Critical: TextFieldDoubleClickHandler cleanup failed:', cleanupError);
        return false;
      }
    }
  }

  setupDoubleClickListeners() {
    try {
      // Use capture phase to catch events before they're prevented
      this.addEventListener(document, 'dblclick', this.handleDoubleClick, {
        capture: true,
        critical: true
      });

      logger.debug('Text field double-click listeners setup complete');

    } catch (error) {
      logger.error('Failed to setup double-click listeners:', error);
    }
  }

  setupPostMessageListener() {
    try {
      // Listen for postMessage from iframes
      this.postMessageHandler = (event) => {
        // Only handle messages from same origin or trusted origins
        if (event.data && event.data.type === 'showTranslationIcon') {
          logger.info('TextFieldDoubleClickHandler: Received showTranslationIcon message from iframe', {
            frameId: event.data.frameId,
            text: event.data.text?.substring(0, 30) + '...',
            origin: event.origin
          });

          // Process the iframe request using our own showTranslationUI
          this.showTranslationUI(event.data.text, event.data.position);
        }

        // Handle iframe position calculation requests (only in main document)
        if (event.data && event.data.type === 'calculateIframePosition' && window === window.top) {
          this.handleIframePositionRequest(event);
        }

        // Handle position calculation responses (only in iframes)
        if (event.data && event.data.type === 'iframePositionCalculated' && window !== window.top) {
          this.handlePositionCalculationResponse(event);
        }
      };

      window.addEventListener('message', this.postMessageHandler);
      this.trackResource('postMessageHandler', () => {
        window.removeEventListener('message', this.postMessageHandler);
      });

      logger.debug('TextFieldDoubleClickHandler: PostMessage listener setup complete');

    } catch (error) {
      logger.error('Failed to setup postMessage listener:', error);
    }
  }

  /**
   * Handle position calculation responses from parent
   */
  handlePositionCalculationResponse(event) {
    try {
      const { frameId, calculatedPosition } = event.data;

      logger.debug('Received position calculation response', {
        frameId: frameId,
        calculatedPosition: calculatedPosition
      });

      // Find pending request for this position
      const requestId = `${frameId}_${calculatedPosition.timestamp}`;
      const pendingRequest = this.pendingPositionRequests.get(requestId);

      if (pendingRequest) {
        // Execute the pending callback with the calculated position
        pendingRequest(calculatedPosition);

        // Remove from pending requests
        this.pendingPositionRequests.delete(requestId);

        logger.debug('Processed pending position request', { requestId: requestId });
      }

    } catch (error) {
      logger.error('Error handling position calculation response:', error);
    }
  }

  /**
   * Handle position calculation requests from iframes
   */
  handleIframePositionRequest(event) {
    try {
      const { frameId, clientPosition, elementInfo } = event.data;

      logger.debug('Received position calculation request from iframe', {
        frameId: frameId,
        clientPosition: clientPosition,
        elementInfo: elementInfo
      });

      // Find the iframe element in the main document
      const iframeElement = this.findIframeByFrameId(frameId);

      if (iframeElement) {
        try {
          const rect = iframeElement.getBoundingClientRect();
          const calculatedPosition = {
            x: clientPosition.x + rect.left,
            y: clientPosition.y + rect.top + 25 // Add offset for icon
          };

          // Send the calculated position back to the iframe
          const response = {
            type: 'iframePositionCalculated',
            frameId: frameId,
            calculatedPosition: calculatedPosition,
            timestamp: Date.now()
          };

          event.source.postMessage(response, '*');

          logger.debug('Sent calculated position back to iframe', {
            frameId: frameId,
            calculatedPosition: calculatedPosition
          });

        } catch (error) {
          logger.debug('Could not calculate iframe position', {
            frameId: frameId,
            error: error.message
          });
        }
      } else {
        logger.debug('Could not find iframe element', { frameId: frameId });
      }

    } catch (error) {
      logger.error('Error handling iframe position request:', error);
    }
  }

  /**
   * Find iframe element by frame ID
   */
  findIframeByFrameId(frameId) {
    try {
      // Method 1: Check IFrameManager registry first
      if (window.translateItFrameRegistry) {
        const frameData = window.translateItFrameRegistry.get(frameId);
        if (frameData && frameData.element) {
          return frameData.element;
        }
      }

      // Method 2: Search all iframes in the document
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          // Try to access contentWindow properties to identify the iframe
          if (iframe.contentWindow && iframe.contentWindow.frameId === frameId) {
            return iframe;
          }
        } catch (error) {
          // Cross-origin iframe - can't access contentWindow
          // Skip and continue
        }
      }

      // Method 3: Try to match by other attributes
      for (const iframe of iframes) {
        if (iframe.dataset.frameId === frameId) {
          return iframe;
        }
      }

      logger.debug('Could not find iframe with ID', { frameId: frameId });
      return null;

    } catch (error) {
      logger.error('Error finding iframe by ID:', error);
      return null;
    }
  }

  /**
   * Handle double-click events on text fields
   */
  async handleDoubleClick(event) {
    logger.info('TextFieldDoubleClickHandler: Double-click event received');

    if (!this.isActive) {
      logger.info('TextFieldDoubleClickHandler: Handler is not active');
      return;
    }

    const target = event.target;

    const isTextField = this.isTextField(target);

    logger.debug('Double-click detected', {
      target: target?.tagName,
      timestamp: Date.now(),
      isTextField: isTextField,
      targetInfo: {
        tagName: target?.tagName,
        contentEditable: target?.contentEditable,
        parentTagName: target?.parentElement?.tagName,
        parentContentEditable: target?.parentElement?.contentEditable
      }
    });

    // Only handle text fields and editable elements
    if (!this.isTextField(target)) {
      logger.debug('Double-click ignored - not a text field');
      return;
    }

    // Check if text field icons are enabled
    if (!(await this.isTextFieldIconsEnabled())) {
      logger.debug('Double-click ignored - text field icons disabled');
      return;
    }

    // Mark processing start
    this.lastDoubleClickTime = Date.now();
    this.doubleClickProcessing = true;

    try {
      // Process the double-click with delay for text selection
      setTimeout(async () => {
        await this.processTextFieldDoubleClick(event);
        this.doubleClickProcessing = false;
      }, 150); // Give time for text selection to occur

    } catch (error) {
      this.doubleClickProcessing = false;
      logger.error('Error processing text field double-click:', error);
    }
  }

  /**
   * Check if the target is a text field or editable element
   */
  isTextField(element) {
    if (!element) {
      logger.debug('isTextField: element is null');
      return false;
    }

    logger.debug('isTextField: checking element', {
      tagName: element.tagName,
      contentEditable: element.contentEditable,
      type: element.type
    });

    // Check the element itself first
    if (this.isDirectTextField(element)) {
      logger.debug('isTextField: element itself is text field');
      return true;
    }

    // Check parent elements for contenteditable or professional editors
    // This handles cases like Twitter where you click on SPAN inside contenteditable DIV
    let currentElement = element.parentElement;
    let depth = 0;
    const maxDepth = 5; // Prevent infinite loops

    logger.debug('isTextField: checking parent elements', {
      hasParent: !!currentElement,
      parentTag: currentElement?.tagName,
      parentContentEditable: currentElement?.contentEditable
    });

    while (currentElement && depth < maxDepth) {
      logger.debug('isTextField: checking parent at depth', {
        depth: depth + 1,
        parentTag: currentElement.tagName,
        parentContentEditable: currentElement.contentEditable,
        isDirectTextField: this.isDirectTextField(currentElement)
      });

      if (this.isDirectTextField(currentElement)) {
        logger.debug('Found text field in parent element', {
          clickedTag: element.tagName,
          parentTag: currentElement.tagName,
          depth: depth + 1
        });
        return true;
      }
      currentElement = currentElement.parentElement;
      depth++;
    }

    logger.debug('isTextField: no text field found in element or parents');
    return false;
  }

  /**
   * Check if element is directly a text field (without checking parents)
   */
  isDirectTextField(element) {
    if (!element) return false;

    // Standard input fields
    if (element.tagName === 'INPUT') {
      const type = (element.type || '').toLowerCase();
      // Use all text field types for double-click detection
      return INPUT_TYPES.ALL_TEXT_FIELDS.includes(type);
    }

    // Textarea
    if (element.tagName === 'TEXTAREA') {
      return true;
    }

    // Contenteditable elements (comprehensive check)
    if (element.contentEditable === 'true' ||
        element.isContentEditable === true ||
        element.getAttribute('contenteditable') === 'true') {
      return true;
    }

    // Professional editors (Google Docs, etc.)
    if (this.isProfessionalEditor(element)) {
      return true;
    }

    return false;
  }

  /**
   * Check if element is part of a professional editor
   */
  isProfessionalEditor(element) {
    // General approach: look for contenteditable ancestors
    // This works for most modern rich text editors
    const editableAncestor = element.closest('[contenteditable="true"]');
    if (editableAncestor) {
      return true;
    }

    // Also check for isContentEditable property
    let currentElement = element;
    let depth = 0;
    while (currentElement && depth < 5) {
      if (currentElement.isContentEditable === true) {
        return true;
      }
      currentElement = currentElement.parentElement;
      depth++;
    }

    return false;
  }

  /**
   * Process text field double-click
   */
  async processTextFieldDoubleClick(event) {
    logger.info('TextFieldDoubleClickHandler: Processing text field double-click');

    try {
      // Store the clicked element for position estimation
      this.lastClickedElement = event.target;

      // Find the actual text field element (might be parent of clicked element)
      const actualTextField = this.findActualTextField(event.target);

      // Get selected text
      const selectedText = await this.getSelectedTextFromField(actualTextField || event.target);

      if (!selectedText || !selectedText.trim()) {
        logger.debug('No text selected in text field');
        return;
      }

      logger.debug('Processing text field selection', {
        text: selectedText.substring(0, 30) + '...',
        clickedElement: event.target?.tagName,
        actualTextField: actualTextField?.tagName || 'not found'
      });

      // Calculate position using the actual text field element
      const position = this.calculateTextFieldPosition(event, actualTextField);

      if (!position) {
        logger.warn('Could not calculate position for text field');
        return;
      }

      // Show translation UI
      await this.showTranslationUI(selectedText, position);

    } catch (error) {
      logger.error('Error processing text field double-click:', error);
    }
  }

  /**
   * Find the actual text field element (handles cases where we click on child elements)
   */
  findActualTextField(element) {
    if (!element) return null;

    // Check the element itself first
    if (this.isDirectTextField(element)) {
      return element;
    }

    // Check parent elements
    let currentElement = element.parentElement;
    let depth = 0;
    const maxDepth = 5;

    while (currentElement && depth < maxDepth) {
      if (this.isDirectTextField(currentElement)) {
        logger.debug('Found actual text field in parent', {
          clickedTag: element.tagName,
          actualFieldTag: currentElement.tagName,
          depth: depth + 1
        });
        return currentElement;
      }
      currentElement = currentElement.parentElement;
      depth++;
    }

    return null;
  }

  /**
   * Get selected text from text field
   */
  async getSelectedTextFromField(element) {
    try {
      // For regular input/textarea elements
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        const start = element.selectionStart;
        const end = element.selectionEnd;
        if (start !== end && start !== null && end !== null) {
          return element.value.substring(start, end);
        }
      }

      // For contenteditable and professional editors
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        return selection.toString().trim();
      }

      // Fallback: use site-specific detection
      return await this.detectTextUsingSiteHandler(element);

    } catch (error) {
      logger.debug('Error getting selected text from field:', error);
      return null;
    }
  }

  /**
   * Detect text using site-specific handlers (simplified version)
   */
  async detectTextUsingSiteHandler() {
    try {
      const hostname = window.location.hostname;

      // Google Docs specific
      if (hostname.includes('docs.google.com')) {
        // Simple fallback for Google Docs
        const selection = window.getSelection();
        return selection ? selection.toString().trim() : null;
      }

      // Other professional editors - use standard selection
      const selection = window.getSelection();
      return selection ? selection.toString().trim() : null;

    } catch (error) {
      logger.debug('Site handler detection failed:', error);
      return null;
    }
  }

  /**
   * Calculate position for text field translation UI using SelectionManager pattern
   */
  calculateTextFieldPosition(event, actualTextField = null) {
    try {
      // Use actual text field element if provided, otherwise use event target
      const element = actualTextField || event.target;
      const rect = element.getBoundingClientRect();

      let position;

      // Use double-click position if available (more accurate for text fields)
      if (event.clientX && event.clientY) {
        // For double-click events, use the mouse position directly
        // This is more accurate than the element rect for text fields
        const iconSize = 32; // Same as WindowsConfig.POSITIONING.ICON_SIZE
        position = {
          x: event.clientX - (iconSize / 2) + window.scrollX,
          y: event.clientY + 10 + window.scrollY, // Small offset below cursor
          isFromMouseEvent: true,
          clientX: event.clientX,
          clientY: event.clientY
        };
      } else {
        // Fallback to element-based position (same as SelectionManager)
        const iconSize = 32;
        const selectionCenter = rect.left + rect.width / 2;
        position = {
          x: selectionCenter - (iconSize / 2) + window.scrollX,
          y: rect.bottom + 10 + window.scrollY,
          isFromMouseEvent: false
        };
      }

      logger.debug('Calculated text field position', {
        elementRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        },
        calculatedPosition: position,
        scrollOffset: { x: window.scrollX, y: window.scrollY },
        isInIframe: window !== window.top
      });

      return position;

    } catch (error) {
      logger.error('Error calculating text field position:', error);
      return null;
    }
  }

  /**
   * Convert iframe coordinates to main document coordinates
   */
  convertIframePositionToMain(position) {
    try {
      logger.debug('Converting iframe position to main document', {
        originalPosition: position,
        isInIframe: window !== window.top,
        clientX: position.clientX,
        clientY: position.clientY
      });

      // If not in iframe, return original position
      if (window === window.top) {
        return position;
      }

      // Store the mouse event for later reference
      if (position.isFromMouseEvent) {
        this.lastMouseEvent = {
          clientX: position.clientX,
          clientY: position.clientY,
          timestamp: Date.now()
        };
      }

      // Method 1: Try to get iframe position and add to client coordinates
      const iframePosition = this.getIframePositionInMainDocument();
      if (iframePosition) {
        const mainPosition = {
          x: (position.clientX || position.x) + iframePosition.x,
          y: (position.clientY || position.y) + iframePosition.y + 25,
          isFromMouseEvent: true
        };

        logger.debug('Successfully converted iframe coordinates using direct iframe position', {
          originalPosition: position,
          iframePosition: iframePosition,
          mainPosition: mainPosition
        });

        return mainPosition;
      }

      // Method 2: Use enhanced position estimation
      const clientX = position.clientX || position.x;
      const clientY = position.clientY || position.y;

      // Check if these coordinates are likely iframe-relative
      if (!this.areCoordinatesMainDocument(clientX, clientY)) {
        // These are iframe-relative coordinates, need conversion
        const enhancedPosition = this.estimateIframePositionEnhanced(clientX, clientY);
        if (enhancedPosition) {
          logger.debug('Successfully converted iframe coordinates using enhanced estimation', {
            originalPosition: position,
            clientCoords: { x: clientX, y: clientY },
            enhancedPosition: enhancedPosition
          });
          return enhancedPosition;
        }
      } else {
        // These appear to be main document coordinates already
        const mainCoords = {
          x: clientX,
          y: clientY + 25,
          isFromMouseEvent: true
        };
        logger.debug('Using coordinates as main document relative', {
          originalPosition: position,
          mainCoords: mainCoords
        });
        return mainCoords;
      }

      // Method 3: Send async request to parent for position calculation
      this.requestPositionFromParent(position, (calculatedPosition) => {
        logger.debug('Received async position calculation from parent', {
          calculatedPosition: calculatedPosition
        });

        // Note: For now, we'll log the response but continue with the fallback
        // The async response comes too late for the immediate display
      });

      logger.warn('Could not get iframe position immediately, using fallback with offsets');
      // Fallback: Try basic coordinate transformation
      return {
        x: clientX,
        y: clientY + 25,
        isFromMouseEvent: true,
        isFallback: true
      };

    } catch (error) {
      logger.error('Error converting iframe position:', error);
      return {
        x: position.clientX || position.x,
        y: (position.clientY || position.y) + 25,
        isFromMouseEvent: true,
        isFallback: true
      };
    }
  }

  /**
   * Get iframe position in main document using multiple approaches
   */
  getIframePositionInMainDocument() {
    // Approach 1: Try to access frame element directly (same-origin only)
    if (window.frameElement) {
      try {
        const rect = window.frameElement.getBoundingClientRect();
        const position = {
          x: rect.left,
          y: rect.top
        };

        logger.debug('Got iframe position from frameElement', {
          position: position,
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          }
        });

        return position;
      } catch (error) {
        logger.debug('Could not access frameElement (cross-origin)', { error: error.message });
      }
    }

    // Approach 2: Enhanced estimation using mouse coordinates
    // For cross-origin iframes, we can estimate position using various techniques
    // Return null since this method doesn't have the required parameters for enhanced estimation
    return null;
  }

  /**
   * Setup mouse tracking for accurate iframe position conversion
   */
  setupMouseTracking() {
    try {
      if (this.mouseTrackingEnabled) {
        return;
      }

      this.mouseTrackingEnabled = true;

      // Track mouse movement continuously
      this.mouseMoveHandler = (event) => {
        this.trackedMousePosition = {
          x: event.clientX,
          y: event.clientY,
          timestamp: Date.now()
        };
      };

      // Use capture to get events before they're prevented
      document.addEventListener('mousemove', this.mouseMoveHandler, { capture: true });
      this.trackResource('mouseMoveHandler', () => {
        document.removeEventListener('mousemove', this.mouseMoveHandler, { capture: true });
      });

      logger.debug('Mouse tracking enabled for iframe position conversion');

    } catch (error) {
      logger.error('Failed to setup mouse tracking:', error);
    }
  }

  /**
   * Disable mouse tracking
   */
  disableMouseTracking() {
    try {
      this.mouseTrackingEnabled = false;
      this.trackedMousePosition = null;

      if (this.mouseMoveHandler) {
        document.removeEventListener('mousemove', this.mouseMoveHandler, { capture: true });
        this.mouseMoveHandler = null;
      }

      logger.debug('Mouse tracking disabled');

    } catch (error) {
      logger.error('Failed to disable mouse tracking:', error);
    }
  }

  /**
   * Enhanced iframe position estimation for cross-origin iframes
   */
  estimateIframePositionEnhanced(clientX, clientY) {
    try {
      logger.debug('Estimating iframe position with enhanced method', {
        clientX: clientX,
        clientY: clientY,
        hasTrackedPosition: !!this.trackedMousePosition,
        isInIframe: window !== window.top
      });

      // CRITICAL APPROACH: These coordinates are iframe-relative and need conversion
      // to main document coordinates

      // Method 1: Try Visual Viewport API first (most reliable)
      if (window.visualViewport) {
        const viewport = window.visualViewport;
        // Note: offsetLeft/offsetTop might be 0 for cross-origin iframes
        if (viewport.offsetLeft > 0 || viewport.offsetTop > 0) {
          const mainCoords = {
            x: clientX + viewport.offsetLeft,
            y: clientY + viewport.offsetTop + 25
          };
          logger.debug('Using visual viewport offset', {
            clientCoords: { x: clientX, y: clientY },
            viewportOffset: { left: viewport.offsetLeft, top: viewport.offsetTop },
            calculatedPosition: mainCoords
          });
          return mainCoords;
        }
      }

      // Method 2: Use tracked mouse position (most reliable for cross-origin)
      if (this.trackedMousePosition) {
        const timeDiff = Date.now() - this.trackedMousePosition.timestamp;
        if (timeDiff < 1000) { // Within 1 second
          // The tracked position should be main document relative
          const mainCoords = {
            x: this.trackedMousePosition.x,
            y: this.trackedMousePosition.y + 25
          };
          logger.debug('Using tracked mouse position (main document relative)', {
            iframeCoords: { x: clientX, y: clientY },
            trackedPosition: this.trackedMousePosition,
            calculatedPosition: mainCoords,
            timeDiff: timeDiff
          });
          return mainCoords;
        }
      }

      // Method 3: Enhanced iframe position estimation using element bounds
      if (this.lastClickedElement) {
        const rect = this.lastClickedElement.getBoundingClientRect();

        // Estimate iframe position based on element and mouse coordinates
        // This is a fallback method
        const estimatedMainCoords = {
          x: Math.max(clientX + 100, 200), // Assume iframe is at least 100px from left
          y: Math.max(clientY + 150, 300) // Assume iframe is at least 150px from top
        };

        logger.debug('Using enhanced element-based estimation', {
          iframeCoords: { x: clientX, y: clientY },
          elementRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          estimatedMainCoords: estimatedMainCoords
        });
        return estimatedMainCoords;
      }

      // Method 4: Conservative estimation - add significant offset for iframe position
      // Most iframes are not at (0,0) on the main page
      const conservativeCoords = {
        x: clientX + 200, // Assume iframe is around 200px from left
        y: clientY + 250 // Assume iframe is around 250px from top
      };

      logger.debug('Using conservative iframe position estimation', {
        iframeCoords: { x: clientX, y: clientY },
        estimatedMainCoords: conservativeCoords
      });
      return conservativeCoords;

    } catch (error) {
      logger.error('Error in enhanced position estimation:', error);
      // Return a reasonable fallback position
      return {
        x: clientX + 200,
        y: clientY + 250
      };
    }
  }

  /**
   * Check if coordinates are likely relative to main document
   */
  areCoordinatesMainDocument(x, y) {
    try {
      // CRITICAL FIX: Small coordinates (like 54, 150) are almost always iframe-relative
      // Most main document coordinates for text fields would be larger

      // If coordinates are very small, they're almost certainly iframe-relative
      if (x < 100 && y < 200) {
        return false; // These are iframe coordinates
      }

      // If coordinates are very large, they might be main document relative
      if (x > 500 || y > 500) {
        return true;
      }

      // Check if coordinates are a significant portion of viewport
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      // For main document, text fields are usually not in the top-left corner
      if (x > viewportWidth * 0.2 || y > viewportHeight * 0.2) {
        return true;
      }

      // Default to false for small coordinates (assume iframe-relative)
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Request position calculation from parent document
   */
  requestPositionFromParent(position, callback) {
    try {
      const timestamp = Date.now();
      const frameId = window.frameId || 'unknown';

      // Send a special message to parent requesting position calculation
      const message = {
        type: 'calculateIframePosition',
        frameId: frameId,
        clientPosition: {
          x: position.clientX || position.x,
          y: position.clientY || position.y
        },
        elementInfo: this.lastClickedElement ? {
          tagName: this.lastClickedElement.tagName,
          id: this.lastClickedElement.id,
          className: this.lastClickedElement.className,
          value: this.lastClickedElement.value || this.lastClickedElement.textContent
        } : null,
        timestamp: timestamp
      };

      // Store the callback for when we receive the response
      const requestId = `${frameId}_${timestamp}`;
      this.pendingPositionRequests.set(requestId, callback);

      // Set a timeout to remove the pending request if no response
      setTimeout(() => {
        if (this.pendingPositionRequests.has(requestId)) {
          this.pendingPositionRequests.delete(requestId);
          logger.debug('Position request timed out', { requestId: requestId });
        }
      }, 1000); // 1 second timeout

      window.parent.postMessage(message, '*');
      logger.debug('Sent position calculation request to parent', message);

    } catch (error) {
      logger.debug('Could not send position request to parent', { error: error.message });
    }
  }

  /**
   * Send message to parent frame for position calculation
   */
  sendMessageToParent(messageData) {
    try {
      if (window.parent && window.parent !== window) {
        const message = {
          ...messageData,
          frameId: window.frameId || 'unknown',
          timestamp: Date.now()
        };

        window.parent.postMessage(message, '*');
        logger.debug('Sent position calculation message to parent', message);
      }
    } catch (error) {
      logger.debug('Failed to send message to parent', { error: error.message });
    }
  }

  /**
   * Approach 1: Direct iframe element access
   */
  getIframePositionApproach1(position) {
    try {
      const iframeElement = window.frameElement;
      if (!iframeElement) {
        return null;
      }

      const iframeRect = iframeElement.getBoundingClientRect();

      return {
        x: position.x + iframeRect.left,
        y: position.y + iframeRect.top
      };

    } catch (accessError) {
      logger.debug('Approach 1 failed - cannot access iframe rect', {
        error: accessError.message
      });
      return null;
    }
  }

  /**
   * Approach 2: Visual viewport and scroll estimation
   */
  getIframePositionApproach2(position) {
    try {
      // Use visual viewport API if available
      if (window.visualViewport) {
        const viewport = window.visualViewport;
        const iframeOffsetLeft = viewport.offsetLeft || 0;
        const iframeOffsetTop = viewport.offsetTop || 0;

        return {
          x: position.x + iframeOffsetLeft,
          y: position.y + iframeOffsetTop
        };
      }

      // Try to use iframe position from existing IFrameManager
      return this.getIframePositionFromManager(position);

    } catch (error) {
      logger.debug('Approach 2 failed', { error: error.message });
      return null;
    }
  }

  /**
   * Get iframe position from existing IFrameManager system
   */
  getIframePositionFromManager(position) {
    try {
      // Try to access IFrameManager from existing iframe-support system
      if (window.translateItFrameRegistry) {
        const frameId = window.frameId || this.generateFrameId();
        const frameData = window.translateItFrameRegistry.get(frameId);

        if (frameData && frameData.element) {
          const frameRect = frameData.element.getBoundingClientRect();
          return {
            x: position.x + frameRect.left,
            y: position.y + frameRect.top
          };
        }
      }

      // Fallback to mouse event estimation
      return this.estimateIframePosition(position);

    } catch (error) {
      logger.debug('Could not get iframe position from manager', { error: error.message });
      return this.estimateIframePosition(position);
    }
  }

  /**
   * Generate a simple frame ID if needed
   */
  generateFrameId() {
    return `frame_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Estimate iframe position using mouse coordinates
   */
  estimateIframePosition(position) {
    try {
      logger.debug('Estimating iframe position from mouse coordinates', {
        hasClientX: !!position.clientX,
        hasClientY: !!position.clientY,
        isFromMouseEvent: position.isFromMouseEvent
      });

      // For mouse events, the clientX/Y are already relative to the viewport
      // For iframe to main document conversion, we need to add iframe offset
      if (position.isFromMouseEvent && position.clientX !== undefined && position.clientY !== undefined) {
        // The clientX/clientY are viewport coordinates - these should be correct for the main document
        // when the iframe is positioned normally in the flow
        return {
          x: position.clientX,
          y: position.clientY + 25 // Add offset for icon placement
        };
      }

      // For non-mouse based positions, try to use element-based estimation
      if (this.lastClickedElement) {
        const rect = this.lastClickedElement.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.bottom + 10
        };
      }

      return null;

    } catch (error) {
      logger.debug('Could not estimate iframe position', { error: error.message });
      return null;
    }
  }

  /**
   * Check if position is valid (not negative or too large)
   */
  isPositionValid(position) {
    if (!position) return false;

    // Check for reasonable coordinate values
    return (
      position.x >= 0 &&
      position.y >= 0 &&
      position.x < window.screen.width + 1000 && // Allow some margin
      position.y < window.screen.height + 1000
    );
  }

  /**
   * Check if WindowsManager should be allowed to operate
   */
  async shouldProcessWindowsManager() {
    if (!this.featureManager) {
      logger.debug('FeatureManager not available for WindowsManager check');
      return false;
    }

    try {
      const exclusionChecker = this.featureManager.exclusionChecker;
      if (!exclusionChecker) {
        logger.debug('ExclusionChecker not available');
        return false;
      }

      const allowed = await exclusionChecker.isFeatureAllowed('windowsManager');
      logger.debug(`WindowsManager check for text field: ${allowed ? 'ALLOWED' : 'BLOCKED'}`);
      return allowed;
    } catch (error) {
      logger.error('Error checking WindowsManager permission:', error);
      return false;
    }
  }

  /**
   * Show translation UI using the same pattern as TextSelection system
   */
  async showTranslationUI(selectedText, position) {
    // Check if WindowsManager should be allowed
    if (!(await this.shouldProcessWindowsManager())) {
      logger.info('WindowsManager is blocked by exclusion, skipping text field translation UI');
      return;
    }

    // Use the same approach as TextSelection system
    if (window !== window.top) {
      // Iframe - request window creation in main frame (same as SelectionManager)
      this.requestWindowCreationInMainFrame(selectedText, position);
    } else {
      // Main frame - use WindowsManager directly
      const windowsManager = this.getWindowsManager();
      if (windowsManager) {
        logger.debug('Showing translation UI via WindowsManager', {
          text: selectedText.substring(0, 30) + '...',
          position,
          context: 'main-frame'
        });

        // For text fields, always show icon first
        await windowsManager._showIcon(selectedText, position);
      } else {
        logger.warn('WindowsManager not available in main frame');
      }
    }
  }

  /**
   * Request window creation in main frame (copied from SelectionManager)
   */
  requestWindowCreationInMainFrame(selectedText, position) {
    try {
      // Import WindowsConfig for message types
      import('@/features/windows/managers/core/WindowsConfig.js').then(({ WindowsConfig }) => {
        const message = {
          type: 'TEXT_SELECTION_WINDOW_REQUEST', // Use same message type as text selection
          frameId: this.generateFrameId(),
          selectedText: selectedText,
          position: position,
          timestamp: Date.now()
        };

        if (window.parent !== window) {
          window.parent.postMessage(message, '*');
          logger.info('Text field translation window request sent to parent frame', {
            frameId: message.frameId,
            textLength: selectedText.length,
            position: {
              x: Math.round(position.x),
              y: Math.round(position.y)
            }
          });
        }
      });

    } catch (error) {
      logger.error('Failed to request window creation in main frame:', error);
    }
  }

  /**
   * Get WindowsManager instance
   */
  getWindowsManager() {
    if (!this.featureManager) {
      logger.info('WindowsManager: FeatureManager not available');
      return null;
    }

    const windowsHandler = this.featureManager.getFeatureHandler('windowsManager');
    if (!windowsHandler) {
      logger.info('WindowsManager: WindowsHandler not available');
      return null;
    }

    if (!windowsHandler.getIsActive()) {
      logger.info('WindowsManager: WindowsHandler is not active');
      return null;
    }

    // Debug WindowsHandler state
    logger.info('WindowsManager: WindowsHandler available and active, checking getWindowsManager()');

    const windowsManager = windowsHandler.getWindowsManager();
    if (!windowsManager) {
      logger.info('WindowsManager: getWindowsManager() returned null', {
        hasGetWindowsManager: typeof windowsHandler.getWindowsManager === 'function',
        windowsHandlerMethods: Object.getOwnPropertyNames(windowsHandler).filter(name => typeof windowsHandler[name] === 'function')
      });
      return null;
    }

    return windowsManager;
  }

  /**
   * Check if text field icons are enabled in settings
   */
  async isTextFieldIconsEnabled() {
    try {
      const {
        getActiveSelectionIconOnTextfieldsAsync,
        getExtensionEnabledAsync,
        getTranslateOnTextSelectionAsync
      } = await import('@/shared/config/config.js');

      const activeSelectionIconEnabled = await getActiveSelectionIconOnTextfieldsAsync();
      const extensionEnabled = await getExtensionEnabledAsync();
      const translateOnTextSelection = await getTranslateOnTextSelectionAsync();

      // Only enable if all parent settings are also enabled
      return activeSelectionIconEnabled && extensionEnabled && translateOnTextSelection;
    } catch (error) {
      logger.warn('Error checking text field icons setting:', error);
      return false; // Default to disabled if can't check
    }
  }

  // Public API methods
  getStatus() {
    return {
      handlerActive: this.isActive,
      doubleClickProcessing: this.doubleClickProcessing,
      lastDoubleClickTime: this.lastDoubleClickTime,
      timeSinceLastDoubleClick: this.lastDoubleClickTime ? Date.now() - this.lastDoubleClickTime : null
    };
  }
}

export default TextFieldDoubleClickHandler;