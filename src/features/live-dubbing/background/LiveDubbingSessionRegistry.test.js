import { describe, expect, it } from 'vitest';
import { LiveDubbingSessionRegistry } from './LiveDubbingSessionRegistry.js';

describe('LiveDubbingSessionRegistry', () => {
  it('keeps exact session references and conditionally deletes them', () => {
    const registry = new LiveDubbingSessionRegistry();
    const state = { descriptor: { sessionId: 'session-1' } };
    const replacement = { descriptor: { sessionId: 'session-1' } };

    registry.setSessionState('session-1', state);
    expect(registry.getSessionState('session-1')).toBe(state);
    expect(registry.isSessionState('session-1', state)).toBe(true);
    expect(registry.deleteSessionState('session-1', replacement)).toBe(false);
    expect(registry.getSessionState('session-1')).toBe(state);
    registry.setSessionState('session-1', replacement);
    expect(registry.deleteSessionState('session-1', state)).toBe(false);
    expect(registry.deleteSessionState('session-1', replacement)).toBe(true);
    expect(registry.getSessionState('session-1')).toBeNull();
  });

  it('snapshots pending records without exposing the backing Set', () => {
    const registry = new LiveDubbingSessionRegistry();
    const first = { sessionId: 'session-1' };
    const second = { sessionId: 'session-1' };

    registry.addPendingStart(first);
    registry.addPendingStart(second);
    const snapshot = registry.listPendingStarts();
    snapshot.pop();
    expect(registry.listPendingStarts()).toEqual([first, second]);
    expect(registry.deletePendingStart({ ...first })).toBe(false);
    expect(registry.deletePendingStart(first)).toBe(true);
    expect(registry.listPendingStarts()).toEqual([second]);
  });

  it('finds pending starts by session and tab, including wildcard sessions', () => {
    const registry = new LiveDubbingSessionRegistry();
    const sessionOneUnresolved = { sessionId: 'session-1', tabId: null };
    const sessionOneTab = { sessionId: 'session-1', tabId: 42 };
    const sessionTwoUnresolved = { sessionId: 'session-2', tabId: null };
    const sessionTwoTab = { sessionId: 'session-2', tabId: 7 };
    registry.addPendingStart(sessionOneUnresolved);
    registry.addPendingStart(sessionOneTab);
    registry.addPendingStart(sessionTwoUnresolved);
    registry.addPendingStart(sessionTwoTab);

    expect(registry.findPendingStart('session-1')).toBe(sessionOneUnresolved);
    expect(registry.findPendingStart('session-1', 42)).toBe(sessionOneTab);
    expect(registry.findPendingStart(null, 42)).toBe(sessionOneTab);
    expect(registry.findPendingStart(undefined, 7)).toBe(sessionTwoTab);
    expect(registry.findPendingStart('missing')).toBeUndefined();
    expect(registry.findPendingStart('session-1', 7)).toBeUndefined();

    const unresolved = registry.listUnresolvedPendingStarts();
    expect(unresolved).toEqual([sessionOneUnresolved, sessionTwoUnresolved]);
    expect(unresolved[0]).toBe(sessionOneUnresolved);
    unresolved.pop();
    expect(registry.listUnresolvedPendingStarts()).toEqual([
      sessionOneUnresolved,
      sessionTwoUnresolved,
    ]);
  });

  it('conditionally deletes terminal operations without removing replacements', () => {
    const registry = new LiveDubbingSessionRegistry();
    const first = { promise: Promise.resolve() };
    const replacement = { promise: Promise.resolve() };

    registry.setTerminalOperation('session-1', first);
    expect(registry.hasTerminalOperation('session-1')).toBe(true);
    expect(registry.deleteTerminalOperation('session-1', replacement)).toBe(false);
    registry.setTerminalOperation('session-1', replacement);
    expect(registry.deleteTerminalOperation('session-1', first)).toBe(false);
    expect(registry.getTerminalOperation('session-1')).toBe(replacement);
    expect(registry.deleteTerminalOperation('session-1', replacement)).toBe(true);
    expect(registry.getTerminalOperation('session-1')).toBeNull();
  });

  it('keeps bootstrap reservations session-scoped', () => {
    const registry = new LiveDubbingSessionRegistry();

    expect(registry.reserveBootstrapSession('session-1')).toBeUndefined();
    expect(registry.hasBootstrapSession('session-1')).toBe(true);
    expect(registry.hasBootstrapSession('session-2')).toBe(false);
    expect(registry.releaseBootstrapSession('session-2')).toBe(false);
    expect(registry.hasBootstrapSession('session-1')).toBe(true);
    expect(registry.releaseBootstrapSession('session-1')).toBe(true);
    expect(registry.hasBootstrapSession('session-1')).toBe(false);
  });

  it('supports independent cleanup through narrow collection APIs', () => {
    const registry = new LiveDubbingSessionRegistry();
    const state = {};
    const pending = { sessionId: 'session-1' };
    const terminal = {};
    registry.setSessionState('session-1', state);
    registry.addPendingStart(pending);
    registry.setTerminalOperation('session-1', terminal);
    registry.reserveBootstrapSession('session-1');
    expect(registry.deleteSessionState('session-1', state)).toBe(true);
    expect(registry.deletePendingStart(pending)).toBe(true);
    expect(registry.deleteTerminalOperation('session-1', terminal)).toBe(true);
    expect(registry.releaseBootstrapSession('session-1')).toBe(true);
    expect(registry.getSessionState('session-1')).toBeNull();
    expect(registry.listPendingStarts()).toEqual([]);
    expect(registry.getTerminalOperation('session-1')).toBeNull();
    expect(registry.hasBootstrapSession('session-1')).toBe(false);
  });
});
