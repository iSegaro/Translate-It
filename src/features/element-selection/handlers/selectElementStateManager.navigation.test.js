import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { sendMessage: vi.fn(() => Promise.resolve()) },
    tabs: { sendMessage: vi.fn(() => Promise.resolve({ success: true })), onRemoved: { addListener: vi.fn() }, onActivated: { addListener: vi.fn() } },
    webNavigation: { onCommitted: { addListener: vi.fn() }, getAllFrames: vi.fn(() => Promise.resolve([])) }
  }
}));
vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: { DEACTIVATE_SELECT_ELEMENT_MODE: 'DEACTIVATE_SELECT_ELEMENT_MODE', SELECT_ELEMENT_STATE_CHANGED: 'selectElementStateChanged' }
}));
vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessagingContexts: { BACKGROUND: 'BACKGROUND', CONTENT: 'CONTENT' },
  MessageFormat: { create: vi.fn((a,b,c)=>({action:a,data:b,context:c})) }
}));
vi.mock('@/features/exclusion/utils/exclusion-utils.js', () => ({ checkUrlExclusionAsync: vi.fn(()=>Promise.resolve(false)) }));
vi.mock('@/core/tabPermissions.js', () => ({ tabPermissionChecker: { checkTabAccess: vi.fn() } }));

import {
  createActivationGeneration,
  recordActivationAttemptFrames,
  completeActivationAttempt,
  getActivationAttemptToken,
  getProvisionalCleanupFrames,
  registerParticipant,
  getParticipants,
  clearTabParticipants,
  setStateForTab,
  clearStateForTab,
} from './selectElementStateManager.js';

const onCommittedListener = browser.webNavigation.onCommitted.addListener.mock.calls[0][0];

describe('A5-06 navigation retirement via onCommitted',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    clearTabParticipants(700);
    clearTabParticipants(701);
    clearStateForTab(700);
    clearStateForTab(701);
  });
  it('retires D1 debt when D2 commits via real listener',()=>{
    const tabId=700;
    setStateForTab(tabId,true);
    const g1=createActivationGeneration(tabId);
    recordActivationAttemptFrames(tabId,g1,[{frameId:5,documentId:'D1'}]);
    completeActivationAttempt(tabId,g1,getActivationAttemptToken(tabId));
    const g2Debt=createActivationGeneration(tabId);
    recordActivationAttemptFrames(tabId,g2Debt,[{frameId:5,documentId:'D2'}]);
    completeActivationAttempt(tabId,g2Debt,getActivationAttemptToken(tabId));
    const g2=createActivationGeneration(tabId);
    registerParticipant(tabId,5,g2,'D2');
    // unrelated debt frame 9 DX
    const g3=createActivationGeneration(tabId);
    recordActivationAttemptFrames(tabId,g3,[{frameId:9,documentId:'DX'}]);
    completeActivationAttempt(tabId,g3,getActivationAttemptToken(tabId));
    const before=getProvisionalCleanupFrames(tabId);
    expect(before.some(e=>e.frameId===5 && e.documentId==='D1')).toBe(true);
    expect(before.some(e=>e.frameId===5 && e.documentId==='D2')).toBe(true);
    expect(before.some(e=>e.frameId===9 && e.documentId==='DX')).toBe(true);

    onCommittedListener({tabId, frameId:5, documentId:'D2'});

    const after=getProvisionalCleanupFrames(tabId);
    expect(after.some(e=>e.frameId===5 && e.documentId==='D1')).toBe(false);
    expect(after.some(e=>e.frameId===5 && e.documentId==='D2')).toBe(true);
    expect(getParticipants(tabId).get(5)).toBe(g2);
    expect(after.some(e=>e.frameId===9 && e.documentId==='DX')).toBe(true);
  });
  it('unknown documentId preserves legacy whole-frame clear',()=>{
    const tabId=701;
    setStateForTab(tabId,true);
    const g1=createActivationGeneration(tabId);
    recordActivationAttemptFrames(tabId,g1,[{frameId:5,documentId:'D1'}]);
    completeActivationAttempt(tabId,g1,getActivationAttemptToken(tabId));
    const g2=createActivationGeneration(tabId);
    registerParticipant(tabId,5,g2,'D2');
    // unknown commit should trigger legacy fallback (clears whole frame provisional)
    onCommittedListener({tabId, frameId:5, documentId: undefined });
    const after=getProvisionalCleanupFrames(tabId);
    expect(after.some(e=>e.frameId===5)).toBe(false);
    // participant handling for unknown is legacy frame removal, but participant may remain? Check participant still? For unknown, removeParticipant fallback may clear
    // At least provisional cleared
  });
});
