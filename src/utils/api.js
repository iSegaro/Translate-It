// src/utils/api.js
import {
  CONFIG,
  getApiKeyAsync,
  getUseMockAsync,
  getApiUrlAsync,
  getSourceLanguageAsync,
  getTargetLanguageAsync,
  getPromptAsync,
} from "../config.js";
import { delay } from "./helpers.js";
import { isPersianText } from "./textDetection.js";

const MOCK_DELAY = 500;

export const translateText = async (text) => {
  const useMock = await getUseMockAsync();
  if (useMock) {
    await delay(MOCK_DELAY);
    const isPersian = isPersianText(text);
    return isPersian ?
        CONFIG.DEBUG_TRANSLATED_ENGLISH
      : CONFIG.DEBUG_TRANSLATED_PERSIAN;
  }

  try {
    const apiKey = await getApiKeyAsync();
    if (!apiKey) {
      throw new Error("API key is missing");
    }

    const sourceLang = await getSourceLanguageAsync();
    const targetLang = await getTargetLanguageAsync();

    // دریافت الگوی Prompt
    let promptTemplate = await getPromptAsync();

    // جایگزینی کلمات کلیدی با مقادیر واقعی زبان
    const prompt = promptTemplate
      .replace(/\${SOURCE}/g, sourceLang)
      .replace(/\${TARGET}/g, targetLang)
      .replace(/\${TEXT}/g, text);

    if (sourceLang === targetLang) {
      return text; // No translation needed
    }

    console.info("Generated Prompt: ", prompt);

    const apiUrl = await getApiUrlAsync();
    const response = await fetch(`${apiUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let errorMessage =
        errorData.error?.message || response.statusText || "Translation failed";

      if (
        response.status === 401 ||
        errorMessage.toLowerCase().includes("api key")
      ) {
        throw new Error(`Invalid API key: ${errorMessage}`);
      } else if (
        response.status === 429 ||
        response.status === 503 ||
        errorMessage.toLowerCase().includes("overloaded")
      ) {
        throw new Error(`Translation service overloaded: ${errorMessage}`);
      } else {
        throw new Error(`Translation service error: ${errorMessage}`);
      }
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    // مدیریت اختصاصی خطای "Extension context invalid"
    if (error.message.includes("Extension context invalid")) {
      throw new Error(
        "Extension context invalid. Please refresh the page to continue."
      );
    } else if (error.message.includes("API key is missing")) {
      throw new Error("API key is missing");
    } else if (error.message.startsWith("Invalid API key")) {
      throw new Error(error.message);
    } else if (error.message.startsWith("Translation service overloaded")) {
      throw new Error(error.message);
    } else {
      throw new Error(
        `Network error or translation service unavailable: ${error.message}`
      );
    }
  }
};
