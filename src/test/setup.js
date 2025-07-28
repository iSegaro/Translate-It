import { vi } from 'vitest'

// Mock browser extension APIs
const mockbrowser = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    getURL: vi.fn(path => `chrome-extension://test/${path}`),
    id: 'test-extension-id'
  },
  tabs: {
    query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
    sendMessage: vi.fn().mockResolvedValue({ success: true })
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(),
      remove: vi.fn().mockResolvedValue(),
      clear: vi.fn().mockResolvedValue()
    },
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(),
      remove: vi.fn().mockResolvedValue(),
      clear: vi.fn().mockResolvedValue()
    }
  },
  i18n: {
    getMessage: vi.fn(key => key),
    getUILanguage: vi.fn(() => 'en')
  }
}

// Make browser available globally
global.browser = mockbrowser
global.chrome = mockbrowser

// Mock Web APIs
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

global.IntersectionObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

// Mock Speech Synthesis API
global.speechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn(() => [
    { name: 'Test Voice', lang: 'en-US', voiceURI: 'test-voice' }
  ]),
  onvoiceschanged: null
}

global.SpeechSynthesisUtterance = vi.fn(() => ({
  text: '',
  lang: 'en-US',
  voice: null,
  volume: 1,
  rate: 1,
  pitch: 1,
  onstart: null,
  onend: null,
  onerror: null
}))

// Mock fetch API
global.fetch = vi.fn()

// Mock logME function used in config.js
global.logME = vi.fn()

// Mock console methods to reduce test noise
const originalConsole = { ...console }
global.console = {
  ...originalConsole,
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
}

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks()
})