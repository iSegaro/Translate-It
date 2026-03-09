# Translation Provider Implementation Guide

## Overview

This document provides a comprehensive guide for implementing translation providers within the Translate-It system. All providers must inherit from `BaseProvider` and adhere to the Rate Limiting and Circuit Breaker patterns.

## Architecture Overview

The system is built upon **Unified Provider Discovery**:
- **ProviderManifest**: **The heart of the system.** A single file containing all identities, display settings, and provider loading logic.
- **BaseProvider**: The base class for translation coordination logic and error handling.
- **ProviderConstants**: Name and ID constants to prevent typos.
- **ProviderConfigurations**: Precise technical settings (Rate Limit, Batching, Features).
- **RateLimitManager**: Manages request rate limits (automatically populated from technical settings).
- **ProviderRegistry**: Handles dynamic provider management in the UI (automatically populated from the manifest).

---

## 🚀 Workflow: Adding a New Provider (Quick Start)

To add a new provider, simply follow these 4 steps:

### 1. Define Constants (`ProviderConstants.js`)
Add the constant ID and Name:
- `ProviderNames.YOUR_PROVIDER`: The class name (e.g., `'YourTranslate'`)
- `ProviderRegistryIds.YOUR_ID`: The registry ID (e.g., `'yourid'`)

### 2. Implement the Provider Class (`providers/YourProvider.js`)
Create a new class inheriting from `BaseTranslateProvider` or `BaseAIProvider` and implement the essential methods (`_getLangCode` and `_translateChunk`/`_translateSingle`).

### 3. Register in the Manifest (`providers/ProviderManifest.js`)
Add the provider information to the `PROVIDER_MANIFEST` array. This **automatically** handles the following:
- Registration for Lazy Loading
- Display in UI dropdowns
- Toolbar icon configuration
- Validation in the context menu
- Description management in the settings page

```javascript
{
  id: ProviderRegistryIds.YOUR_ID,
  name: ProviderNames.YOUR_PROVIDER,
  displayName: "Your Provider Name",
  type: ProviderTypes.TRANSLATE,
  category: ProviderCategories.FREE,
  icon: "your-icon.png", // Place in icons/providers/
  descriptionKey: "your_description_key",
  titleKey: "your_title_key",
  importFunction: () => import("./YourProvider.js").then(m => ({ default: m.YourProvider })),
  features: ["text", "autoDetect"],
  needsApiKey: false,
  supported: true,
}

```

### 4. Define Technical Details and i18n

* **Technical Settings**: Enter Rate Limit settings and capabilities in `core/ProviderConfigurations.js`.
* **Translation**: Define `descriptionKey` and `titleKey` in `_locales/*/messages.json`.

---

## ✅ Provider Implementation Rules

### 1. MANDATORY: Inherit from BaseProvider

All providers must inherit from `BaseProvider` or its specialized children (`BaseTranslateProvider` / `BaseAIProvider`).

### 2. DO NOT Override translate() Method

Never override the `translate()` method. This method handles critical coordination (Language Swapping, JSON mode, Rate Limiting). Only implement the internal `_translateChunk` or `_translateSingle` methods.

### 3. MANDATORY: Use ProviderNames constant

Always use `ProviderNames` constants in the class constructor:

```javascript
constructor() {
  super(ProviderNames.YOUR_PROVIDER);
}

```

---

## Provider Manifest System (The "Source of Truth")

The manifest (`ProviderManifest.js`) allows the system to automatically adapt to a new provider:

* **UI Registry**: The `src/core/provider-registry.js` file is dynamically generated from the manifest.
* **Actionbar Icons**: `ActionbarIconManager` locates icons based on the `icon` field in the manifest.
* **Context Menu**: The `knownProviderIds` list is automatically updated from manifest IDs.
* **Options UI**: The `LanguagesTab.vue` page intelligently reads each provider's description from the manifest.

---

## Rate Limiting & Configurations

Technical settings are centralized in `ProviderConfigurations.js`. Upon startup, the `RateLimitManager` reads all these settings and assigns a dedicated Queue and Circuit Breaker to each provider.

### Key Config Sections:

* **rateLimit**: Number of concurrent requests and delays.
* **batching**: Text segmentation strategy (Character limit or Smart AI batching).
* **streaming**: Enabling/disabling streaming capabilities.
* **features**: Capabilities such as Image Translation or Dictionary.

---

## Multi-API Key Failover System

If your provider requires an API Key, the system automatically supports **Multi-Key Failover**:

1. Set the field `needsApiKey: true` in the manifest.
2. Use `ApiKeyManager` to manage keys.
3. Call the `_executeApiCallWithFailover` method within the provider class so the system can automatically switch to the next key in case of errors (e.g., 429 or invalid key).

---

## Summary of Optimization

With the new architecture, system complexity has been significantly reduced:

* **Elimination of Redundant Code**: Provider metadata is defined in only one place (the Manifest).
* **Reduced Error Probability**: Due to the use of constants and dynamic list generation, the risk of forgetting steps or making typos in auxiliary files is eliminated.
* **Easy Maintenance**: To change a provider's icon or name, you only need to edit the manifest.
