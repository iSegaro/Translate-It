// src/sidepanel/apiProviderManager.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { getSettingsAsync } from "../config.js";
import { ProviderRegistry } from "../providers/index.js";
import { ProviderHtmlGenerator } from "../utils/providerHtmlGenerator.js";

export class ApiProviderManager {
  constructor(options) {
    this.button = options.button;
    this.icon = options.icon;
    this.dropdown = options.dropdown;
    this.currentProvider = null;

    this.init();
  }

  async init() {
    // Load available providers
    this.availableProviders = ProviderHtmlGenerator.generateProviderArray();
    logME(
      `[ApiProviderManager] Loaded ${this.availableProviders.length} available providers`
    );

    // Populate dropdown with available providers
    this.populateDropdown();

    // Load current provider
    const settings = await getSettingsAsync();
    this.currentProvider = settings.TRANSLATION_API || "google";

    // Check if current provider is available, fallback if needed
    const fallbackProvider = ProviderRegistry.getFallbackProvider(
      this.currentProvider
    );
    if (fallbackProvider !== this.currentProvider) {
      logME(
        `[ApiProviderManager] Provider ${this.currentProvider} not available, using fallback: ${fallbackProvider}`
      );
      this.currentProvider = fallbackProvider;
      // Update settings with fallback
      await Browser.storage.local.set({ TRANSLATION_API: fallbackProvider });
    }

    this.updateIcon(this.currentProvider);

    // Setup event listeners
    this.button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Event handlers for dropdown items are added in populateDropdown()

    // Close dropdown when clicking outside
    document.addEventListener("click", () => {
      this.closeDropdown();
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

  populateDropdown() {
    if (!this.dropdown) return;

    // Clear existing content
    this.dropdown.textContent = "";

    // Create dropdown items for each provider
    this.availableProviders.forEach((provider) => {
      const dropdownItem = document.createElement("div");
      dropdownItem.className = "dropdown-item";
      dropdownItem.dataset.provider = provider.id;

      // Create icon
      const img = document.createElement("img");
      const iconPath = `icons/api-providers/${provider.icon}`;
      img.src = Browser.runtime.getURL(iconPath);
      img.alt = provider.name;
      img.width = 16;
      img.height = 16;

      // Create text span
      const span = document.createElement("span");
      span.textContent = provider.name;

      // Append elements
      dropdownItem.appendChild(img);
      dropdownItem.appendChild(span);

      // Add click handler
      dropdownItem.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.selectProvider(provider.id);
      });

      this.dropdown.appendChild(dropdownItem);
    });

    logME(
      `[ApiProviderManager] Populated dropdown with ${this.availableProviders.length} providers`
    );
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
    this.dropdown.style.top = `${rect.top}px`;
    this.dropdown.style.display = "block";
    this.updateDropdownState();
  }

  closeDropdown() {
    this.dropdown.style.display = "none";
  }

  updateDropdownState() {
    this.dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
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
    const provider = this.availableProviders?.find((p) => p.id === providerId);
    if (provider) {
      // Handle different icon paths for different providers
      const iconPath = `icons/api-providers/${provider.icon}`;

      this.icon.src = Browser.runtime.getURL(iconPath);
      this.icon.alt = provider.name;
      this.button.title = provider.name;
    } else {
      // Fallback for unknown providers
      this.icon.src = Browser.runtime.getURL(
        "icons/api-providers/provider.svg"
      );
      this.icon.alt = "Translation Provider";
      this.button.title = "Translation Provider";
    }
  }
}
