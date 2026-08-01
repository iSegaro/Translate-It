<template>
  <div class="pdf-tab">
    <div class="tab-header">
      <h2>{{ t('pdf_tab_title') }}</h2>
      <p class="tab-description">
        {{ t('pdf_tab_desc') }}
      </p>
    </div>

    <BaseFieldset
      id="pdf_context_menu_section"
      :legend="t('pdf_context_menu_section_title')"
    >
      <div class="setting-group">
        <BaseCheckbox
          id="PAGE_CONTEXT_PDF_TRANSLATOR"
          v-model="showPdfTranslatorInContextMenu"
          :label="t('pdf_context_menu_label')"
        />
        <p class="setting-description">
          {{ t('pdf_context_menu_desc') }}
        </p>
      </div>
    </BaseFieldset>
  </div>
</template>

<script setup>
import './PdfTab.scss'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n'
import { useSettingsStore } from '@/features/settings/stores/settings'
import { useTabSettings } from '../composables/useTabSettings.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

// Components
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseFieldset from '@/components/base/BaseFieldset.vue'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'PdfTab')
const { t } = useUnifiedI18n()
const settingsStore = useSettingsStore()
const { createSetting } = useTabSettings(settingsStore, logger)

const showPdfTranslatorInContextMenu = createSetting('CONTEXT_MENU_VISIBILITY', {}, {
  transformGet: (visibility) => visibility.PAGE_CONTEXT_PDF_TRANSLATOR !== false,
  transformSet: (value) => {
    const current = settingsStore.settings?.CONTEXT_MENU_VISIBILITY || {}
    return { ...current, PAGE_CONTEXT_PDF_TRANSLATOR: value }
  }
})
</script>
