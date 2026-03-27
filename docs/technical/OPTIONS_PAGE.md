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

## Developer Guide: Adding a New Setting

To ensure a new configuration key is properly tracked, persisted, and synchronized across the extension, follow this checklist:

### 1. Define the Default Value
Add your new key and its default value to the `CONFIG` object in `src/shared/config/config.js`.
*Why:* This acts as the source of truth for the extension's default state.

### 2. Register in the Settings Store
Add the key to the `getDefaultSettings()` function in `src/features/settings/stores/settings.js`.
**CRITICAL:** If you skip this step, the setting will not be reactive, and it will be lost whenever the extension reloads or the store initializes.

### 3. Create an Async Getter (Optional but Recommended)
Add an async getter function in `src/shared/config/config.js` (e.g., `export const getMySettingAsync = ...`).
*Why:* This allows background scripts and non-Vue logic to access the setting reliably using the `StorageManager`.

### 4. Implement the UI Control
Add the appropriate input or toggle in the relevant tab component (under `src/components/feature/options/tabs/`).
- Use **`updateSettingLocally(key, value)`** for most settings (requires clicking the "Save" button).
- Use **`updateSettingAndPersist(key, value)`** for settings that should take effect instantly (e.g., UI theme, language).

---

## Import/Export Mechanism

The extension provides a robust way to backup and restore settings via the **Import/Export** tab. This process is not a simple JSON dump; it involves security and integrity checks:

-   **Exporting**: When `exportSettings()` is called, it uses `SecureStorage` to encrypt sensitive data (like API keys) and excludes large, non-essential data (like translation history).
-   **Importing**: When a user uploads a settings file, `importSettings()` performs:
    1.  **Decryption**: Validates and decrypts API keys.
    2.  **Merging**: Combines imported values with current defaults to prevent missing keys.
    3.  **Migration**: Automatically runs the migration system to ensure the imported file is compatible with the current version of the extension.

## Settings Migration System

Located in `src/shared/config/settingsMigrations.js`, this system ensures that user settings remain valid across different versions of the extension.

### When does it run?
1.  **On Update**: Triggered automatically when the extension is updated to a new version.
2.  **On Import**: Triggered after a user imports a settings file.

### Key Responsibilities:
-   **Structure Alignment**: Remaps old configuration keys to new formats (e.g., migrating `select_element` to the new `MessageContexts` format).
-   **Default Filling**: Adds any newly introduced settings from `CONFIG` that are missing in the user's current storage.
-   **Model List Updates**: Synchronizes AI model lists (Gemini, OpenAI, etc.) while preserving the user's specific model selection if it still exists.
-   **Legacy Conversions**: Handles complex migrations like moving from a single `API_KEY` to the multi-key `GEMINI_API_KEY` system.

**Developer Note:** If you rename a setting or change its data type, you **must** add a migration rule in `src/shared/config/settingsMigrations.js` to prevent breaking existing users' setups.

---

## UI/UX Considerations

- **RTL Support**: The Options page fully supports RTL (Right-to-Left) layouts based on the selected UI language.
- **Transitions**: Theme and Language changes utilize the `useUITransition` composable for smooth visual effects (View Transitions API).
- **Responsive Design**: The layout adapts to Tablet and Mobile screens, switching the vertical sidebar to a horizontal scrollable navigation.

---

**Last Updated**: March 2026