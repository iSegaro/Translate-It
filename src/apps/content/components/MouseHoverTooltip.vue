<template>
  <div
    v-if="isVisible"
    ref="tooltipRef"
    class="ti-mouse-hover-tooltip"
    :style="{
      '--tooltip-transform': `translate3d(${position.x}px, ${position.y}px, 0)`,
    }"
    @pointerenter="emitPointer('MOUSE_HOVER_TOOLTIP_POINTER_ENTER')"
    @pointerleave="emitPointer('MOUSE_HOVER_TOOLTIP_POINTER_LEAVE')"
  >
    <TranslationDisplay
      :content="translatedText"
      :target-language="targetLanguage"
      mode="standard"
      :show-toolbar="false"
      max-height="40vh"
      class="ti-mouse-hover-display"
      :error="errorMessage"
      :error-type="errorType"
      :is-streaming="isStreaming"
    />
  </div>
</template>

<script setup>
import "./MouseHoverTooltip.scss";
import { ref, nextTick, computed } from "vue";
import { pageEventBus } from "@/core/PageEventBus.js";
import { useResourceTracker } from "@/composables/core/useResourceTracker.js";
import { useSettingsStore } from "@/features/settings/stores/settings.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import TranslationDisplay from "@/components/shared/TranslationDisplay.vue";

const logger = getScopedLogger(LOG_COMPONENTS.ON_HOVER, "MouseHoverTooltip");
const settingsStore = useSettingsStore();
const isVisible = ref(false);
const translatedText = ref("");
const errorMessage = ref("");
const errorType = ref(null);
const position = ref({ x: 0, y: 0 });
const tooltipRef = ref(null);
const isError = ref(false);
const isStreaming = ref(false);
const hoverId = ref(null);
const frameId = ref(0);
let displayGeneration = 0;

const tracker = useResourceTracker("mouse-hover-tooltip");

// Reactive target language
const targetLanguage = computed(() => settingsStore.targetLanguage || "fa");

const acknowledgeReplacedDisplay = (nextHoverId) => {
  if (
    !isVisible.value ||
    !hoverId.value ||
    !nextHoverId ||
    hoverId.value === nextHoverId
  )
    return;
  pageEventBus.emit("MOUSE_HOVER_TOOLTIP_HIDDEN", {
    hoverId: hoverId.value,
    frameId: frameId.value,
  });
};

const showTooltip = async (detail) => {
  if (!detail.translatedText) return;
  acknowledgeReplacedDisplay(detail.hoverId);
  const generation = ++displayGeneration;
  const token = detail.hoverId;

  // Clear any existing timer
  tracker.clearAllTimers();

  const wasVisible = isVisible.value;
  hoverId.value = token ?? hoverId.value;
  frameId.value = detail.frameId ?? 0;
  isStreaming.value = !!detail.isStreaming;

  // Only hide and reset if it wasn't already visible (new hover)
  // This prevents flickering during streaming updates
  if (!wasVisible) {
    isVisible.value = false;
    isError.value = false;
    errorMessage.value = "";
    errorType.value = null;
  }

  translatedText.value = detail.translatedText;

  // Wait for content update and DOM reset
  await nextTick();
  if (
    generation !== displayGeneration ||
    (token !== undefined && token !== hoverId.value)
  )
    return;

  if (!wasVisible) {
    isVisible.value = true;
    // Wait for new dimensions to be calculated by the browser
    await nextTick();
    if (
      generation !== displayGeneration ||
      (token !== undefined && token !== hoverId.value)
    )
      return;
    calculatePosition(detail.position);
  } else {
    // If already visible, just update position in case content changed significantly
    calculatePosition(detail.position);
  }

  // Setup auto-hide if configured for timer, but ONLY if not streaming
  if (!isStreaming.value) {
    const autoClose =
      settingsStore.settings?.MOUSE_HOVER_AUTO_CLOSE || "mouseleave";
    if (autoClose === "timer") {
      const duration =
        settingsStore.settings?.MOUSE_HOVER_TIMER_DURATION || 3000;
      tracker.setTimeout(() => {
        hideTooltip({ hoverId: token });
      }, duration);
    }
  }
};

const showError = (detail) => {
  acknowledgeReplacedDisplay(detail.hoverId);
  displayGeneration += 1;
  hoverId.value = detail.hoverId ?? hoverId.value;
  frameId.value = detail.frameId ?? 0;
  isVisible.value = true;
  isError.value = true;
  errorMessage.value = detail.error?.message || "Translation failed";
  errorType.value = detail.error?.type || null;
  translatedText.value = "";

  tracker.clearAllTimers();
  const token = hoverId.value;
  tracker.setTimeout(() => {
    hideTooltip({ hoverId: token });
  }, 3000);
};

const hideTooltip = (detail) => {
  if (detail?.hoverId && detail.hoverId !== hoverId.value) return;
  if (!detail && hoverId.value !== null) return;
  displayGeneration += 1;
  const hiddenDetail = { hoverId: hoverId.value, frameId: frameId.value };
  isVisible.value = false;
  isError.value = false;
  errorMessage.value = "";
  errorType.value = null;
  hoverId.value = null;
  frameId.value = 0;

  // Notify manager that tooltip is hidden so it can reset its cache
  pageEventBus.emit("MOUSE_HOVER_TOOLTIP_HIDDEN", hiddenDetail);

  tracker.clearAllTimers();
};

const emitPointer = (type) => {
  if (isVisible.value)
    pageEventBus.emit(type, { hoverId: hoverId.value, frameId: frameId.value });
};

const calculatePosition = (pos) => {
  if (!pos || !isVisible.value || !tooltipRef.value) return;

  const el = tooltipRef.value;
  const rect = el.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const offset = 15;
  let x = pos.x + offset;
  let y = pos.y - rect.height - offset; // Default: show ABOVE the cursor

  // Adjust Y position if it goes off the top of the screen
  if (y < 10) {
    // Not enough space above, show BELOW the cursor instead
    y = pos.y + offset;
    logger.debug("Not enough space above cursor, flipping tooltip to bottom");
  }

  // Adjust X position if it goes off the right edge
  if (x + rect.width > viewportWidth - 10) {
    x = pos.x - rect.width - offset;
  }

  // Final safety checks for viewport boundaries
  if (x < 10) x = 10;
  if (y + rect.height > viewportHeight - 10)
    y = viewportHeight - rect.height - 10;

  position.value = { x, y };
};

// Expose for testing
defineExpose({
  isVisible,
  translatedText,
  position,
  showTooltip,
  hideTooltip,
  calculatePosition,
});

// Safe event listening with automatic cleanup
tracker.addEventListener(
  pageEventBus,
  "MOUSE_HOVER_TRANSLATION_READY",
  showTooltip,
);
tracker.addEventListener(
  pageEventBus,
  "MOUSE_HOVER_TRANSLATION_ERROR",
  showError,
);
tracker.addEventListener(pageEventBus, "MOUSE_HOVER_HIDE_TOOLTIP", hideTooltip);
</script>
