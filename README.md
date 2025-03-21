# AI Writing Companion

A lightweight and versatile browser extension designed to translate text within input fields (e.g., text boxes, textareas, and contenteditable elements). Translations can be triggered by clicking the extension icon or using the `Ctrl + /` shortcut.

**AI Writing Companion is your smart writing and translation assistant.**

---

## 🚀 Features

- **Universal Compatibility:** Works seamlessly with standard and advanced input fields.
- **Multiple Activation Methods:** Trigger translation via icon click or the `Ctrl + /` shortcut.
- **Flexible Provider Support:** Choose from multiple translation providers, including:
  - [Gemini](https://gemini.com/)
  - [OpenAI](https://chat.openai.com/)
  - [OpenRouter](https://openaourter.com/)
  - [WebAI to API](https://github.com/Amm1rr/WebAI-to-API/)

---

## 📋 Requirements

- A modern Chromium-based browser (Chrome, Edge, Brave, etc.)
- A valid API key (if not using [WebAI to API](https://github.com/Amm1rr/WebAI-to-API/))

---

## 🔧 Installation

### 1. Install via CRX File

- Download the last version of the [`AI-Writing-Companion.crx`](https://github.com/iSegaro/AI-Writing-Companion/raw/refs/heads/main/Build-Extension/Chrome/AI-Writing-Companion.crx) file from the [`Build-Extension/Chrome/`](https://github.com/iSegaro/AI-Writing-Companion/raw/refs/heads/main/Build-Extension/Chrome/) folder.
- Open `chrome://extensions/` in Chrome and enable **Developer mode**.
- Drag and drop the `.crx` file onto the `chrome://extensions/` page to install the extension.

### 2. Install via Git

```bash
# Clone the repository
git clone https://github.com/iSegaro/AI-Writing-Companion.git
cd AI-Writing-Companion
```

- Follow the **CRX installation steps** above.

### 3. Set Your API Key

- Go to the **Options** page of the extension and enter your API key.

---

## 🔑 API Keys

#### Get a Free Google Gemini API Key

- Visit: [Google AI Studio](https://aistudio.google.com/apikey/)

#### OpenAI API Key

- Visit: [OpenAI API Keys](https://platform.openai.com/api-keys/)

#### OpenRouter API Key

- Visit: [OpenRouter API Keys](httpshttps://openrouter.ai/settings/keys/)

#### Get Free WebAI to API

- Visit: [WebAI to API](https://github.com/amm1rr/WebAI-to-API/)

---

## 🎯 Usage

- **Select Element:** Click on the extension icon, then click on an element to translate its text.
- **Automatic:** Hover over or click an input field to reveal the translation icon.
- **Shortcut:** Press `Ctrl + /` while an input field is active to trigger translation.

---

## ⚙️ Development

### Prerequisites

Ensure **Node.js** is installed (which includes npm), then run:

```bash
cd Gemini-Translate
npm install
```

### Build

To generate the production-ready extension files:

```bash
npm run build
```

This will create the `Chrome-Extension/dist/` folder for manual installation.

For live updates during development, run:

```bash
npm run watch
```

---

## 🤝 Contribute

- **⭐ Star the repo** to support the project.
- **🐞 Report issues:** [GitHub Issues](https://github.com/iSegaro/Gemini-Translate/issues)
- **📥 Submit Pull Requests (PRs)** to contribute improvements.

---

## 🎨 Credits

Icon by [Pixel perfect - Flaticon](https://www.flaticon.com/free-icons/translate)

---

## 📜 License

This project is licensed under the **MIT License**. Feel free to improve and share!
