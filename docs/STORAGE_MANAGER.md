# StorageManager Documentation

## Overview

StorageManager is a centralized storage management system for the Translate-It extension that provides unified API for browser extension storage with caching and event system support.

## Features

✅ **Unified Storage API** - Single interface for all storage operations  
✅ **Intelligent Caching** - Automatic cache management with invalidation  
✅ **Event System** - Reactive updates across components  
✅ **Cross-browser Support** - Compatible with Chrome and Firefox  
✅ **Error Handling** - Comprehensive error management  
✅ **Performance Optimization** - Reduces storage API calls  

## Architecture

### Core Components

1. **StorageManager Class** (`src/core/StorageManager.js`)
   - Singleton storage manager with cache and events
   - Automatic initialization and cleanup
   - Promise-based API

2. **useStorage Composable** (`src/composables/useStorage.js`)
   - Vue integration with reactive data
   - Multiple usage patterns
   - Lifecycle management

3. **Enhanced useBrowserAPI** (`src/composables/useBrowserAPI.js`)
   - Updated to use StorageManager
   - Backward compatible API
   - Storage event handling

## Usage Patterns

### 1. Direct StorageManager Usage

```javascript
import storageManager from '@/core/StorageManager.js';

// Get data
const data = await storageManager.get(['key1', 'key2']);

// Set data
await storageManager.set({ key1: 'value1', key2: 'value2' });

// Listen to changes
storageManager.on('change:key1', ({ newValue, oldValue }) => {
  console.log('Key1 changed:', newValue);
});
```

### 2. Vue Composable Usage

```javascript
import { useStorage } from '@/composables/useStorage.js';

// Multiple keys with reactive object
const { data, isLoading, save, remove } = useStorage(['key1', 'key2']);

// Single key with auto-sync
const { value } = useStorageItem('settings', {});
```

### 3. Vue Store Integration

```javascript
// Already integrated in enhanced-settings store
import { useSettingsStore } from '@/store/core/settings.js';

const settings = useSettingsStore();
// All operations now use StorageManager internally
```

## API Reference

### StorageManager Methods

#### Basic Operations

```javascript
// Get values (with optional defaults and caching)
await storageManager.get(keys, useCache = true)

// Set values (with cache update)
await storageManager.set(data, updateCache = true)

// Remove values (with cache cleanup)
await storageManager.remove(keys, updateCache = true)

// Clear all storage
await storageManager.clear(updateCache = true)
```

#### Cache Management

```javascript
// Get cached value (synchronous)
const value = storageManager.getCached(key, defaultValue)

// Check if cached
const exists = storageManager.hasCached(key)

// Invalidate cache
storageManager.invalidateCache(['key1', 'key2'])

// Clear all cache
storageManager.clearCache()

// Get cache statistics
const stats = storageManager.getCacheStats()
```

#### Event System

```javascript
// Listen to events
storageManager.on('change', callback)
storageManager.on('change:key', callback)
storageManager.on('set', callback)
storageManager.on('remove', callback)

// Remove listeners
storageManager.off('change', callback)
```

### useStorage Composable

```javascript
const {
  data,        // Reactive data object
  isLoading,   // Loading state
  error,       // Error state
  load,        // Manual load function
  save,        // Save function
  remove,      // Remove function
  update,      // Update single key
  getCached    // Get cached value
} = useStorage(keys, options);
```

### useStorageItem Composable

```javascript
const {
  value,       // Reactive value with auto-sync
  isLoading,   // Loading state
  error,       // Error state
  save,        // Manual save
  remove       // Remove item
} = useStorageItem(key, defaultValue, options);
```

## Migration Guide

### From Direct browser.storage Calls

**Before:**
```javascript
// Old pattern
const data = await browser.storage.local.get(['key1', 'key2']);
await browser.storage.local.set({ key1: 'value1' });

// Manual change listeners
browser.storage.onChanged.addListener((changes) => {
  // Handle changes
});
```

**After:**
```javascript
// New pattern with StorageManager
const data = await storageManager.get(['key1', 'key2']);
await storageManager.set({ key1: 'value1' });

// Event system
storageManager.on('change:key1', ({ newValue }) => {
  // Handle change
});
```

### From useBrowserAPI Storage

**Before:**
```javascript
const { safeStorageGet, safeStorageSet } = useBrowserAPI();
const data = await safeStorageGet(['key1']);
await safeStorageSet({ key1: 'value1' });
```

**After:**
```javascript
// API remains the same, but now uses StorageManager internally
const { safeStorageGet, safeStorageSet } = useBrowserAPI();
const data = await safeStorageGet(['key1']); // Uses StorageManager
await safeStorageSet({ key1: 'value1' }); // Uses StorageManager
```

## Benefits

### Performance Improvements

1. **Reduced API Calls** - Intelligent caching reduces browser.storage calls
2. **Batch Operations** - Efficient bulk operations
3. **Memory Management** - Automatic cache cleanup and garbage collection

### Developer Experience

1. **Unified API** - Single interface for all storage operations
2. **Type Safety** - Better TypeScript support (future enhancement)
3. **Error Handling** - Consistent error management across the app
4. **Debugging** - Cache statistics and detailed logging

### Architecture Benefits

1. **Centralized Logic** - All storage logic in one place
2. **Event-Driven Updates** - Reactive components with automatic updates
3. **Testing** - Easier unit testing with mocked storage
4. **Maintenance** - Single point of control for storage changes

## Examples

### Settings Management

```javascript
// Load settings with defaults
const settings = await storageManager.get({
  theme: 'auto',
  language: 'en',
  enabled: true
});

// Update single setting
await storageManager.set({ theme: 'dark' });

// Listen for setting changes
storageManager.on('change:theme', ({ newValue }) => {
  document.body.className = `theme-${newValue}`;
});
```

### Vue Component Integration

```vue
<script setup>
import { useStorage } from '@/composables/useStorage.js';

// Reactive settings object
const { data: settings, save } = useStorage({
  API_KEY: '',
  PROVIDER: 'google',
  ENABLED: true
});

// Auto-sync single value
const { value: theme } = useStorageItem('theme', 'auto');

// Save settings
const saveSettings = async () => {
  await save({
    API_KEY: settings.API_KEY,
    PROVIDER: settings.PROVIDER
  });
};
</script>
```

### Background Service Integration

```javascript
// In background service
import storageManager from '@/core/StorageManager.js';

class TranslationService {
  constructor() {
    // Listen for API key changes
    storageManager.on('change:API_KEY', ({ newValue }) => {
      this.updateApiKey(newValue);
    });
  }

  async getSettings() {
    return await storageManager.get({
      API_KEY: '',
      PROVIDER: 'google',
      SOURCE_LANG: 'auto',
      TARGET_LANG: 'en'
    });
  }
}
```

## Testing

StorageManager includes comprehensive test coverage:

```bash
# Run StorageManager tests
pnpm run test:vue:run

# Tests include:
# - Basic operations (get, set, remove, clear)
# - Cache management
# - Event system
# - Error handling
# - Cleanup and memory management
```

## Performance Monitoring

```javascript
// Get cache statistics for debugging
const stats = storageManager.getCacheStats();
console.log('Cache stats:', stats);
// Output: { size: 10, keys: ['key1', 'key2', ...], isReady: true }

// Monitor storage events
storageManager.on('change', (data) => {
  console.log('Storage changed:', data.key, data.newValue);
});
```

## Best Practices

1. **Use Appropriate Pattern** - Choose between direct StorageManager, useStorage, or useStorageItem based on needs
2. **Cache Management** - Let StorageManager handle cache automatically, manual invalidation only when needed
3. **Event Cleanup** - Always cleanup event listeners in components (handled automatically in composables)
4. **Error Handling** - Use try-catch blocks for storage operations
5. **Default Values** - Always provide sensible defaults for storage operations

## Future Enhancements

- [ ] TypeScript support for better type safety
- [ ] Storage quotas and limits management
- [ ] Advanced caching strategies (LRU, TTL)
- [ ] Storage compression for large data
- [ ] Cross-tab synchronization improvements
- [ ] Performance metrics and analytics

---

This StorageManager system provides a solid foundation for centralized storage management while maintaining backward compatibility and improving performance across the extension.