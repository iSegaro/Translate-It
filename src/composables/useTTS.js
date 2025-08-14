import { ref, computed, onMounted, onUnmounted } from "vue";
import { useExtensionAPI } from "./useExtensionAPI.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useTTS');

export function useTTS() {
  const { getStorageData, setStorageData } = useExtensionAPI();

  // State
  const isSupported = ref(false);
  const isPlaying = ref(false);
  const isPaused = ref(false);
  const isLoading = ref(false);
  const currentUtterance = ref(null);
  const availableVoices = ref([]);
  const error = ref(null);

  // Settings
  const settings = ref({
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    voice: null,
    language: "en-US",
    autoPlay: false,
    preferredVoiceGender: "female", // male, female, neutral
  });

  // Computed
  const isActive = computed(() => isPlaying.value || isPaused.value);

  const progress = computed(() => {
    // This would need to be calculated based on text position
    // For now, return a simple estimation
    return 0;
  });

  const filteredVoices = computed(() => {
    return availableVoices.value.filter((voice) => {
      if (settings.value.language && voice.lang) {
        return voice.lang.startsWith(settings.value.language.split("-")[0]);
      }
      return true;
    });
  });

  const currentVoice = computed(() => {
    if (settings.value.voice) {
      return availableVoices.value.find(
        (voice) => voice.voiceURI === settings.value.voice,
      );
    }
    return getDefaultVoice();
  });

  // Methods
  const checkSupport = () => {
    isSupported.value =
      "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    return isSupported.value;
  };

  const loadVoices = () => {
    if (!isSupported.value) return;

    const voices = speechSynthesis.getVoices();
    availableVoices.value = voices.map((voice) => ({
      voiceURI: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
      localService: voice.localService,
      default: voice.default,
      gender: extractGender(voice.name),
    }));

    // Set default voice if none selected
    if (!settings.value.voice && availableVoices.value.length > 0) {
      const defaultVoice = getDefaultVoice();
      if (defaultVoice) {
        settings.value.voice = defaultVoice.voiceURI;
      }
    }
  };

  const extractGender = (voiceName) => {
    const name = voiceName.toLowerCase();
    if (
      name.includes("female") ||
      name.includes("woman") ||
      name.includes("girl")
    ) {
      return "female";
    }
    if (name.includes("male") || name.includes("man") || name.includes("boy")) {
      return "male";
    }
    // Try to guess from common names
    const femaleNames = [
      "anna",
      "emma",
      "samantha",
      "kate",
      "sarah",
      "victoria",
      "zoe",
    ];
    const maleNames = ["alex", "daniel", "thomas", "fred", "jorge", "rishi"];

    for (const femaleName of femaleNames) {
      if (name.includes(femaleName)) return "female";
    }

    for (const maleName of maleNames) {
      if (name.includes(maleName)) return "male";
    }

    return "neutral";
  };

  const getDefaultVoice = () => {
    if (availableVoices.value.length === 0) return null;

    // Try to find a voice matching the preferred language and gender
    let preferredVoices = availableVoices.value.filter((voice) => {
      if (settings.value.language && voice.lang) {
        return voice.lang.startsWith(settings.value.language.split("-")[0]);
      }
      return true;
    });

    if (preferredVoices.length === 0) {
      preferredVoices = availableVoices.value;
    }

    // Filter by preferred gender
    if (settings.value.preferredVoiceGender !== "neutral") {
      const genderFiltered = preferredVoices.filter(
        (voice) => voice.gender === settings.value.preferredVoiceGender,
      );
      if (genderFiltered.length > 0) {
        preferredVoices = genderFiltered;
      }
    }

    // Prefer local voices
    const localVoices = preferredVoices.filter((voice) => voice.localService);
    if (localVoices.length > 0) {
      return localVoices[0];
    }

    // Prefer default voices
    const defaultVoices = preferredVoices.filter((voice) => voice.default);
    if (defaultVoices.length > 0) {
      return defaultVoices[0];
    }

    return preferredVoices[0] || null;
  };

  const speak = async (text, options = {}) => {
    if (!isSupported.value || !text?.trim()) {
      throw new Error("TTS not supported or no text provided");
    }

    // Stop current speech
    stop();

    isLoading.value = true;
    error.value = null;

    try {
      const utterance = new SpeechSynthesisUtterance(text);

      // Apply settings
      utterance.rate = options.rate ?? settings.value.rate;
      utterance.pitch = options.pitch ?? settings.value.pitch;
      utterance.volume = options.volume ?? settings.value.volume;
      utterance.lang = options.language ?? settings.value.language;

      // Set voice
      if (options.voice || settings.value.voice) {
        const voiceURI = options.voice || settings.value.voice;
        const voice = availableVoices.value.find(
          (v) => v.voiceURI === voiceURI,
        );
        if (voice) {
          utterance.voice = speechSynthesis
            .getVoices()
            .find((v) => v.voiceURI === voiceURI);
        }
      }

      // Set up event listeners
      utterance.onstart = () => {
        isLoading.value = false;
        isPlaying.value = true;
        isPaused.value = false;
      };

      utterance.onend = () => {
        isPlaying.value = false;
        isPaused.value = false;
        currentUtterance.value = null;
      };

      utterance.onerror = (event) => {
        isLoading.value = false;
        isPlaying.value = false;
        isPaused.value = false;
        currentUtterance.value = null;
        error.value = `TTS Error: ${event.error}`;
        throw new Error(error.value);
      };

      utterance.onpause = () => {
        isPaused.value = true;
        isPlaying.value = false;
      };

      utterance.onresume = () => {
        isPaused.value = false;
        isPlaying.value = true;
      };

      // Store current utterance
      currentUtterance.value = utterance;

      // Start speaking
      speechSynthesis.speak(utterance);

      return utterance;
    } catch (err) {
      isLoading.value = false;
      error.value = err.message;
      throw err;
    }
  };

  const pause = () => {
    if (isSupported.value && isPlaying.value) {
      speechSynthesis.pause();
    }
  };

  const resume = () => {
    if (isSupported.value && isPaused.value) {
      speechSynthesis.resume();
    }
  };

  const stop = () => {
    if (isSupported.value) {
      speechSynthesis.cancel();
      isPlaying.value = false;
      isPaused.value = false;
      currentUtterance.value = null;
    }
  };

  const toggle = () => {
    if (isPlaying.value) {
      pause();
    } else if (isPaused.value) {
      resume();
    }
  };

  // Settings management
  const updateSettings = (newSettings) => {
    settings.value = { ...settings.value, ...newSettings };
    saveSettings();
  };

  const updateSetting = (key, value) => {
    settings.value[key] = value;
    saveSettings();
  };

  const resetSettings = () => {
    settings.value = {
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      voice: null,
      language: "en-US",
      autoPlay: false,
      preferredVoiceGender: "female",
    };
    saveSettings();
  };

  const saveSettings = async () => {
    try {
      await setStorageData({ tts_settings: settings.value });
    } catch (err) {
      logger.error("Failed to save TTS settings:", err);
    }
  };

  const loadSettings = async () => {
    try {
      const data = await getStorageData(["tts_settings"]);
      if (data.tts_settings) {
        settings.value = { ...settings.value, ...data.tts_settings };
      }
    } catch (err) {
      logger.error("Failed to load TTS settings:", err);
    }
  };

  // Voice utilities
  const getVoicesByLanguage = (language) => {
    const langCode = language.split("-")[0];
    return availableVoices.value.filter(
      (voice) => voice.lang && voice.lang.startsWith(langCode),
    );
  };

  const getVoicesByGender = (gender) => {
    return availableVoices.value.filter((voice) => voice.gender === gender);
  };

  const findBestVoice = (language, gender = null) => {
    let candidates = getVoicesByLanguage(language);

    if (gender && candidates.length > 1) {
      const genderFiltered = candidates.filter(
        (voice) => voice.gender === gender,
      );
      if (genderFiltered.length > 0) {
        candidates = genderFiltered;
      }
    }

    // Prefer local voices
    const localVoices = candidates.filter((voice) => voice.localService);
    if (localVoices.length > 0) {
      return localVoices[0];
    }

    return candidates[0] || null;
  };

  // Test functionality
  const testVoice = async (
    voiceURI,
    testText = "Hello, this is a test of the text to speech system.",
  ) => {
    const voice = availableVoices.value.find((v) => v.voiceURI === voiceURI);
    if (!voice) {
      throw new Error("Voice not found");
    }

    return await speak(testText, {
      voice: voiceURI,
      rate: settings.value.rate,
      pitch: settings.value.pitch,
      volume: settings.value.volume,
    });
  };

  // Language detection and setup
  const setLanguageFromText = (text) => {
    // Simple language detection based on character patterns
    const arabicPattern = /[\u0600-\u06FF]/;
    const persianPattern = /[\u06A9\u06AF\u06C0-\u06D3]/;
    const chinesePattern = /[\u4E00-\u9FFF]/;
    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF]/;
    const koreanPattern = /[\uAC00-\uD7AF]/;
    const russianPattern = /[\u0400-\u04FF]/;

    let detectedLang = "en-US"; // default

    if (persianPattern.test(text)) {
      detectedLang = "fa-IR";
    } else if (arabicPattern.test(text)) {
      detectedLang = "ar-SA";
    } else if (chinesePattern.test(text)) {
      detectedLang = "zh-CN";
    } else if (japanesePattern.test(text)) {
      detectedLang = "ja-JP";
    } else if (koreanPattern.test(text)) {
      detectedLang = "ko-KR";
    } else if (russianPattern.test(text)) {
      detectedLang = "ru-RU";
    }

    // Find best voice for detected language
    const bestVoice = findBestVoice(
      detectedLang,
      settings.value.preferredVoiceGender,
    );

    return {
      language: detectedLang,
      voice: bestVoice?.voiceURI || null,
    };
  };

  // Initialize
  const initialize = async () => {
    if (!checkSupport()) {
      logger.warn("TTS not supported in this browser");
      return false;
    }

    await loadSettings();
    loadVoices();

    // Load voices when they become available
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    return true;
  };

  // Cleanup
  const cleanup = () => {
    stop();
    if (speechSynthesis.onvoiceschanged) {
      speechSynthesis.onvoiceschanged = null;
    }
  };

  // Lifecycle
  onMounted(() => {
    initialize();
  });

  onUnmounted(() => {
    cleanup();
  });

  return {
    // State
    isSupported,
    isPlaying,
    isPaused,
    isLoading,
    isActive,
    availableVoices,
    filteredVoices,
    currentVoice,
    currentUtterance,
    progress,
    error,
    settings,

    // Methods
    speak,
    pause,
    resume,
    stop,
    toggle,
    testVoice,

    // Settings
    updateSettings,
    updateSetting,
    resetSettings,
    saveSettings,
    loadSettings,

    // Voice utilities
    getVoicesByLanguage,
    getVoicesByGender,
    findBestVoice,
    setLanguageFromText,

    // Utilities
    initialize,
    cleanup,
    checkSupport,
    loadVoices,
  };
}