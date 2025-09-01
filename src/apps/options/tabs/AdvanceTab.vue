<template>
  <section class="advance-tab">
  <h2>{{ t('advance_section_title') || 'Advanced Settings' }}</h2>
    
    <div class="setting-group">
      <BaseCheckbox
        v-model="useMock"
        :label="t('advance_dev_api_mode_label') || 'Use Dev API Mode'"
      />
    </div>
    
    <div class="setting-group">
      <BaseCheckbox
        v-model="debugMode"
        :label="t('advance_debug_mode_label') || 'Debug Mode'"
      />
    </div>
    
    <div class="setting-group">
  <label>{{ t('excluded_sites_label') || 'Exclude these sites (comma separated)' }}</label>
      <BaseTextarea
        v-model="excludedSites"
        :rows="3"
        placeholder="example.com, anotherdomain.org"
        dir="ltr"
        class="excluded-sites-input"
      />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'

import { useI18n } from 'vue-i18n'

const settingsStore = useSettingsStore()

const { t } = useI18n()

// Advanced settings
const useMock = computed({
  get: () => settingsStore.settings?.USE_MOCK || false,
  set: (value) => settingsStore.updateSettingLocally('USE_MOCK', value)
})

const debugMode = computed({
  get: () => settingsStore.settings?.DEBUG_MODE || false,
  set: (value) => settingsStore.updateSettingLocally('DEBUG_MODE', value)
})

const excludedSites = computed({
  get: () => {
    const sites = settingsStore.settings?.EXCLUDED_SITES || []
    return Array.isArray(sites) ? sites.join(', ') : sites
  },
  set: (value) => {
    const sites = value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    settingsStore.updateSettingLocally('EXCLUDED_SITES', sites)
  }
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.advance-tab {
  max-width: 600px;
}

h2 {
  font-size: $font-size-xl;
  font-weight: $font-weight-medium;
  margin-top: 0;
  margin-bottom: $spacing-lg;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  color: var(--color-text);
}

.setting-group {
  margin-bottom: $spacing-lg;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  
  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
  
  label {
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    margin-bottom: 0;
    flex-grow: 1;
    min-width: 200px;
  }
}

.excluded-sites-input {
  flex: 1;
  min-width: 100%;
  margin-top: $spacing-sm;
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .setting-group {
    flex-direction: column;
    align-items: stretch;
    gap: $spacing-sm;
    
    label {
      min-width: auto;
    }
    
    .excluded-sites-input {
      margin-top: 0;
    }
  }
}
</style>