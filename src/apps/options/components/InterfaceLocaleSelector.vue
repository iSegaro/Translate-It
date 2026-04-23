<template>
  <div
    ref="selectorRef"
    class="interface-locale-selector"
    :class="[mode]"
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
import './InterfaceLocaleSelector.scss'
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
