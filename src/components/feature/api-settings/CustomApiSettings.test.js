import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import CustomApiSettings from './CustomApiSettings.vue';
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js';
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';

// Fake translation catalog: resolves keys the way vue-i18n would, so tests
// verify which semantic message the UI selects (and its params), not key names.
const CATALOG = {
  custom_api_test_connection: 'Test Connection',
  custom_api_testing_connection: 'Testing…',
  custom_api_not_tested: 'Not tested',
  custom_api_connection_success: 'TRANSLATED SUCCESS',
  custom_api_connection_fallback: 'TRANSLATED FALLBACK',
  custom_api_connection_inconclusive: 'TRANSLATED INCONCLUSIVE',
  custom_api_connection_unreachable: 'TRANSLATED UNREACHABLE',
  custom_api_connection_auth_failed: 'TRANSLATED AUTH',
  custom_api_connection_completion_failed: 'TRANSLATED COMPLETION',
  custom_api_connection_request_failed: 'TRANSLATED REQUEST {status}',
  custom_api_connection_structured_invalid: 'TRANSLATED STRUCTURED INVALID',
  custom_api_connection_model_mismatch: 'TRANSLATED MISMATCH {requestedModel}->{effectiveModel}',
  custom_api_connection_model_mismatch_fallback: 'TRANSLATED MISMATCH FALLBACK {requestedModel}->{effectiveModel}',
  custom_api_connection_model_mismatch_inconclusive: 'TRANSLATED MISMATCH UNKNOWN {requestedModel}->{effectiveModel}',
  custom_api_connection_model_mismatch_unusable: 'TRANSLATED MISMATCH UNUSABLE {requestedModel}->{effectiveModel}',
  custom_api_connection_failed_unexpected: 'TRANSLATED UNEXPECTED',
  api_test_custom_config_missing: 'TRANSLATED MISSING CONFIG',
  api_test_custom_model_not_found: 'TRANSLATED MODEL {model}',
};

const translate = (key, params) => {
  let text = CATALOG[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
};

const mocks = vi.hoisted(() => ({
  settingsStore: null,
  testKeysDirect: vi.fn(),
  testCustomConnection: vi.fn(),
}));

vi.mock('@/features/settings/stores/settings.js', () => ({
  useSettingsStore: vi.fn(() => mocks.settingsStore),
}));

vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({
  ApiKeyManager: {
    testKeysDirect: mocks.testKeysDirect,
    parseKeys: (value) => (typeof value !== 'string' || !value
      ? []
      : value.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)),
  },
}));

// The probe executes in background: the component must reach it only through
// messaging, never through a direct module import.
vi.mock('@/composables/core/useExtensionAPI.js', () => ({
  useExtensionAPI: () => ({ testCustomConnection: mocks.testCustomConnection }),
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    get: vi.fn().mockResolvedValue({ CUSTOM_API_URL: '', CUSTOM_API_MODEL: '' }),
    set: vi.fn(),
  },
}));

vi.mock('@/features/settings/presentation/ProviderSettingsErrorPresenter.js', () => ({
  presentProviderSettingsError: vi.fn(() => ({})),
}));

vi.mock('vue-i18n', () => ({
  useI18n: vi.fn(() => ({ t: translate })),
}));

vi.mock('./ApiKeyInput.vue', () => ({
  default: {
    name: 'ApiKeyInput',
    props: ['providerId'],
    emits: ['test'],
    template: '<button data-test="test-provider" @click="$emit(\'test\', providerId)">test</button>',
  },
}));

vi.mock('@/components/base/BaseInput.vue', () => ({
  default: { template: '<div />' },
}));

const URL_A = 'https://a.example/v1/chat/completions';
const URL_B = 'https://b.example/v1/chat/completions';

const successReport = (messageKey = 'custom_api_connection_success', params = null, responseFormat = 'supported') => ({
  fallbackStructured: 'supported',
  responseFormat,
  usable: true,
  state: 'success',
  messageKey,
  params,
});

const failedReport = (messageKey, params = null) => ({
  fallbackStructured: 'unknown',
  responseFormat: 'unknown',
  usable: false,
  state: 'completion_failed',
  messageKey,
  params,
});

const envelope = (report) => ({ success: true, data: { report } });

function mountWith(settings) {
  mocks.settingsStore = {
    settings: reactive({
      CUSTOM_API_URL: '',
      CUSTOM_API_KEY: '',
      CUSTOM_API_MODEL: '',
      ...settings,
    }),
    updateSettingLocally: vi.fn((key, value) => {
      mocks.settingsStore.settings[key] = value;
    }),
  };
  return mount(CustomApiSettings);
}

const statusOf = (wrapper) => wrapper.get('[data-testid="custom-connection-status"]');

describe('CustomApiSettings Test Connection', () => {
  beforeEach(() => {
    mocks.testKeysDirect.mockReset().mockResolvedValue({
      allInvalid: true,
      messageKey: 'api_test_result_all_invalid',
      params: { count: 1 },
      reorderedString: 'draft-key',
    });
    mocks.testCustomConnection.mockReset().mockResolvedValue(envelope(successReport()));
    vi.mocked(storageManager.set).mockClear();
  });

  it('never imports the probe or capability modules directly', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './CustomApiSettings.vue'),
      'utf8',
    );
    expect(source).not.toContain('CustomConnectionProbe');
    expect(source).not.toContain('CustomResponseFormatCapability');
  });

  it('does not probe on mount and shows the translated Not tested status', () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    expect(mocks.testCustomConnection).not.toHaveBeenCalled();
    expect(statusOf(wrapper).text()).toBe('Not tested');
    wrapper.unmount();
  });

  it('sends unsaved form values with the first key via messaging', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k1\nk2', CUSTOM_API_MODEL: 'm1' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));

    expect(mocks.testCustomConnection).toHaveBeenCalledWith({
      apiUrl: URL_A,
      apiModel: 'm1',
      apiKey: 'k1',
    });
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED SUCCESS'));
    expect(statusOf(wrapper).classes()).toContain('success');
    expect(statusOf(wrapper).classes()).not.toContain('warning');
    expect(statusOf(wrapper).classes()).not.toContain('error');
    wrapper.unmount();
  });

  it('renders the background report unchanged', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope(
      successReport('custom_api_connection_fallback', null, 'unsupported'),
    ));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED FALLBACK'));
    expect(statusOf(wrapper).classes()).toContain('warning');
    wrapper.unmount();
  });

  it('renders failed reports with translated text and error styling', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope(failedReport('custom_api_connection_completion_failed')));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED COMPLETION'));
    expect(statusOf(wrapper).classes()).toContain('error');
    expect(statusOf(wrapper).classes()).not.toContain('warning');
    expect(statusOf(wrapper).classes()).not.toContain('success');
    wrapper.unmount();
  });

  it('renders accepted-but-contract-failing reports as errors, never fully usable', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce({ success: true, data: { report: {
      fallbackStructured: 'supported',
      responseFormat: 'supported',
      usable: false,
      state: 'success',
      messageKey: 'custom_api_connection_structured_invalid',
      params: null,
    } } });
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED STRUCTURED INVALID'));
    expect(statusOf(wrapper).classes()).toContain('error');
    expect(statusOf(wrapper).classes()).not.toContain('success');
    expect(statusOf(wrapper).classes()).not.toContain('warning');
    wrapper.unmount();
  });

  it('renders mismatch+supported with warning and both interpolated models', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce({ success: true, data: { report: {
      fallbackStructured: 'supported',
      responseFormat: 'supported',
      usable: true,
      state: 'success',
      messageKey: 'custom_api_connection_model_mismatch',
      params: { requestedModel: 'm1', effectiveModel: 'other' },
      modelStatus: 'mismatch',
      requestedModel: 'm1',
      effectiveModel: 'other',
    } } });
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm1' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED MISMATCH m1->other'));
    expect(statusOf(wrapper).classes()).toContain('warning');
    expect(statusOf(wrapper).classes()).not.toContain('success');
    expect(statusOf(wrapper).classes()).not.toContain('error');
    wrapper.unmount();
  });

  it('renders mismatch+unsupported with the combined message and warning styling', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce({ success: true, data: { report: {
      fallbackStructured: 'supported',
      responseFormat: 'unsupported',
      usable: true,
      state: 'success',
      messageKey: 'custom_api_connection_model_mismatch_fallback',
      params: { requestedModel: 'm1', effectiveModel: 'other' },
      modelStatus: 'mismatch',
      requestedModel: 'm1',
      effectiveModel: 'other',
    } } });
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm1' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED MISMATCH FALLBACK m1->other'));
    expect(statusOf(wrapper).classes()).toContain('warning');
    wrapper.unmount();
  });

  it('renders mismatch+unusable as an error while keeping the mismatch facts', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce({ success: true, data: { report: {
      fallbackStructured: 'unsupported',
      responseFormat: 'unsupported',
      usable: false,
      state: 'success',
      messageKey: 'custom_api_connection_model_mismatch_unusable',
      params: { requestedModel: 'm1', effectiveModel: 'other' },
      modelStatus: 'mismatch',
      requestedModel: 'm1',
      effectiveModel: 'other',
    } } });
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm1' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED MISMATCH UNUSABLE m1->other'));
    expect(statusOf(wrapper).classes()).toContain('error');
    expect(statusOf(wrapper).classes()).not.toContain('warning');
    expect(statusOf(wrapper).classes()).not.toContain('success');
    wrapper.unmount();
  });

  it.each([
    ['unsupported response_format', 'custom_api_connection_fallback', 'unsupported'],
    ['inconclusive response_format', 'custom_api_connection_inconclusive', 'unknown'],
  ])('renders usable %s reports with warning styling', async (_label, messageKey, responseFormat) => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope(successReport(messageKey, null, responseFormat)));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).classes()).toContain('warning'));
    expect(statusOf(wrapper).classes()).not.toContain('success');
    expect(statusOf(wrapper).classes()).not.toContain('error');
    wrapper.unmount();
  });

  it('interpolates semantic params into the translated status', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope({
      ...failedReport('api_test_custom_model_not_found', { model: 'm1' }),
      state: 'model_unavailable',
    }));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm1' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED MODEL m1'));
    wrapper.unmount();
  });

  it.each([
    ['missing report', { success: true, data: {} }],
    ['missing data', { success: true }],
  ])('falls back to the unexpected-failure status on %s', async (_label, response) => {
    mocks.testCustomConnection.mockResolvedValueOnce(response);
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED UNEXPECTED'));
    expect(statusOf(wrapper).classes()).toContain('error');
    wrapper.unmount();
  });

  it('falls back to the unexpected-failure status when messaging rejects', async () => {
    mocks.testCustomConnection.mockRejectedValueOnce(new Error('background unreachable'));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED UNEXPECTED'));
    wrapper.unmount();
  });

  it('probes keyless with an empty key', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: '', CUSTOM_API_MODEL: 'm1' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));

    expect(mocks.testCustomConnection).toHaveBeenCalledWith({
      apiUrl: URL_A,
      apiModel: 'm1',
      apiKey: '',
    });
    wrapper.unmount();
  });

  it('never gates Save or persists: no storage writes from Test Connection', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));

    expect(vi.mocked(storageManager.set)).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each([
    ['URL', { CUSTOM_API_URL: URL_B }],
    ['model', { CUSTOM_API_MODEL: 'm2' }],
    ['key', { CUSTOM_API_KEY: 'other-key' }],
  ])('invalidates the report back to Not tested on %s edit', async (_label, edit) => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED SUCCESS'));

    Object.assign(mocks.settingsStore.settings, edit);
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Not tested'));
    wrapper.unmount();
  });

  it('discards a stale resolution for config A after config B completes', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });
    let resolveA;
    mocks.testCustomConnection
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockImplementationOnce(async () => envelope(successReport('custom_api_connection_fallback', null, 'unsupported')));

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));

    Object.assign(mocks.settingsStore.settings, { CUSTOM_API_URL: URL_B });
    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED FALLBACK'));

    resolveA(envelope(successReport()));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(statusOf(wrapper).text()).toBe('TRANSLATED FALLBACK');
    wrapper.unmount();
  });

  it('discards the older click in a rapid click-race', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });
    let resolveFirst;
    mocks.testCustomConnection
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async () => envelope(successReport('custom_api_connection_fallback', null, 'unsupported')));

    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await wrapper.get('[data-testid="custom-test-connection"]').trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('TRANSLATED FALLBACK'));

    resolveFirst(envelope(failedReport('custom_api_connection_completion_failed')));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(statusOf(wrapper).text()).toBe('TRANSLATED FALLBACK');
    wrapper.unmount();
  });

  it('leaves Test Key behavior unchanged', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'draft-key', CUSTOM_API_MODEL: 'm' });

    await wrapper.get('[data-test="test-provider"]').trigger('click');

    expect(ApiKeyManager.testKeysDirect).toHaveBeenCalledWith(
      'draft-key',
      ProviderRegistryIds.CUSTOM,
      { apiUrl: URL_A, apiModel: 'm' },
    );
    expect(mocks.testCustomConnection).not.toHaveBeenCalled();
    expect(statusOf(wrapper).text()).toBe('Not tested');
    wrapper.unmount();
  });
});
