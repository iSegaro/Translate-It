# Select Element System Documentation

## 🎯 Overview

The Select Element system provides an intuitive way for users to translate content directly on a webpage. By activating this mode, users can hover over any element, see a visual highlight, and click to translate its text content. The system is built on a modern, decoupled architecture that separates business logic from the user interface, ensuring high performance and maintainability.

## 🏗️ Architecture

The system is fundamentally split into two distinct layers that communicate via an event bus, following the headless controller pattern.

```
+-------------------------+
|   Browser UI (Popup)    |
+-------------------------+
            |
            ▼ (Message: ACTIVATE_SELECT_ELEMENT_MODE)
+-------------------------+
|   Background Script     |
+-------------------------+
            |
            ▼ (Message to Content Script)
+--------------------------------------------------------------------+
|                               Content Script                       |
|                                                                    |
| +--------------------------+     (Events)     +--------------------+ |
| | SelectElementManager.js  | ◀──────────────▶ |   UI Host System   | |
| | (Headless Logic)         | (PageEventBus)   | (Vue UI in Shadow  | |
| +--------------------------+                  +--------------------+ |
|           |                                             |            |
|           ▼ (DOM Inspection & Highlighting)             ▼ (Renders)  |
| +--------------------------------------------------------------------+ |
| |                            Webpage DOM                           | |
| +--------------------------------------------------------------------+ |
+--------------------------------------------------------------------+
```

### 1. Logic Layer (`SelectElementManager.js`)
This is the core of the system, running as a headless controller in the content script. It does **not** render any complex UI itself. Its responsibilities include:
- **Activation & Deactivation**: Manages the lifecycle of the selection mode.
- **Event Handling**: Listens to mouse events (`mouseover`, `click`) to track user interactions.
- **Smart Element Detection**: Contains sophisticated logic to find the most relevant translatable element near the cursor, not just the element being hovered over.
- **Service Orchestration**: Composed of smaller, specialized services for highlighting, text extraction, translation, and state management.
- **Event Emission**: Communicates with the UI layer by emitting events to the `PageEventBus` (e.g., `select-mode-activated`).

### 2. UI Layer (`SelectModeToolbar.vue` within UI Host)
The user interface for the selection mode is a Vue component rendered by the central `UI Host System`. 
- **Event-Driven**: It listens for events from the `SelectElementManager` to know when to show or hide itself.
- **Shadow DOM Isolation**: As part of the UI Host, it is rendered inside a Shadow DOM, making it completely immune to the host page's CSS styles.
- **User Feedback**: It provides visual cues to the user, such as a toolbar or an overlay indicating that the selection mode is active.

## ✨ Key Features

- **Decoupled Architecture**: The separation of logic from UI makes the system robust and easy to maintain.
- **Smart Element Detection**: Instead of a simple hover-to-select, the manager analyzes parent and child elements to identify the most meaningful block of content for translation.
- **Multiple Selection Modes**: The `ModeManager` service supports different selection behaviors (e.g., a "Simple" mode that selects only the direct element, and a "Smart" mode that finds the best container). These modes can be toggled dynamically using the `Ctrl` key.
- **Direct Highlighting**: For maximum performance, the highlight border around elements is applied directly via CSS classes by the `ElementHighlighter` service. This avoids the overhead of passing frequent updates to Vue.
- **Asynchronous, Non-Blocking Translation**: Once an element is clicked, the selection UI disappears immediately, and the translation process runs in the background. This provides a fluid user experience.
- **Revert-able Translations**: The `StateManager` service tracks all translated elements, allowing the user to revert the changes back to the original text.

## 🔄 Event Flow (`PageEventBus`)
The communication between the logic and UI layers relies on a simple set of events:

- `select-mode-activated`: Fired by `SelectElementManager` when the mode becomes active. The UI Host listens to this to show the `SelectModeToolbar`.
- `select-mode-deactivated`: Fired when the mode is turned off or an element has been selected. The UI Host listens to this to hide the toolbar.
- `show-notification`: Used by various services within the manager to display status updates or errors (e.g., "No text found to translate").
- `clear-all-highlights`: An event to command the `ElementHighlighter` to remove any active highlights from the page.

## 🛠️ How It Works (User Flow)

1.  User clicks the "Select Element" action in the extension popup.
2.  The background script sends a message to the content script to activate the mode.
3.  `SelectElementManager.activate()` is called.
4.  The manager attaches mouse listeners to the page and emits `select-mode-activated`.
5.  The `UI Host` receives this event and renders the `SelectModeToolbar.vue` component, showing the user that selection mode is active.
6.  As the user moves the mouse, `ElementHighlighter` analyzes elements and applies a CSS class to highlight valid targets.
7.  The user clicks a highlighted element.
8.  `SelectElementManager.handleClick()` takes over. It identifies the final target element and passes it to the `TranslationOrchestrator` to begin the translation process.
9.  The manager immediately calls `deactivateUI()` and emits `select-mode-deactivated`.
10. The `UI Host` hides the `SelectModeToolbar`.
11. When the translation result arrives, `TranslationOrchestrator` applies the translated text directly to the DOM and registers the change with the `StateManager` so it can be reverted later.
