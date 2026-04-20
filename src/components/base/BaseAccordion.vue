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

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.base-accordion {
  width: 100%;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;

  .accordion-header {
    width: 100%;
    padding: $spacing-sm 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: color $transition-base;
    user-select: none;

    &:hover {
      color: var(--color-primary);
      
      .icon-wrapper {
        color: var(--color-primary);
      }
    }

    &.is-active {
      color: var(--color-primary);
    }

    .header-content {
      flex: 1;
      display: flex;
      align-items: center;
    }

    .trigger-area {
      padding: $spacing-sm $spacing-md;
      margin-inline-end: -$spacing-md;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      color: var(--color-text-secondary);

      &.is-active {
        transform: rotate(45deg);
        color: var(--color-primary);
      }

      .icon {
        font-size: 18px;
        font-weight: 300;
        line-height: 1;
      }
    }
  }

  .accordion-body {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
    opacity: 0;
    overflow: hidden;

    &.is-open {
      grid-template-rows: 1fr;
      opacity: 1;
    }

    .body-inner {
      min-height: 0;
    }
  }
}
</style>
