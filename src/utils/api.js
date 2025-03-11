// src/utils/api.js
import { CONFIG, getApiKeyAsync } from "../config.js";
import { delay } from "./helpers.js";
import { isPersianText } from "./textDetection.js";

const MOCK_DELAY = 500;

export const translateText = async (text) => {
  if (CONFIG.USE_MOCK) {
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

    const prompt =
      isPersianText(text) ?
        CONFIG.PROMPT_ENGLISH + text
      : CONFIG.PROMPT_PERSIAN + text;

    const response = await fetch(`${CONFIG.API_URL}?key=${apiKey}`, {
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
        // خطای مشخص برای کلید API نامعتبر
        throw new Error(`Invalid API key: ${errorMessage}`);
      } else if (
        response.status === 429 ||
        response.status === 503 ||
        errorMessage.toLowerCase().includes("overloaded")
      ) {
        // خطای مشخص برای overload سرویس
        throw new Error(`Translation service overloaded: ${errorMessage}`);
      } else {
        // خطای عمومی برای سایر خطاهای سرویس
        throw new Error(`Translation service error: ${errorMessage}`);
      }
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    if (error.message.includes("API key is missing")) {
      throw new Error("API key is missing"); //  دوباره پرتاب شود تا در لایه بالاتر مدیریت شود
    } else if (error.message.startsWith("Invalid API key")) {
      throw new Error(error.message); // پرتاب خطای Invalid API Key با پیام دقیق
    } else if (error.message.startsWith("Translation service overloaded")) {
      throw new Error(error.message); // پرتاب خطای service overloaded با پیام دقیق
    } else {
      throw new Error(
        `Network error or translation service unavailable: ${error.message}`
      ); // خطای شبکه یا سرویس در دسترس نیست
    }
  }
};
