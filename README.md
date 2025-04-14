# AI Writing Companion

<div align="center">
    <strong>
        • <a href="./README.md">English</a> |
        • <a href="./README.FA.md">فارسی</a>
    </strong>
</div>

<br>

This is a personal, lightweight, and efficient tool for seamless text translation on the web and in any text you type. By offering multiple distinct translation and lookup methods, it delivers a fast and hassle-free user experience:

- **Text Selection Translation:** Simply select the text you want to translate; as soon as you release the mouse button, the translation appears right at that spot.
- **Element Selection Translation:** Activate the "Select Element" mode via the extension icon in your browser toolbar, then click on any part of the page (such as paragraphs or buttons) to see a complete translation without altering the page layout.
- **In-Field Translation:** When typing in any text field or form, press the `Ctrl + /` shortcut or click the small translator icon next to the field to quickly translate your text before submission.
- **Inline Translation Display:** When you select any text, its translation is shown in a small box directly beneath your selection.
- **Advanced Popup Translation:** Click the extension icon in the browser toolbar to open a popup window that not only translates text but also provides extra features such as pronunciation assistance and comprehensive dictionary information.

Developed exclusively for personal use, this extension ensures that smart and fast translation is always at fingertips.

**Smart and fast translation, anytime and everywhere.**

<br>

## ⚙️ Key Features

- 💸 **Free & Open Source:**
  Always free for use, with complete open source code available.

- 🔊 **Word and Sentence Pronunciation:**  
  Every translation comes with the ability to listen to the exact pronunciation of words and sentences. You can choose from various accents to hear your preferred pronunciation. Simply click the translator icon in the toolbar to access advanced pronunciation features.

- 📙 **Dictionary Mode:**
  By selecting a word on the page with your mouse, you not only receive its translation but also comprehensive details—such as meaning, synonyms, part of speech, and practical examples—helping you build a deeper understanding of the vocabulary.

- ✅ **Supports Multiple Translation Providers:**
  This extension supports several AI translation services, allowing you to choose the best option for your needs:
  - [Gemini][gemini-url] (✔ Free)
  - [OpenAI][openai-url]
  - [OpenRouter][openrouter-url] (✔ Free)
  - [WebAI to API][webai-to-api-url] (✔ Free)

<br>

## 📋 Requirements

- A modern Chromium-based browser or Firefox (Chrome, Edge, Brave, etc.)
- A valid API key (if not using [WebAI to API][webai-to-api-url])

<br>

---

## 🔧 Installation

Just a few finishing touches remain, and we'll soon release it on the Chrome Store and Firefox Add-ons.

### Install for Chrome

- [Download the latest Chrome version here][chrome-zip-url].
- Extract the downloaded ZIP file.
- Open [`chrome://extensions/`][chrome-extensions-url] in Chrome and enable **Developer mode**.
- Drag and drop the extracted folder onto the `chrome://extensions/` page to install the extension.
- That's it!

_Note:_ After installation, click the **extension icon** in your browser to open **Settings** and enter your API key.

<br><br>

### Install for Firefox

- [Download the latest Firefox version here][firefox-zip-url].
- Extract the downloaded ZIP file.
- Open [`about:debugging#/runtime/this-firefox/`][firefox-extensions-url] in Firefox.
- Click the `Load Temporary Add-on...` button and select the `manifest.json` file from the extracted folder.
- That's it!

_Note:_ Once installed, click the **extension icon** in your browser to access **Settings** and enter your API key.

<br>

---

## 🔑 API Keys

To utilize the full capabilities of AI Writing Companion, you might need API keys from the following providers:

| Provider      | Get API Key                                   | Cost                     |
| ------------- | --------------------------------------------- | ------------------------ |
| Google Gemini | [Google AI Studio][gemini-api-key-url]        | Free                     |
| OpenAI        | [OpenAI API Keys][openai-api-key-url]         | Paid                     |
| OpenRouter    | [OpenRouter API Keys][openrouter-api-key-url] | Free                     |
| WebAI to API  | _(Doesn't Need)_                              | [Free][webai-to-api-url] |

**Note:** **`WebAI to API`** is a Python server that allows you to have a local API without needing an real API key.

<br>

---

## 🎯 Usage

- **Element Selection:** Click on the translator icon in the browser toolbar, then select any element on the page that gets highlighted. The entire text within the selected element will be translated and replaced. Press ESC to revert to the original text.
- **Writing Fields:** Click on any field to make the translation icon appear.
- **Shortcut:** When an input field is active, press `Ctrl + /` to activate translation.
  Type your text in your native language, and then by pressing the shortcut, the text will be automatically replaced with its translation. It's really cool, and we love it! : )

<br>

---

## ☕ Buy Me a Coffee

If you found this project useful and can afford it, treat me to a coffee! :)

<br>

| Donations Method    | 🔗 Link                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **USDT (Ethereum)** | `0x76DAF7D7C3f7af9B90e16B5C25d063ff3A1A0f8f`                                                                                                                     |
| **Bitcoin (BTC)**   | `bc1qgxj96s6nks6nyhzlncw65nnuf7pyngyyxmfrsw`                                                                                                                     |
| **PayPal**          | [![Donate PayPal](https://img.shields.io/badge/Donate-Paypal-00457C?logo=paypal&labelColor=gold)](https://www.paypal.com/donate/?hosted_button_id=DUZBXEKUJGKLE) |

<br>
Thank you for your support!

Your support goes to Mohammad [![Mohammad X](<https://img.shields.io/badge/X%20(Twitter)-M_Khani65-green?style=flat&logo=x>)][mohammad-x-url]

<br>

---

### Contributors

- iSegar0 [![iSegar0 X](<https://img.shields.io/badge/X%20(Twitter)-iSegar0-blue?style=flat&logo=x>)](https://x.com/iSegar0/)
- Mohammad [![Mohammad X](<https://img.shields.io/badge/X%20(Twitter)-M_Khani65-blue?style=flat&logo=x>)](https://x.com/M_Khani65/)

<br>

---

## ⚙️ Development

### Prerequisites

Ensure **Node.js** is installed (which includes `npm`), then type the following in the terminal:

```bash
cd AI-Writing-Companion
npm install
```

### Build

To generate extension files, type:

```bash
npm run build
```

This command creates the `AI-Writing-Companion/Build-Extension/Chrome/` folder for manual installation.

But if you want to make changes, use this command which is much more useful:

```bash
npm run watch
```

<br>

---

## 🤝 Contribute

- **Star the repo** to support the project. ⭐
- **Report issues:** [GitHub Issues][github-issues-url] 🐞
- **Submit Pull Requests (PRs)** to contribute improvements.

---

### 🖼️ Copyright

Icons used in this project are provided by [Flaticon](https://www.flaticon.com), created by the following authors:

- [Pixel perfect](https://www.flaticon.com/authors/pixel-perfect) — Main icon, Select, Paste
- [Tanah Basah](https://www.flaticon.com/free-icons/voice-command) — Voice Command
- [photo3idea_studio](https://www.flaticon.com/free-icons/translate) — Translate
- [Midev](https://www.flaticon.com/free-icons/clear) — Clear
- [Miftakhul Rizky](https://www.flaticon.com/free-icons/close) — Close
- [fjstudio](https://www.flaticon.com/free-icons/awareness) — Awareness
- [Bharat Icons](https://www.flaticon.com/free-icons/volume) — Volume
- [Freepik](https://www.flaticon.com/authors/freepik) — Swap, Translate, Settings
- [Catalin Fertu](https://www.flaticon.com/free-icons/copy) — Copy
  <br>

---

## 📜 License

This project is licensed under the **MIT License**. Feel free to improve and share!

[gemini-url]: https://gemini.com/
[openai-url]: https://chat.openai.com/
[openrouter-url]: https://openrouter.ai/
[webai-to-api-url]: https://github.com/Amm1rr/WebAI-to-API/
[firefox-zip-url]: https://github.com/iSegaro/AIWritingCompanion/raw/refs/heads/main/Build-Extension/AI-Writing-for-Firefox-v0.1.0.zip
[chrome-zip-url]: https://github.com/iSegaro/AIWritingCompanion/raw/refs/heads/main/Build-Extension/AI-Writing-for-Chrome-v0.1.0.zip
[crx-download-url]: https://github.com/iSegaro/AIWritingCompanion/raw/refs/heads/main/Build-Extension/AI-Writing-Companion.crx
[chrome-build-folder-url]: https://github.com/iSegaro/AIWritingCompanion/raw/refs/heads/main/Build-Extension/
[chrome-extensions-url]: chrome://extensions/
[firefox-extensions-url]: about:debugging#/runtime/this-firefox/
[gemini-api-key-url]: https://aistudio.google.com/apikey/
[openai-api-key-url]: https://platform.openai.com/api-keys/
[openrouter-api-key-url]: https://openrouter.ai/settings/keys/
[mohammad-x-url]: https://x.com/m_khani65/
[github-issues-url]: https://github.com/iSegaro/AIWritingCompanion/issues
[isegaro-x-url]: https://x.com/iSegar0/
[m-khani65-x-url]: https://x.com/M_Khani65/
[flaticon-url]: https://www.flaticon.com/free-icons/translate
