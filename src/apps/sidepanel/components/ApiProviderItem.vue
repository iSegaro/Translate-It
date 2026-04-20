<template>
  <div
    class="provider-item"
    :class="{ active: item.isActive }"
    :data-provider-id="item.id"
    @click="handleClick"
  >
    <div class="provider-icon">
      <img
        :src="item.iconUrl"
        :alt="item.name"
      >
    </div>
    <div class="provider-info">
      <span class="provider-name">{{ item.name }}</span>
      <span
        v-if="item.isActive"
        class="active-indicator"
      >Current</span>
    </div>
  </div>
</template>

<script setup>
import './ApiProviderItem.scss'
const props = defineProps({
  item: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['select'])

const handleClick = () => {
  // Always emit the selection, even for active provider (to close the dropdown)
  emit('select', props.item.id)
}
</script>
