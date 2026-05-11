import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useScreenCapture } from '../useScreenCapture.js';

// Mock useExtensionAPI
vi.mock('@/composables/core/useExtensionAPI.js', () => ({
  useExtensionAPI: () => ({
    startScreenCapture: vi.fn().mockResolvedValue(true),
    captureScreenArea: vi.fn().mockResolvedValue({ 
      success: true, 
      data: { imageData: 'data:image/png;base64,test', text: 'extracted' } 
    })
  })
}));

describe('useScreenCapture', () => {
  let wrapper;
  let composable;

  const TestComponent = defineComponent({
    setup() {
      composable = useScreenCapture();
      return () => h('div', { id: 'container', onMousedown: composable.startSelection });
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    wrapper = mount(TestComponent, {
      attachTo: document.body
    });
  });

  afterEach(() => {
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('should initialize with default values', () => {
    expect(composable.isSelecting.value).toBe(false);
    expect(composable.isCapturing.value).toBe(false);
    expect(composable.hasSelection.value).toBe(false);
  });

  it('should start selection on mousedown', () => {
    const container = wrapper.find('#container');
    container.trigger('mousedown', { clientX: 10, clientY: 10 });

    expect(composable.isSelecting.value).toBe(true);
    expect(document.body.style.userSelect).toBe('none');
  });

  it('should update selection rect on mousemove', async () => {
    const container = wrapper.find('#container');
    await container.trigger('mousedown', { clientX: 10, clientY: 10 });

    // Mock getBoundingClientRect for the container
    vi.spyOn(container.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 1000, height: 1000
    });

    // Directly call the handler because document listeners are hard to trigger via wrapper
    composable.startSelection({ 
      clientX: 10, clientY: 10, 
      currentTarget: container.element,
      preventDefault: vi.fn()
    });

    // Simulate mouse move
    const moveEvent = new MouseEvent('mousemove', { clientX: 50, clientY: 60 });
    document.dispatchEvent(moveEvent);

    expect(composable.selectionRect.value).toEqual({
      x: 10, y: 10, width: 40, height: 50
    });
    expect(composable.hasSelection.value).toBe(true);
  });

  it('should stop selecting on mouseup', async () => {
    const container = wrapper.find('#container');
    composable.startSelection({ 
      clientX: 10, clientY: 10, 
      currentTarget: container.element,
      preventDefault: vi.fn()
    });
    
    expect(composable.isSelecting.value).toBe(true);
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(composable.isSelecting.value).toBe(false);
  });

  it('should cancel selection on Escape key', () => {
    const container = wrapper.find('#container');
    composable.startSelection({ 
      clientX: 10, clientY: 10, 
      currentTarget: container.element,
      preventDefault: vi.fn()
    });
    
    expect(composable.isSelecting.value).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    
    expect(composable.isSelecting.value).toBe(false);
    expect(composable.selectionRect.value.width).toBe(0);
  });

  it('should confirm selection and call captureScreenArea', async () => {
    composable.selectionRect.value = { x: 10, y: 10, width: 100, height: 100 };
    
    const result = await composable.confirmSelection();
    
    expect(result.text).toBe('extracted');
    expect(composable.isCapturing.value).toBe(false);
  });

  it('should cleanup on unmount', () => {
    composable.isSelecting.value = true;
    
    wrapper.unmount();
    
    expect(composable.isSelecting.value).toBe(false);
  });
});
