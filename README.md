# Gemini Translate

A lightweight browser extension that translates text in text fields (e.g., textboxes, inputs, textareas, and contenteditable elements) using either a mock translation for testing or real API calls in production. The extension replaces the original text with the translated version upon clicking the translation icon or using the keyboard shortcut (Ctrl+/).

🚧 **This project is still in development and has not been officially released. Once published, you will be able to install it easily from your browser's extension store.**

---

## Features

- **Universal Compatibility:**  
  Works seamlessly on websites that use standard text fields and also performs well on platforms with advanced text fields, such as WhatsApp, Instagram, Telegram, Twitter, etc.

- **Multiple Trigger Methods:**  
  Translate text by either clicking a dedicated translation icon or using the keyboard shortcut (Ctrl+/).

- **Mock & API Translation:**  
  Easily switch between mock translation (for development) and real API-based translation.

- **Dynamic Updates:**  
  Observes changes in the DOM to ensure that translated text remains current.

- **Customizable Configuration:**  
  Configure prompts, API keys, icon text, highlight styles, and more via a simple configuration object.

---

## Requirements

- A modern browser that supports extensions (Chrome, Firefox, Edge, etc.)
- Basic knowledge of JavaScript and browser extension development
- (Optional) A valid API key for translation if not using mock mode

---

## Installation

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/iSegaro/Gemini-Translate.git
   cd Gemini-Translate
   ```

2. **Configure the Extension:**

   Open the `config.js` file and customize the `CONFIG` object according to your preferences.  
   **Note:** To set the source and target languages for translation, simply assign the appropriate prompt values to the corresponding keys in the `CONFIG` object. For instance, the example below is configured for English-to-Persian and Persian-to-English translation (using `PROMPT_PERSIAN` and `DEBUG_TRANSLATED_PERSIAN`).

   ```js
   const CONFIG = {
     USE_MOCK: true, // Set to false to use the real API
     API_URL:
       "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-preview-02-05:generateContent",
     API_KEY: "YOUR_API_KEY_HERE",
     TRANSLATION_ICON: "🌐",
     TRANSLATION_ICON_TITLE: "Translate text",
     DEBUG_TRANSLATED_ENGLISH: "Translated to English:",
     DEBUG_TRANSLATED_PERSIAN: "Translated to Persian:",
     PROMPT_ENGLISH: "Translate to English: ",
     PROMPT_PERSIAN: "Translate to Persian: ",
     HIGHLIGHT_STYLE: "2px dashed red",
     HIGHTLIH_NEW_ELEMETN_RED: "2px solid red",
   };
   ```

3. **Load the Extension in Your Browser:**

   - **Chrome:**

     - Navigate to `chrome://extensions/`
     - Enable **Developer mode**
     - Click **Load unpacked** and select the project directory

   - **Firefox:**
     - Open the Add-ons Manager (`about:debugging`)
     - Click **This Firefox** > **Load Temporary Add-on** and select the `manifest.json` file from your project directory

---

## 🔑 Obtaining a Google API Key

You can obtain a free Gemini API key through Google AI Studio, which is free to use. This API key allows you to test the Gemini models without writing code.

**Steps to get a Gemini API key:**

- **Visit Google AI Studio:**  
  Go to [Google AI Studio](https://aistudio.google.com/apikey).

- **Sign In:**  
  Log in with your Google account.

- **Generate API Key:**
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

## Contributing

Contributions are welcome! If you have improvements or fixes, please fork the repository and open a pull request. For significant changes, consider opening an issue first to discuss your ideas.

---

## License

This project is licensed under the MIT License.
