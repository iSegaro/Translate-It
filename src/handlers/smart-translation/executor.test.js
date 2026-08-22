import { describe, expect, it } from 'vitest';

import { strategyLoaders } from './executor.js';

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
