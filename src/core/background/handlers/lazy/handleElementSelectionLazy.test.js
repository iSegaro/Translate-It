import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/features/element-selection/utils/activationError.js', () => ({
  getSelectElementActivationErrorMessage: vi.fn(() => Promise.resolve('Could not activate Select Element mode.')),
}));

vi.mock('@/features/element-selection/handlers/handleActivateSelectElementMode.js', () => ({
  handleActivateSelectElementMode: vi.fn(() => {
    throw new Error('Failed to load chunk: INTERNAL_PORT_9f81');
  }),
}));
vi.mock('@/features/element-selection/handlers/handleDeactivateSelectElementMode.js', () => ({
  handleDeactivateSelectElementMode: vi.fn(),
}));
vi.mock('@/features/element-selection/handlers/handleGetSelectElementState.js', () => ({
  handleGetSelectElementState: vi.fn(),
}));
vi.mock('@/features/element-selection/handlers/handleSetSelectElementState.js', () => ({
  handleSetSelectElementState: vi.fn(),
}));

import { handleActivateSelectElementModeLazy } from './handleElementSelectionLazy.js';

describe('handleActivateSelectElementModeLazy', () => {
  it('returns safe feedback when activation handler fails internally', async () => {
    const response = await handleActivateSelectElementModeLazy({}, {});

    expect(response).toMatchObject({
      success: false,
      message: 'Could not activate Select Element mode.',
      error: 'Could not activate Select Element mode.',
    });
    expect(JSON.stringify(response)).not.toContain('INTERNAL_PORT_9f81');
  });
});
