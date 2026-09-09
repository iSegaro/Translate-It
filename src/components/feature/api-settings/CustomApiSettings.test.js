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
import enMessages from '@/_locales/en/messages.json';

// Resolve keys through the real EN reference (with {param} interpolation),
// so tests lock the approved wording instead of key names.
const translate = (key, params) => {
  let text = enMessages[key]?.message ?? key;
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
  modelStatus: responseFormat === 'supported' ? 'matched' : 'unknown',
  requestedModel: 'm',
  effectiveModel: responseFormat === 'supported' ? 'm' : null,
});

const failedReport = (messageKey, params = null) => ({
  fallbackStructured: 'unknown',
  responseFormat: 'unknown',
  usable: false,
  state: 'completion_failed',
  messageKey,
  params,
  modelStatus: 'unknown',
  requestedModel: 'm',
  effectiveModel: null,
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
const buttonOf = (wrapper) => wrapper.get('[data-testid="custom-test-connection"]');

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

  it('does not probe on mount and shows idle labels', () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    expect(mocks.testCustomConnection).not.toHaveBeenCalled();
    expect(buttonOf(wrapper).text()).toBe('Check Compatibility');
    expect(statusOf(wrapper).text()).toBe('Not checked');
    wrapper.unmount();
  });

  it('shows the busy label while the background check runs', async () => {
    let resolveProbe;
    mocks.testCustomConnection.mockImplementationOnce(() => new Promise((resolve) => { resolveProbe = resolve; }));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(buttonOf(wrapper).text()).toBe('Checking…'));

    resolveProbe(envelope(successReport()));
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Ready to use.'));
    await vi.waitFor(() => expect(buttonOf(wrapper).text()).toBe('Check Compatibility'));
    wrapper.unmount();
  });

  it('sends unsaved form values with the first key via messaging', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k1\nk2', CUSTOM_API_MODEL: 'm1' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));

    expect(mocks.testCustomConnection).toHaveBeenCalledWith({
      apiUrl: URL_A,
      apiModel: 'm1',
      apiKey: 'k1',
    });
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Ready to use.'));
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

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Ready to use. Compatibility mode will be used.'));
    expect(statusOf(wrapper).text()).toContain('Compatibility mode');
    expect(statusOf(wrapper).classes()).toContain('warning');
    wrapper.unmount();
  });

  it('renders failed reports with translated text and error styling', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope(failedReport('custom_api_connection_completion_failed')));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('The server responded, but returned nothing usable.'));
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
      modelStatus: 'matched',
      requestedModel: 'm',
      effectiveModel: 'm',
    } } });
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('The model responded, but its output may not work reliably.'));
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

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('The server used other instead of m1.'));
    expect(statusOf(wrapper).text()).toContain('m1');
    expect(statusOf(wrapper).text()).toContain('other');
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

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe(
      'The server used other instead of m1. Compatibility mode will be used.',
    ));
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

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe(
      'The server used other instead of m1, and its output may not work reliably.',
    ));
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

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).classes()).toContain('warning'));
    expect(statusOf(wrapper).classes()).not.toContain('success');
    expect(statusOf(wrapper).classes()).not.toContain('error');
    wrapper.unmount();
  });

  it.each([
    ['inconclusive', 'custom_api_connection_inconclusive', null, 'Connection works, but compatibility could not be fully verified.'],
    ['unreachable', 'custom_api_connection_unreachable', null, 'Cannot reach the server. Check the server address and network.'],
    ['auth_failed', 'custom_api_connection_auth_failed', null, 'Authentication failed. Check the API key.'],
    ['mismatch_inconclusive', 'custom_api_connection_model_mismatch_inconclusive',
      { requestedModel: 'm1', effectiveModel: 'other' },
      'The server used other instead of m1. Compatibility could not be fully verified.'],
    ['unexpected', 'custom_api_connection_failed_unexpected', null, 'Compatibility check failed unexpectedly.'],
  ])('renders approved %s wording', async (_label, messageKey, params, text) => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope({
      ...failedReport(messageKey, params),
      state: 'success',
      usable: messageKey === 'custom_api_connection_model_mismatch_inconclusive',
    }));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe(text));
    wrapper.unmount();
  });

  it.each([
    ['custom_api_connection_success', successReport()],
    ['custom_api_connection_fallback', successReport('custom_api_connection_fallback', null, 'unsupported')],
    ['custom_api_connection_inconclusive', successReport('custom_api_connection_inconclusive', null, 'unknown')],
    ['custom_api_connection_model_mismatch', { ...successReport('custom_api_connection_model_mismatch', { requestedModel: 'm1', effectiveModel: 'other' }), modelStatus: 'mismatch', requestedModel: 'm1', effectiveModel: 'other' }],
    ['custom_api_connection_model_mismatch_fallback', { ...successReport('custom_api_connection_model_mismatch_fallback', { requestedModel: 'm1', effectiveModel: 'other' }, 'unsupported'), modelStatus: 'mismatch', requestedModel: 'm1', effectiveModel: 'other' }],
    ['custom_api_connection_model_mismatch_inconclusive', { ...successReport('custom_api_connection_model_mismatch_inconclusive', { requestedModel: 'm1', effectiveModel: 'other' }, 'unknown'), modelStatus: 'mismatch', requestedModel: 'm1', effectiveModel: 'other' }],
    ['custom_api_connection_model_mismatch_unusable', { fallbackStructured: 'unsupported', responseFormat: 'unsupported', usable: false, state: 'success', messageKey: 'custom_api_connection_model_mismatch_unusable', params: { requestedModel: 'm1', effectiveModel: 'other' }, modelStatus: 'mismatch', requestedModel: 'm1', effectiveModel: 'other' }],
    ['custom_api_connection_structured_invalid', { fallbackStructured: 'supported', responseFormat: 'supported', usable: false, state: 'success', messageKey: 'custom_api_connection_structured_invalid', params: null, modelStatus: 'matched', requestedModel: 'm', effectiveModel: 'm' }],
  ])('hides protocol details in %s', async (_label, report) => {
    expect(report.messageKey.startsWith('custom_api_')).toBe(true);
    mocks.testCustomConnection.mockResolvedValueOnce(envelope(report));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(statusOf(wrapper).text()).not.toBe('Not checked'));
    expect(statusOf(wrapper).text()).not.toContain('response_format');
    wrapper.unmount();
  });

  it('renders request failures without any HTTP status', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope({
      ...failedReport('custom_api_connection_request_failed', { status: 500 }),
      state: 'request_failed',
    }));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('The request failed. Check the server settings.'));
    expect(statusOf(wrapper).text()).not.toContain('500');
    expect(statusOf(wrapper).classes()).toContain('error');
    wrapper.unmount();
  });

  it('interpolates semantic params into the translated status', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope({
      ...failedReport('api_test_custom_model_not_found', { model: 'm1' }),
      state: 'model_unavailable',
    }));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm1' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Configured model was not found: m1'));
    wrapper.unmount();
  });

  it.each([
    ['missing report', { success: true, data: {} }],
    ['missing data', { success: true }],
  ])('falls back to the unexpected-failure status on %s', async (_label, response) => {
    mocks.testCustomConnection.mockResolvedValueOnce(response);
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Compatibility check failed unexpectedly.'));
    expect(statusOf(wrapper).classes()).toContain('error');
    wrapper.unmount();
  });

  it('falls back to the unexpected-failure status when messaging rejects', async () => {
    mocks.testCustomConnection.mockRejectedValueOnce(new Error('background unreachable'));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Compatibility check failed unexpectedly.'));
    wrapper.unmount();
  });

  it('probes keyless with an empty key', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: '', CUSTOM_API_MODEL: 'm1' });

    await buttonOf(wrapper).trigger('click');
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

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));

    expect(vi.mocked(storageManager.set)).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each([
    ['URL', { CUSTOM_API_URL: URL_B }],
    ['model', { CUSTOM_API_MODEL: 'm2' }],
    ['key', { CUSTOM_API_KEY: 'other-key' }],
  ])('invalidates the report back to Not checked on %s edit', async (_label, edit) => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Ready to use.'));

    Object.assign(mocks.settingsStore.settings, edit);
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Not checked'));
    wrapper.unmount();
  });

  it('discards a stale resolution for config A after config B completes', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });
    let resolveA;
    mocks.testCustomConnection
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockImplementationOnce(async () => envelope(successReport('custom_api_connection_fallback', null, 'unsupported')));

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));

    Object.assign(mocks.settingsStore.settings, { CUSTOM_API_URL: URL_B });
    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Ready to use. Compatibility mode will be used.'));

    resolveA(envelope(successReport()));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(statusOf(wrapper).text()).toBe('Ready to use. Compatibility mode will be used.');
    wrapper.unmount();
  });

  it('discards the older click in a rapid click-race', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });
    let resolveFirst;
    mocks.testCustomConnection
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async () => envelope(successReport('custom_api_connection_fallback', null, 'unsupported')));

    await buttonOf(wrapper).trigger('click');
    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Ready to use. Compatibility mode will be used.'));

    resolveFirst(envelope(failedReport('custom_api_connection_completion_failed')));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(statusOf(wrapper).text()).toBe('Ready to use. Compatibility mode will be used.');
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
    expect(statusOf(wrapper).text()).toBe('Not checked');
    wrapper.unmount();
  });
});
