# AI Writing Companion

<div align="center">
    <strong>
        • <a href="./README.md">English</a> | 
        • <a href="./README.FA.md">فارسی</a>
    </strong>
</div>

<br>

A lightweight and versatile browser extension designed to translate text within input fields (such as text boxes, text areas, and contenteditable elements). Translations can be triggered by clicking the extension icon or using the `Ctrl + /` shortcut.

**This is a handy, small writing tool and translation assistant.**

<br>

## ⚙️ Features

- **Universal Compatibility:** Works seamlessly with standard and advanced input fields.
- **Multiple Activation Methods:** Trigger translation via icon click or the `Ctrl + /` shortcut.
- **Multi-AI Support:** Choose from multiple translation providers, including:
  - [Gemini][gemini-url] (✔ Free)
  - [OpenAI][openai-url]
  - [OpenRouter][openrouter-url]
  - [WebAI to API][webai-to-api-url] (✔ Free)

<br>

## 📋 Requirements

- A modern Chromium-based browser (Chrome, Edge, Brave, etc.)
- A valid API key (if not using [WebAI to API][webai-to-api-url])

<br>

---

## 🔧 Installation

We're almost done with the fine-tuning, and we'll soon publish it on the Chrome Store.

### 1. Install via CRX File

- Download the latest version of [`AI-Writing-Companion.crx`][crx-download-url] from the [`Build-Extension/Chrome/`][chrome-build-folder-url] folder.
- Open [`chrome://extensions/`][chrome-extensions-url] in Chrome and enable **Developer mode**.
- Drag and drop the [`.CRX`][crx-download-url] file onto the `chrome://extensions/` page to install the extension.
- Go to the **Settings** page of the extension and enter your API key.

### 2. Install via Git

```bash
# Clone the repository
git clone https://github.com/iSegaro/AIWritingCompanion.git
cd AI-Writing-Companion
```

- Instead of using the CRX file, you can use the "AI-Writing-Companion/Build-Extension/Chrome/" folder.
- Follow the **CRX installation** steps.

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

| 💰 Payment Method      | 🔗 Link                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟢 **USDT (Ethereum)** | `0x76DAF7D7C3f7af9B90e16B5C25d063ff3A1A0f8f`                                                                                                                     |
| 🟠 **Bitcoin (BTC)**   | `bc1qgxj96s6nks6nyhzlncw65nnuf7pyngyyxmfrsw`                                                                                                                     |
| 💲 **PayPal**          | [![Donate PayPal](https://img.shields.io/badge/Donate-Paypal-00457C?logo=paypal&labelColor=gold)](https://www.paypal.com/donate/?hosted_button_id=DUZBXEKUJGKLE) |

<br>
Thank you for your support!

Your support goes to Mohammad [![Mohammad X](<https://img.shields.io/badge/X%20(Twitter)-M_Khani65-green?style=flat&logo=x>)][mohammad-x-url]

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

## 🎨 Credits

- iSegar0 [![iSegar0 X](<https://img.shields.io/badge/X%20(Twitter)-iSegar0-blue?style=flat&logo=x>)](https://x.com/iSegar0/)
- Mohammad [![Mohammad X](<https://img.shields.io/badge/X%20(Twitter)-M_Khani65-blue?style=flat&logo=x>)](https://x.com/M_Khani65/)
- Icon by [Pixel perfect - Flaticon][flaticon-url]

<br>

---

## 📜 License

This project is licensed under the **MIT License**. Feel free to improve and share!

[gemini-url]: https://gemini.com/
[openai-url]: https://chat.openai.com/
[openrouter-url]: https://openrouter.ai/
[webai-to-api-url]: https://github.com/Amm1rr/WebAI-to-API/
[crx-download-url]: https://github.com/iSegaro/AIWritingCompanion/raw/refs/heads/main/Build-Extension/Chrome/AI-Writing-Companion.crx
[chrome-build-folder-url]: https://github.com/iSegaro/AIWritingCompanion/raw/refs/heads/main/Build-Extension/Chrome/
[chrome-extensions-url]: chrome://extensions/
[gemini-api-key-url]: https://aistudio.google.com/apikey/
[openai-api-key-url]: https://platform.openai.com/api-keys/
[openrouter-api-key-url]: https://openrouter.ai/settings/keys/
[mohammad-x-url]: https://x.com/m_khani65/
[github-issues-url]: https://github.com/iSegaro/AIWritingCompanion/issues
[isegaro-x-url]: https://x.com/iSegar0/
[m-khani65-x-url]: https://x.com/M_Khani65/
[flaticon-url]: https://www.flaticon.com/free-icons/translate
