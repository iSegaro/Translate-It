import { describe, it, expect, vi } from 'vitest';
import ElementDetectionService from '@/shared/services/ElementDetectionService.js';
import { SimpleTextSelectionHandler } from './SimpleTextSelectionHandler.js';

vi.mock('@/shared/services/ElementDetectionService.js', () => ({
  default: {
    isUIElement: vi.fn(() => false),
    getClickedUIElement: vi.fn(() => null)
  }
}));

/**
 * Focused tests for diagnostic event-path capture in SimpleTextSelectionHandler.
 *
 * In real browsers, event.composedPath() only returns the full path while the
 * event is being dispatched; afterwards it returns an empty array. The handler
 * must classify the path synchronously inside handleMouseUp and store only
 * primitive diagnostic metadata. Classification must be side-effect-free:
 * it uses direct Element.matches() and never touches the cached
 * ElementDetectionService.isUIElement().
 */
describe('SimpleTextSelectionHandler diagnostic capture', () => {
  it('classifies inside-UI composed path during handleMouseUp and reads stored metadata afterwards', () => {
    const handler = new SimpleTextSelectionHandler();
    ElementDetectionService.getClickedUIElement.mockReturnValue(null);

    // First composedPath() call (during dispatch) returns the real path;
    // later calls return empty, simulating post-dispatch behavior.
    const pathDuringDispatch = [
      document.createElement('div'),
      document.createElement('div')
    ];
    pathDuringDispatch[1].classList.add('translation-window'); // matches UI_ELEMENTS
    let composedPathCalls = 0;
    const event = new MouseEvent('mouseup', { bubbles: true });
    event.composedPath = () => {
      composedPathCalls += 1;
      return composedPathCalls === 1 ? pathDuringDispatch : [];
    };

    handler.handleMouseUp(event);

    // Classified synchronously during handleMouseUp, never re-read afterwards.
    expect(composedPathCalls).toBe(1);
    expect(handler._lastMouseUpDiagnostics).toEqual({
      timestamp: handler.lastMouseEventTime,
      composedPathHasUi: true
    });

    // Inside-window detection behavior is unchanged (driven by
    // getClickedUIElement, not by the diagnostic metadata).
    expect(handler.isClickInsideTranslationWindow()).toBe(false);
    expect(composedPathCalls).toBe(1);
  });

  it('classifies outside-UI composed path as false with the same mechanism', () => {
    const handler = new SimpleTextSelectionHandler();
    ElementDetectionService.getClickedUIElement.mockReturnValue(null);

    const event = new MouseEvent('mouseup', { bubbles: true });
    event.composedPath = () => [document.createElement('div'), document.body];

    handler.handleMouseUp(event);

    expect(handler._lastMouseUpDiagnostics).toEqual({
      timestamp: handler.lastMouseEventTime,
      composedPathHasUi: false
    });
  });

  it('keeps inside-window detection true when the service identifies UI and stores no DOM nodes', () => {
    const handler = new SimpleTextSelectionHandler();
    const uiNode = document.createElement('div');
    ElementDetectionService.getClickedUIElement.mockReturnValue({
      type: 'window',
      element: uiNode
    });

    const event = new MouseEvent('mouseup', { bubbles: true });
    event.composedPath = () => [document.createElement('div'), uiNode];
    handler.handleMouseUp(event);

    expect(handler.isClickInsideTranslationWindow()).toBe(true);
    // Metadata holds primitives only, no event path or DOM nodes.
    expect(Object.values(handler._lastMouseUpDiagnostics).every((v) => typeof v !== 'object')).toBe(true);
  });

  it('never invokes the cached ElementDetectionService.isUIElement for diagnostics', () => {
    const handler = new SimpleTextSelectionHandler();

    const insideEvent = new MouseEvent('mouseup', { bubbles: true });
    insideEvent.composedPath = () => [
      document.createElement('div'),
      Object.assign(document.createElement('div'), { className: 'translation-icon' })
    ];
    handler.handleMouseUp(insideEvent);
    handler.isClickInsideTranslationWindow();

    const outsideEvent = new MouseEvent('mouseup', { bubbles: true });
    outsideEvent.composedPath = () => [document.createElement('span')];
    handler.handleMouseUp(outsideEvent);
    handler.isClickInsideTranslationWindow();

    expect(ElementDetectionService.isUIElement).not.toHaveBeenCalled();
  });
});
