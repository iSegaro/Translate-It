<template>
  <div 
    class="log-level-item"
    :class="[`level-${modelValue}`]"
  >
    <span class="component-name">{{ componentName }}</span>
    <BaseSelect
      :model-value="modelValue"
      :options="logLevelOptions"
      class="log-level-select"
      @update:model-value="$emit('update:modelValue', Number($event))"
    />
  </div>
</template>

<script setup>
import BaseSelect from '@/components/base/BaseSelect.vue'

defineProps({
  componentName: {
    type: String,
    required: true
  },
  modelValue: {
    type: Number,
    required: true
  }
})

defineEmits(['update:modelValue'])

const logLevelOptions = [
  { value: 0, label: 'Error' },
  { value: 1, label: 'Warn' },
  { value: 2, label: 'Info' },
  { value: 3, label: 'Debug' }
]
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.log-level-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-xs $spacing-sm;
  background: var(--color-background-soft);
  border-radius: $border-radius-sm;
  gap: $spacing-md;
  transition: background 0.2s ease;

  &:hover {
    filter: brightness(0.95);
  }

  // Level Colors
  &.level-0 { // Error
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.2);
    .component-name { color: #dc2626; }
  }

  &.level-1 { // Warn
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.2);
    .component-name { color: #d97706; }
  }

  &.level-2 { // Info
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.2);
    .component-name { color: #2563eb; }
  }

  &.level-3 { // Debug
    background: rgba(139, 92, 246, 0.15);
    border: 1px solid rgba(139, 92, 246, 0.2);
    .component-name { color: #7c3aed; }
  }

  .component-name {
    font-size: $font-size-sm;
    color: var(--color-text);
    font-weight: $font-weight-medium;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .log-level-select {
    min-width: 100px;
    max-width: 120px;
    
    :deep(.ti-select) {
      padding-top: 4px;
      padding-bottom: 4px;
      font-size: $font-size-sm;
    }
  }
}

// Mobile responsiveness
@media (max-width: 600px) {
  .log-level-item {
    padding: $spacing-sm;

    .component-name {
      white-space: normal;
    }
  }
}
</style>
