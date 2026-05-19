import { computed } from 'vue';
import { useSettingsStore } from '@/features/settings/stores/settings.js';

/**
 * Shared logic for toggling the Mouse Hover translation feature.
 */
export function useMouseHoverToggle() {
  const settingsStore = useSettingsStore();

  const isMouseHoverEnabled = computed(() => {
    return settingsStore.settings?.MOUSE_HOVER_TRANSLATION_ENABLED ?? false;
  });

  const toggleMouseHover = async () => {
    const newValue = !isMouseHoverEnabled.value;
    await settingsStore.updateSettingAndPersist('MOUSE_HOVER_TRANSLATION_ENABLED', newValue);
  };

  return {
    isMouseHoverEnabled,
    toggleMouseHover
  };
}
