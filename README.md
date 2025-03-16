# Gemini Translate

A lightweight browser extension that translates text in input fields (e.g., text boxes, textareas, and contenteditable elements) using either a mock translation for testing or real API calls in production. It replaces the original text with the translated version when you click the icon or press Ctrl+/.

🚧 **This project is in development and not yet officially released.**

---

## Features

- **Universal Compatibility:** Works on both standard and advanced input fields.
- **Multiple Triggers:** Activate via icon click or Ctrl+/ shortcut.

---

## Requirements

- A modern Chromium-based browser (Chrome, Edge, Brave, etc.)
- A valid API key if not using mock mode

---

## Installation

1. **Clone the Repository:**

   ```bash
   git clone [https://github.com/iSegaro/Gemini-Translate.git](https://github.com/iSegaro/Gemini-Translate.git)
   cd Gemini-Translate
   ```

2. **Load in Chrome:**

   - Open `chrome://extensions/` and enable Developer mode.
   - **Option 1:** Click **Load unpacked** and select the `Chrome-Extension/dist/` folder.
   - **Option 2:** Drag and drop the `Chrome-Extension/dist/` folder onto the `chrome://extensions/` page.

3. **Set your API key on the Options page.**

---

## 🔑 Get a Free Google API Key

1. Visit [Google AI Studio](https://aistudio.google.com/apikey) and log in.
2. Click **Get API Key**, then **Create API Key**, and copy it.

_Free Tier: 1,500 requests/day with Gemini 1.5 Flash._

Watch this [video guide](https://www.youtube.com/watch?v=o-eyHCP5XwY&t=0) for details.

---

## Usage

- **Automatic:** Hover or click an input field to reveal the translation icon.
- **Shortcut:** Press Ctrl+/ when an input field is active.

---

## Development

### Prerequisites

Install Node.js (which includes npm), then run:

```bash
cd Gemini-Translate
npm install
```

### Build

```bash
npm run build
```

This generates the `Chrome-Extension/dist/` folder for manual installation.
For live updates, run:

```bash
npm run watch
```

---

## Contribute

- **Star** the repo.
- **Report issues:** [GitHub Issues](https://github.com/iSegaro/Gemini-Translate/issues)
- **Submit PRs.**

---

## License

This project is licensed under the MIT License.
Feel free to improve and share!
