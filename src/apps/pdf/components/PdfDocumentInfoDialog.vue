<template>
  <BaseModal
    v-model="open"
    title="PDF Information"
    size="sm"
  >
    <dl class="pdf-info-rows">
      <div
        v-for="row in rows"
        :key="row.label"
        class="pdf-info-row"
      >
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </div>
    </dl>
  </BaseModal>
</template>

<script setup>
import { computed } from 'vue'
import BaseModal from '@/components/base/BaseModal.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  rows: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:modelValue'])

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
</script>

<style lang="scss" scoped>
.pdf-info-rows {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
}

.pdf-info-row {
  display: grid;
  gap: 2px;
}

dt {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

dd {
  font-size: 14px;
  color: var(--color-text, #222);
  margin: 0;
  word-break: break-word;
}
</style>
