// src/popup/apiProviderManager.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";

const API_PROVIDERS = [
  { id: "google", name: "Google Translate", icon: "google.svg" },
  { id: "gemini", name: "Gemini", icon: "gemini.svg" },
  { id: "webai", name: "WebAI", icon: "webai.svg" },
  { id: "openai", name: "OpenAI", icon: "openai.svg" },
  { id: "openrouter", name: "OpenRouter", icon: "openrouter.svg" },
  { id: "deepseek", name: "DeepSeek", icon: "deepseek.svg" },
  { id: "custom", name: "Custom", icon: "custom.svg" },
];

export class ApiProviderManager {
  constructor(options) {
    this.button = options.button; // provider dropdown area
    this.icon = options.icon;
    this.dropdown = options.dropdown;
    this.translateButton = options.translateButton; // main translate button
    this.dropdownArrow = options.dropdownArrow; // dropdown arrow icon
    this.currentProvider = null;
    
    this.init();
  }

  async init() {
    // Load current provider
    const settings = await Browser.storage.local.get("TRANSLATION_API");
    this.currentProvider = settings.TRANSLATION_API || "google";
    this.updateIcon(this.currentProvider);
    
    // Set dropdown arrow icon with correct URL
    if (this.dropdownArrow) {
      this.dropdownArrow.src = Browser.runtime.getURL("icons/dropdown-arrow.svg");
    }
    
    // Setup event listeners
    this.button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleDropdown();
    });
    
    // Prevent form submission when clicking provider area
    this.translateButton.addEventListener("click", (e) => {
      if (e.target.closest(".provider-dropdown-area")) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    
    // Handle dropdown item clicks
    this.dropdown.querySelectorAll(".dropdown-item").forEach(item => {
      item.addEventListener("click", async (e) => {
        e.stopPropagation();
        const provider = item.dataset.provider;
        await this.selectProvider(provider);
      });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".provider-dropdown-area") && !e.target.closest(".dropdown-menu")) {
        this.closeDropdown();
      }
    });
    
    // Listen for provider changes from other parts of the extension
    Browser.storage.onChanged.addListener((changes) => {
      if (changes.TRANSLATION_API) {
        this.currentProvider = changes.TRANSLATION_API.newValue;
        this.updateIcon(this.currentProvider);
        this.updateDropdownState();
      }
    });
  }

  toggleDropdown() {
    const isVisible = this.dropdown.style.display === "block";
    if (isVisible) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    // Position dropdown relative to button
    const rect = this.button.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 5}px`;
    this.dropdown.style.left = `${rect.left}px`;
    this.dropdown.style.display = "block";
    this.button.classList.add("active");
    this.updateDropdownState();
  }

  closeDropdown() {
    this.dropdown.style.display = "none";
    this.button.classList.remove("active");
  }

  updateDropdownState() {
    this.dropdown.querySelectorAll(".dropdown-item").forEach(item => {
      const isActive = item.dataset.provider === this.currentProvider;
      item.classList.toggle("active", isActive);
    });
  }

  async selectProvider(providerId) {
    try {
      await Browser.storage.local.set({ TRANSLATION_API: providerId });
      this.currentProvider = providerId;
      this.updateIcon(providerId);
      this.closeDropdown();
      logME(`[ApiProviderManager] Provider changed to: ${providerId}`);
    } catch (error) {
      logME("[ApiProviderManager] Error changing provider:", error);
    }
  }

  updateIcon(providerId) {
    const provider = API_PROVIDERS.find(p => p.id === providerId);
    if (provider) {
      this.icon.src = Browser.runtime.getURL(`icons/api-providers/${provider.icon}`);
      this.icon.alt = provider.name;
      
      // Update translate button title to show current provider
      if (this.translateButton) {
        this.translateButton.title = `ترجمه با ${provider.name}`;
      }
    }
  }
}