# Options Page Documentation

## Overview

The **Options Page** is the central configuration hub for the Translate-It extension. It allows users to customize translation providers, languages, appearance, and behavioral settings. The page is built using a modern Vue.js architecture with a clear separation between state management and UI components.

## Settings Application Logic

One of the most important aspects of the Options page is how settings are applied and persisted. The system uses a dual-approach strategy:

### 1. Instant Application (No Save Required)
Certain settings take effect immediately the moment the user interacts with the control. These are typically UI-related settings that provide instant visual feedback.

- **Theme Switching**: Switching between Light, Dark, or Auto mode.
- **UI Language (Localization)**: Changing the interface language of the extension.

**Technical Implementation:**
These settings use the `updateSettingAndPersist` method in the `settings` store, which updates the local state and immediately calls `storageManager.set()` to persist the change.

### 2. Save-Triggered Application (Manual Save Required)
Most other configurations are buffered in the local state and require the user to explicitly click the **"Save"** button at the bottom of the navigation sidebar to be permanently applied and synchronized across tabs.

- **Translation Providers**: API keys, model selections, and provider-specific URLs.
- **Languages**: Source and Target language preferences.
- **Activation Modes**: Enabling/disabling Select Element, Text Selection, or Whole Page translation.
- **Advanced Settings**: Proxy configurations, exclusion lists, and debug mode.
- **Prompt Templates**: Custom templates for AI-based translation providers.

**Technical Implementation:**
These settings use the `updateSettingLocally` method, which only modifies the reactive `settings` object in the Pinia store. The changes are only written to `browser.storage.local` when the `saveAllSettings` action is called by the Save button.

## Architecture

### Store: `settings.js`
The `useSettingsStore` (Pinia) is the single source of truth for all settings.
- **`settings`**: A reactive object containing all configuration keys.
- **`loadSettings()`**: Fetches data from storage on initialization.
- **`saveAllSettings()`**: Persists all current local changes to storage.
- **`resetSettings()`**: Restores all settings to their default values.

### Layout: `OptionsLayout.vue`
Coordinates the overall structure, including:
- **`OptionsSidebar.vue`**: Navigation links.
- **`OptionsNavigation.vue`**: Contains the **Save Button** and status messages.
- **`router-view`**: Dynamically loads the selected tab component.

### Tabs
The configuration is divided into logical tabs:
- **Languages**: Source/Target language and primary provider selection.
- **Appearance**: Theme, font family, and font size settings.
- **Activation**: Toggle specific features (Select Element, Page Translation, etc.).
- **Providers**: Detailed configuration for each API (Gemini, OpenAI, etc.).
- **Prompt**: Custom AI prompt templates.
- **Advance**: Exclusion sites, Proxy settings, and Debug mode.
- **Import/Export**: Backup and restore settings via JSON.

## Best Practices for Developers

1. **Adding a New Setting**:
   - Add the default value in `getDefaultSettings()` within `src/features/settings/stores/settings.js`.
   - Use `updateSettingLocally` for most settings unless an instant visual update is required.
   
2. **Settings Synchronization**:
   - When `saveAllSettings` is called, it automatically triggers `settingsManager.refreshSettings()` and sends a `SETTINGS_UPDATED` message to all content scripts to ensure real-time synchronization without page reloads.

3. **Validation**:
   - Use the `validateSettings()` method in the store before saving to ensure critical data (like API keys for selected providers) is present and correctly formatted.

## UI/UX Considerations

- **RTL Support**: The Options page fully supports RTL (Right-to-Left) layouts based on the selected UI language.
- **Transitions**: Theme and Language changes utilize the `useUITransition` composable for smooth visual effects (View Transitions API).
- **Responsive Design**: The layout adapts to Tablet and Mobile screens, switching the vertical sidebar to a horizontal scrollable navigation.

---

**Last Updated**: March 2026