import { beforeEach, describe, expect, it, vi } from 'vitest';

const strategyCalls = vi.hoisted(() => []);

vi.mock('@/features/text-field-interaction/strategies/DefaultStrategy.js', () => ({
  default: class MockDefaultStrategy {
    async updateElement(...args) {
      strategyCalls.push(args);
      return true;
    }
  },
}));

import { applyTranslation, strategyLoaders } from './executor.js';

const productionStrategies = [
  'DefaultStrategy',
  'ChatGPTStrategy',
  'InstagramStrategy',
  'YoutubeStrategy',
  'TwitterStrategy',
  'WhatsAppStrategy',
  'TelegramStrategy',
  'MediumStrategy',
  'DiscordStrategy',
];

describe('strategyLoaders', () => {
  it('lazy-loads every production strategy', async () => {
    for (const strategyName of productionStrategies) {
      const strategyModule = await strategyLoaders[strategyName]();

      expect(strategyModule.default).toBeTypeOf('function');
    }
  });

  it('contains no test modules and preserves unknown strategy failure behavior', async () => {
    expect(Object.keys(strategyLoaders).every(name => !/\.test\.js$|\.spec\.js$/.test(name))).toBe(true);
    expect(() => strategyLoaders.UnknownStrategy()).toThrow(TypeError);
  });
});

describe('applyTranslation canonical Field scope', () => {
  beforeEach(() => {
    strategyCalls.length = 0;
  });

  it('forwards the service-attached scope to the strategy via applicationContext', async () => {
    const field = document.createElement('textarea');
    field.value = 'Hello سلام world';
    document.body.appendChild(field);

    const fieldSource = {
      scope: 'selection',
      range: { start: 6, end: 10 },
      expectedSelectedText: 'سلام',
    };

    await applyTranslation('hello', { start: 6, end: 10 }, 'default', null, field, null, {
      isCurrent: () => true,
      fieldSource,
    });

    expect(strategyCalls).toHaveLength(1);
    const [, , scopedContext] = strategyCalls[0];
    expect(scopedContext.fieldSource).toEqual(fieldSource);

    document.body.removeChild(field);
  });

  it('passes legacy descriptor-absent contexts through untouched', async () => {
    const field = document.createElement('textarea');
    field.value = 'hello';
    document.body.appendChild(field);

    const legacyContext = { isCurrent: () => true };

    await applyTranslation('hello', null, 'default', null, field, null, legacyContext);

    expect(strategyCalls).toHaveLength(1);
    const [, , scopedContext] = strategyCalls[0];
    expect(scopedContext).toBe(legacyContext);

    document.body.removeChild(field);
  });
});
