<template>
  <div class="live-dubbing-view">
    <div class="live-dubbing-language-controls">
      <LanguageSelector
        v-model:target-language="targetLanguageModel"
        :provider="providerId"
        :enable-select-element-integration="false"
        :target-only="true"
      />
    </div>
    <LiveDubbingControl
      :target-language="targetLanguage"
      :provider-id="providerId"
      @busy-change="emit('busy-change', $event)"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import LiveDubbingControl from '@/components/popup/LiveDubbingControl.vue'

// Import adjacent SCSS
import './LiveDubbingView.scss'

const props = defineProps({
  targetLanguage: {
    type: String,
    default: 'en'
  },
  providerId: {
    type: String,
    default: 'gemini'
  }
})

const emit = defineEmits(['busy-change', 'update:targetLanguage'])

const targetLanguageModel = computed({
  get: () => props.targetLanguage,
  set: (value) => emit('update:targetLanguage', value)
})
</script>
