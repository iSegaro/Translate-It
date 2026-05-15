# Translate It!
> The Ultimate Translation Ecosystem for Modern Web Browsers.

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
    • English | 
    • <a href="./docs/README_FARSI.md">فارسی</a> | 
    • <a href="./docs/README_JAPANESE.md">日本語</a>
  </strong>
</div>

<br>

<p align="center">
  <img src="./docs/Images/Options.jpg" alt="Translate It Extension" height="400" />
</p>

**Translate It** is not just a translator; it's a high-performance, modular ecosystem designed to bridge the language gap across any device. Engineered with a "zero-pressure" philosophy, it is optimized to run seamlessly in modern browsers without taxing system resources or bloating RAM, even when dozens of tabs are active. Built with **Vue.js 3** and powered by **10+ Providers**, it offers a surgical approach to web translation with a focus on privacy, speed, and cost-efficiency.

<br>

<p align="center">
  <a href="https://www.youtube.com/watch?v=oMw-CbcKPOY">
    <b>Watch Demo on YouTube</b>
  </a>
  <br>
  <a href="https://www.youtube.com/watch?v=oMw-CbcKPOY">
    <img src="./docs/Images/Windows.png" alt="Watch the video" width="560" />
  </a>
</p>

---

## Why Translate It?

- **Privacy First:** OCR and core processes happen locally. Your data stays in your browser.
- **AI-Powered:** Support for Gemini, OpenAI, DeepSeek and more.
- **Cost-Efficient:** Save up to **70% on AI tokens** with the unique Economy Mode.
- **Zero-Pressure Engineering:** Optimized for low-footprint operation. Keep dozens of tabs open without worrying about RAM bloat or system slowdowns.
- **Platform Agnostic:** Seamless experience from **Desktop Chrome** to **Android Firefox**.

---

## Key Features

### 1. Advanced Translation Engines
- **Progressive Streaming Engine:** Don't wait for large translations! The system splits long texts into optimized segments and renders them in real-time as they arrive, providing a fluid and responsive experience across all providers.
- **10+ Providers:** Switch between advanced AI models (LLMs) and traditional providers (Google, Microsoft, DeepL) instantly.

<br>

### 2. Surgical Element Translation (Point-and-Click)
- **Visual Highlight:** Activate the mode and hover over any paragraph, button, or menu to see a real-time orange highlight. Click to translate that specific element instantly.
- **Layout Preservation:** Translate text directly inside the website's structure. Your page layout remains 100% intact.
- **Hover Preview:** Need to see the source? Simply hover over any translated element to see the original text in a surgical tooltip.
<!-- ELEMENT_SELECTION_SCREENSHOT_PLACEHOLDER -->

<br>

### 3. Smart Whole-Page Translation (Lazy-Loading)
- **Infinite Scrolling Support:** Automatically detects and translates new content as you scroll down. Perfect for social media and long-form articles.
- **Dual Execution Modes:** 
  - **Fluid Mode:** Translates content in real-time as it enters the viewport.
  - **On-Stop Mode:** Waits for you to finish scrolling before initiating translation, saving API costs and reducing visual noise.
<!-- WHOLE_PAGE_SCREENSHOT_PLACEHOLDER -->

<br>

### 4. Screen Capture & OCR (Anything-to-Text)
- **Visual Translation:** Capture and translate text from images, videos, PDFs, or any non-selectable web area.
- **Offline Engine:** Powered by Tesseract.js with local model caching for "True Offline" privacy.
<!-- OCR_SCREENSHOT_PLACEHOLDER -->

<br>

### 5. Smart Optimization Slider (Economy vs. Turbo)
Take full control over your API costs and UI speed with **Optimization Levels (1-5)**:
- **Economy Mode (Level 1):** Packs 70% more text per request. Perfect for saving AI tokens and preventing IP bans on traditional providers.
- **Turbo Mode (Level 5):** Maximizes concurrency for the fastest possible UI response.
<!-- OPTIMIZATION_SLIDER_PLACEHOLDER -->

<br>

### 6. Cross-Platform Ergonomics
- **Mobile Bottom Sheet:** A native-like, thumb-friendly interface for mobile browsers (Firefox Android, Kiwi, Lemur) with gesture support.
- **Desktop/Mobile FAB Menu:** A draggable, persistent floating action button for instant access to OCR, Page Translation, Element Mode, and rapid feature toggles (like instant TTS or direct-translation mode).

<br>

### 7. Mouse on Hover (Instant Glance)
- **Glance-to-Translate:** Move your mouse over any text while holding a modifier key (like Ctrl) to see an instant translation in a non-intrusive tooltip.
- **Smart Scoping:** Choose your focus: translate a single **Word**, a full **Sentence**, or the entire **Container** block automatically.

---

## Features at a Glance

| Feature | Description |
| :--- | :--- |
| **Text Selection** | Instant translation icon/box right where you select text. |
| **Element Mode** | Click any UI element to translate it inline while keeping the layout. |
| **Whole Page** | Auto-translate entire pages with lazy-loading and smart memory management. |
| **Mouse Hover** | Instant translation tooltip triggered by moving mouse over text (supports Word/Sentence/Container scopes). |
| **Desktop/Mobile FAB** | Multipurpose draggable hub for instant OCR, Page Translation, Element Mode, and rapid feature toggles. |
| **In-Field (Ctrl+/)** | Translate your input inside text fields before sending. |
| **Smart Dictionary** | Definitions, synonyms, and usage examples with multi-accent TTS. |
| **History & Export** | Keep track of your translations and export them for later use. |
| **Resource Tracker** | Advanced memory management to keep your browser fast. |

---

## Getting Started

### 1. Installation
Install via the official stores for the best experience:

<p align="center">
  <a target="_blank" href="https://chromewebstore.google.com/detail/AI%20Writing%20Companion%20for%20Chrome/jfkpmcnebiamnbbkpmmldomjijiahmbd/">
    <img src="./docs/Store/Chrome-Store.png" alt="Chrome" height="50" />
  </a>
  <a target="_blank" href="https://addons.mozilla.org/en-GB/firefox/addon/ai-writing-companion/">
    <img src="./docs/Store/Firefox-Store.png" alt="Firefox" height="50" />
  </a>
</p>

*For manual installation, see the [Installation Guide](./docs/guides/INSTALLATION.md).*

### 2. Configuration
Most AI providers require an API key. 
- Follow the [**API Configuration Guide**](./docs/guides/API_GUIDE.md) to set up Gemini, OpenAI, etc.
- *Free providers like Google and Yandex work out of the box.*

### 3. Mastering Shortcuts
Maximize your productivity with the [**User Guide**](./docs/guides/USAGE.md).

---

## Developer & Contributing

We follow a **Feature-Based Architecture** using Vue 3, Pinia, and Vite.
- **Architecture:** Explore [ARCHITECTURE.md](./docs/technical/ARCHITECTURE.md) to understand the modular system.
- **Contributing:** Read [CONTRIBUTING.md](./docs/guides/CONTRIBUTING.md) for local setup instructions.
- **Localization:** Help us reach more people by following the [Localization Guide](./docs/guides/LOCALIZATION_GUIDE.md).

---

## Contributors
- [**Mohammad**](https://x.com/M_Khani65/)
- [**iSegar0**](https://x.com/iSegar0/)

---

## License
Licensed under the **MIT License**.

---

<p align="center">
  <a href="https://www.star-history.com/#iSegaro/Translate-It&Date">
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=iSegaro/Translate-It&type=Date" />
  </a>
</p>
