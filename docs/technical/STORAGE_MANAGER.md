# Storage Management Guide (StorageCore)

## Overview

**StorageCore** is a centralized storage management system for the Translate-It extension that provides a unified API for browser extension storage with intelligent caching and a robust event system. It replaces direct `browser.storage` calls to ensure performance, consistency, and reactive updates across all components.

## Features

**Unified Storage API** - Single interface for all storage operations (`get`, `set`, `remove`, `clear`).  
**Intelligent Caching** - Built-in caching mechanism to reduce expensive browser API calls.  
**Reactive Event System** - Emits events for storage changes, allowing components to stay in sync.  
**Cross-browser Support** - Seamlessly handles Chrome (Manifest V3) and Firefox APIs.  
**Error Resilience** - Integrated with the global Error Management System.  
**Performance Optimized** - Optimized for high-frequency access in content scripts and background workers.

## Architecture

### Core Components

1. **StorageCore Class** (`src/shared/storage/core/StorageCore.js`)
   - Singleton storage manager that inherits from `ResourceTracker`.
   - Manages an internal cache and coordinates with the browser's storage API.
   - Provides a localized event system for specific key changes (e.g., `change:key1`).

2. **SecureStorage** (`src/shared/storage/core/SecureStorage.js`)
   - Specialized layer for handling sensitive data like API keys.
   - Ensures data integrity and provides an additional layer of protection.

3. **useStorage Composables** (`src/shared/storage/composables/`)
   - **useStorage.js**: Vue integration for managing multiple reactive keys.
   - **useStorageItem.js**: Simplified Vue integration for a single reactive storage item with auto-sync.

4. **Vue Store Integration**
   - Core stores like `useSettingsStore` (`src/features/settings/stores/settings.js`) use `StorageCore` internally for persistence.

## Usage Patterns

### 1. Direct StorageCore Usage (Background/Logic)

```javascript
import { storageManager } from '@/shared/storage/core/StorageCore.js';

// Get data (with defaults)
const { theme, language } = await storageManager.get({
  theme: 'auto',
  language: 'en'
});

// Set data
await storageManager.set({ theme: 'dark' });

// Listen to specific key changes
storageManager.on('change:theme', ({ newValue, oldValue }) => {
  console.log('Theme changed to:', newValue);
});
```

### 2. Vue Composable Usage (UI)

```vue
<script setup>
import { useStorage } from '@/shared/storage/composables/useStorage.js';
import { useStorageItem } from '@/shared/storage/composables/useStorageItem.js';

// Multiple keys with reactive data object
const { data, isLoading, save } = useStorage(['API_KEY', 'PROVIDER']);

// Single key with auto-sync and default value
const { value: theme } = useStorageItem('theme', 'auto');
</script>
```

## API Reference

### StorageCore Methods

#### Basic Operations
- `get(keys, useCache = true)`: Retrieves values. Can accept a string, array of strings, or an object with defaults.
- `set(data, updateCache = true)`: Saves values to storage and updates the cache.
- `remove(keys, updateCache = true)`: Deletes specific keys.
- `clear(updateCache = true)`: Wipes all extension storage.

#### Event System
- `on(eventName, callback)`: Subscribe to changes. Use `change:KEY_NAME` for specific keys.
- `off(eventName, callback)`: Unsubscribe from changes.
- `emit(eventName, data)`: Manages internal event propagation.

#### Cache Management
- `getCached(key, defaultValue)`: Synchronous access to cached values.
- `getCacheStats()`: Returns debugging information about cache size and state.

## Benefits

### Performance
- **Reduced Overhead**: Minimizes the number of asynchronous `browser.storage` calls via an in-memory cache.
- **Batching**: Automatically handles batch operations for multiple keys.

### Reliability
- **Race Condition Prevention**: Centralized write operations ensure data consistency.
- **Context Awareness**: Integrated with `ExtensionContextManager` to handle extension updates and reloads safely.

### Maintainability
- **Single Source of Truth**: All storage logic is encapsulated within `StorageCore`.
- **Decoupled UI**: Vue components use composables that abstract away the complexity of storage listeners.

## Best Practices

1.  **Always Provide Defaults**: Use the object syntax in `get()` to ensure your code has sensible defaults.
2.  **Prefer Composables in Vue**: Use `useStorage` or `useStorageItem` in components to ensure automatic cleanup of listeners.
3.  **Use Specific Listeners**: Instead of listening to all changes, use `change:KEY_NAME` to improve performance.
4.  **Sensitive Data**: Use the appropriate settings keys (e.g., `GEMINI_API_KEY`) which are handled with extra care by the system.

---

**Last Updated**: May 2026
