<template>
  <div
    class="subtitle-app"
    :class="{ 'is-dark': isDark }"
  >
    <header class="app-header">
      <div class="logo">
        <v-icon
          icon="mdi:closed-caption-outline"
          class="logo-icon"
        />
        <div class="logo-text">
          <h1>{{ t('subtitle_app_title', 'Subtitle Translator') }}</h1>
          <span>{{ t('subtitle_app_powered_by', 'Powered by Translate It') }}</span>
        </div>
      </div>
      
      <div class="header-actions">
        <button 
          class="icon-btn" 
          :title="t('theme_toggle_title', 'Toggle Theme')"
          @click="toggleTheme"
        >
          <v-icon :icon="isDark ? 'mdi:white-balance-sunny' : 'mdi:moon-waning-crescent'" />
        </button>
      </div>
    </header>

    <main class="app-content">
      <div class="container">
        <!-- Step 1: Upload -->
        <section
          v-if="status === 'idle'"
          class="step-upload"
        >
          <SubtitleFileDropzone 
            v-model="currentFile" 
            @file-loaded="handleFileLoaded" 
          />
          
          <div
            v-if="fileContent"
            class="config-card fade-in"
          >
            <div class="config-grid">
              <div class="config-item language-pair">
                <label>{{ t('subtitle_languages_label', 'Translation Languages') }}</label>
                <LanguageSelector 
                  v-model:source-language="config.sourceLanguage" 
                  v-model:target-language="config.targetLanguage" 
                  :provider="config.providerId"
                />
              </div>
              <div class="config-item">
                <label>{{ t('provider_label', 'Provider') }}</label>
                <ProviderSelector v-model="config.providerId" />
              </div>
            </div>

            <div class="actions">
              <button 
                class="primary-btn" 
                :disabled="!canTranslate"
                @click="startJob"
              >
                <v-icon icon="mdi:translate" />
                {{ t('subtitle_start_btn', 'Start Translation') }}
              </button>
            </div>
          </div>
        </section>

        <!-- Step 2: Translating -->
        <section
          v-if="status === 'translating' || status === 'completed'"
          class="step-progress"
        >
          <SubtitleProgressPanel 
            :progress="progress" 
            :status="status" 
            :filename="currentFile?.name" 
          />

          <div
            v-if="status === 'translating'"
            class="actions"
          >
            <button
              class="secondary-btn"
              @click="cancelTranslation"
            >
              <v-icon icon="mdi:close" />
              {{ t('subtitle_cancel_btn', 'Cancel Job') }}
            </button>
          </div>

          <div
            v-if="status === 'completed'"
            class="complete-actions fade-in"
          >
            <button
              class="primary-btn success"
              @click="handleDownload(currentFile.name)"
            >
              <v-icon icon="mdi:download" />
              {{ t('subtitle_download_btn', 'Download Translated Subtitles') }}
            </button>
            <button
              v-if="isDownloaded"
              class="secondary-btn fade-in"
              @click="reset"
            >
              <v-icon icon="mdi:refresh" />
              {{ t('subtitle_another_file_btn', 'Translate Another File') }}
            </button>
          </div>
        </section>

        <!-- Error State -->
        <section
          v-if="status === 'error'"
          class="step-error fade-in"
        >
          <div class="error-card">
            <v-icon
              icon="mdi:alert-circle-outline"
              class="error-icon"
            />
            <h3>{{ t('subtitle_error_title', 'Oops! Something went wrong') }}</h3>
            <p>{{ error }}</p>
            <button
              class="primary-btn"
              @click="status = 'idle'"
            >
              {{ t('subtitle_try_again_btn', 'Try Again') }}
            </button>
          </div>
        </section>
      </div>
    </main>

    <footer class="app-footer">
      <p>&copy; 2026 {{ t('app_copyright', 'Translate It. All rights reserved.') }}</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { Icon as VIcon } from '@iconify/vue';
import browser from 'webextension-polyfill';
import SubtitleFileDropzone from '@/features/subtitle-translation/components/SubtitleFileDropzone.vue';
import SubtitleProgressPanel from '@/features/subtitle-translation/components/SubtitleProgressPanel.vue';
import LanguageSelector from '@/components/shared/LanguageSelector.vue';
import ProviderSelector from '@/components/shared/ProviderSelector.vue';
import { useSubtitleTranslation } from '@/features/subtitle-translation/composables/useSubtitleTranslation.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import { useSettingsStore } from '@/features/settings/stores/settings.js';
import { applyTheme } from '@/utils/ui/theme.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// --- Initialization & Setup ---
const logger = getScopedLogger(LOG_COMPONENTS.SUBTITLE, 'SubtitleApp');
const { t } = useUnifiedI18n();
const settingsStore = useSettingsStore();
const tracker = useResourceTracker('subtitle-app');

const isDark = computed(() => settingsStore.isDarkTheme);
const fileContent = ref('');
const isDownloaded = ref(false);

const {
  status,
  progress,
  error,
  currentFile,
  startTranslation,
  cancelTranslation,
  downloadResult: downloadResultOriginal,
  cleanup
} = useSubtitleTranslation();

/**
 * Enhanced download handler to track state.
 */
const handleDownload = (filename) => {
  downloadResultOriginal(filename);
  isDownloaded.value = true;
};

const config = reactive({
  sourceLanguage: 'auto',
  targetLanguage: 'en',
  providerId: 'Gemini',
  options: { useContext: true }
});

/**
 * Toggle the theme settings store preference and broadcast it globally.
 */
const toggleTheme = () => {
  const nextTheme = settingsStore.isDarkTheme ? 'light' : 'dark';
  settingsStore.updateSettingAndPersist('THEME', nextTheme);
  
  browser.runtime.sendMessage({
    action: 'THEME_CHANGED',
    payload: { theme: nextTheme }
  }).catch(error => {
    logger.debug('Could not send THEME_CHANGED message from Subtitle:', error.message);
  });
};

onMounted(async () => {
  try {
    // Load existing settings and initialize the theme
    await settingsStore.loadSettings();
    applyTheme(settingsStore.settings.THEME);
    
    // Listen for theme changes from other options/extension pages
    tracker.addEventListener(browser.runtime.onMessage, 'addListener', (message) => {
      if (message && message.action === 'THEME_CHANGED') {
        if (message.payload?.theme) {
          applyTheme(message.payload.theme);
        }
      }
    });

    // Listen for system theme changes in auto mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    tracker.addEventListener(mediaQuery, 'change', () => {
      if (settingsStore.settings.THEME === 'auto') {
        applyTheme('auto');
      }
    });
  } catch (err) {
    logger.error('Failed to initialize settings/theme in SubtitleApp:', err);
  }
});

const handleFileLoaded = (content) => {
  fileContent.value = content;
};

const canTranslate = computed(() => {
  return fileContent.value && config.targetLanguage && config.providerId;
});

const startJob = () => {
  startTranslation(fileContent.value, currentFile.value.name, config);
};

const reset = () => {
  status.value = 'idle';
  currentFile.value = null;
  fileContent.value = '';
  isDownloaded.value = false;
};

onUnmounted(() => {
  cleanup();
});
</script>

<style lang="scss">
:root {
  --primary-color: #6366f1;
  --primary-glow: rgba(99, 102, 241, 0.15);
  --success-color: #10b981;
  --error-color: #ef4444;
  
  /* Light theme default colors */
  --bg-app: #f8fafc;
  --bg-card: #ffffff;
  --border-color: rgba(0, 0, 0, 0.08);
  --text-primary: #0f172a;
  --text-secondary: #64748b;
  --bg-header: rgba(248, 250, 252, 0.8);
  --logo-text-gradient-start: #0f172a;
  --logo-text-gradient-end: #475569;
  --btn-secondary-bg: rgba(0, 0, 0, 0.03);
  --btn-secondary-bg-hover: rgba(0, 0, 0, 0.06);
  --bg-glass: rgba(0, 0, 0, 0.02);
  --bg-glass-hover: rgba(0, 0, 0, 0.04);
  --progress-track-bg: rgba(0, 0, 0, 0.05);
}

/* Dark theme overrides */
:root.theme-dark, .theme-dark, .is-dark {
  --bg-app: #0f172a;
  --bg-card: rgba(30, 41, 59, 0.7);
  --border-color: rgba(255, 255, 255, 0.1);
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --bg-header: rgba(15, 23, 42, 0.8);
  --logo-text-gradient-start: #ffffff;
  --logo-text-gradient-end: #94a3b8;
  --btn-secondary-bg: rgba(255, 255, 255, 0.05);
  --btn-secondary-bg-hover: rgba(255, 255, 255, 0.1);
  --bg-glass: rgba(255, 255, 255, 0.03);
  --bg-glass-hover: rgba(255, 255, 255, 0.05);
  --progress-track-bg: rgba(255, 255, 255, 0.1);
}

.subtitle-app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  transition: background-color 0.3s ease;
  background-color: var(--bg-app);
  color: var(--text-primary);

  .app-header {
    padding: 1.5rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-header);
    backdrop-filter: blur(12px);
    position: sticky;
    top: 0;
    z-index: 100;

    .logo {
      display: flex;
      align-items: center;
      gap: 1rem;

      .logo-icon {
        font-size: 2.5rem;
        color: var(--primary-color);
      }

      .logo-text {
        h1 {
          font-size: 1.25rem;
          margin: 0;
          font-weight: 700;
          background: linear-gradient(90deg, var(--logo-text-gradient-start), var(--logo-text-gradient-end));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        span {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
      }
    }
  }

  .app-content {
    flex: 1;
    padding: 3rem 1rem;

    .container {
      max-width: 800px;
      margin: 0 auto;
    }
  }

  .config-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 20px;
    padding: 2rem;
    margin-top: 1rem;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
    transition: all 0.3s ease;

    :root.theme-dark &, .theme-dark &, .is-dark & {
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }

    .config-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 2rem;
      margin-bottom: 2rem;

      .config-item {
        &.language-pair {
          grid-column: span 2;
          
          @media (max-width: 600px) {
            grid-column: span 1;
          }
        }

        label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 0.75rem;
        }
      }
    }
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: 1rem;
  }

  .complete-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }

  .primary-btn {
    padding: 0.85rem 2rem;
    border-radius: 12px;
    background: var(--primary-color);
    color: #fff;
    border: none;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px var(--primary-glow);
      filter: brightness(1.1);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.success {
      background: var(--success-color);
      padding: 1rem 3rem;
      font-size: 1.1rem;
    }
  }

  .secondary-btn {
    padding: 0.85rem 2rem;
    border-radius: 12px;
    background: var(--btn-secondary-bg);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s ease;

    &:hover {
      background: var(--btn-secondary-bg-hover);
    }
  }

  .icon-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--btn-secondary-bg);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 1.25rem;

    &:hover {
      background: var(--btn-secondary-bg-hover);
      transform: scale(1.05);
    }
    
    &:active {
      transform: scale(0.95);
    }
  }

  .error-card {
    text-align: center;
    padding: 3rem;
    background: rgba(239, 68, 68, 0.05);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 20px;

    .error-icon {
      font-size: 4rem;
      color: var(--error-color);
      margin-bottom: 1rem;
    }

    h3 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }

    p {
      color: var(--text-secondary);
      margin-bottom: 2rem;
    }
  }

  .app-footer {
    padding: 2rem;
    text-align: center;
    border-top: 1px solid var(--border-color);
    font-size: 0.85rem;
    color: var(--text-secondary);
  }
}

.fade-in {
  animation: fadeIn 0.5s ease-out forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
