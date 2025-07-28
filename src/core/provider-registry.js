/**
 * Provider Registry for UI - Static provider information for UI display only
 * No actual implementation code - used for dropdowns, settings, etc.
 */

/**
 * Provider categories
 */
export const PROVIDER_CATEGORIES = {
  FREE: 'free',
  AI: 'ai',
  BROWSER: 'browser',
  LOCAL: 'local',
  CUSTOM: 'custom'
}

/**
 * Complete provider registry with metadata for UI
 */
export const PROVIDER_REGISTRY = [
  {
    id: 'google',
    name: 'Google Translate',
    description: 'Free translation service by Google',
    icon: 'google.svg',
    category: PROVIDER_CATEGORIES.FREE,
    needsApiKey: false,
    supported: true,
    features: ['text', 'autoDetect', 'bulk'],
    languages: 100,
    rateLimit: 'None',
    quality: 'High',
    speed: 'Fast'
  },
  {
    id: 'bing',
    name: 'Bing Translate',
    description: 'Free translation service by Microsoft',
    icon: 'bing.svg',
    category: PROVIDER_CATEGORIES.FREE,
    needsApiKey: false,
    supported: true,
    features: ['text', 'autoDetect'],
    languages: 70,
    rateLimit: 'None',
    quality: 'High',
    speed: 'Fast'
  },
  {
    id: 'yandex',
    name: 'Yandex Translate',
    description: 'Free translation service by Yandex',
    icon: 'yandex.svg',
    category: PROVIDER_CATEGORIES.FREE,
    needsApiKey: false,
    supported: true,
    features: ['text', 'autoDetect'],
    languages: 90,
    rateLimit: 'None',
    quality: 'High',
    speed: 'Fast'
  },
  {
    id: 'browser',
    name: 'browser Translation',
    description: 'Built-in browser translation API (Chrome 138+)',
    icon: 'chrome-translate.svg',
    category: PROVIDER_CATEGORIES.BROWSER,
    needsApiKey: false,
    supported: true,
    features: ['text', 'autoDetect', 'offline'],
    languages: 50,
    rateLimit: 'None',
    quality: 'High',
    speed: 'Very Fast',
    requirements: 'Chrome 138+ or compatible browser'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'AI-powered translation with context understanding',
    icon: 'gemini.svg',
    category: PROVIDER_CATEGORIES.AI,
    needsApiKey: true,
    supported: true,
    features: ['text', 'context', 'smart', 'bulk'],
    languages: 100,
    rateLimit: 'API dependent',
    quality: 'Very High',
    speed: 'Medium',
    models: ['gemini-pro', 'gemini-flash']
  },
  {
    id: 'openai',
    name: 'OpenAI GPT',
    description: 'AI translation using GPT models',
    icon: 'openai.svg',
    category: PROVIDER_CATEGORIES.AI,
    needsApiKey: true,
    supported: true,
    features: ['text', 'context', 'smart', 'creative'],
    languages: 100,
    rateLimit: 'API dependent',
    quality: 'Very High',
    speed: 'Medium',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Advanced AI translation with reasoning capabilities',
    icon: 'deepseek.svg',
    category: PROVIDER_CATEGORIES.AI,
    needsApiKey: true,
    supported: true,
    features: ['text', 'context', 'reasoning', 'technical'],
    languages: 100,
    rateLimit: 'API dependent',
    quality: 'Very High',
    speed: 'Medium',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access to multiple AI models through OpenRouter',
    icon: 'openrouter.svg',
    category: PROVIDER_CATEGORIES.AI,
    needsApiKey: true,
    supported: true,
    features: ['text', 'context', 'multiModel'],
    languages: 100,
    rateLimit: 'API dependent',
    quality: 'Variable',
    speed: 'Variable',
    models: ['Multiple available']
  },
  {
    id: 'webai',
    name: 'WebAI to API',
    description: 'Local AI server integration',
    icon: 'webai.svg',
    category: PROVIDER_CATEGORIES.LOCAL,
    needsApiKey: false,
    supported: true,
    features: ['text', 'local', 'privacy'],
    languages: 50,
    rateLimit: 'None',
    quality: 'Variable',
    speed: 'Fast',
    requirements: 'Local WebAI server running'
  },
  {
    id: 'custom',
    name: 'Custom API',
    description: 'Connect to custom OpenAI-compatible API',
    icon: 'custom.svg',
    category: PROVIDER_CATEGORIES.CUSTOM,
    needsApiKey: true,
    supported: true,
    features: ['text', 'configurable'],
    languages: 'Variable',
    rateLimit: 'API dependent',
    quality: 'Variable',
    speed: 'Variable'
  }
]

/**
 * Get provider by ID
 * @param {string} id - Provider ID
 * @returns {Object|null}
 */
export function getProviderById(id) {
  return PROVIDER_REGISTRY.find(provider => provider.id === id) || null
}

/**
 * Get providers by category
 * @param {string} category - Provider category
 * @returns {Array}
 */
export function getProvidersByCategory(category) {
  return PROVIDER_REGISTRY.filter(provider => provider.category === category)
}

/**
 * Get all free providers
 * @returns {Array}
 */
export function getFreeProviders() {
  return PROVIDER_REGISTRY.filter(provider => !provider.needsApiKey)
}

/**
 * Get all providers requiring API key
 * @returns {Array}
 */
export function getApiKeyProviders() {
  return PROVIDER_REGISTRY.filter(provider => provider.needsApiKey)
}

/**
 * Get supported providers only
 * @returns {Array}
 */
export function getSupportedProviders() {
  return PROVIDER_REGISTRY.filter(provider => provider.supported)
}

/**
 * Get providers with specific feature
 * @param {string} feature - Feature name
 * @returns {Array}
 */
export function getProvidersByFeature(feature) {
  return PROVIDER_REGISTRY.filter(provider => 
    provider.features && provider.features.includes(feature)
  )
}

/**
 * Provider feature definitions
 */
export const PROVIDER_FEATURES = {
  TEXT: 'text',
  AUTO_DETECT: 'autoDetect',
  CONTEXT: 'context',
  SMART: 'smart',
  CREATIVE: 'creative',
  TECHNICAL: 'technical',
  REASONING: 'reasoning',
  BULK: 'bulk',
  OFFLINE: 'offline',
  LOCAL: 'local',
  PRIVACY: 'privacy',
  MULTI_MODEL: 'multiModel',
  CONFIGURABLE: 'configurable'
}

/**
 * Get provider display name
 * @param {string} id - Provider ID
 * @returns {string}
 */
export function getProviderName(id) {
  const provider = getProviderById(id)
  return provider ? provider.name : id
}

/**
 * Get provider icon
 * @param {string} id - Provider ID
 * @returns {string}
 */
export function getProviderIcon(id) {
  const provider = getProviderById(id)
  return provider ? provider.icon : 'provider.svg'
}

/**
 * Check if provider needs API key
 * @param {string} id - Provider ID
 * @returns {boolean}
 */
export function providerNeedsApiKey(id) {
  const provider = getProviderById(id)
  return provider ? provider.needsApiKey : false
}

/**
 * Get provider category
 * @param {string} id - Provider ID
 * @returns {string}
 */
export function getProviderCategory(id) {
  const provider = getProviderById(id)
  return provider ? provider.category : PROVIDER_CATEGORIES.CUSTOM
}

/**
 * Check if provider is supported
 * @param {string} id - Provider ID
 * @returns {boolean}
 */
export function isProviderSupported(id) {
  const provider = getProviderById(id)
  return provider ? provider.supported : false
}

/**
 * Get providers for dropdown/select components
 * @returns {Array}
 */
export function getProvidersForDropdown() {
  return getSupportedProviders().map(provider => ({
    value: provider.id,
    label: provider.name,
    icon: provider.icon,
    category: provider.category,
    needsApiKey: provider.needsApiKey
  }))
}

/**
 * Get providers grouped by category for settings
 * @returns {Object}
 */
export function getProvidersGroupedByCategory() {
  const grouped = {}
  
  Object.values(PROVIDER_CATEGORIES).forEach(category => {
    grouped[category] = getProvidersByCategory(category)
  })
  
  return grouped
}

/**
 * Default provider recommendations
 */
export const DEFAULT_PROVIDERS = {
  QUICK: 'google',      // For quick translations
  ACCURATE: 'gemini',   // For high-quality translations
  FREE: 'google',       // Free option
  AI: 'gemini',         // AI-powered
  OFFLINE: 'browser'    // Offline capable
}

/**
 * Get recommended provider for use case
 * @param {string} useCase - Use case ('quick', 'accurate', 'free', 'ai', 'offline')
 * @returns {string}
 */
export function getRecommendedProvider(useCase) {
  return DEFAULT_PROVIDERS[useCase.toUpperCase()] || DEFAULT_PROVIDERS.QUICK
}