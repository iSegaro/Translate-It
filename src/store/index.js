import { createPinia } from 'pinia'

// Create Pinia instance
export const pinia = createPinia()

// Store plugins
pinia.use(({ store }) => {
  // Add extension API access to all stores
  store.$extensionAPI = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null)
})

export default pinia