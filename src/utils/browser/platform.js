export const Platform = {
  MAC: 'MAC',
  WINDOWS: 'WINDOWS',
  LINUX: 'LINUX',
  UNKNOWN: 'UNKNOWN'
};

export function detectPlatform() {
  if (typeof navigator === 'undefined') {
    return Platform.UNKNOWN;
  }
  const platform = navigator.platform.toLowerCase();
  if (platform.startsWith('mac')) {
    return Platform.MAC;
  }
  if (platform.startsWith('win')) {
    return Platform.WINDOWS;
  }
  if (platform.includes('linux')) {
    return Platform.LINUX;
  }
  return Platform.UNKNOWN;
}