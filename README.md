# Gemini Translate

A lightweight and versatile browser extension designed to translate text within input fields (e.g., text boxes, textareas, and contenteditable elements). Translations are triggered by either clicking the extension icon or pressing the Ctrl+/ shortcut.

**It's a writing and translation assistant.**

---

## Features

- **Universal Compatibility:** Works seamlessly with standard and advanced input fields.
- **Multiple Activation Methods:** Trigger translation via the icon click or the Ctrl+/ shortcut.
- **Provider Support:** Choose between multiple translation providers, including [Gemini](https://gemini.com/), [OpenAI](https://chat.openai.com/), and [WebAI to API](https://github.com/Amm1rr/WebAI-to-API/).

---

## Requirements

- A modern Chromium-based browser (Chrome, Edge, Brave, etc.)
- A valid API key if not using [WebAI ot API](https://github.com/Amm1rr/WebAI-to-API/)

---

## Installation

1. **Install via CRX File:**

   - Download the [`Gemini-Translation-Extension.crx`](https://github.com/iSegaro/Gemini-Translate/raw/refs/heads/Dev/Chrome-Extension/AI_Writing_Companion_v0.1.0.crx) file from the `Chrome-Extension/` folder.
   - Open `chrome://extensions/` in Chrome and enable Developer mode.
   - Drag and drop the `.crx` file onto the `chrome://extensions/` page to install the extension.

2. **Install via Git:**

   - Clone the repository:

     ```bash
     git clone https://github.com/iSegaro/Gemini-Translate.git
     cd Gemini-Translate
     ```

   - Load the extension in Chrome:
     - Open `chrome://extensions/` and enable Developer mode.
     - Click **Load unpacked** and select the `Chrome-Extension/dist/` folder.

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
