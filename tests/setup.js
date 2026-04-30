import { vi } from 'vitest';
import { config } from '@vue/test-utils';

// Mock Web Extension APIs
const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    getURL: vi.fn((path) => path),
    getManifest: vi.fn(() => ({ version: '1.0.0' })),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
  },
  i18n: {
    getMessage: vi.fn((key) => key),
  },
};

globalThis.chrome = chromeMock;
globalThis.browser = chromeMock;

// Mock import.meta.env
globalThis.import = {
  meta: {
    env: {
      MODE: 'test',
      VITE_DEBUG_MODE: 'true',
    },
  },
};

// Global Vue Test Utils config
config.global.stubs = {
  // Add global stubs here if needed
};

config.global.mocks = {
  $t: (msg) => msg,
  $tm: (msg) => msg,
};

// Console silencing (optional: only silence debug/info during tests)
// vi.spyOn(console, 'debug').mockImplementation(() => {});
