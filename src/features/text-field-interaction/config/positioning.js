/**
 * Text Field Icon Advanced Configuration
 * Configuration for smart positioning and appearance of text field translation icons
 */

export const textFieldIconConfig = {
  positioning: {
    // Preferred placement order for single-line elements
    singleLinePlacements: ['top-right', 'bottom-right', 'top-left', 'bottom-left', 'inside-right', 'inside-left'],
    
    // Preferred placement order for multiline elements (textarea, WYSIWYG)
    multiLinePlacements: ['inside-bottom-right', 'inside-bottom-left', 'inside-top-right', 'bottom-right', 'top-right', 'bottom-left'],
    
    // Distance from target element (pixels)
    elementMargin: 4,
    
    // Minimum distance from viewport edges (pixels) 
    viewportMargin: 8,
    
    // Collision detection settings
    collision: {
      enabled: true,
      overlapThreshold: 0.3, // 30% overlap triggers collision
      padding: 2
    }
  },
  
  // Icon appearance settings
  appearance: {
    defaultSize: 'medium', // small, medium, large
    sizes: {
      small: { width: 24, height: 24, iconSize: 14 },
      medium: { width: 28, height: 28, iconSize: 16 },
      large: { width: 32, height: 32, iconSize: 18 }
    }
  },
  
  // Animation settings
  animation: {
    enabled: true,
    duration: 200,
    easing: 'ease-in-out',
    positionTransition: {
      duration: 200,
      easing: 'ease-out'
    }
  },
  
  // Responsive behavior
  responsive: {
    mobile: {
      sizeMultiplier: 1.2, // 20% larger on mobile
      preferredPlacements: ['bottom-right', 'bottom-left', 'top-right', 'top-left']
    },
    
    // Breakpoints
    mobileBreakpoint: 768
  },
  
  // Attachment system settings
  attachment: {
    updateThrottle: 16, // ~60fps
    
    // Observer settings
    resizeObserver: {
      enabled: true
    },
    intersectionObserver: {
      enabled: true,
      threshold: 0.1,
      rootMargin: '50px'
    }
  },
  
  // Performance settings
  performance: {
    maxActiveIcons: 5, // Limit concurrent icons
    cleanupDelay: 100, // Delay before cleanup (ms)
    debounceUpdates: true
  },
  
  // Element detection settings
  detection: {
    // Minimum height for input to be considered multiline
    multilineHeightThreshold: 40,
    
    // WYSIWYG editor selectors
    wysiwyg: {
      selectors: [
        '.ql-editor',           // Quill
        '.tox-edit-area',       // TinyMCE
        '.cke_contents',        // CKEditor
        '.fr-element',          // Froala
        '.DraftEditor-root',    // Draft.js
        '.ProseMirror'          // ProseMirror
      ]
    },
    
    // Authentication field keywords to exclude
    authKeywords: [
      'email', 'mail', 'username', 'user', 'login', 'signin',
      'password', 'pass', 'pwd', 'auth', 'credential',
      'account', 'register', 'signup'
    ]
  }
};

export default textFieldIconConfig;