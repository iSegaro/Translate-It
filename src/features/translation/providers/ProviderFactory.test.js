import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderFactory } from './ProviderFactory.js';

// Mock ProviderRegistry
vi.mock("./ProviderRegistry.js", () => {
  const mockAvailable = [
    { id: 'google', name: 'Google Translate', isLazy: false },
    { id: 'gemini', name: 'Google Gemini', isLazy: true }
  ];
  
  return {
    providerRegistry: {
      get: vi.fn(),
      getAllAvailable: vi.fn(() => mockAvailable),
      isProviderAvailable: vi.fn(id => mockAvailable.some(p => p.id === id))
    }
  };
});

describe('ProviderFactory', () => {
  let factory;

  beforeEach(() => {
    vi.clearAllMocks();
    factory = new ProviderFactory();
  });

  describe('getProvider', () => {
    it('should create and cache provider instance', async () => {
      const { providerRegistry } = await import("./ProviderRegistry.js");
      class MockProvider { constructor() { this.name = 'Mock'; } }
      providerRegistry.get.mockResolvedValue(MockProvider);

      const p1 = await factory.getProvider('google');
      const p2 = await factory.getProvider('google');

      expect(p1).toBeInstanceOf(MockProvider);
      expect(p1).toBe(p2); // Same instance (cached)
      expect(providerRegistry.get).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent requests for the same provider gracefully', async () => {
      const { providerRegistry } = await import("./ProviderRegistry.js");
      class MockProvider {}
      
      // Simulate slow registry lookup
      providerRegistry.get.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(MockProvider), 50))
      );

      // Start 3 requests simultaneously
      const [p1, p2, p3] = await Promise.all([
        factory.getProvider('google'),
        factory.getProvider('google'),
        factory.getProvider('google')
      ]);

      expect(p1).toBe(p2);
      expect(p2).toBe(p3);
      expect(providerRegistry.get).toHaveBeenCalledTimes(1);
    });

    it('should throw meaningful error if creation fails', async () => {
      const { providerRegistry } = await import("./ProviderRegistry.js");
      providerRegistry.get.mockRejectedValue(new Error('Registry Error'));

      await expect(factory.getProvider('unknown'))
        .rejects.toThrow(/Failed to create provider instance/);
    });
  });

  describe('Utility Methods', () => {
    it('should return supported providers list', () => {
      const supported = factory.getSupportedProviders();
      expect(supported.length).toBe(2);
      expect(supported[0].id).toBe('google');
    });

    it('should reset cached instances', async () => {
      const { providerRegistry } = await import("./ProviderRegistry.js");
      providerRegistry.get.mockResolvedValue(class Mock {});

      await factory.getProvider('google');
      expect(factory.providerInstances.size).toBe(1);

      factory.resetProviders();
      expect(factory.providerInstances.size).toBe(0);
    });
  });
});
