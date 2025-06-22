// src/options.js

import Browser from "webextension-polyfill";
import { getSettingsAsync, CONFIG } from "./config.js";
import { ErrorHandler } from "./services/ErrorService.js";
import { ErrorTypes } from "./services/ErrorTypes.js";
import { logME } from "./utils/helpers.js";
import { app_localize, getTranslationString } from "./utils/i18n.js";
import { fadeOutInElement } from "./utils/i18n.helper.js";
import { shouldInject } from "./utils/injector.js";
import { applyTheme } from "./utils/theme.js";
import "./utils/localization.js";

document.addEventListener("DOMContentLoaded", async () => {
  const tabButtons = document.querySelectorAll(".tab-button");
  // const tabContents = document.querySelectorAll(".tab-content"); // اگر در ادامه استفاده نمی‌شود، می‌توان حذف کرد

  const errorHandler = new ErrorHandler(); // ایجاد یک نمونه از ErrorHandler

  // const themeSelect = document.getElementById("theme-select"); // کامنت شده در کد شما
  // const themeIcon = document.getElementById("themeIcon"); // اگر مستقیماً استفاده نمی‌شود
  const themeSwitch = document.getElementById("theme-Switch");
  const themeAuto = document.getElementById("theme-Auto");

  // تابع کمکی برای تنظیم وضعیت کنترل‌های تم بر اساس مقدار ذخیره شده
  const setThemeControlsState = (currentThemeValue) => {
    if (!themeAuto || !themeSwitch) {
      logME("Theme control elements not found in setThemeControlsState");
      return;
    }

    applyTheme(currentThemeValue); // اعمال بصری تم به صفحه

    if (currentThemeValue === "auto") {
      themeAuto.checked = true;
      themeSwitch.disabled = true;
      // اختیاری: وضعیت سوئیچ را با تم فعلی سیستم هماهنگ کنید (وقتی غیرفعال است)
      // این به کاربر نشان می‌دهد که اگر Auto را غیرفعال کند، به چه حالتی برمی‌گردد
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        themeSwitch.checked = true; // اگر سیستم تیره است، سوئیچ را تیک بزن
      } else {
        themeSwitch.checked = false; // اگر سیستم روشن است، تیک سوئیچ را بردار
      }
    } else {
      themeAuto.checked = false;
      themeSwitch.disabled = false;
      themeSwitch.checked = currentThemeValue === "dark";
    }
    logME(
      `Theme controls updated: THEME = ${currentThemeValue}, Auto checked: ${themeAuto.checked}, Switch disabled: ${themeSwitch.disabled}, Switch checked: ${themeSwitch.checked}`
    );
  };

  // بارگذاری اولیه و تنظیم وضعیت کنترل‌های تم
  if (themeSwitch && themeAuto) {
    Browser.storage.local
      .get("THEME")
      .then((result) => {
        const savedTheme = result.THEME || CONFIG.THEME || "auto"; // پیش‌فرض به auto
        logME("Initial theme loaded from storage:", savedTheme);
        setThemeControlsState(savedTheme);
      })
      .catch((err) => {
        logME("Error loading theme from storage on init:", err);
        setThemeControlsState(CONFIG.THEME || "auto"); // Fallback on error
      });

    // رویداد برای سوئیچ دستی تم (Light/Dark)
    themeSwitch.addEventListener("change", async () => {
      if (themeSwitch.disabled) return; // اگر سوئیچ غیرفعال است (Auto فعال است)، کاری نکن

      const newThemeValue = themeSwitch.checked ? "dark" : "light";
      logME("ThemeSwitch changed. New manual theme:", newThemeValue);
      await Browser.storage.local.set({ THEME: newThemeValue });
      applyTheme(newThemeValue); // فقط تم را اعمال کن، وضعیت کنترلرها نباید تغییر کند
      // themeAuto.checked باید false باشد، که با کلیک روی سوئیچ دستی، توسط کنترلر themeAuto مدیریت می‌شود اگر پیاده‌سازی شود
      // یا مستقیماً اینجا:
      if (themeAuto.checked) {
        // اگر به نحوی Auto هنوز تیک داشت
        themeAuto.checked = false;
      }
    });

    // رویداد برای چک‌باکس تم خودکار (System Theme)
    themeAuto.addEventListener("change", async () => {
      let newThemeToApply;
      if (themeAuto.checked) {
        // وقتی "Auto" انتخاب می‌شود
        newThemeToApply = "auto";
      } else {
        // وقتی "Auto" از انتخاب خارج می‌شود
        // به وضعیت فعلی سوئیچ دستی برگرد و آن را فعال کن
        newThemeToApply = themeSwitch.checked ? "dark" : "light";
      }
      logME("ThemeAuto changed. New theme to apply:", newThemeToApply);
      await Browser.storage.local.set({ THEME: newThemeToApply });
      setThemeControlsState(newThemeToApply); // وضعیت همه کنترل‌های تم را بر اساس انتخاب جدید به‌روز کن
    });
  }

  // --- Start of added elements for the new feature ---
  // Elements for Selection Translation Mode
  const selectionModeImmediateRadio = document.getElementById(
    "selection-mode-immediate"
  );
  const selectionModeOnClickRadio = document.getElementById(
    "selection-mode-onclick"
  );
  const selectionModeGroup = document.getElementById("selectionModeGroup"); // The container div for the radio buttons
  // --- End of added elements ---

  // Elements for Tab Navigation
  // const languagesTabButton = document.querySelector('[data-tab="languages"]'); // کامنت شده در کد شما
  // const apiSettingsTabButton = document.querySelector('[data-tab="apiSettings"]'); // کامنت شده در کد شما
  // const importExportTabButton = document.querySelector('[data-tab="importExport"]'); // کامنت شده در کد شما
  // const languagesTabContent = document.getElementById("languages"); // کامنت شده در کد شما
  // const apiSettingsTabContent = document.getElementById("apiSettings"); // کامنت شده در کد شما
  // const importExportTabContent = document.getElementById("importExport"); // کامنت شده در کد شما

  // Elements for Language Tab - Activation Settings
  const extensionEnabledCheckbox = document.getElementById("extensionEnabled");

  const translateOnTextFieldsCheckbox = document.getElementById(
    "translateOnTextFields"
  );
  const enableShortcutForTextFieldsCheckbox = document.getElementById(
    "enableShortcutForTextFields"
  );
  // const textFieldShortcutGroup = document.getElementById("textFieldShortcutGroup"); // کامنت شده در کد شما

  const translateWithSelectElementCheckbox = document.getElementById(
    "translateWithSelectElement"
  );

  const translateOnTextSelectionCheckbox = document.getElementById(
    "translateOnTextSelection"
  );
  const requireCtrlForTextSelectionCheckbox = document.getElementById(
    "requireCtrlForTextSelection"
  );
  const textSelectionCtrlGroup = document.getElementById(
    "textSelectionCtrlGroup"
  );

  const enableDictionraryCheckbox =
    document.getElementById("enableDictionrary");

  // Elements for API Settings
  const translationApiSelect = document.getElementById("translationApi");
  const webAIApiSettings = document.getElementById("webAIApiSettings");
  // const apiKeySettingGroup = document.getElementById("apiKey")?.closest(".setting-group"); // کامنت شده در کد شما
  const apiUrlSettingGroup = document
    .getElementById("apiUrl")
    ?.closest(".setting-group");
  const useMockCheckbox = document.getElementById("useMock");
  const debugModeCheckbox = document.getElementById("debugMode");
  const webAIApiUrlInput = document.getElementById("webAIApiUrl");
  const webAIApiModelInput = document.getElementById("webAIApiModel");
  const apiKeyInput = document.getElementById("apiKey");
  const apiUrlInput = document.getElementById("apiUrl");
  const saveSettingsButton = document.getElementById("saveSettings");
  const sourceLanguageInput = document.getElementById("sourceLanguage");
  const targetLanguageInput = document.getElementById("targetLanguage");
  const geminiApiSettings = document.getElementById("geminiApiSettings");
  const openAIApiSettings = document.getElementById("openAIApiSettings");
  const openAIApiKeyInput = document.getElementById("openaiApiKey");
  const openAIModelInput = document.getElementById("openaiApiModel");
  const openRouterApiSettings = document.getElementById(
    "openRouterApiSettings"
  );
  const openRouterApiKeyInput = document.getElementById("openrouterApiKey");
  const openRouterApiModelInput = document.getElementById("openrouterApiModel");

  // DeepSeek Elements
  const deepseekApiSettings = document.getElementById("deepseekApiSettings");
  const deepseekApiKeyInput = document.getElementById("deepseekApiKey");
  const deepseekApiModelInput = document.getElementById("deepseekApiModel");

  // Elements for Import/Export
  const exportSettingsButton = document.getElementById("exportSettings");
  const importFile = document.getElementById("importFile");
  // const importSettingsButton = document.getElementById("importSettings"); // کامنت شده در کد شما

  // Elements for Status and Manifest Info
  const statusElement = document.getElementById("status");
  const manifest_Name = document.getElementById("options_app_name");
  const manifest_Version = document.getElementById("options_app_version");

  const promptTemplateInput = document.getElementById("promptTemplate");
  const sourceLangNameSpan = document.getElementById("sourceLangName");
  const targetLangNameSpan = document.getElementById("targetLangName");

  const excludedSites = document.getElementById("excludedSites");

  // وابستگی انتخاب متن
  function handleTextSelectionDependency() {
    if (
      !translateOnTextSelectionCheckbox ||
      !requireCtrlForTextSelectionCheckbox ||
      !textSelectionCtrlGroup ||
      !selectionModeImmediateRadio ||
      !selectionModeOnClickRadio ||
      !selectionModeGroup
    )
      return;

    // وضعیت چک‌باکس والد (ترجمه با انتخاب متن) را بررسی می‌کند
    // اگر چک‌باکس اصلی "Enable Extension" غیرفعال باشد، این متغیر false خواهد بود چون آن چک‌باکس غیرفعال شده است.
    const isTextSelectionEnabled =
      translateOnTextSelectionCheckbox.checked &&
      !translateOnTextSelectionCheckbox.disabled;
    const isImmediateModeEnabled = selectionModeImmediateRadio.checked;

    // 1. فعال/غیرفعال کردن کل گروه رادیو‌باکس‌ها
    selectionModeGroup.style.opacity = isTextSelectionEnabled ? "1" : "0.6";
    selectionModeGroup.style.pointerEvents =
      isTextSelectionEnabled ? "auto" : "none";
    selectionModeImmediateRadio.disabled = !isTextSelectionEnabled;
    selectionModeOnClickRadio.disabled = !isTextSelectionEnabled;

    // 2. فعال/غیرفعال کردن گزینه "Require Ctrl key"
    const isCtrlGroupEnabled = isTextSelectionEnabled && isImmediateModeEnabled;
    requireCtrlForTextSelectionCheckbox.disabled = !isCtrlGroupEnabled;
    textSelectionCtrlGroup.style.opacity = isCtrlGroupEnabled ? "1" : "0.6";
    textSelectionCtrlGroup.style.pointerEvents =
      isCtrlGroupEnabled ? "auto" : "none";
  }

  // Add event listeners for the radio buttons to update the dependency
  if (selectionModeImmediateRadio) {
    selectionModeImmediateRadio.addEventListener(
      "change",
      handleTextSelectionDependency
    );
  }
  if (selectionModeOnClickRadio) {
    selectionModeOnClickRadio.addEventListener(
      "change",
      handleTextSelectionDependency
    );
  }

  // Add event listener for the text selection checkbox
  if (translateOnTextSelectionCheckbox) {
    translateOnTextSelectionCheckbox.addEventListener(
      "change",
      handleTextSelectionDependency
    );
  }

  function showTab(tabId) {
    const activeContent = document.querySelector(".tab-content.active");
    const targetContent = document.getElementById(tabId);
    const container = document.querySelector(".container");

    if (activeContent === targetContent) return;

    tabButtons.forEach((btn) => btn.classList.remove("active"));
    const newActiveButton = document.querySelector(`[data-tab="${tabId}"]`);
    if (newActiveButton) {
      newActiveButton.classList.add("active");
    }

    if (activeContent) {
      fadeOutInElement(
        activeContent,
        () => {
          activeContent.classList.remove("active");
          if (targetContent) {
            // بررسی وجود targetContent
            targetContent.classList.add("active");
            targetContent.style.opacity = "0"; // برای شروع انیمیشن fade in
            targetContent.style.transition = "opacity 300ms ease-in-out"; // اطمینان از وجود transition

            requestAnimationFrame(() => {
              // برای اطمینان از اعمال تغییرات display قبل از انیمیشن
              setTimeout(() => {
                // تاخیر کوچک برای محاسبه صحیح ارتفاع
                if (container && targetContent.classList.contains("active")) {
                  // بررسی مجدد فعال بودن
                  const containerRect = container.getBoundingClientRect();
                  const contentRect = targetContent.getBoundingClientRect();
                  const paddingBottom = 40; // برای دکمه save و status و فاصله پایین
                  // اطمینان از اینکه contentRect.bottom معتبر است
                  const newHeight =
                    contentRect.bottom > containerRect.top ?
                      contentRect.bottom - containerRect.top + paddingBottom
                    : targetContent.scrollHeight + paddingBottom; // fallback اگر rect معتبر نباشد

                  container.style.transition = "height 300ms ease-in-out";
                  container.style.height = `${newHeight}px`;
                  targetContent.style.opacity = "1";
                }
              }, 0); // یا یک تاخیر کوچک مانند 20 یا 50
            });
          }
        },
        200 // مدت زمان fadeOut
      );
    } else if (targetContent) {
      // اگر هیچ تب فعالی از قبل نبود (بار اول)
      targetContent.classList.add("active");
      targetContent.style.opacity = "1"; // نمایش مستقیم بدون fade اولیه

      requestAnimationFrame(() => {
        setTimeout(() => {
          if (container && targetContent.classList.contains("active")) {
            const containerRect = container.getBoundingClientRect();
            const contentRect = targetContent.getBoundingClientRect();
            const paddingBottom = 40;
            const newHeight =
              contentRect.bottom > containerRect.top ?
                contentRect.bottom - containerRect.top + paddingBottom
              : targetContent.scrollHeight + paddingBottom;
            // در بار اول ممکن است transition برای height لازم نباشد یا متفاوت باشد
            container.style.height = `${newHeight}px`;
          }
        }, 0);
      });
    }
  }

  function updateOverallExtensionDependency() {
    if (!extensionEnabledCheckbox) return;
    const isEnabled = extensionEnabledCheckbox.checked;

    // لیست کنترل‌های اصلی که مستقیماً به چک‌باکس اصلی وابسته‌اند
    const dependentControls = [
      translateOnTextFieldsCheckbox,
      enableShortcutForTextFieldsCheckbox,
      translateWithSelectElementCheckbox,
      translateOnTextSelectionCheckbox,
      enableDictionraryCheckbox,
    ];

    dependentControls.forEach((el) => {
      if (el) {
        el.disabled = !isEnabled;
        const group = el.closest(".setting-group");
        if (group) {
          group.classList.toggle("disabled", !isEnabled);
        }
      }
    });

    // مهم: همیشه بعد از تغییر سوئیچ اصلی، وابستگی‌های زیرمجموعه را دوباره ارزیابی کن.
    // این تابع، وضعیت رادیو‌باکس‌ها و چک‌باکس "Require Ctrl" را مدیریت خواهد کرد.
    handleTextSelectionDependency();
  }

  // در لود اولیه و هنگام تغییر این تابع را فراخوانی کن
  if (extensionEnabledCheckbox) {
    extensionEnabledCheckbox.addEventListener(
      "change",
      updateOverallExtensionDependency
    );
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      const tabId = event.target.getAttribute("data-tab");
      if (tabId) showTab(tabId);
    });
  });

  async function updateMockState(isMockEnabled) {
    try {
      if (translationApiSelect) translationApiSelect.disabled = isMockEnabled;
      if (sourceLanguageInput) sourceLanguageInput.disabled = isMockEnabled;
      if (targetLanguageInput) targetLanguageInput.disabled = isMockEnabled;

      const elementsToToggle = [
        webAIApiUrlInput,
        webAIApiModelInput,
        apiKeyInput,
        apiUrlInput,
        openAIApiKeyInput,
        openAIModelInput,
        openRouterApiKeyInput,
        openRouterApiModelInput,
      ];

      elementsToToggle.forEach((element) => {
        if (element) element.disabled = isMockEnabled;
      });

      const apiSections = {
        webai: webAIApiSettings,
        gemini: geminiApiSettings,
        openai: openAIApiSettings,
        openrouter: openRouterApiSettings,
      };

      // نمایش یا عدم نمایش بخش‌ها بر اساس انتخاب API و وضعیت Mock
      if (translationApiSelect) {
        // بررسی وجود translationApiSelect
        Object.entries(apiSections).forEach(([key, section]) => {
          if (section) {
            section.style.display =
              !isMockEnabled && translationApiSelect.value === key ?
                "block"
              : "none";
          }
        });
        // نمایش فیلد API URL فقط در صورتی که Gemini انتخاب شده باشد و mock فعال نباشد
        if (apiUrlSettingGroup) {
          apiUrlSettingGroup.style.display =
            !isMockEnabled && translationApiSelect.value === "gemini" ?
              "block"
            : "none";
        }
      }
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "updateMockState-options",
      });
    }
  }

  function toggleApiSettings() {
    if (!translationApiSelect) return; // اگر select موجود نیست، خارج شو
    const selectedApi = translationApiSelect.value;
    const isMock = useMockCheckbox ? useMockCheckbox.checked : false; // وضعیت mock را هم در نظر بگیر

    if (isMock) {
      // اگر mock فعال است، همه بخش‌های API خاص مخفی شوند
      if (webAIApiSettings) webAIApiSettings.style.display = "none";
      if (geminiApiSettings) geminiApiSettings.style.display = "none";
      if (openAIApiSettings) openAIApiSettings.style.display = "none";
      if (openRouterApiSettings) openRouterApiSettings.style.display = "none";
      if (apiUrlSettingGroup) apiUrlSettingGroup.style.display = "none";
      return;
    }

    if (webAIApiSettings) {
      webAIApiSettings.style.display =
        selectedApi === "webai" ? "block" : "none";
    }
    if (geminiApiSettings) {
      geminiApiSettings.style.display =
        selectedApi === "gemini" ? "block" : "none";
    }
    if (openAIApiSettings) {
      openAIApiSettings.style.display =
        selectedApi === "openai" ? "block" : "none";
    }
    if (openRouterApiSettings) {
      openRouterApiSettings.style.display =
        selectedApi === "openrouter" ? "block" : "none";
    }
    if (deepseekApiSettings) {
      deepseekApiSettings.style.display =
        selectedApi === "deepseek" ? "block" : "none";
    }
    if (apiUrlSettingGroup) {
      apiUrlSettingGroup.style.display =
        selectedApi === "gemini" ? "block" : "none";
    }
  }

  if (translationApiSelect) {
    // بررسی وجود translationApiSelect
    toggleApiSettings(); // تنظیم حالت اولیه
    translationApiSelect.addEventListener("change", toggleApiSettings);
  }

  if (useMockCheckbox) {
    // بررسی وجود useMockCheckbox
    useMockCheckbox.addEventListener("change", () => {
      updateMockState(useMockCheckbox.checked); // updateMockState باید toggleApiSettings را نیز در نظر بگیرد یا فراخوانی کند
      toggleApiSettings(); // اطمینان از اینکه نمایش بخش‌ها پس از تغییر mock به‌روز می‌شود
    });
  }

  saveSettingsButton.addEventListener("click", async () => {
    // const currentSettings = await getSettingsAsync(); // این خط دیگر برای APPLICATION_LOCALIZE لازم نیست اگر مستقیم از storage بخوانیم

    let finalThemeValue;
    if (themeAuto && themeAuto.checked) {
      finalThemeValue = "auto";
    } else if (themeSwitch) {
      finalThemeValue = themeSwitch.checked ? "dark" : "light";
    } else {
      // اگر کنترل‌های تم در DOM موجود نباشند، مقدار فعلی یا پیش‌فرض را بخوان
      const storedTheme = await Browser.storage.local.get("THEME");
      finalThemeValue = storedTheme.THEME || CONFIG.THEME || "auto";
    }
    logME("Saving theme as:", finalThemeValue);

    // --- Start of added logic to get new setting value ---
    const selectionTranslationMode =
      selectionModeOnClickRadio?.checked ? "onClick" : "immediate";
    // --- End of added logic ---

    const webAIApiUrl = webAIApiUrlInput?.value?.trim();
    const webAIApiModel = webAIApiModelInput?.value?.trim();
    const apiKey = apiKeyInput?.value?.trim();
    const useMock = useMockCheckbox?.checked ?? CONFIG.USE_MOCK; // فال‌بک به CONFIG اگر چک‌باکس موجود نباشد
    const debugMode = debugModeCheckbox?.checked ?? CONFIG.DEBUG_MODE;
    const apiUrl = apiUrlInput?.value?.trim();
    const sourceLanguage = sourceLanguageInput?.value;
    const targetLanguage = targetLanguageInput?.value;
    const promptTemplate = promptTemplateInput?.value?.trim();
    const translationApi = translationApiSelect?.value; // فال‌بک در ادامه
    const openaiApiKey = openAIApiKeyInput?.value?.trim();
    const openaiApiModel = openAIModelInput?.value?.trim();
    const openrouterApiKey = openRouterApiKeyInput?.value?.trim();
    const openrouterApiModel = openRouterApiModelInput?.value?.trim();
    const deepseekApiKey = deepseekApiKeyInput?.value?.trim();
    const deepseekApiModel = deepseekApiModelInput?.value?.trim();
    const extensionEnabled =
      extensionEnabledCheckbox?.checked ?? CONFIG.EXTENSION_ENABLED;
    const enableDictionary =
      enableDictionraryCheckbox?.checked ?? CONFIG.ENABLE_DICTIONARY;
    const translateOnTextFields =
      translateOnTextFieldsCheckbox?.checked ?? CONFIG.TRANSLATE_ON_TEXT_FIELDS;
    const enableShortcutForTextFields =
      enableShortcutForTextFieldsCheckbox?.checked ??
      CONFIG.ENABLE_SHORTCUT_FOR_TEXT_FIELDS;
    const translateWithSelectElement =
      translateWithSelectElementCheckbox?.checked ??
      CONFIG.TRANSLATE_WITH_SELECT_ELEMENT;
    const translateOnTextSelection =
      translateOnTextSelectionCheckbox?.checked ??
      CONFIG.TRANSLATE_ON_TEXT_SELECTION;
    const requireCtrlForTextSelection =
      requireCtrlForTextSelectionCheckbox?.checked ??
      CONFIG.REQUIRE_CTRL_FOR_TEXT_SELECTION;
    const excludedList =
      excludedSites?.value
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];

    try {
      const currentLocalizationSetting = await Browser.storage.local.get(
        "APPLICATION_LOCALIZE"
      );
      const appLocalize =
        currentLocalizationSetting.APPLICATION_LOCALIZE ||
        CONFIG.APPLICATION_LOCALIZE;

      const settingsToSave = {
        API_KEY: apiKey || "", // فال‌بک به رشته خالی اگر تعریف نشده باشد
        USE_MOCK: useMock,
        DEBUG_MODE: debugMode,
        EXTENSION_ENABLED: extensionEnabled,
        THEME: finalThemeValue, // استفاده از مقدار تعیین شده
        API_URL: apiUrl || CONFIG.API_URL,
        SOURCE_LANGUAGE: sourceLanguage || CONFIG.SOURCE_LANGUAGE,
        TARGET_LANGUAGE: targetLanguage || CONFIG.TARGET_LANGUAGE,
        APPLICATION_LOCALIZE: appLocalize,
        PROMPT_TEMPLATE: promptTemplate || CONFIG.PROMPT_TEMPLATE,
        TRANSLATION_API: translationApi || CONFIG.TRANSLATION_API,
        WEBAI_API_URL: webAIApiUrl || CONFIG.WEBAI_API_URL,
        WEBAI_API_MODEL: webAIApiModel || CONFIG.WEBAI_API_MODEL,
        OPENAI_API_KEY: openaiApiKey || CONFIG.OPENAI_API_KEY,
        OPENAI_API_MODEL: openaiApiModel || CONFIG.OPENAI_API_MODEL,
        OPENROUTER_API_KEY: openrouterApiKey || CONFIG.OPENROUTER_API_KEY,
        OPENROUTER_API_MODEL: openrouterApiModel || CONFIG.OPENROUTER_API_MODEL,
        DEEPSEEK_API_KEY: deepseekApiKey || CONFIG.DEEPSEEK_API_KEY,
        DEEPSEEK_API_MODEL: deepseekApiModel || CONFIG.DEEPSEEK_API_MODEL,
        TRANSLATE_ON_TEXT_FIELDS: translateOnTextFields,
        ENABLE_DICTIONARY: enableDictionary,
        ENABLE_SHORTCUT_FOR_TEXT_FIELDS: enableShortcutForTextFields,
        TRANSLATE_WITH_SELECT_ELEMENT: translateWithSelectElement,
        TRANSLATE_ON_TEXT_SELECTION: translateOnTextSelection,
        REQUIRE_CTRL_FOR_TEXT_SELECTION: requireCtrlForTextSelection,
        EXCLUDED_SITES: excludedList,
        selectionTranslationMode: selectionTranslationMode, // --- Added new setting to save object ---
      };

      await Browser.storage.local.set(settingsToSave);
      logME("Settings saved:", settingsToSave);

      if (settingsToSave.EXTENSION_ENABLED) {
        const tabs = await Browser.tabs.query({ url: "<all_urls>" });
        await Promise.allSettled(
          tabs.map(async (tab) => {
            if (!tab.id || !tab.url) return;
            // حالا shouldInject لیست exclude را از settingsToSave می‌گیرد
            if (await shouldInject(tab.url, settingsToSave.EXCLUDED_SITES)) {
              try {
                // بررسی می‌کنیم آیا اسکریپت محتوا قبلاً inject شده یا نه
                // این بخش ممکن است نیاز به منطق دقیق‌تری برای جلوگیری از inject مجدد داشته باشد
                // یا اینکه TRY_INJECT_IF_NEEDED این را مدیریت می‌کند.
                await Browser.runtime.sendMessage({
                  action: "TRY_INJECT_IF_NEEDED", // این اکشن باید در background script تعریف شده باشد
                  tabId: tab.id,
                  url: tab.url,
                });
                // logME("Injection message sent for", tab.url); // لاگ قبلی شما
              } catch (e) {
                logME(
                  "Injection message failed for",
                  tab.url,
                  e.message.includes("Could not establish connection") ?
                    "(Tab not accessible)"
                  : e
                );
              }
            }
          })
        );
      }

      await updatePromptHelpText(settingsToSave); // پاس دادن تنظیمات ذخیره شده برای جلوگیری از خواندن مجدد
      showStatus(
        await getTranslationString("OPTIONS_STATUS_SAVED_SUCCESS"),
        "success"
      );
      setTimeout(() => showStatus("", ""), 2000);
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "saveSettings",
      });
      showStatus(
        await getTranslationString("OPTIONS_STATUS_SAVED_FAILED"),
        "error" // باید 'error' باشد
      );
      setTimeout(() => showStatus("", ""), 3000); // زمان بیشتر برای پیام خطا
    }
  });

  async function updatePromptHelpText(currentSettings) {
    // اگر currentSettings پاس داده نشده، از storage بخوان
    const settings = currentSettings || (await getSettingsAsync());
    const sourceLang = settings.SOURCE_LANGUAGE || CONFIG.SOURCE_LANGUAGE; // استفاده از فال‌بک CONFIG
    const targetLang = settings.TARGET_LANGUAGE || CONFIG.TARGET_LANGUAGE; // استفاده از فال‌بک CONFIG

    if (sourceLangNameSpan) {
      sourceLangNameSpan.textContent = `(${sourceLang})`;
    }
    if (targetLangNameSpan) {
      targetLangNameSpan.textContent = `(${targetLang})`;
    }
  }

  async function loadSettings() {
    try {
      const settings = await getSettingsAsync(); // این شامل THEME از قبل لود شده هم می‌شود.
      // منطق مربوط به UI تم در DOMContentLoaded انجام شده.

      // نمایش اطلاعات مانیفست
      const manifest = Browser.runtime.getManifest();
      if (manifest_Name && CONFIG.APP_NAME) {
        // بررسی وجود CONFIG.APP_NAME
        manifest_Name.textContent = CONFIG.APP_NAME;
      } else if (manifest_Name) {
        manifest_Name.textContent = manifest.name; // فال‌بک به نام از مانیفست
      }

      if (manifest_Version) {
        manifest_Version.textContent = `v${manifest.version}`;
      }

      // مقداردهی اولیه تنظیمات دیباگ و ماد
      if (debugModeCheckbox) {
        debugModeCheckbox.checked = settings.DEBUG_MODE ?? CONFIG.DEBUG_MODE;
      }
      if (useMockCheckbox) {
        useMockCheckbox.checked = settings.USE_MOCK ?? CONFIG.USE_MOCK;
        // وضعیت اولیه mock باید به UI کنترل‌های API هم اعمال شود
        updateMockState(useMockCheckbox.checked); // <--- این خط اضافه شد
      }

      // مقداردهی اولیه تنظیمات حالت‌های مختلف ترجمه
      if (extensionEnabledCheckbox) {
        extensionEnabledCheckbox.checked =
          settings.EXTENSION_ENABLED ?? CONFIG.EXTENSION_ENABLED;
      }
      if (translateOnTextFieldsCheckbox) {
        translateOnTextFieldsCheckbox.checked =
          settings.TRANSLATE_ON_TEXT_FIELDS ?? CONFIG.TRANSLATE_ON_TEXT_FIELDS;
      }
      if (enableShortcutForTextFieldsCheckbox) {
        enableShortcutForTextFieldsCheckbox.checked =
          settings.ENABLE_SHORTCUT_FOR_TEXT_FIELDS ??
          CONFIG.ENABLE_SHORTCUT_FOR_TEXT_FIELDS;
      }
      if (translateWithSelectElementCheckbox) {
        translateWithSelectElementCheckbox.checked =
          settings.TRANSLATE_WITH_SELECT_ELEMENT ??
          CONFIG.TRANSLATE_WITH_SELECT_ELEMENT;
      }
      if (translateOnTextSelectionCheckbox) {
        translateOnTextSelectionCheckbox.checked =
          settings.TRANSLATE_ON_TEXT_SELECTION ??
          CONFIG.TRANSLATE_ON_TEXT_SELECTION;
      }
      if (requireCtrlForTextSelectionCheckbox) {
        requireCtrlForTextSelectionCheckbox.checked =
          settings.REQUIRE_CTRL_FOR_TEXT_SELECTION ??
          CONFIG.REQUIRE_CTRL_FOR_TEXT_SELECTION;
      }
      if (enableDictionraryCheckbox) {
        enableDictionraryCheckbox.checked =
          settings.ENABLE_DICTIONARY ?? CONFIG.ENABLE_DICTIONARY;
      }

      // --- Start of added logic to load new setting ---
      if (selectionModeImmediateRadio && selectionModeOnClickRadio) {
        if (settings.selectionTranslationMode === "onClick") {
          selectionModeOnClickRadio.checked = true;
        } else {
          selectionModeImmediateRadio.checked = true; // Default
        }
      }
      // --- End of added logic ---

      /** مقدار دهی اولیه exclude */
      if (excludedSites) {
        excludedSites.value = (settings.EXCLUDED_SITES || []).join(", ");
      }

      if (sourceLanguageInput) {
        sourceLanguageInput.value =
          settings.SOURCE_LANGUAGE || CONFIG.SOURCE_LANGUAGE;
      }
      if (targetLanguageInput) {
        targetLanguageInput.value =
          settings.TARGET_LANGUAGE || CONFIG.TARGET_LANGUAGE;
      }
      if (promptTemplateInput) {
        promptTemplateInput.value =
          settings.PROMPT_TEMPLATE || CONFIG.PROMPT_TEMPLATE;
      }

      if (apiKeyInput) apiKeyInput.value = settings.API_KEY || "";
      if (apiUrlInput) apiUrlInput.value = settings.API_URL || CONFIG.API_URL;

      if (translationApiSelect) {
        translationApiSelect.value =
          settings.TRANSLATION_API || CONFIG.TRANSLATION_API;
        toggleApiSettings(); // <--- این خط اضافه شد تا نمایش بخش‌های API بر اساس مقدار لود شده صحیح باشد
      }

      if (webAIApiUrlInput) {
        webAIApiUrlInput.value = settings.WEBAI_API_URL || CONFIG.WEBAI_API_URL;
      }
      if (webAIApiModelInput) {
        webAIApiModelInput.value =
          settings.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL;
      }
      if (openAIApiKeyInput) {
        openAIApiKeyInput.value =
          settings.OPENAI_API_KEY || CONFIG.OPENAI_API_KEY;
      }
      if (openAIModelInput) {
        openAIModelInput.value =
          settings.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL;
      }
      if (openRouterApiKeyInput) {
        openRouterApiKeyInput.value =
          settings.OPENROUTER_API_KEY || CONFIG.OPENROUTER_API_KEY;
      }
      if (openRouterApiModelInput) {
        openRouterApiModelInput.value =
          settings.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL;
      }
      if (deepseekApiKeyInput) {
        deepseekApiKeyInput.value =
          settings.DEEPSEEK_API_KEY || CONFIG.DEEPSEEK_API_KEY;
      }
      if (deepseekApiModelInput) {
        deepseekApiModelInput.value =
          settings.DEEPSEEK_API_MODEL || CONFIG.DEEPSEEK_API_MODEL;
      }

      // اطمینان از اینکه app_localize با مقدار صحیح فراخوانی می‌شود
      // این باید در انتهای لود تنظیمات باشد یا اگر APPLICATION_LOCALIZE تغییر نمی‌کند، یکبار کافی است.
      const currentAppLocalize =
        settings.APPLICATION_LOCALIZE || CONFIG.APPLICATION_LOCALIZE;
      if (typeof app_localize === "function") {
        // بررسی اینکه app_localize یک تابع است
        app_localize(currentAppLocalize);
      }

      handleTextSelectionDependency();
      updateOverallExtensionDependency();
      await updatePromptHelpText(settings); // پاس دادن settings برای جلوگیری از خواندن مجدد

      //*** تنظیم اندازه تب برای نمایش انیمیشن */
      const activeTabInitially =
        document.querySelector(".tab-content.active") ||
        document.getElementById("languages");
      if (
        activeTabInitially &&
        !activeTabInitially.classList.contains("active")
      ) {
        // اگر هیچ تبی فعال نیست، languages را فعال کن
        showTab("languages"); // این showTab ارتفاع را هم تنظیم می‌کند
      } else if (activeTabInitially) {
        // اگر تبی فعال است، فقط ارتفاع را تنظیم کن
        window.requestAnimationFrame(() => {
          setTimeout(() => {
            const container = document.querySelector(".container");
            if (container && activeTabInitially.classList.contains("active")) {
              const containerRect = container.getBoundingClientRect();
              const contentRect = activeTabInitially.getBoundingClientRect();
              const paddingBottom = 40;
              const newHeight =
                contentRect.bottom > containerRect.top ?
                  contentRect.bottom - containerRect.top + paddingBottom
                : activeTabInitially.scrollHeight + paddingBottom;
              container.style.height = `${newHeight}px`;
            }
          }, 50); // کمی تاخیر بیشتر برای اطمینان از رندر کامل محتوای تب
        });
      }
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "loadSettings",
        details: { component: "options-page", action: "initialize-settings" },
      });
      // در صورت بروز خطا، ممکن است بخواهید یک پیام به کاربر نشان دهید
      showStatus(
        (await getTranslationString("OPTIONS_STATUS_LOAD_FAILED")) ||
          "Failed to load settings.",
        "error"
      );
    }
  }

  function showStatus(message, type = "info") {
    // مقدار پیش‌فرض برای type
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = ""; // پاک کردن کلاس‌های قبلی
      statusElement.classList.add(`status-${type}`); // اضافه کردن کلاس جدید
      if (message) {
        statusElement.style.display = "block";
      } else {
        statusElement.style.display = "none";
      }
    }
  }

  exportSettingsButton.addEventListener("click", async () => {
    try {
      const settings = await getSettingsAsync(); // گرفتن آخرین تنظیمات ذخیره شده
      const blob = new Blob([JSON.stringify(settings, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${CONFIG.APP_NAME}_Settings.json`; // استفاده از نام اپ از CONFIG
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      showStatus(
        (await getTranslationString("OPTIONS_STATUS_EXPORT_SUCCESS")) ||
          "Settings exported successfully!",
        "success"
      );
      setTimeout(() => showStatus(""), 2000);
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "exportSettings",
      });
      showStatus(
        (await getTranslationString("OPTIONS_STATUS_EXPORT_FAILED")) ||
          "Failed to export settings.",
        "error"
      );
      setTimeout(() => showStatus(""), 3000);
    }
  });

  importFile.addEventListener("change", async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      const importedSettingsText = await file.text();
      const importedSettings = JSON.parse(importedSettingsText);

      // اعتبارسنجی اولیه تنظیمات وارد شده (اختیاری اما توصیه شده)
      // مثلاً بررسی کنید که آیا کلیدهای اصلی مانند THEME، API_KEY و غیره وجود دارند.

      await Browser.storage.local.set(importedSettings);
      showStatus(
        (await getTranslationString(
          "OPTIONS_STATUS_IMPORT_SUCCESS_RELOADING"
        )) || "Settings imported! Reloading...",
        "success"
      );
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "importSettings",
      });
      showStatus(
        (await getTranslationString("OPTIONS_STATUS_IMPORT_FAILED")) ||
          "Failed to import settings. Invalid file?",
        "error"
      );
      if (importFile) importFile.value = ""; // Reset file input
      setTimeout(() => showStatus(""), 3000);
    }
  });

  // فراخوانی loadSettings پس از اینکه event listener ها و توابع کمکی تعریف شده‌اند.
  await loadSettings();
  // showTab("languages") در انتهای loadSettings مدیریت می‌شود یا می‌تواند اینجا باشد اگر بخواهید حتما با این تب شروع شود.
  // اگر loadSettings تب پیش‌فرض را مدیریت نمی‌کند، این خط را فعال کنید:
  if (!document.querySelector(".tab-content.active")) {
    showTab("languages");
  }
});
