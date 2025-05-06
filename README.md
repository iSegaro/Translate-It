# Translate It!

> Smart Translation Assistant

<p align="center">
  <a target="_blank" href="https://chromewebstore.google.com/detail/AI%20Writing%20Companion%20for%20Chrome/jfkpmcnebiamnbbkpmmldomjijiahmbd/">
    <img src="./docs/Store/Chrome-Store.png" alt="Chrome" height="60" />
  </a>
  <a target="_blank" href="https://addons.mozilla.org/en-GB/firefox/addon/ai-writing-companion/">
    <img src="./docs/Store/Firefox-Store.png" alt="Firefox" height="60" />
  </a>

</p>

<br>

---

<br>

<div align="center">
  <strong>
    • <a href="./README.md">English</a> | 
    • <a href="./README.FA.md">فارسی</a>
  </strong>
</div>

<br>

This is a lightweight and efficient personal tool for translating text on websites and even the text you write yourself. With multiple methods for translation and word lookup, it offers a fast and seamless experience:

- **Text Selection Translation:** Simply select any text, and the translation box will appear right where you selected.

  <p align="center">
    <img src="./docs/Selection.png" alt="Popup showing translation of selected text" height="280" />
  </p>

- **Element Selection Translation:** Activate “Select Element” mode from the extension icon. Then click on any part of the page (e.g., paragraph or button) to translate it entirely, without breaking the page layout.

<p align="center">
  <img src="./docs/Select_Element_Item.png" alt="Webpage after element-selection mode has highlighted an element" height="120" />
  <img src="./docs/Select_Element_Before.png" alt="Webpage before element-selection mode is activated" height="120" />
  <img src="./docs/Select_Element_After.png" alt="Webpage after element-selection mode has highlighted an element" height="120" />
</p>

- **In-Field Translation:** When typing inside a form or text field, press the `Ctrl + /` shortcut or click the inline translator icon to instantly translate the content before sending.

<p align="center">
  <img src="./docs/Icon.png" alt="Small translation icon next to text input field" height="240" />
</p>

- **Advanced Popup Translation:** Clicking the extension icon opens a popup with extended features such as multi-accent pronunciation and dictionary support.

<p align="center">
  <img src="./docs/Popup.png" alt="Extension popup interface with translation and dictionary features" height="280" />
</p>

This extension is developed solely for personal use and keeps smart and fast translation always within reach.

**Smart and fast translation, anytime, anywhere.**

<br>

## ✨ Key Features

💸 **Free & Open Source:**  
Always free, powered by open-source code.

🔊 **Word and Sentence Pronunciation:**  
Each translation comes with audio playback for accurate pronunciation. You can also choose from different accents. Click the extension icon to access advanced pronunciation options.

📙 **Dictionary Mode:**  
When selecting a word, you’ll not only get a translation but also helpful information like definitions, synonyms, word type, and usage examples.

✅ **Supports Multiple Translation Providers:**  
You can choose from several AI-powered translation providers:

- [Gemini][gemini-url] (✔ Free)
- [OpenAI][openai-url]
- [OpenRouter][openrouter-url] (✔ Free)
- [WebAI to API][webai-to-api-url] (✔ Free)

<br>

## 📋 Requirements

- A modern Chromium-based browser or Firefox (Chrome, Edge, Brave, etc.)
- A valid API key (unless using [WebAI to API][webai-to-api-url])

<br>

---

## 🔧 Download & Install

<p align="center">
  <a target="_blank" href="https://chromewebstore.google.com/detail/AI%20Writing%20Companion%20for%20Chrome/jfkpmcnebiamnbbkpmmldomjijiahmbd/">
    <img src="./docs/Store/Chrome-Store.png" alt="Chrome" height="60" />
  </a>
  <a target="_blank" href="https://addons.mozilla.org/en-GB/firefox/addon/ai-writing-companion/">
    <img src="./docs/Store/Firefox-Store.png" alt="Firefox" height="60" />
  </a>

</p>

<details id="manual-install">
<summary>
Manual Installation
</summary>

<details id="install-for-chrome">
<summary>
  <h3>Install for Chrome</h3>
</summary>

- [Download the latest Chrome version here][chrome-zip-url].
- Extract the downloaded ZIP file.
- Open [`chrome://extensions/`][chrome-extensions-url] and enable **Developer mode**.
- Drag the extracted folder into the page to install the extension.
- Done!

_Note:_ After installation, click the **extension icon**, go to **Settings**, and enter your **API Key**.

</details>

<br>

<details id="install-for-firefox">
<summary>
  <h3>Install for Firefox</h3>
</summary>

- [Download the latest Firefox version here][firefox-zip-url].
- Extract the downloaded ZIP file.
- Open [`about:debugging#/runtime/this-firefox/`][firefox-extensions-url].
- Click `Load Temporary Add-on...` and select the `manifest.json` file from the extracted folder.
- Done!

_Note:_ After installation, click the **extension icon**, go to **Settings**, and enter your **API Key**.

</details>

<br>

<details id="install-for-edge">
<summary>
  <h3>Install for Microsoft Edge</h3>
</summary>

- [Download the latest Edge version here][edge-zip-url].
- Extract the downloaded ZIP file.
- Open [`edge://extensions/`][edge-extensions-url] and enable **Developer mode**.
- Drag the extracted folder into the page to install the extension.
- Done!

_Note:_ After installation, click the **extension icon**, go to **Settings**, and enter your **API Key**.

</details>

</details>

<br>

---

## 🔑 API Keys

To use the extension, you’ll need an API key from one of the providers below:

| Provider      | How to Get API Key                            | Cost                     |
| ------------- | --------------------------------------------- | ------------------------ |
| Google Gemini | [Google AI Studio][gemini-api-key-url]        | Free                     |
| OpenAI        | [OpenAI API Keys][openai-api-key-url]         | Paid                     |
| OpenRouter    | [OpenRouter API Keys][openrouter-api-key-url] | Free                     |
| WebAI to API  | _(No key needed)_                             | [Free][webai-to-api-url] |

**Note:** `WebAI to API` is a local Python-based server that allows you to use AI translation without an API key.

**Important:** If you're in Iran, you may need a VPN to access and register for free API keys.

<br>

---

<details>
<summary>
  <h2>⚙️ Advanced Settings</h2>
</summary>

In the API Settings page of the extension, each provider has customizable options to let you choose and configure different models:

- **Google Gemini**

  You can change the `API URL` to use different Gemini models. For available models and usage info, see [Gemini official documentation][gemini-url-docs]. Choosing the right model may improve translation quality, speed, or reduce API cost.

- **OpenAI**

  You can select models like `gpt-4`, `gpt-3.5-turbo`, and more by entering their names in the settings. Visit [OpenAI docs][openai-url-docs] for the full list. This allows you to customize translation quality vs. cost.

- **OpenRouter**

  Similar to OpenAI, OpenRouter supports a variety of models. You can pick one from the list at [OpenRouter documentation][openrouter-url-docs] and use it by name.

- **WebAI to API**

  This is a free local backend for translation. You can configure your own model in the settings. For setup, see [WebAI to API GitHub repo][webai-to-api-url-docs].

> These options let you balance between cost, quality, and speed.  
> The extension uses default models with minimum setup required — but upgrading the model will improve translation results.

**Default models used:**

- For `OpenAI` and `OpenRouter`: `gpt-3.5-turbo`
- For `Google Gemini` and `WebAI to API`: `gemini-2.0-flash`

</details>

---

## ☕ Buy Me a Coffee

If this project helped you and you’d like to support it, you can buy me a coffee ☕

<br>

| Donation Method     | 🔗 Link                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BuyMeACoffee**    | <a href="https://www.buymeacoffee.com/m_khani" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/arial-yellow.png" alt="Buy Me A Coffee" style="height: 30px !important;width: 117px !important;" ></a> |
| **USDT (Ethereum)** | `0x76DAF7D7C3f7af9B90e16B5C25d063ff3A1A0f8f`                                                                                                                                                                            |
| **Bitcoin (BTC)**   | `bc1qgxj96s6nks6nyhzlncw65nnuf7pyngyyxmfrsw`                                                                                                                                                                            |
| **PayPal**          | [![کمک مالی PayPal](https://img.shields.io/badge/Donate-Paypal-00457C?logo=paypal&labelColor=gold)](https://www.paypal.com/donate/?hosted_button_id=DUZBXEKUJGKLE)                                                      |

<br>
Thank you for your support!

<br>

---

### 👥 Contributors

- iSegar0 [![iSegar0 X](<https://img.shields.io/badge/X%20(Twitter)-iSegar0-blue?style=flat&logo=x>)](https://x.com/iSegar0/)
- Mohammad [![Mohammad X](<https://img.shields.io/badge/X%20(Twitter)-M_Khani65-blue?style=flat&logo=x>)](https://x.com/M_Khani65/)

<br>

---

## 🥤 Development

### Prerequisites

Make sure [**Node.js**][node-js-url] is installed (it includes `npm`). Then run:

_Note: I am using [`pnpm`][pnpm-url] in this project instead `npm`._

```bash
cd Translate-It
npm install
```

### Build

To generate the extension files, run:

```bash
npm run build

npm run build:chrome
npm run build:firefox
npm run build:edge

```

This will create `zip` files in the `Build-Extension/` directory for each browser, intended for manual installation.

To actively develop and apply changes in real time, use one of follwing commands:

```bash
npm run watch

npm run watch:chrome
npm run watch:firefox
```

### Lint Check

To ensure code quality and catch potential issues early, you can run ESLint:

```bash
npm run lint
```

This command will scan all src/\*_/_.js files and report any syntax errors, unsafe patterns or unused variables.

<br>

---

## 🤝 Contributing

- ⭐ **Star the repo** to support the project.
- 🐞 **Report issues** via [GitHub Issues][github-issues-url].
- 📝 **Submit a Pull Request (PR)** to help improve the extension.

---

### 🖼️ Icons Credit

Icons used in this project are provided by [Flaticon](https://www.flaticon.com) and created by:

- <img src="icons/page.png" width="24px"> — [Pixel perfect](https://www.flaticon.com/authors/pixel-perfect) (Main icon)
- <img src="icons/select.png" width="24px"> — [Pixel perfect](https://www.flaticon.com/authors/pixel-perfect) (Select)
- <img src="icons/paste.png" width="24px"> — [Pixel perfect](https://www.flaticon.com/authors/pixel-perfect) (Paste)
- <img src="icons/speaker.png" width="24px"> — [Tanah Basah](https://www.flaticon.com/free-icons/voice-command) (Voice Command)
- <img src="icons/translate.png" width="24px"> — [photo3idea_studio](https://www.flaticon.com/free-icons/translate) (Translate)
- <img src="icons/clear.png" width="24px"> — [Midev](https://www.flaticon.com/free-icons/clear) (Clear)
- <img src="icons/close.png" width="24px"> — [Miftakhul Rizky](https://www.flaticon.com/free-icons/close) (Close)
- <img src="icons/swap.png" width="24px"> — [Freepik](https://www.flaticon.com/authors/freepik) (Swap)
- <img src="icons/settings.png" width="24px"> — [Freepik](https://www.flaticon.com/authors/freepik) (Settings)
- <img src="icons/copy.png" width="24px"> — [Catalin Fertu](https://www.flaticon.com/free-icons/copy) (Copy)
- <img src="icons/revert.png" width="24px"> — [KP Arts](https://www.flaticon.com/free-icons/revert) (Revert)

<br>

---

## 📜 License

This project is licensed under the **MIT License** — feel free to modify and share!

[gemini-url]: https://gemini.com/
[openai-url]: https://chat.openai.com/
[openrouter-url]: https://openrouter.ai/
[webai-to-api-url]: https://github.com/Amm1rr/WebAI-to-API/
[firefox-store]: https://addons.mozilla.org/en-GB/firefox/addon/ai-writing-companion/
[chrome-store]: https://chromewebstore.google.com/detail/AI%20Writing%20Companion%20for%20Chrome/jfkpmcnebiamnbbkpmmldomjijiahmbd/
[edge-store]: https://microsoftedge.microsoft.com/addons/detail/ai-writing-companion
[firefox-zip-url]: https://github.com/iSegaro/AIWritingCompanion/raw/refs/heads/main/Build-Extension/Translate-It-for-Firefox-v0.1.0.zip
[chrome-zip-url]: https://github.com/iSegaro/AIWritingCompanion/raw/refs/heads/main/Build-Extension/Translate-It-for-Chrome-v0.1.0.zip
[edge-zip-url]: https://github.com/iSegaro/AIWritingCompanion/raw/refs/heads/main/Build-Extension/Translate-It-for-Edge-v0.1.0.zip
[chrome-extensions-url]: chrome://extensions/
[edge-extensions-url]: edge://extensions/
[firefox-extensions-url]: about:debugging#/runtime/this-firefox/
[gemini-api-key-url]: https://aistudio.google.com/apikey/
[openai-api-key-url]: https://platform.openai.com/api-keys/
[openrouter-api-key-url]: https://openrouter.ai/settings/keys/
[mohammad-x-url]: https://x.com/m_khani65/
[github-issues-url]: https://github.com/iSegaro/AIWritingCompanion/issues/
[isegaro-x-url]: https://x.com/iSegar0/
[m-khani65-x-url]: https://x.com/M_Khani65/
[flaticon-url]: https://www.flaticon.com/free-icons/translate/
[gemini-url-docs]: https://ai.google.dev/api/all-methods/
[openai-url-docs]: https://platform.openai.com/docs/models/
[openrouter-url-docs]: https://openrouter.ai/models/
[webai-to-api-url-docs]: https://github.com/Amm1rr/WebAI-to-API/
[pnpm-url]: https://pnpm.io/
[node-js-url]: https://nodejs.org/
