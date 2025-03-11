// src/utils/api.js
import { CONFIG } from "../config.js";
import { getApiKeyAsync } from "../config.js";
import { delay } from "./helpers.js";

import { isPersianText } from "../utils/textDetection.js";

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
    if (!apiKey) throw new Error("API key is missing");

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
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Translation failed");
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    throw new Error(`Translation error: ${error.message}`);
  }
};
