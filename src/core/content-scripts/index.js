// Content script entry point - Ultra-optimized with smart loading
// Minimal footprint with intelligent, interaction-based loading

let contentScriptCore = null;
let featureLoadPromises = new Map();
let interactionDetected = false;

// Smart loading configuration
const LOAD_STRATEGIES = {
  CRITICAL: {
    delay: 0,          // Load immediately
    priority: 'high'
  },
  ESSENTIAL: {
    delay: 500,        // Load after 500ms
    priority: 'medium'
  },
  ON_DEMAND: {
    delay: 2000,       // Load after 2 seconds or on interaction
    priority: 'low'
  },
  INTERACTIVE: {
    delay: 0,          // Load on specific user interaction
    priority: 'medium'
  }
};

// Feature categorization
const FEATURE_CATEGORIES = {
  CRITICAL: ['messaging', 'extensionContext'], // Core infrastructure
  ESSENTIAL: ['textSelection', 'windowsManager', 'vue', 'contentMessageHandler', 'selectElement'], // Core translation features
  INTERACTIVE: [], // UI interaction features
  ON_DEMAND: ['shortcut', 'textFieldIcon'] // Optional features
};

// Initialize the content script with ultra-minimal footprint
(async () => {
  try {
    // Dynamically import ContentScriptCore for code splitting
    const { contentScriptCore: core } = await import('./ContentScriptCore.js');
    contentScriptCore = core;

    // Expose globally for other modules
    window.translateItContentCore = contentScriptCore;

    // Initialize with minimal dependencies
    const initialized = await contentScriptCore.initializeCritical();

    if (initialized) {
      // Setup smart event listeners
      setupSmartListeners();

      // Start intelligent loading sequence
      startIntelligentLoading();

      // Debug info
      if (process.env.NODE_ENV === 'development') {
        console.log('Translate It: Ultra-optimized content script initialized', {
          mode: 'smart-loading',
          critical: true,
          memory: 'minimal'
        });
      }
    }
  } catch (error) {
    console.error('Failed to initialize content script:', error);
  }
})();

function setupSmartListeners() {
  // Extension popup interaction
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'popupOpened') {
      loadFeature('vue', 'INTERACTIVE');
    }
  });

  // Text selection interaction
  document.addEventListener('mouseup', handleTextSelection, { passive: true });

  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardInteraction, { passive: true });

  // Focus on text fields
  document.addEventListener('focusin', handleTextFieldFocus, { passive: true });

  // Scroll detection (for preload)
  let scrollTimer;
  document.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!interactionDetected) {
        preloadEssentialFeatures();
      }
    }, 1000);
  }, { passive: true });
}

function handleTextSelection(event) {
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) {
    loadFeature('textSelection', 'ESSENTIAL');
  }
}

function handleKeyboardInteraction(event) {
  // Ctrl+/ for translation
  if (event.ctrlKey && event.key === '/') {
    event.preventDefault();
    loadFeature('shortcut', 'INTERACTIVE');
    loadFeature('windowsManager', 'INTERACTIVE');
  }
}

function handleTextFieldFocus(event) {
  if (isEditableElement(event.target)) {
    loadFeature('textFieldIcon', 'INTERACTIVE');
  }
}

function isEditableElement(element) {
  return element && (
    element.isContentEditable ||
    element.tagName === 'TEXTAREA' ||
    (element.tagName === 'INPUT' &&
     ['text', 'search', 'email', 'url', 'tel'].includes(element.type))
  );
}

async function startIntelligentLoading() {
  // Phase 1: Load critical features immediately
  await Promise.all(
    FEATURE_CATEGORIES.CRITICAL.map(feature =>
      loadFeature(feature, 'CRITICAL')
    )
  );

  // Phase 2: Load essential features after short delay
  setTimeout(() => {
    Promise.all(
      FEATURE_CATEGORIES.ESSENTIAL.map(feature =>
        loadFeature(feature, 'ESSENTIAL')
      )
    );
  }, LOAD_STRATEGIES.ESSENTIAL.delay);

  // Phase 3: Preload remaining features if user is active
  setTimeout(() => {
    if (interactionDetected) {
      preloadRemainingFeatures();
    }
  }, LOAD_STRATEGIES.ON_DEMAND.delay);
}

async function loadFeature(featureName, category) {
  if (featureLoadPromises.has(featureName)) {
    return featureLoadPromises.get(featureName);
  }

  const strategy = LOAD_STRATEGIES[category];
  const loadPromise = (async () => {
    try {
      if (strategy.delay > 0 && category !== 'INTERACTIVE') {
        await new Promise(resolve => setTimeout(resolve, strategy.delay));
      }

      if (contentScriptCore && contentScriptCore.loadFeature) {
        await contentScriptCore.loadFeature(featureName);

        if (process.env.NODE_ENV === 'development') {
          console.log(`📦 Loaded feature: ${featureName} (${category})`);
        }
      }
    } catch (error) {
      console.warn(`Failed to load feature ${featureName}:`, error);
    }
  })();

  featureLoadPromises.set(featureName, loadPromise);
  return loadPromise;
}

function preloadEssentialFeatures() {
  interactionDetected = true;
  FEATURE_CATEGORIES.ESSENTIAL.forEach(feature =>
    loadFeature(feature, 'ESSENTIAL')
  );
}

function preloadRemainingFeatures() {
  interactionDetected = true;
  [...FEATURE_CATEGORIES.INTERACTIVE, ...FEATURE_CATEGORIES.ON_DEMAND].forEach(feature =>
    loadFeature(feature, 'ON_DEMAND')
  );
}

// Export for debugging
window.translateItContentScriptCore = contentScriptCore;
window.translateItDebug = {
  loadFeature,
  featureLoadPromises,
  interactionDetected,
  FEATURE_CATEGORIES
};

// Export for debugging
window.translateItContentScriptCore = contentScriptCore;