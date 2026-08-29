import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModifierTriggerController,
  ModifierTriggerState,
  getTriggerKeys
} from './ModifierTriggerController.js';
import { OS_PLATFORMS } from '@/utils/browser/compatibility.js';

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

  it.each([
    [OS_PLATFORMS.WINDOWS, 'Control'],
    [OS_PLATFORMS.LINUX, 'Control'],
    [OS_PLATFORMS.MAC, 'Meta']
  ])('resolves primary on %s to %s', (platform, expectedKey) => {
    expect(getTriggerKeys('primary', platform)).toEqual(new Set([expectedKey]));
  });

  it('uses key identity instead of modifier flags', () => {
    controller = new ModifierTriggerController(OS_PLATFORMS.WINDOWS);
    controller.handleKeyDown(keyEvent('A', { ctrlKey: true }), 'primary');

    expect(controller.state).toBe(ModifierTriggerState.IDLE);
  });

  it('does not accept the legacy ctrl trigger value', () => {
    controller = new ModifierTriggerController(OS_PLATFORMS.WINDOWS);
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'ctrl');

    expect(controller.state).toBe(ModifierTriggerState.IDLE);
    expect(controller.handleKeyUp(keyEvent('Control'), 'ctrl')).toBe(false);
  });

  it.each([OS_PLATFORMS.WINDOWS, OS_PLATFORMS.LINUX])(
    'primary moves to pending on standalone Control and triggers on release on %s',
    (platform) => {
      controller = new ModifierTriggerController(platform);
      controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'primary');

      expect(controller.state).toBe(ModifierTriggerState.PENDING);
      expect(controller.handleKeyUp(keyEvent('Control'), 'primary')).toBe(true);
      expect(controller.state).toBe(ModifierTriggerState.IDLE);
    }
  );

  it.each(['A', 'C'])('invalidates Ctrl+%s', (key) => {
    controller = new ModifierTriggerController(OS_PLATFORMS.WINDOWS);
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'primary');
    controller.handleKeyDown(keyEvent(key, { ctrlKey: true }), 'primary');

    expect(controller.state).toBe(ModifierTriggerState.INVALID);
    expect(controller.handleKeyUp(keyEvent('Control'), 'primary')).toBe(false);
  });

  it('invalidates Shift+A', () => {
    controller.handleKeyDown(keyEvent('Shift', { shiftKey: true }), 'shift');
    controller.handleKeyDown(keyEvent('A', { shiftKey: true }), 'shift');

    expect(controller.handleKeyUp(keyEvent('Shift'), 'shift')).toBe(false);
  });

  it('invalidates Ctrl+Shift regardless of press order', () => {
    controller = new ModifierTriggerController(OS_PLATFORMS.WINDOWS);
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'primary');
    controller.handleKeyDown(keyEvent('Shift', { ctrlKey: true, shiftKey: true }), 'primary');
    expect(controller.handleKeyUp(keyEvent('Control'), 'primary')).toBe(false);

    controller.reset();
    controller.handleKeyDown(keyEvent('Shift', { shiftKey: true }), 'primary');
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true, shiftKey: true }), 'primary');
    expect(controller.state).toBe(ModifierTriggerState.IDLE);
    expect(controller.handleKeyUp(keyEvent('Control'), 'primary')).toBe(false);
  });

  it('supports standalone Alt and Shift triggers', () => {
    controller.handleKeyDown(keyEvent('Alt', { altKey: true }), 'alt');
    expect(controller.handleKeyUp(keyEvent('Alt'), 'alt')).toBe(true);

    controller.handleKeyDown(keyEvent('Shift', { shiftKey: true }), 'shift');
    expect(controller.handleKeyUp(keyEvent('Shift'), 'shift')).toBe(true);
  });

  it('ignores repeated modifier keydown', () => {
    controller = new ModifierTriggerController(OS_PLATFORMS.WINDOWS);
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'primary');
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true, repeat: true }), 'primary');

    expect(controller.handleKeyUp(keyEvent('Control'), 'primary')).toBe(true);
    expect(controller.handleKeyUp(keyEvent('Control'), 'primary')).toBe(false);
  });

  it('primary accepts Meta on macOS and rejects Control', () => {
    controller = new ModifierTriggerController(OS_PLATFORMS.MAC);
    controller.handleKeyDown(keyEvent('Meta', { metaKey: true }), 'primary');

    expect(controller.handleKeyUp(keyEvent('Meta'), 'primary')).toBe(true);

    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'primary');
    expect(controller.state).toBe(ModifierTriggerState.IDLE);
    expect(controller.handleKeyUp(keyEvent('Control'), 'primary')).toBe(false);
  });

  it.each([OS_PLATFORMS.WINDOWS, OS_PLATFORMS.LINUX])(
    'primary rejects Meta on %s',
    (platform) => {
      controller = new ModifierTriggerController(platform);
      controller.handleKeyDown(keyEvent('Meta', { metaKey: true }), 'primary');

      expect(controller.state).toBe(ModifierTriggerState.IDLE);
      expect(controller.handleKeyUp(keyEvent('Meta'), 'primary')).toBe(false);
    }
  );

  it('control accepts Control and rejects Meta on macOS', () => {
    controller = new ModifierTriggerController(OS_PLATFORMS.MAC);
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'control');

    expect(controller.handleKeyUp(keyEvent('Control'), 'control')).toBe(true);

    controller.handleKeyDown(keyEvent('Meta', { metaKey: true }), 'control');
    expect(controller.state).toBe(ModifierTriggerState.IDLE);
    expect(controller.handleKeyUp(keyEvent('Meta'), 'control')).toBe(false);
  });

  it('keeps Alt and Shift trigger identities unchanged on macOS', () => {
    controller = new ModifierTriggerController(OS_PLATFORMS.MAC);
    expect(getTriggerKeys('alt', OS_PLATFORMS.MAC)).toEqual(new Set(['Alt']));
    expect(getTriggerKeys('shift', OS_PLATFORMS.MAC)).toEqual(new Set(['Shift']));

    controller.handleKeyDown(keyEvent('Alt', { altKey: true }), 'alt');
    expect(controller.handleKeyUp(keyEvent('Alt'), 'alt')).toBe(true);
    controller.handleKeyDown(keyEvent('Shift', { shiftKey: true }), 'shift');
    expect(controller.handleKeyUp(keyEvent('Shift'), 'shift')).toBe(true);
  });

  it('invalidates pending gesture on interaction and resets explicitly', () => {
    controller = new ModifierTriggerController(OS_PLATFORMS.WINDOWS);
    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'primary');
    controller.invalidate();

    expect(controller.state).toBe(ModifierTriggerState.INVALID);
    expect(controller.handleKeyUp(keyEvent('Control'), 'primary')).toBe(false);

    controller.handleKeyDown(keyEvent('Control', { ctrlKey: true }), 'primary');
    controller.reset();

    expect(controller.state).toBe(ModifierTriggerState.IDLE);
    expect(controller.pressedKeys.size).toBe(0);
  });
});
