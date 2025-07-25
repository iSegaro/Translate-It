<template>
  <div
    class="provider-item"
    :class="{ active: item.isActive }"
    :data-provider-id="item.id"
    @click="handleClick"
  >
    <div class="provider-icon">
      <img :src="item.iconUrl" :alt="item.name" />
    </div>
    <div class="provider-info">
      <span class="provider-name">{{ item.name }}</span>
      <span v-if="item.isActive" class="active-indicator">Current</span>
    </div>
  </div>
</template>

<script setup>

const props = defineProps({
  item: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['select'])

const handleClick = () => {
  if (!props.item.isActive) {
    emit('select', props.item.id)
  }
}
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.provider-item {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm;
  border-radius: $border-radius-sm;
  cursor: pointer;
  transition: all $transition-fast;
  background-color: transparent;
  border: 1px solid transparent;

  &:hover {
    background-color: var(--color-background);
    border-color: var(--color-border);
  }

  &.active {
    background-color: var(--color-primary);
    color: white;
    cursor: default;

    .provider-name {
      color: white;
    }

    .active-indicator {
      color: rgba(255, 255, 255, 0.9);
    }

    .provider-icon img {
      filter: brightness(0) invert(1);
    }
  }
}

.provider-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.provider-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0; // Allow text truncation

  .provider-name {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .active-indicator {
    font-size: $font-size-xs;
    color: var(--color-text-secondary);
    font-weight: $font-weight-normal;
  }
}
</style>
