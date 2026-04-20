<template>
  <div
    class="base-accordion"
    :class="{ 'is-open': isOpen, [itemClass]: !!itemClass }"
  >
    <!-- Header Section -->
    <div 
      class="accordion-header" 
      :class="{ 'is-active': isOpen, [headerClass]: !!headerClass }"
      @click="$emit('toggle')"
    >
      <div class="header-content">
        <slot name="header">
          <span class="default-title">{{ title }}</span>
        </slot>
      </div>

      <div class="trigger-area">
        <slot name="trigger">
          <div
            class="icon-wrapper"
            :class="{ 'is-active': isOpen }"
          >
            <span class="icon">+</span>
          </div>
        </slot>
      </div>
    </div>

    <!-- Collapsible Content Section -->
    <div
      class="accordion-body"
      :class="{ 'is-open': isOpen, [bodyClass]: !!bodyClass }"
    >
      <div class="body-inner">
        <slot name="content" />
      </div>
    </div>
  </div>
</template>

<script setup>
import './BaseAccordion.scss';
/**
 * BaseAccordion Component
 * A reusable, accessible accordion with smooth height transitions using CSS Grid.
 */

defineProps({
  /** Whether the accordion is currently expanded */
  isOpen: {
    type: Boolean,
    default: false
  },
  /** Optional title if header slot is not used */
  title: {
    type: String,
    default: ''
  },
  /** Custom class for the root container */
  itemClass: {
    type: String,
    default: ''
  },
  /** Custom class for the header area */
  headerClass: {
    type: String,
    default: ''
  },
  /** Custom class for the body container */
  bodyClass: {
    type: String,
    default: ''
  }
});

defineEmits(['toggle']);
</script>
