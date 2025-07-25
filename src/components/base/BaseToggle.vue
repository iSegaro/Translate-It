<template>
  <label class="base-toggle" :class="{ disabled }" :title="title">
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.checked)"
    />
    <span class="slider round"></span>
  </label>
</template>

<script setup>
defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  }
})

defineEmits(['update:modelValue'])
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.base-toggle {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
  cursor: pointer;
  
  input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: $transition-base;
    border-radius: 20px;
    
    &:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 2px;
      bottom: 2px;
      background-color: white;
      transition: $transition-base;
      border-radius: 50%;
    }
  }
  
  input:checked + .slider {
    background-color: var(--color-primary);
  }
  
  input:checked + .slider:before {
    transform: translateX(20px);
  }
  
  &.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    
    .slider {
      cursor: not-allowed;
    }
  }
}
</style>