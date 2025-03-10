# Gemini Translate

A lightweight browser extension that translates text in input fields (e.g., textboxes, textareas, and contenteditable elements) using either a mock translation for testing or real API calls in production. The extension replaces the original text with the translated version upon clicking the translation icon or using the keyboard shortcut (Ctrl+/).

🚧 **This project is still in development and has not been officially released. Once published, you will be able to install it easily from your browser's extension store.**

---

## Features

- **Universal Compatibility:**  
  Works seamlessly on websites that use standard text fields and also performs well on platforms with advanced text fields, such as WhatsApp, Instagram, Telegram, and Twitter.

- **Multiple Trigger Methods:**  
  Translate text by either clicking the translation icon or using the keyboard shortcut (Ctrl+/).

---

## Requirements

- A modern Chromium-based browser (Chrome, Edge, Brave, etc.)
- A valid API key for translation if not using mock mode

---

## Installation

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/iSegaro/Gemini-Translate.git
   cd Gemini-Translate
   ```

2. **Load the Extension in Your Browser:**

   - **Chrome:**

     - Navigate to `chrome://extensions/`
     - Enable **Developer mode**
     - Click **Load unpacked** and select the `dist/` directory inside the project folder

   - **Firefox:** _(Coming soon)_

3. **Set the API Key on the Options Page**

---

## 🔑 Obtaining a Google API Key

You can obtain a free Gemini API key through Google AI Studio, which allows you to test Gemini models without writing code.

**Steps to get a Gemini API key:**

1. **Visit Google AI Studio:**  
   Go to [Google AI Studio](https://aistudio.google.com/apikey).

2. **Sign In:**  
   Log in with your Google account.

3. **Generate API Key:**
   - Click **Get API Key** in the top left corner.
   - Click **Create API Key**.
   - Choose whether to generate the key in an existing project or a new project.
   - Copy the generated API key.

**Free Tier Details:**  
The free tier of the Gemini API includes 1,500 requests per day with Gemini 1.5 Flash.

**Additional Resource:**  
Watch this [video guide](https://www.youtube.com/watch?v=o-eyHCP5XwY&t=0) for a step-by-step walkthrough on obtaining your API key.

---

## Usage

- **Automatic Translation:**  
  When you hover over or click on a text field, a translation icon will appear. Clicking this icon triggers the translation process, replacing the original text with the translated version.

- **Keyboard Shortcut:**  
  Press `Ctrl+/` when a text field is active or highlighted. The extension will translate the text and update the field accordingly.

---

## 🌱 Support

If you find Gemini Translate useful, you can support its development in the following ways:

### ☕ Buy Me a Coffee

These donation links do not belong to [**iSegaro**](https://x.com/iSegar0/). The project is supported by them, but donations go to [![Mohammad X](<https://img.shields.io/badge/X%20(Twitter)-M_Khani65-000000?style=flat&logo=x>)](https://x.com/M_Khani65/).

- **Crypto Wallets**  
  🔹 **Ethereum (ETH):** `0x38cEacDEe25E5892F38b133A79E4B2Fd5EF30502`  
  🔸 **Bitcoin (BTC):** `bc1qh4p5nqa97adcnx0vpv2mfzm5q226688vsqwzmj`

- **PayPal**  
  [![Donate PayPal](https://img.shields.io/badge/Donate-Paypal-00457C?logo=paypal&labelColor=gold)](https://www.paypal.com/donate/?hosted_button_id=DUZBXEKUJGKLE)

---

## Development

This project is built using **webpack** and **npm**, making it easy to develop in a local environment.

### Prerequisites

Ensure **Node.js** (which includes npm) is installed on your system. Then, navigate to the project root directory:

```bash
cd Gemini-Translate
```

### Project Structure

```
Gemini-Translate/
|
|-- dist/
|-- html/
|-- icons/
|-- manifest.json
|-- package.json
|-- package-lock.json
|-- README.md
|-- src/
|-- styles/
|-- webpack.config.js
```

### Installation

Run the following command to install project dependencies:

```bash
npm install
```

### Building the Extension

To generate the first build of the extension, run:

```bash
npm run build
```

This will create the `dist/` folder, which contains the necessary files for manually loading the extension into Chrome.

```
dist/
|-- background.bundle.js
|-- content.bundle.js
|-- html/
|-- icons/
|-- manifest.json
|-- options.bundle.js
|-- popup.bundle.js
|-- styles/
```

For development mode, use:

```bash
npm run watch
```

This allows real-time updates whenever changes are made.

---

## Contribute

- ⭐ **Star the repository** on GitHub
- 🐛 **Report issues** on the [issue page](https://github.com/iSegaro/Gemini-Translate/issues)
- 💻 **Contribute code** – clone the repo and submit a pull request

Thank you for your support!

---

## License

This project is licensed under the MIT License.  
Feel free to improve and share!
