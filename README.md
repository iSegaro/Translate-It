# AI Writing Companion

A lightweight and versatile browser extension designed to translate text within input fields (e.g., text boxes, textareas, and contenteditable elements). Translations can be triggered by clicking the extension icon or using the `Ctrl + /` shortcut.

**AI Writing Companion is a handy, small writing tool and translation assistant.**

<br>

## 🚀 Features

- **Universal Compatibility:** Works seamlessly with standard and advanced input fields.
- **Multiple Activation Methods:** Trigger translation via icon click or the `Ctrl + /` shortcut.
- **Flexible Provider Support:** Choose from multiple translation providers, including:
  - [Gemini][gemini-url] (✔ Free)
  - [OpenAI][openai-url]
  - [OpenRouter][openrouter-url]
  - [WebAI to API][webai-to-api-url] (✔ Free)

<br>

## 📋 Requirements

- A modern Chromium-based browser (Chrome, Edge, Brave, etc.)
- A valid API key (if not using [WebAI to API][webai-to-api-url])

<br>

---

## 🔧 Installation

### 1. Install via CRX File

- Download the latest version of [`AI-Writing-Companion.crx`][crx-download-url] from the [`Build-Extension/Chrome/`][chrome-build-folder-url] folder.
- Open [`chrome://extensions/`][chrome-extensions-url] in Chrome and enable **Developer mode**.
- Drag and drop the [`.CRX`][crx-download-url] file onto the `chrome://extensions/` page to install the extension.

- Go to the **Options** page of the extension and enter your API key.

### 2. Install via Git

```bash
# Clone the repository
git clone https://github.com/iSegaro/AI-Writing-Companion.git
cd AI-Writing-Companion
```

- Follow the **CRX installation steps** above.

<br>

---

## 🔑 API Keys

To utilize the full capabilities of AI Writing Companion, you might need API keys from the following providers. Here's a quick guide on where to obtain them:

| Provider      | Get API Key                                   | Cost                     |
| ------------- | --------------------------------------------- | ------------------------ |
| Google Gemini | [Google AI Studio][gemini-api-key-url]        | Free                     |
| OpenAI        | [OpenAI API Keys][openai-api-key-url]         | Potentially Paid         |
| OpenRouter    | [OpenRouter API Keys][openrouter-api-key-url] | Potentially Paid         |
| WebAI to API  | _(Doesn't Need)_                              | [Free][webai-to-api-url] |

**Note:** **_`WebAI to API`_** is mentioned as a free option in the features section, potentially removing the direct need for an API key in the traditional sense. Please refer to their documentation for specific instructions.

<br>

---

## 🎯 Usage

- **Select Element:** Click on the extension icon, then click on an element to translate its text.
- **Automatic:** Hover over or click an input field to reveal the translation icon.
- **Shortcut:** Press `Ctrl + /` while an input field is active to trigger translation.

<br>

---

## 🌱 Support the Project

If you find this project helpful, consider making a donation to support ongoing development:

| 💰 Cryptocurrency      | 🔗 Address                                   |
| ---------------------- | -------------------------------------------- |
| 🟢 **USDT (Ethereum)** | `0x76DAF7D7C3f7af9B90e16B5C25d063ff3A1A0f8f` |
| 🟠 **Bitcoin (BTC)**   | `bc1qgxj96s6nks6nyhzlncw65nnuf7pyngyyxmfrsw` |

Your contributions help maintain and improve the extension. Thank you for your support!

Your support goes to [Mohammad][mohammad-x-url]

<br>

---

## 🤝 Contribute

- **Star the repo** to support the project. ⭐
- **Report issues:** [GitHub Issues][github-issues-url] 🐞
- **Submit Pull Requests (PRs)** to contribute improvements.

<br>

---

## ⚙️ Development

### Prerequisites

Ensure **Node.js** is installed (which includes \`npm\`), then run:

```bash
cd AI-Writing-Companion
npm install
```

### Build

To generate the production-ready extension files:

```bash
npm run build
```

This will create the `AI-Writing-Companion/Chrome-Extension/dist/` folder for manual installation.

For live updates during development, run:

```bash
npm run watch
```

<br>

---

## 🎨 Credits

- Author [@iSegar0][isegaro-x-url]
- Developer [@m_khani65][m-khani65-x-url]
- Icon by [Pixel perfect - Flaticon][flaticon-url]

<br>

---

## 📜 License

This project is licensed under the **MIT Licence**. Feel free to improve and share!

[gemini-url]: https://gemini.com/
[openai-url]: https://chat.openai.com/
[openrouter-url]: https://openrouter.ai/
[webai-to-api-url]: https://github.com/Amm1rr/WebAI-to-API/
[crx-download-url]: https://github.com/iSegaro/AI-Writing-Companion/raw/refs/heads/main/Build-Extension/Chrome/AI-Writing-Companion.crx
[chrome-build-folder-url]: https://github.com/iSegaro/AI-Writing-Companion/raw/refs/heads/main/Build-Extension/Chrome/
[chrome-extensions-url]: chrome://extensions/
[gemini-api-key-url]: https://aistudio.google.com/apikey/
[openai-api-key-url]: https://platform.openai.com/api-keys/
[openrouter-api-key-url]: https://openrouter.ai/settings/keys/
[mohammad-x-url]: https://x.com/m_khani65/
[github-issues-url]: https://github.com/iSegaro/AI-Writing-Companion/issues
[isegaro-x-url]: https://x.com/iSegar0/
[m-khani65-x-url]: https://x.com/M_Khani65/
[flaticon-url]: https://www.flaticon.com/free-icons/translate
