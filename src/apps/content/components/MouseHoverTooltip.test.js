import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import MouseHoverTooltip from './MouseHoverTooltip.vue';
import { pageEventBus } from '@/core/PageEventBus.js';
import { useSettingsStore } from '@/features/settings/stores/settings.js';

// Mock dependencies
vi.mock('@/core/PageEventBus.js', () => ({
  pageEventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}));

vi.mock('@/shared/managers/SettingsManager.js', () => ({
  settingsManager: {
    get: vi.fn((key, def) => def)
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

// Mock TranslationDisplay
vi.mock('@/components/shared/TranslationDisplay.vue', () => ({
  default: {
    name: 'TranslationDisplay',
    props: ['content', 'direction'],
    template: '<div class="translation-display">{{ content }}</div>'
  }
}));

describe('MouseHoverTooltip', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should be hidden by default', () => {
    const wrapper = mount(MouseHoverTooltip);
    expect(wrapper.vm.isVisible).toBe(false);
  });

  it('should show when MOUSE_HOVER_TRANSLATION_READY is emitted', async () => {
    const wrapper = mount(MouseHoverTooltip);
    
    // Find the listener for MOUSE_HOVER_TRANSLATION_READY
    const calls = pageEventBus.on.mock.calls;
    const readyCall = calls.find(call => call[0] === 'MOUSE_HOVER_TRANSLATION_READY');
    expect(readyCall).toBeDefined();
    const listener = readyCall[1];
    
    await listener({
      originalText: 'Hello',
      translatedText: 'سلام',
      position: { x: 100, y: 100 },
      direction: 'rtl'
    });

    // Wait for nextTicks in showTooltip
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isVisible).toBe(true);
    expect(wrapper.text()).toContain('سلام');
  });

  it('renders only message and type from adapted hover error payload', async () => {
    const wrapper = mount(MouseHoverTooltip);
    const errorCall = pageEventBus.on.mock.calls.find(call => call[0] === 'MOUSE_HOVER_TRANSLATION_ERROR');
    const listener = errorCall[1];
    const displayError = Object.assign(new Error('Localized safe message'), {
      type: 'HTTP_ERROR'
    });

    listener({ error: displayError });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isVisible).toBe(true);
    expect(wrapper.vm.errorMessage).toBe('Localized safe message');
    expect(wrapper.vm.errorType).toBe('HTTP_ERROR');
  });

  it('should hide when MOUSE_HOVER_HIDE_TOOLTIP is emitted', async () => {
    const wrapper = mount(MouseHoverTooltip);
    wrapper.vm.isVisible = true;
    
    const hideCall = pageEventBus.on.mock.calls.find(call => call[0] === 'MOUSE_HOVER_HIDE_TOOLTIP');
    const listener = hideCall[1];
    
    await listener();
    expect(wrapper.vm.isVisible).toBe(false);
  });

  it('should calculate position correctly (above cursor)', async () => {
    const wrapper = mount(MouseHoverTooltip);
    wrapper.vm.isVisible = true;
    
    await wrapper.vm.$nextTick();
    const tooltip = wrapper.find('.ti-mouse-hover-tooltip');
    vi.spyOn(tooltip.element, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 100 });

    window.innerHeight = 1000;
    wrapper.vm.calculatePosition({ x: 500, y: 500 });

    expect(wrapper.vm.position.y).toBeLessThan(500); // Should be above
  });

  it('should flip to bottom if not enough space at top', async () => {
    const wrapper = mount(MouseHoverTooltip);
    wrapper.vm.isVisible = true;
    
    await wrapper.vm.$nextTick();
    const tooltip = wrapper.find('.ti-mouse-hover-tooltip');
    vi.spyOn(tooltip.element, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 100 });

    window.innerHeight = 1000;
    wrapper.vm.calculatePosition({ x: 500, y: 5 }); // Very close to top

    expect(wrapper.vm.position.y).toBeGreaterThan(5); // Should be below
  });

  it('should hide on mouseleave if not over tooltip', async () => {
    const wrapper = mount(MouseHoverTooltip);
    wrapper.vm.isVisible = true;
    
    // Manually trigger hideTooltip logic
    const emitSpy = vi.spyOn(pageEventBus, 'emit');
    wrapper.vm.hideTooltip();
    
    expect(wrapper.vm.isVisible).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_TOOLTIP_HIDDEN', { hoverId: null, frameId: 0 });
  });

  it('emits tokenized pointer events only while visible and returns token on hide', async () => {
    const wrapper = mount(MouseHoverTooltip);
    const ready = pageEventBus.on.mock.calls.find(([type]) => type === 'MOUSE_HOVER_TRANSLATION_READY')[1];
    await ready({ translatedText: 'translated', hoverId: 'hover-1', frameId: 7, position: { x: 10, y: 10 } });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    await wrapper.find('.ti-mouse-hover-tooltip').trigger('pointerenter');
    expect(pageEventBus.emit).toHaveBeenCalledWith('MOUSE_HOVER_TOOLTIP_POINTER_ENTER', { hoverId: 'hover-1', frameId: 7 });
    wrapper.vm.hideTooltip({ hoverId: 'old-hover' });
    expect(wrapper.vm.isVisible).toBe(true);
    wrapper.vm.hideTooltip({ hoverId: 'hover-1' });
    expect(pageEventBus.emit).toHaveBeenCalledWith('MOUSE_HOVER_TOOLTIP_HIDDEN', { hoverId: 'hover-1', frameId: 7 });
  });

  it('does not reopen after a pending show is hidden before nextTick completes', async () => {
    const wrapper = mount(MouseHoverTooltip);
    const showing = wrapper.vm.showTooltip({
      translatedText: 'translated', hoverId: 'hover-pending', frameId: 0,
      position: { x: 10, y: 10 }
    });
    wrapper.vm.hideTooltip({ hoverId: 'hover-pending' });
    await showing;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isVisible).toBe(false);
    expect(wrapper.find('.ti-mouse-hover-tooltip').exists()).toBe(false);
  });

  it('acknowledges a replaced display once while streaming updates retain the new token', async () => {
    const wrapper = mount(MouseHoverTooltip);
    const emitSpy = vi.spyOn(pageEventBus, 'emit');
    await wrapper.vm.showTooltip({
      translatedText: 'translation A', hoverId: 'hover-a', frameId: 0,
      position: { x: 10, y: 10 }, isStreaming: true
    });
    await wrapper.vm.showTooltip({
      translatedText: 'translation B', hoverId: 'hover-b', frameId: 4,
      position: { x: 20, y: 20 }, isStreaming: true
    });
    await wrapper.vm.showTooltip({
      translatedText: 'translation B continued', hoverId: 'hover-b', frameId: 4,
      position: { x: 20, y: 20 }, isStreaming: true
    });

    expect(emitSpy.mock.calls.filter(([type]) => type === 'MOUSE_HOVER_TOOLTIP_HIDDEN')).toEqual([
      ['MOUSE_HOVER_TOOLTIP_HIDDEN', { hoverId: 'hover-a', frameId: 0 }]
    ]);
    expect(wrapper.vm.isVisible).toBe(true);
    expect(wrapper.vm.hoverId).toBe('hover-b');
    expect(wrapper.vm.translatedText).toBe('translation B continued');
  });

  it('does not let timer A hide replacement B or extend B timer', async () => {
    vi.useFakeTimers();
    try {
      const settings = useSettingsStore();
      settings.settings.MOUSE_HOVER_AUTO_CLOSE = 'timer';
      settings.settings.MOUSE_HOVER_TIMER_DURATION = 3000;
      const wrapper = mount(MouseHoverTooltip);
      await wrapper.vm.showTooltip({
        translatedText: 'translation A', hoverId: 'timer-a', frameId: 0,
        position: { x: 10, y: 10 }, isStreaming: false
      });
      await vi.advanceTimersByTimeAsync(1000);
      await wrapper.vm.showTooltip({
        translatedText: 'translation B', hoverId: 'timer-b', frameId: 0,
        position: { x: 20, y: 20 }, isStreaming: false
      });

      await vi.advanceTimersByTimeAsync(2000);
      expect(wrapper.vm.isVisible).toBe(true);
      expect(wrapper.vm.hoverId).toBe('timer-b');
      await vi.advanceTimersByTimeAsync(1000);
      expect(wrapper.vm.isVisible).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
