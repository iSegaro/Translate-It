import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { useI18n } from 'vue-i18n';
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
const innerOf = (wrapper) => wrapper.get('[data-testid="custom-connection-status"] > div');
const buttonOf = (wrapper) => wrapper.get('[data-testid="custom-test-connection"]');
const buttonLabelsOf = (wrapper) => wrapper.findAll('[data-testid="custom-test-connection"] .compat-check-label');
const visibleButtonLabelOf = (wrapper) => buttonLabelsOf(wrapper).find((label) => !label.classes('is-hidden'));
const verdictOf = (wrapper) => wrapper.get('[data-testid="custom-connection-status"] .connection-verdict');
const detailOf = (wrapper) => wrapper.get('[data-testid="custom-connection-status"] .connection-detail');
const detailExists = (wrapper) => wrapper.find('[data-testid="custom-connection-status"] .connection-detail').exists();
const strongsOf = (wrapper) => wrapper.findAll('[data-testid="custom-connection-status"] strong');

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
    expect(visibleButtonLabelOf(wrapper).text()).toBe('Check Compatibility');
    expect(statusOf(wrapper).text()).toBe('Not checked');
    wrapper.unmount();
  });

  it('shows the busy label while the background check runs', async () => {
    let resolveProbe;
    mocks.testCustomConnection.mockImplementationOnce(() => new Promise((resolve) => { resolveProbe = resolve; }));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(visibleButtonLabelOf(wrapper).text()).toBe('Checking…'));

    resolveProbe(envelope(successReport()));
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));
    await vi.waitFor(() => expect(visibleButtonLabelOf(wrapper).text()).toBe('Check Compatibility'));
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
      operationId: expect.any(String),
      callerId: expect.any(String),
    });
    const sentId = mocks.testCustomConnection.mock.calls[0][0].operationId;
    expect(sentId.length).toBeGreaterThan(0);
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));
    expect(detailExists(wrapper)).toBe(false);
    expect(innerOf(wrapper).classes()).toContain('success');
    expect(innerOf(wrapper).classes()).not.toContain('warning');
    expect(innerOf(wrapper).classes()).not.toContain('error');
    wrapper.unmount();
  });

  it('generates a unique operation id per check with a stable caller id', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));
    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(2));

    const [firstCall, secondCall] = mocks.testCustomConnection.mock.calls.map(([payload]) => payload);
    expect(typeof firstCall.operationId).toBe('string');
    expect(firstCall.operationId.length).toBeGreaterThan(0);
    expect(secondCall.operationId).not.toBe(firstCall.operationId);
    // One stable id per component instance across both checks.
    expect(typeof firstCall.callerId).toBe('string');
    expect(firstCall.callerId.length).toBeGreaterThan(0);
    expect(secondCall.callerId).toBe(firstCall.callerId);
    wrapper.unmount();
  });

  it('uses a fresh caller id per component instance', async () => {
    const first = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });
    await buttonOf(first).trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));
    first.unmount();

    const second = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });
    await buttonOf(second).trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(2));
    second.unmount();

    const [firstCall, secondCall] = mocks.testCustomConnection.mock.calls.map(([payload]) => payload);
    expect(secondCall.callerId).not.toBe(firstCall.callerId);
  });

  it('renders the background report unchanged', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope(
      successReport('custom_api_connection_fallback', null, 'unsupported'),
    ));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));
    expect(detailOf(wrapper).text()).toBe('Compatibility mode will be used.');
    expect(detailOf(wrapper).text()).toContain('Compatibility mode');
    expect(innerOf(wrapper).classes()).toContain('warning');
    wrapper.unmount();
  });

  it('renders failed reports with translated text and error styling', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope(failedReport('custom_api_connection_completion_failed')));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatibility check failed.'));
    expect(detailOf(wrapper).text()).toBe('The server responded, but returned nothing usable.');
    expect(innerOf(wrapper).classes()).toContain('error');
    expect(innerOf(wrapper).classes()).not.toContain('warning');
    expect(innerOf(wrapper).classes()).not.toContain('success');
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
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Not compatible.'));
    expect(detailOf(wrapper).text()).toBe('The model returned an unusable response.');
    expect(innerOf(wrapper).classes()).toContain('error');
    expect(innerOf(wrapper).classes()).not.toContain('success');
    expect(innerOf(wrapper).classes()).not.toContain('warning');
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
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));
    expect(detailOf(wrapper).text()).toBe('The server used other instead of m1.');
    expect(detailOf(wrapper).text()).toContain('m1');
    expect(detailOf(wrapper).text()).toContain('other');
    expect(innerOf(wrapper).classes()).toContain('warning');
    expect(innerOf(wrapper).classes()).not.toContain('success');
    expect(innerOf(wrapper).classes()).not.toContain('error');
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
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));
    expect(detailOf(wrapper).text()).toBe(
      'The server used other instead of m1. Compatibility mode will be used.',
    );
    expect(innerOf(wrapper).classes()).toContain('warning');
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
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Not compatible.'));
    expect(detailOf(wrapper).text()).toBe(
      'The server used other instead of m1, and its output may not work reliably.',
    );
    expect(innerOf(wrapper).classes()).toContain('error');
    expect(innerOf(wrapper).classes()).not.toContain('warning');
    expect(innerOf(wrapper).classes()).not.toContain('success');
    wrapper.unmount();
  });

  it.each([
    ['unsupported response_format', 'custom_api_connection_fallback', 'unsupported'],
    ['inconclusive response_format', 'custom_api_connection_inconclusive', 'unknown'],
  ])('renders usable %s reports with warning styling', async (_label, messageKey, responseFormat) => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope(successReport(messageKey, null, responseFormat)));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(innerOf(wrapper).classes()).toContain('warning'));
    expect(innerOf(wrapper).classes()).not.toContain('success');
    expect(innerOf(wrapper).classes()).not.toContain('error');
    wrapper.unmount();
  });

  it.each([
    ['inconclusive', 'custom_api_connection_inconclusive', null,
      'Compatibility could not be fully verified.', null],
    ['unreachable', 'custom_api_connection_unreachable', null,
      'Cannot connect.', 'Check the server address and network.'],
    ['auth_failed', 'custom_api_connection_auth_failed', null,
      'Authentication failed.', 'Check the API key.'],
    ['mismatch_inconclusive', 'custom_api_connection_model_mismatch_inconclusive',
      { requestedModel: 'm1', effectiveModel: 'other' },
      'Compatibility could not be fully verified.', 'The server used other instead of m1.'],
    ['unexpected', 'custom_api_connection_failed_unexpected', null,
      'Compatibility check failed.', null],
  ])('renders approved %s wording', async (_label, messageKey, params, verdict, detail) => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope({
      ...failedReport(messageKey, params),
      state: 'success',
      usable: messageKey === 'custom_api_connection_model_mismatch_inconclusive',
    }));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe(verdict));
    if (detail === null) {
      expect(detailExists(wrapper)).toBe(false);
    } else {
      expect(detailOf(wrapper).text()).toBe(detail);
    }
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
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatibility check failed.'));
    expect(detailOf(wrapper).text()).toBe('Check the server settings.');
    expect(statusOf(wrapper).text()).not.toContain('500');
    expect(innerOf(wrapper).classes()).toContain('error');
    wrapper.unmount();
  });

  it('interpolates semantic params into the translated status', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope({
      ...failedReport('api_test_custom_model_not_found', { model: 'm1' }),
      state: 'model_unavailable',
    }));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm1' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Not compatible.'));
    expect(detailOf(wrapper).text()).toBe('Configured model was not found: m1');
    wrapper.unmount();
  });

  it.each([
    ['missing report', { success: true, data: {} }],
    ['missing data', { success: true }],
  ])('falls back to the unexpected-failure status on %s', async (_label, response) => {
    mocks.testCustomConnection.mockResolvedValueOnce(response);
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatibility check failed.'));
    expect(detailExists(wrapper)).toBe(false);
    expect(innerOf(wrapper).classes()).toContain('error');
    wrapper.unmount();
  });

  it('falls back to the unexpected-failure status when messaging rejects', async () => {
    mocks.testCustomConnection.mockRejectedValueOnce(new Error('background unreachable'));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatibility check failed.'));
    expect(detailExists(wrapper)).toBe(false);
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
      operationId: expect.any(String),
      callerId: expect.any(String),
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
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));

    Object.assign(mocks.settingsStore.settings, edit);
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('Not checked'));
    wrapper.unmount();
  });

  it('discards a stale resolution for config A after config B completes', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });
    let resolveA;
    mocks.testCustomConnection
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockResolvedValueOnce({ success: true, data: { cancelled: true } })
      .mockImplementationOnce(async () => envelope(successReport('custom_api_connection_fallback', null, 'unsupported')));

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));
    const checkCallerId = mocks.testCustomConnection.mock.calls[0][0].callerId;

    Object.assign(mocks.settingsStore.settings, { CUSTOM_API_URL: URL_B });
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledWith({ cancel: true, callerId: checkCallerId }));
    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));
    await vi.waitFor(() => expect(detailOf(wrapper).text()).toBe('Compatibility mode will be used.'));

    resolveA(envelope(successReport()));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(verdictOf(wrapper).text()).toBe('Compatible.');
    expect(detailOf(wrapper).text()).toBe('Compatibility mode will be used.');
    wrapper.unmount();
  });

  it('cancels the active background check on config edit and renders nothing stale', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });
    let resolveCheck;
    mocks.testCustomConnection.mockImplementationOnce(() => new Promise((resolve) => { resolveCheck = resolve; }));

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledTimes(1));
    const checkCallerId = mocks.testCustomConnection.mock.calls[0][0].callerId;

    Object.assign(mocks.settingsStore.settings, { CUSTOM_API_URL: URL_B });
    await vi.waitFor(() => expect(mocks.testCustomConnection).toHaveBeenCalledWith({ cancel: true, callerId: checkCallerId }));

    resolveCheck(envelope(successReport()));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(statusOf(wrapper).text()).toBe('Not checked');
    expect(vi.mocked(storageManager.set)).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('sends no cancel message when no check is in flight', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    Object.assign(mocks.settingsStore.settings, { CUSTOM_API_URL: URL_B });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.testCustomConnection).not.toHaveBeenCalled();
    expect(statusOf(wrapper).text()).toBe('Not checked');
    wrapper.unmount();
  });

  it('renders background timeout reports with the timed-out wording and error styling', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope({
      fallbackStructured: 'unknown',
      responseFormat: 'unknown',
      usable: false,
      state: 'timed_out',
      messageKey: 'custom_api_connection_timed_out',
      params: null,
      modelStatus: 'unknown',
      requestedModel: 'm',
      effectiveModel: null,
    }));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatibility check timed out.'));
    expect(detailOf(wrapper).text()).toBe('Try again.');
    expect(innerOf(wrapper).classes()).toContain('error');
    expect(innerOf(wrapper).classes()).not.toContain('success');
    expect(innerOf(wrapper).classes()).not.toContain('warning');
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
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));
    await vi.waitFor(() => expect(detailOf(wrapper).text()).toBe('Compatibility mode will be used.'));

    resolveFirst(envelope(failedReport('custom_api_connection_completion_failed')));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(verdictOf(wrapper).text()).toBe('Compatible.');
    expect(detailOf(wrapper).text()).toBe('Compatibility mode will be used.');
    wrapper.unmount();
  });

  it.each([
    ['success', 'custom_api_connection_success', null, 'Compatible.'],
    ['fallback', 'custom_api_connection_fallback', null, 'Compatible.'],
    ['mismatch', 'custom_api_connection_model_mismatch', { requestedModel: 'm1', effectiveModel: 'other' }, 'Compatible.'],
    ['mismatch_fallback', 'custom_api_connection_model_mismatch_fallback', { requestedModel: 'm1', effectiveModel: 'other' }, 'Compatible.'],
    ['inconclusive', 'custom_api_connection_inconclusive', null, 'Compatibility could not be fully verified.'],
    ['mismatch_inconclusive', 'custom_api_connection_model_mismatch_inconclusive', { requestedModel: 'm1', effectiveModel: 'other' }, 'Compatibility could not be fully verified.'],
    ['structured_invalid', 'custom_api_connection_structured_invalid', null, 'Not compatible.'],
    ['mismatch_unusable', 'custom_api_connection_model_mismatch_unusable', { requestedModel: 'm1', effectiveModel: 'other' }, 'Not compatible.'],
    ['model_not_found', 'api_test_custom_model_not_found', { model: 'm1' }, 'Not compatible.'],
    ['unreachable', 'custom_api_connection_unreachable', null, 'Cannot connect.'],
    ['auth_failed', 'custom_api_connection_auth_failed', null, 'Authentication failed.'],
    ['completion_failed', 'custom_api_connection_completion_failed', null, 'Compatibility check failed.'],
    ['request_failed', 'custom_api_connection_request_failed', null, 'Compatibility check failed.'],
    ['unexpected', 'custom_api_connection_failed_unexpected', null, 'Compatibility check failed.'],
    ['timed_out', 'custom_api_connection_timed_out', null, 'Compatibility check timed out.'],
  ])('renders the %s verdict first', async (_label, messageKey, params, verdict) => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope({
      ...failedReport(messageKey, params),
      usable: true,
    }));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe(verdict));
    wrapper.unmount();
  });

  it('renders mismatch model names inside <strong> elements', async () => {
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
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));

    const strongs = strongsOf(wrapper);
    expect(strongs).toHaveLength(2);
    expect(strongs[0].text()).toBe('other');
    expect(strongs[1].text()).toBe('m1');
    expect(detailOf(wrapper).text()).toBe('The server used other instead of m1.');
    wrapper.unmount();
  });

  it('renders model names correctly when the locale reverses placeholder order', async () => {
    const reversedTranslate = (key, params) => {
      const templates = {
        custom_api_verdict_compatible: '互換性があります。',
        custom_api_connection_model_mismatch: 'サーバーは{requestedModel}ではなく{effectiveModel}を使用しました。',
      };
      let text = templates[key] ?? enMessages[key]?.message ?? key;
      if (params) {
        for (const [name, value] of Object.entries(params)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    };
    vi.mocked(useI18n).mockReturnValueOnce({ t: reversedTranslate });
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
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('互換性があります。'));

    const strongs = strongsOf(wrapper);
    expect(strongs).toHaveLength(2);
    expect(strongs[0].text()).toBe('m1');
    expect(strongs[1].text()).toBe('other');
    wrapper.unmount();
  });

  it('renders overlapping model values without confusion', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce({ success: true, data: { report: {
      fallbackStructured: 'supported',
      responseFormat: 'supported',
      usable: true,
      state: 'success',
      messageKey: 'custom_api_connection_model_mismatch',
      params: { requestedModel: 'foo', effectiveModel: 'foo.gguf' },
      modelStatus: 'mismatch',
      requestedModel: 'foo',
      effectiveModel: 'foo.gguf',
    } } });
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'foo' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));

    const strongs = strongsOf(wrapper);
    expect(strongs).toHaveLength(2);
    expect(strongs[0].text()).toBe('foo.gguf');
    expect(strongs[1].text()).toBe('foo');
    wrapper.unmount();
  });

  it('escapes HTML-like model values inside <strong>', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    mocks.testCustomConnection.mockResolvedValueOnce({ success: true, data: { report: {
      fallbackStructured: 'supported',
      responseFormat: 'supported',
      usable: true,
      state: 'success',
      messageKey: 'custom_api_connection_model_mismatch',
      params: { requestedModel: 'm1', effectiveModel: evil },
      modelStatus: 'mismatch',
      requestedModel: 'm1',
      effectiveModel: evil,
    } } });
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm1' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));

    const strongs = strongsOf(wrapper);
    expect(strongs).toHaveLength(2);
    expect(strongs[0].text()).toBe(evil);
    expect(strongs[0].html()).toContain('&lt;img');
    expect(strongs[0].html()).not.toContain('<img src');
    wrapper.unmount();
  });

  it('falls back to plain detail for unknown message keys', async () => {
    mocks.testCustomConnection.mockResolvedValueOnce(envelope(
      failedReport('custom_api_connection_nonexistent'),
    ));
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(statusOf(wrapper).text()).toBe('custom_api_connection_nonexistent'));
    expect(wrapper.find('[data-testid="custom-connection-status"] .connection-verdict').exists()).toBe(false);
    expect(innerOf(wrapper).classes()).toContain('error');
    wrapper.unmount();
  });

  it('exposes the result container as a live status region', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    expect(statusOf(wrapper).attributes('role')).toBe('status');

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));
    expect(statusOf(wrapper).attributes('role')).toBe('status');
    wrapper.unmount();
  });

  it('keeps both button labels in the DOM with grid-stack stability semantics', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    const labels = buttonLabelsOf(wrapper);
    expect(labels).toHaveLength(2);
    expect(labels[0].text()).toBe('Check Compatibility');
    expect(labels[1].text()).toBe('Checking…');
    // Idle: first label active, busy label layout-reserving but hidden from AT.
    expect(labels[0].classes()).not.toContain('is-hidden');
    expect(labels[0].attributes('aria-hidden')).toBe('false');
    expect(labels[1].classes()).toContain('is-hidden');
    expect(labels[1].attributes('aria-hidden')).toBe('true');

    let resolveProbe;
    mocks.testCustomConnection.mockImplementationOnce(() => new Promise((resolve) => { resolveProbe = resolve; }));
    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(visibleButtonLabelOf(wrapper).text()).toBe('Checking…'));

    const busyLabels = buttonLabelsOf(wrapper);
    expect(busyLabels).toHaveLength(2);
    expect(busyLabels[0].classes()).toContain('is-hidden');
    expect(busyLabels[0].attributes('aria-hidden')).toBe('true');
    expect(busyLabels[1].classes()).not.toContain('is-hidden');
    expect(busyLabels[1].attributes('aria-hidden')).toBe('false');

    resolveProbe(envelope(successReport()));
    await vi.waitFor(() => expect(visibleButtonLabelOf(wrapper).text()).toBe('Check Compatibility'));
    wrapper.unmount();
  });

  it('declares the grid-stack and reservation rules in the component stylesheet', () => {
    const scss = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './CustomApiSettings.scss'),
      'utf8',
    );
    // Button: both labels share one grid cell; inactive keeps space.
    expect(scss).toContain('display: grid');
    expect(scss).toContain('grid-area: 1 / 1');
    expect(scss).toContain('visibility: hidden');
    // Status: scalable reservation, never a rigid height; reservation
    // metrics pinned on the outer wrapper, not inherited from inner
    // presentation classes.
    expect(scss).toContain('.custom-connection-status');
    expect(scss).toMatch(/min-height:\s*calc\(2lh \+ 4px \+ 16px\)/);
    expect(scss).not.toMatch(/\.custom-connection-status\s*{[^}]*?(?<!min-)(?<!line-)height:/);
    expect(scss).toMatch(/\.custom-connection-status\s*{[^}]*font-size:/);
    expect(scss).toMatch(/\.custom-connection-status\s*{[^}]*line-height:/);
    // Model emphasis stays direction-isolated.
    expect(scss).toContain('unicode-bidi: isolate');
  });

  it('keeps layout ownership on the outer wrapper and presentation on the inner element', async () => {
    const wrapper = mountWith({ CUSTOM_API_URL: URL_A, CUSTOM_API_KEY: 'k', CUSTOM_API_MODEL: 'm' });

    // Idle: outer owns layout, inner carries the idle presentation.
    expect(statusOf(wrapper).classes()).toContain('custom-connection-status');
    expect(statusOf(wrapper).classes()).not.toContain('test-result');
    expect(statusOf(wrapper).classes()).not.toContain('setting-help-text');
    expect(statusOf(wrapper).attributes('role')).toBe('status');
    expect(innerOf(wrapper).classes()).toContain('setting-help-text');
    expect(innerOf(wrapper).classes()).not.toContain('custom-connection-status');

    await buttonOf(wrapper).trigger('click');
    await vi.waitFor(() => expect(verdictOf(wrapper).text()).toBe('Compatible.'));

    // Result: outer unchanged, inner carries the result presentation.
    expect(statusOf(wrapper).classes()).toContain('custom-connection-status');
    expect(statusOf(wrapper).classes()).not.toContain('test-result');
    expect(statusOf(wrapper).classes()).not.toContain('setting-help-text');
    expect(statusOf(wrapper).attributes('role')).toBe('status');
    expect(innerOf(wrapper).classes()).toContain('test-result');
    expect(innerOf(wrapper).classes()).toContain('success');
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
