// Browser polyfill for Vue components
// This provides a basic browser object when not in extension context

let browserAPI = null

if (typeof browser !== 'undefined') {
  browserAPI = browser
} else if (typeof chrome !== 'undefined') {
  browserAPI = chrome
} else {
  // Mock browser API for development
  browserAPI = {
    runtime: {
      sendMessage: async (message) => {
        console.log('Mock sendMessage:', message)
        return { success: true, mock: true }
      },
      onMessage: {
        addListener: (callback) => {
          console.log('Mock addListener:', callback)
        },
        removeListener: (callback) => {
          console.log('Mock removeListener:', callback)
        }
      },
      getURL: (path) => path,
      openOptionsPage: async () => {
        console.log('Mock openOptionsPage')
      }
    },
    storage: {
      local: {
        get: async (keys) => {
          console.log('Mock storage.get:', keys)
          return {}
        },
        set: async (data) => {
          console.log('Mock storage.set:', data)
        }
      }
    },
    tabs: {
      query: async (queryInfo) => {
        console.log('Mock tabs.query:', queryInfo)
        return [{ id: 1, url: 'http://example.com' }]
      },
      sendMessage: async (tabId, message) => {
        console.log('Mock tabs.sendMessage:', tabId, message)
        return { success: true }
      },
      captureVisibleTab: async (options) => {
        console.log('Mock captureVisibleTab:', options)
        return 'data:image/png;base64,mock-image'
      }
    },
    notifications: {
      create: async (options) => {
        console.log('Mock notifications.create:', options)
        return 'mock-notification-id'
      }
    }
  }
}

// Make browser API globally available
if (typeof window !== 'undefined') {
  window.browser = browserAPI
}

export default browserAPI