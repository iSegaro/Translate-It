/**
 * TTS Providers Configuration - Centralized data for all TTS engines
 */
import { TTS_ENGINES } from '@/shared/config/constants.js';

export const PROVIDER_CONFIGS = {
  // --- Microsoft Edge Neural TTS Data ---
  [TTS_ENGINES.EDGE]: {
    name: 'Microsoft Edge TTS',
    endpointUrl: 'https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0',
    voicesUrl: 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list',
    trustedClientToken: '6A5AA1D4EAFF4E9FB37E23D68491D6F4',
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    clientVersion: '4.0.530a 5fe1dc6c',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    signatureSecret: 'oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==',
    appId: 'MSTranslatorAndroidApp',
    userId: '0f04d16a175c411e',
    homeRegion: 'en-US',
    // Circuit Breaker Settings
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeoutMs: 15 * 60 * 1000, // 15 minutes
      windowMs: 10 * 60 * 1000        // 10 minutes
    },
    // Static fallback voices (used if dynamic list is unavailable)
    voices: {
      'fa': 'fa-IR-DilaraNeural', 'ar': 'ar-SA-HamedNeural', 'he': 'he-IL-HilaNeural',
      'tr': 'tr-TR-EmelNeural', 'uz': 'uz-UZ-MadinaNeural', 'en': 'en-US-AriaNeural',
      'de': 'de-DE-KatjaNeural', 'fr': 'fr-FR-DeniseNeural', 'es': 'es-ES-ElviraNeural',
      'it': 'it-IT-ElsaNeural', 'nl': 'nl-NL-ColetteNeural', 'pt': 'pt-BR-FranciscaNeural',
      'sv': 'sv-SE-SofieNeural', 'da': 'da-DK-ChristelNeural', 'no': 'nb-NO-PernilleNeural',
      'fi': 'fi-FI-NooraNeural', 'ru': 'ru-RU-SvetlanaNeural', 'uk': 'uk-UA-PolinaNeural',
      'pl': 'pl-PL-AgnieszkaNeural', 'ro': 'ro-RO-AlinaNeural', 'hu': 'hu-HU-NoemiNeural',
      'cs': 'cs-CZ-VlastaNeural', 'sk': 'sk-SK-ViktoriaNeural', 'el': 'el-GR-AthinaNeural',
      'ja': 'ja-JP-NanamiNeural', 'ko': 'ko-KR-SunHiNeural', 'zh': 'zh-cn-XiaoxiaoNeural',
      'hi': 'hi-IN-SwaraNeural', 'mr': 'mr-IN-AarohiNeural', 'ne': 'ne-NP-HemkalaNeural',
      'bn': 'bn-IN-TanishaNeural', 'ta': 'ta-IN-PallaviNeural',
      'te': 'te-IN-ShrutiNeural', 'th': 'th-TH-PremwadeeNeural', 'vi': 'vi-VN-HoaiMyNeural',
      'id': 'id-ID-GadisNeural', 'ms': 'ms-MY-LatreeNeural',
      'zh-hk': 'zh-HK-HiuGaaiNeural', 'yue': 'zh-HK-HiuMaanNeural',
      'lzh': 'zh-TW-HsiaoChenNeural', 'ps': 'ps-AF-LatifaNeural', 'ur': 'ur-PK-UzmaNeural'
      }
      },

      // --- Google TTS Data ---
      [TTS_ENGINES.GOOGLE]: {
      name: 'Google TTS',
      baseUrl: 'https://translate.google.com/translate_tts',
      clientParam: 'tw-ob',
      encoding: 'UTF-8',
      offscreenPath: 'html/offscreen.html',
      maxTextLength: 200,
      defaultLanguage: 'en',
      cleaningRegex: /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF\u0400-\u04FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u3000-\u303F\uFF00-\uFFEF\u00C0-\u024Fa-zA-Z0-9\s.,!?-]/g,
      supportedLanguages: new Set([
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'zh-cn', 'zh-tw', 'yue',
      'ar', 'hi', 'ne', 'mr', 'tr', 'pl', 'nl', 'sv', 'da', 'no', 'fi', 'el', 'he', 'th',
      'vi', 'id', 'ms', 'tl', 'uk', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl',
      'et', 'lv', 'lt', 'mt', 'ga', 'cy', 'is', 'mk', 'sq', 'az', 'be', 'ka',
      'hy', 'ne', 'si', 'my', 'km', 'lo', 'gu', 'ta', 'te', 'kn', 'ml', 'pa',
      'bn', 'ur', 'am', 'om', 'so', 'sw', 'rw', 'ny', 'mg', 'st', 'zu', 'xh', 
      'af', 'sq', 'eu', 'ca', 'co', 'eo', 'fy', 'gl', 'haw', 'hmn', 'is', 'ig', 
      'jw', 'kk', 'ky', 'lb', 'mi', 'mn', 'sm', 'gd', 'sn', 'su', 'tg', 'tt', 
      'to', 'uz', 'yi', 'yo'
    ])
  }
};
