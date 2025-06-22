### Translate It!

#### 0.3.0 - Draft

### Added

-   **Added support for the DeepSeek API** as a new translation provider.
-   **Added a "Custom" provider**, allowing users to connect to any OpenAI-compatible API endpoint (e.g., for local or self-hosted models).

### Changed

-   **Overhauled the error handling system** to be more robust and provide clearer, generalized messages for all supported API providers.

### Fixed

-   The extension is now correctly disabled on non-web pages (e.g., `file://` or internal browser pages) to prevent errors.
-   The in-field translation icon now appears more accurately on editable text fields and ignores non-text elements like checkboxes.
-   A default list of excluded sites (e.g., `accounts.google.com`, web stores) has been added to prevent conflicts.

---

#### 0.2.2 - Released 21 June 2025

-   New Feature: In addition to automatic translation on text selection, a new method has been added — a small icon now appears near the selected text. The translation is shown only after clicking this icon, allowing for a more deliberate and user-controlled experience.
-   Minor UI improvements and stability enhancements.

---

#### 0.2.1 - Released 28 May 2025

-   Improved Popup Behavior on Initial Inactivity
-   Enhanced display of the last translation (now shown only in Dictionary mode)
-   fix: resolve conflicts between theme styles and website styles (#43)

---

#### v0.2.0 - Released 26 May 2025

-   Theme Support Added
    -   Switch between Light, Dark, or Auto (system-based) themes to suit your visual preferences.
-   Improved RTL Language Support
    -   Text rendering and alignment for Right-to-Left languages like Persian and Arabic has been significantly refined for better readability and accuracy.
-   Discord Input Fix
    -   Resolved an issue where translated text wasn't properly sent in Discord input fields — it now works as expected.
-   General Enhancements
    -   Various bug fixes and performance improvements for a more stable and seamless experience.

---

#### v0.1.1 - Released 6 May 2025

-   Updated the build process and added a lint check
-   Renamed the extension (UUID remains unchanged)

---

#### v0.1.0 - Released 30 Apr 2025

-   First public release