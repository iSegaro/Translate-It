// src/managers/tts-player.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import {
  AUTO_DETECT_VALUE,
  playAudioViaOffscreen,
  playAudioGoogleTTS,
  playAudioChromeTTS,
} from "../utils/tts.js";
import { detectTextLanguage } from "../utils/textDetection.js";
import { resolveLangCode } from "../utils/langUtils.js";

// با این آبجکت نگهداری می‌کنیم که "کدام" روش در حال حاضر در حال پخش است
// مثلاً: { method: 'google', audio: AudioObject } یا { method: 'chrome' } و ...
let activeTTS = null;

// تابع اصلی پخش
/**
 * تلاش برای پخش متن ورودی با ترتیب:
 *   1) Web Speech API (در صورت در دسترس بودن در بک‌گراند)
 *   2) اگر مرورگر Chrome:
 *       - تلاش با chrome.tts
 *       - اگر نشد => پخش از طریق offscreen
 *     اگر مرورگر Firefox:
 *       - پخش از طریق Google TTS
 */
export async function playTTS(message) {
  // ابتدا اگر پخشی در حال اجراست، آن را متوقف کنیم
  stopTTS();

  const text = message?.text?.trim();
  if (!text) {
    throw new Error("No text provided for TTS.");
  }

  // تعیین زبان و تشخیص خودکار
  let rawLang = message?.lang || AUTO_DETECT_VALUE;
  if (rawLang === AUTO_DETECT_VALUE) {
    try {
      const detectedLang = await detectTextLanguage(text);
      rawLang = detectedLang || "en";
    } catch (err) {
      logME("[TTS] Language detection failed. Fallback to 'en'.", err);
      rawLang = "en";
    }
  }

  const lang = resolveLangCode(rawLang);
  logME("[TTS] Final language to play:", lang);

  // تشخیص مرورگر
  let isFirefox = false;

  try {
    if (typeof Browser.runtime.getBrowserInfo === "function") {
      const browserInfo = await Browser.runtime.getBrowserInfo();
      isFirefox = browserInfo.name.toLowerCase() === "firefox";
    }
  } catch {
    // اگر اطلاعاتی نتوانستیم بگیریم، فرض می‌کنیم Chrome-like است
    logME(
      "[TTS] Could not get browser info, assuming Chrome-like environment."
    );
  }

  // TODO: این روش نیازمندِ انتقال به UI می باشد.
  // (1) ابتدا تلاش برای پخش توسط Web Speech API
  // این روش در پس‌زمینه در دسترس نیست و برای هر دو مرورگر
  // باید از طریق UI انجام شود
  // try {
  //   if (typeof speechSynthesis !== "undefined" && speechSynthesis) {
  //     logME("[TTS] Trying Web Speech API first...");
  //     await playAudioWebSpeech(text, lang);
  //     return { success: true };
  //   }
  // } catch (error) {
  //   logME("[TTS] Web Speech API playback failed, will fallback...", error);
  // }
  // *** End of TODO ***

  // (2) اگر وب اسپیچ کار نکرد، بسته به مرورگر به سراغ فالبک‌ها می‌رویم
  if (isFirefox) {
    // --- فایرفاکس: google tts fallback ---
    logME("[TTS] On Firefox, falling back to Google TTS method.");
    // متد را فراخوانی می‌کنیم و آبجکت Audio یا رفرنس برمی‌گرداند
    const { audio, playbackPromise } = playAudioGoogleTTS(text, lang);

    // توی متغیر فعالTTS ذخیره می‌کنیم تا بتوانیم stop کنیم
    activeTTS = { method: "google", audio };

    // منتظر می‌مانیم تا پخش تمام شود
    await playbackPromise
      .catch((err) => {
        logME("GoogleTTS error:", err);
        throw err;
      })
      .finally(() => {
        // پخش تمام شد یا به خطا خورد، مرجع را خالی کن
        activeTTS = null;
      });

    return { success: true };
  }
  // سناریوی Chrome-like
  else {
    // ابتدا تلاش با chrome.tts
    try {
      if (typeof chrome !== "undefined" && chrome.tts) {
        logME("[TTS] Attempting chrome.tts...");
        // کروم TTS نیاز به فراخوانی تابع دارد، خروجی Promise ساده بدون آبجکت Audio
        const playbackPromise = playAudioChromeTTS(text, lang);

        // استوری می‌کنیم کدام روش در حال پخش است
        activeTTS = { method: "chrome" };

        await playbackPromise
          .catch((err) => {
            logME("[TTS] chrome.tts error:", err);
            throw err;
          })
          .finally(() => {
            activeTTS = null;
          });

        return { success: true };
      }
    } catch (err) {
      logME("[TTS] chrome.tts failed, fallback offscreen...", err);
    }

    // fallback to offscreen
    // اگر chrome.tts وجود نداشت یا خطا داد، می‌رویم سراغ offscreen
    const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(
      text
    )}&tl=${lang}`;

    logME("[TTS] Fallback to offscreen TTS...");

    // در offscreen وعدهٔ صوت پخش می‌شود. ما اینجا فقط منتظر Promise برمی‌گردیم.
    const playbackPromise = playAudioViaOffscreen(ttsUrl);

    // ذخیره می‌کنیم که از offscreen استفاده می‌کنیم
    activeTTS = { method: "offscreen" };

    const result = await playbackPromise
      .catch((err) => {
        activeTTS = null;
        throw err;
      })
      .finally(() => {
        activeTTS = null;
      });

    if (result.success) {
      return { success: true };
    }
    throw new Error(result.error || "TTS playback failed via offscreen.");
  }
}

// تابع توقف پخش در هر روشی که فعال است:
export function stopTTS() {
  if (!activeTTS) return; // پخشی نداریم

  logME("Stopping TTS method:", activeTTS.method);

  try {
    switch (activeTTS.method) {
      case "google":
        // در Google TTS ما یک شیء audio داریم
        if (activeTTS.audio) {
          activeTTS.audio.pause();
          activeTTS.audio.src = "";
        }
        break;

      case "chrome":
        // کروم TTS:
        if (typeof chrome !== "undefined" && chrome.tts) {
          chrome.tts.stop();
        }
        break;

      case "webspeech":
        // اگر جایی با Web Speech API داشتیم:
        speechSynthesis.cancel();
        break;

      case "offscreen":
        // اگر از offscreen استفاده شده بود، با ارسال پیام جداگانه متوقفش می‌کنیم
        stopAudioViaOffscreen();
        break;
      default:
        // روش ناشناخته
        logME("Unknown TTS method to stop:", activeTTS.method);
        break;
    }
  } catch (err) {
    logME("Error stopping TTS:", err);
  }

  // در نهایت، چه موفق شویم و چه خطا داشته باشیم، activeTTS را پاک می‌کنیم
  activeTTS = null;
}

// تابع کمکی برای متوقف‌کردن پخش در offscreen
async function stopAudioViaOffscreen() {
  try {
    if (!chrome.offscreen?.hasDocument) return;
    const docExists = await chrome.offscreen.hasDocument();
    if (!docExists) return;

    // به اسکریپت offscreen می‌گوییم صدا را متوقف کند
    await Browser.runtime.sendMessage({
      action: "stopOffscreenAudio",
    });

    // سپس سند را می‌بندیم
    await Browser.offscreen.closeDocument();
    logME("Offscreen stopped and closed.");
  } catch (err) {
    logME("Error stopping offscreen audio:", err);
  }
}
