/**
 * Internal extension application metadata.
 * Single source of truth for extension pages opened via shared launcher.
 */

export const EXTENSION_APP_LAUNCH_POLICY = {
  FOCUS_OR_CREATE: 'focus-or-create',
  ALWAYS_CREATE: 'always-create',
};

export const EXTENSION_APPS = {
  subtitle: {
    urlPath: 'src/html/subtitle.html',
    launchPolicy: EXTENSION_APP_LAUNCH_POLICY.FOCUS_OR_CREATE,
  },
  pdf: {
    urlPath: 'src/html/pdf.html',
    launchPolicy: EXTENSION_APP_LAUNCH_POLICY.ALWAYS_CREATE,
  },
};
