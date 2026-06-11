import { computed, onBeforeUnmount, ref, unref, watch } from 'vue';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_CAPTION, 'useLiveCaptionOverlay');
const requestFrame = typeof globalThis.requestAnimationFrame === 'function'
  ? globalThis.requestAnimationFrame.bind(globalThis)
  : (callback) => globalThis.setTimeout(callback, 16);
const cancelFrame = typeof globalThis.cancelAnimationFrame === 'function'
  ? globalThis.cancelAnimationFrame.bind(globalThis)
  : (timerId) => globalThis.clearTimeout(timerId);

function resolveTargetElement(target) {
  if (typeof target === 'function') {
    return target();
  }

  return unref(target) || null;
}

function getRectFromElement(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    return null;
  }

  return element.getBoundingClientRect();
}

function buildOverlayStyle(rect, options = {}) {
  const offsetBottom = Number.isFinite(options.offsetBottom) ? options.offsetBottom : 16;
  const offsetHorizontal = Number.isFinite(options.offsetHorizontal) ? options.offsetHorizontal : 16;
  const maxWidth = Math.max(0, rect.width - offsetHorizontal * 2);

  return Object.freeze({
    position: 'fixed',
    top: `${Math.max(0, rect.top + rect.height - offsetBottom)}px`,
    left: `${Math.max(0, rect.left + offsetHorizontal)}px`,
    width: `${maxWidth}px`,
    maxWidth: `${maxWidth}px`,
    bottom: 'auto',
    transform: 'translateY(-100%)',
    zIndex: 2147483647,
    pointerEvents: 'none'
  });
}

export function useLiveCaptionOverlay(target, options = {}) {
  const overlayStyle = ref(null);
  const overlayRect = ref(null);
  const isAttached = ref(false);
  const isVisible = ref(false);

  let resizeObserver = null;
  let scrollHandler = null;
  let rafId = null;

  const updateOverlayPosition = () => {
    const element = resolveTargetElement(target);
    const rect = getRectFromElement(element);

    if (!element || !element.isConnected || !rect) {
      overlayStyle.value = null;
      overlayRect.value = null;
      isVisible.value = false;
      return;
    }

    overlayRect.value = Object.freeze({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    });
    overlayStyle.value = buildOverlayStyle(rect, options);
    isVisible.value = true;
  };

  const scheduleUpdate = () => {
    if (rafId != null) {
      return;
    }

    rafId = requestFrame(() => {
      rafId = null;
      updateOverlayPosition();
    });
  };

  const cleanup = () => {
    if (rafId != null) {
      cancelFrame(rafId);
      rafId = null;
    }

    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }

    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler, { passive: true });
      document.removeEventListener('scroll', scrollHandler, { passive: true });
      window.removeEventListener('resize', scrollHandler, { passive: true });
      scrollHandler = null;
    }

    isAttached.value = false;
  };

  const attach = () => {
    cleanup();

    const element = resolveTargetElement(target);
    if (!element || !element.isConnected) {
      updateOverlayPosition();
      return;
    }

    isAttached.value = true;
    updateOverlayPosition();

    scrollHandler = () => scheduleUpdate();
    window.addEventListener('scroll', scrollHandler, { passive: true });
    document.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('resize', scrollHandler, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleUpdate();
      });
      resizeObserver.observe(element);
    }

    logger.debug('Live-caption overlay attached', {
      hasResizeObserver: Boolean(resizeObserver)
    });
  };

  watch(() => {
    const el = resolveTargetElement(target);
    const vis = options.visible !== undefined
      ? (typeof options.visible === 'function' ? options.visible() : unref(options.visible))
      : true;
    return el && vis ? el : null;
  }, (el) => {
    if (el) {
      attach();
    } else {
      cleanup();
    }
  }, { immediate: true });

  onBeforeUnmount(() => {
    cleanup();
    logger.debug('Live-caption overlay cleaned up');
  });

  return {
    overlayStyle: computed(() => overlayStyle.value),
    overlayRect: computed(() => overlayRect.value),
    isAttached: computed(() => isAttached.value),
    isVisible: computed(() => isVisible.value),
    updateOverlayPosition,
    attach,
    cleanup
  };
}

export default useLiveCaptionOverlay;
