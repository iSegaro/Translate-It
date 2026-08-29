import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModifierTriggerController,
  ModifierTriggerState
} from './ModifierTriggerController.js';

const keyEvent = (key, options = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  repeat: false,
  ...options
});

describe('ModifierTriggerController', () => {
  let controller;

  beforeEach(() => {
    controller = new ModifierTriggerController();
  });

  it('uses key identity instead of modifier flags', () => {
    controller.handleKeyDown(keyEvent('A', { ctrlKey: true }), 'ctrl');

    expect(controller.state).toBe(ModifierTriggerState.IDLE);
  });

  it('moves to pending on standalone Control and triggers on release', () => {
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'ctrl');

    expect(controller.state).toBe(ModifierTriggerState.PENDING);
    expect(controller.handleKeyUp(keyEvent('Control'), 'ctrl')).toBe(true);
    expect(controller.state).toBe(ModifierTriggerState.IDLE);
  });

  it.each(['A', 'C'])('invalidates Ctrl+%s', (key) => {
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'ctrl');
    controller.handleKeyDown(keyEvent(key, { ctrlKey: true }), 'ctrl');

    expect(controller.state).toBe(ModifierTriggerState.INVALID);
    expect(controller.handleKeyUp(keyEvent('Control'), 'ctrl')).toBe(false);
  });

  it('invalidates Shift+A', () => {
    controller.handleKeyDown(keyEvent('Shift', { shiftKey: true }), 'shift');
    controller.handleKeyDown(keyEvent('A', { shiftKey: true }), 'shift');

    expect(controller.handleKeyUp(keyEvent('Shift'), 'shift')).toBe(false);
  });

  it('invalidates Ctrl+Shift regardless of press order', () => {
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'ctrl');
    controller.handleKeyDown(keyEvent('Shift', { ctrlKey: true, shiftKey: true }), 'ctrl');
    expect(controller.handleKeyUp(keyEvent('Control'), 'ctrl')).toBe(false);

    controller.reset();
    controller.handleKeyDown(keyEvent('Shift', { shiftKey: true }), 'ctrl');
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true, shiftKey: true }), 'ctrl');
    expect(controller.state).toBe(ModifierTriggerState.IDLE);
    expect(controller.handleKeyUp(keyEvent('Control'), 'ctrl')).toBe(false);
  });

  it('supports standalone Alt and Shift triggers', () => {
    controller.handleKeyDown(keyEvent('Alt', { altKey: true }), 'alt');
    expect(controller.handleKeyUp(keyEvent('Alt'), 'alt')).toBe(true);

    controller.handleKeyDown(keyEvent('Shift', { shiftKey: true }), 'shift');
    expect(controller.handleKeyUp(keyEvent('Shift'), 'shift')).toBe(true);
  });

  it('ignores repeated modifier keydown', () => {
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'ctrl');
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true, repeat: true }), 'ctrl');

    expect(controller.handleKeyUp(keyEvent('Control'), 'ctrl')).toBe(true);
    expect(controller.handleKeyUp(keyEvent('Control'), 'ctrl')).toBe(false);
  });

  it('accepts Meta as the ctrl trigger equivalent', () => {
    controller.handleKeyDown(keyEvent('Meta', { metaKey: true }), 'ctrl');

    expect(controller.handleKeyUp(keyEvent('Meta'), 'ctrl')).toBe(true);
  });

  it('invalidates pending gesture on interaction and resets explicitly', () => {
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'ctrl');
    controller.invalidate();

    expect(controller.state).toBe(ModifierTriggerState.INVALID);
    expect(controller.handleKeyUp(keyEvent('Control'), 'ctrl')).toBe(false);

    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'ctrl');
    controller.reset();

    expect(controller.state).toBe(ModifierTriggerState.IDLE);
    expect(controller.pressedKeys.size).toBe(0);
  });
});
