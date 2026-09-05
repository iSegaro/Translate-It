import { describe, expect, it } from 'vitest';
import { MessageActions } from './MessageActions.js';

describe('MessageActions provider status removal', () => {
  it('does not define or validate the removed provider status action', () => {
    expect(MessageActions).not.toHaveProperty('GET_PROVIDER_STATUS');
    expect(MessageActions.isValidAction('GET_PROVIDER_STATUS')).toBe(false);
  });
});
