import { getTranslationString } from '@/utils/i18n/i18n.js';

export const SELECT_ELEMENT_ACTIVATION_ERROR_KEY = 'SELECT_ELEMENT_ACTIVATION_FAILED';
export const SELECT_ELEMENT_ACTIVATION_ERROR_FALLBACK = 'Could not activate Select Element mode.';

export async function getSelectElementActivationErrorMessage() {
  try {
    return (await getTranslationString(SELECT_ELEMENT_ACTIVATION_ERROR_KEY))
      || SELECT_ELEMENT_ACTIVATION_ERROR_FALLBACK;
  } catch {
    return SELECT_ELEMENT_ACTIVATION_ERROR_FALLBACK;
  }
}
