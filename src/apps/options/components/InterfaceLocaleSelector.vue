<template>
  <div
    ref="selectorRef"
    class="interface-locale-selector"
    :class="[mode, { 'is-rtl': isRtl }]"
  >
    <!-- Dropdown Mode -->
    <template v-if="mode === 'dropdown'">
      <button
        class="dropdown-toggle-btn"
        :title="t('localization_section_title')"
        @click="toggleDropdown"
      >
        <div class="current-locale-content">
          <img
            :src="getFlagUrl(selectedLocale)"
            class="locale-flag-image"
            :alt="selectedLocale"
          >
          <span class="selected-locale-name">{{ currentLocaleName }}</span>
        </div>
        <div class="dropdown-arrow-wrapper">
          <img
            src="@/icons/ui/dropdown-arrow.svg"
            class="arrow-icon"
            :class="{ 'is-open': isOpen }"
            alt="Arrow"
          >
        </div>
      </button>

      <transition name="dropdown-fade">
        <ul
          v-if="isOpen"
          class="dropdown-menu"
        >
          <li
            v-for="lang in interfaceLanguages"
            :key="lang.code"
            class="dropdown-item"
            :class="{ selected: selectedLocale === lang.code }"
            @click="selectLocale(lang.code)"
          >
            <img
              :src="getFlagUrl(lang.code)"
              class="locale-flag-image"
              :alt="lang.name"
            >
            <span class="locale-name">{{ lang.name }}</span>
          </li>
        </ul>
      </transition>
    </template>

    <!-- List Mode (Desktop) -->
    <ul
      v-else
      class="locale-list"
    >
      <li
        v-for="lang in interfaceLanguages"
        :key="lang.code"
        class="locale-list-item"
        :class="{ selected: selectedLocale === lang.code }"
        @click="selectLocale(lang.code)"
      >
        <img
          :src="getFlagUrl(lang.code)"
          class="locale-flag-image"
          :alt="lang.name"
        >
        <span class="locale-name">{{ lang.name }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { getLocaleInfo } from '@/shared/config/LocaleManifest.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import browser from 'webextension-polyfill'

const props = defineProps({
  mode: {
    type: String,
    default: 'dropdown',
    validator: (value) => ['dropdown', 'list'].includes(value)
  }
})

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'InterfaceLocaleSelector');
const { t, changeLanguage } = useUnifiedI18n()
const settingsStore = useSettingsStore()
const { getInterfaceLanguages } = useLanguages()

const isOpen = ref(false)
const selectorRef = ref(null)

const interfaceLanguages = computed(() => getInterfaceLanguages())
const selectedLocale = computed(() => settingsStore.settings?.APPLICATION_LOCALIZE || 'en')
const isRtl = computed(() => {
  const locale = getLocaleInfo(selectedLocale.value);
  return locale?.dir === 'rtl';
})

const currentLocaleName = computed(() => {
  const lang = interfaceLanguages.value.find(l => l.code === selectedLocale.value)
  return lang ? lang.name : 'English'
})

const getFlagUrl = (code) => {
  const locale = getLocaleInfo(code);
  const flag = locale?.flag || code;
  try {
    return browser.runtime.getURL(`icons/flags/${flag}.svg`)
  } catch (error) {
    logger.error(`Failed to load flag for ${code}:`, error);
    return '';
  }
};

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

const selectLocale = async (code) => {
  if (selectedLocale.value === code) {
    if (props.mode === 'dropdown') isOpen.value = false
    return
  }

  try {
    await changeLanguage(code)
    if (props.mode === 'dropdown') isOpen.value = false
    
    browser.runtime.sendMessage({
      action: 'LANGUAGE_CHANGED',
      payload: { lang: code }
    }).catch(error => {
      logger.debug('Could not send LANGUAGE_CHANGED message, probably sidepanel is closed:', error.message);
    });
  } catch (error) {
    logger.error('Failed to change locale:', error)
  }
}

const handleClickOutside = (event) => {
  if (selectorRef.value && !selectorRef.value.contains(event.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  if (props.mode === 'dropdown') {
    document.addEventListener('click', handleClickOutside)
  }
})

onUnmounted(() => {
  if (props.mode === 'dropdown') {
    document.removeEventListener('click', handleClickOutside)
  }
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.interface-locale-selector {
  width: 100%;
  position: relative;
}

/* Common Styles */
.locale-flag-image {
  width: 18px;
  height: 14px;
  border: 1px solid var(--color-border);
  object-fit: cover;
  border-radius: 2px;
  flex-shrink: 0;
}

.locale-name {
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

/* Dropdown Mode Styles */
.dropdown-toggle-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm);
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-border);
  background-color: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  cursor: pointer;
  outline: none;
  transition: all var(--transition-base);

  &:hover {
    border-color: var(--color-primary);
    background-color: var(--color-surface);
  }

  &:focus {
    border-color: var(--color-primary);
  }
}

.current-locale-content {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.dropdown-arrow-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.arrow-icon {
  width: 10px;
  height: 6px;
  opacity: 0.6;
  transition: transform var(--transition-base);
  filter: var(--icon-filter);

  &.is-open {
    transform: rotate(180deg);
  }
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  padding: 4px;
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  list-style: none;
  z-index: 1000;
  max-height: 250px;
  overflow-y: auto;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 8px 12px;
  cursor: pointer;
  border-radius: var(--border-radius-sm);
  transition: background-color var(--transition-fast);
  color: var(--color-text);

  &:hover {
    background-color: var(--color-surface);
  }

  &.selected {
    background-color: var(--color-active-background, #e8f0fe);
    color: var(--color-active-text, #1967d2);
    font-weight: var(--font-weight-medium);
  }

  :root.theme-dark &.selected,
  .theme-dark &.selected {
    background-color: var(--color-active-background, #1a365d);
    color: var(--color-active-text, white);
  }
}

/* List Mode Styles */
.locale-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 160px;
  overflow-y: auto;
  
  &::-webkit-scrollbar { width: 3px; }
  &::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }
}

.locale-list-item {
  cursor: pointer;
  padding: 8px 12px;
  border-radius: var(--border-radius-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  transition: background-color var(--transition-fast);
  color: var(--color-text);

  &:hover {
    background-color: var(--color-background-hover, rgba(0,0,0,0.05));
  }

  &.selected {
    background-color: var(--color-active-background, #e8f0fe);
    color: var(--color-active-text, #1967d2);
    font-weight: var(--font-weight-medium);
  }

  :root.theme-dark &.selected,
  .theme-dark &.selected {
    background-color: var(--color-active-background, #1a365d);
    color: var(--color-active-text, white);
  }
}

/* RTL Support */
.is-rtl {
  &.list {
    .locale-list-item {
      flex-direction: row-reverse;
      text-align: right;
    }
  }

  &.dropdown {
    .dropdown-item {
      flex-direction: row-reverse;
      text-align: right;
    }
    .current-locale-content {
      flex-direction: row-reverse;
    }
  }
}

/* Tablet responsive: make it fit in the header when in dropdown mode */
@media (max-width: 1024px) {
  .interface-locale-selector {
    width: fit-content !important;
    margin-inline-start: auto; /* Push to end in flex containers if needed */
  }

  .dropdown {
    /* In mobile header, we keep layout consistent regardless of RTL */
    .dropdown-toggle-btn {
      padding: var(--spacing-xs) var(--spacing-sm);
      min-width: 110px; // Reduced from 130px for a more compact look
      width: auto !important; // Allow content-based width
      height: 36px;
      border: none;
      background: transparent;
      display: flex !important;
      justify-content: space-between !important;
      flex-direction: row !important; /* Force LTR direction for button layout */

      &:hover {
        background: rgba(var(--color-primary-rgb), 0.1);
      }
    }

    .current-locale-content {
      flex-direction: row !important;
    }

    .selected-locale-name {
      font-size: var(--font-size-sm);
    }

    .dropdown-menu {
      // In mobile header, it will match the button width via left:0, right:0
      min-width: 100% !important;
      width: 100% !important;
      left: 0 !important;
      right: 0 !important;
      overflow-x: hidden !important;
    }

    .dropdown-item {
      max-width: 100% !important;
      overflow: hidden !important;
      
      .locale-name {
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
    }
  }
}

/* Transition */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.2s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>