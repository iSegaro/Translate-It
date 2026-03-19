# User Guide

This document provides detailed instructions on how to use **Translate It!** and its various features.

---

## How to Use

### 1. Basic Setup
After installation, pin the extension to your browser toolbar for quick and easy access.

### 2. Select Element Mode
To translate any specific part of a web page, you first need to activate `Element Selection` mode. You can do this using one of the following methods:

- Click on the extension icon and select the **Select Element** option.
- Right-click anywhere on the page and choose the option from the **context menu**.
- Use the **keyboard shortcut** (see below).

Once the mode is active, hover over any part of the page to highlight it. Click the highlighted area to instantly translate its content.

### 3. Revert Translations
To undo translations and restore the original text:
- Press the `ESC` key.
- Click the **Revert** button in the extension popup/sidepanel.

---

## ⌨️ Keyboard Shortcuts

We recommend setting shortcuts manually to avoid conflicts with browser or system shortcuts.

### Customize Shortcuts:

- **Chrome:** Go to [`chrome://extensions/shortcuts`](chrome://extensions/shortcuts)
- **Firefox:**
  1. Right-click the extension icon and choose **Manage Extension**.
  2. Click the **gear icon** and select **Manage Extension Shortcuts**.

---

## ⚠️ Known Issues & Limitations

### Bing Translator
**Bing Translate** is generally slow. Additionally, it may encounter issues with complex texts when used in **Select Element** mode.
For Microsoft-based translation, we highly recommend using **Microsoft Translator**, which is significantly faster and offers superior quality.

### Optimization Trade-offs
To minimize API costs and maximize speed, the extension optimizes text before sending it for translation. This may occasionally result in reduced accuracy for complex web pages.
- **Recommendation:** For critical content, we recommend using alternative modes like **Select Text**, or translation via the **Popup** or **Sidepanel** instead of **Select Element**, as these methods preserve more context.

### Regional Restrictions
If you are in a region with restricted internet access (e.g., Iran or China), you will need a VPN to register for and use most AI-based translation services.
