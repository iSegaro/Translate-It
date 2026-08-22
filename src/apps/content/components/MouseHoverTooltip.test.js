import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import MouseHoverTooltip from './MouseHoverTooltip.vue';
import { pageEventBus } from '@/core/PageEventBus.js';

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
    expect(emitSpy).toHaveBeenCalledWith('MOUSE_HOVER_TOOLTIP_HIDDEN');
  });
});
