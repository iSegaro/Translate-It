import { ref, onMounted, watch, unref } from "vue";
import browser from "webextension-polyfill";

/**
 * Composable to fetch and track the active tab's URL.
 * Safe to use in both popup, sidepanel, and options contexts.
 *
 * @param {Object} [options] Options for the composable
 * @param {boolean|Ref<boolean>|Function} [options.enabled=true] Whether the active tab URL resolution is enabled
 * @returns {Object} Active tab URL state and controls
 */
export function useActiveTabUrl(options = {}) {
  const activeTabUrl = ref("");
  const isActiveTabUrlLoading = ref(false);

  async function refreshActiveTabUrl() {
    const isEnabled =
      options.enabled !== undefined ? unref(options.enabled) : true;
    if (!isEnabled) {
      activeTabUrl.value = "";
      return;
    }

    if (typeof browser === "undefined" || !browser.tabs) {
      activeTabUrl.value = "";
      return;
    }

    isActiveTabUrlLoading.value = true;
    try {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const activeTab = Array.isArray(tabs) ? tabs[0] : null;
      activeTabUrl.value = activeTab?.url || "";
    } catch {
      // Gracefully handle errors and default to an empty string
      activeTabUrl.value = "";
    } finally {
      isActiveTabUrlLoading.value = false;
    }
  }

  onMounted(() => {
    refreshActiveTabUrl();
  });

  // Watch for dynamic changes in the enabled option if it's reactive
  if (options.enabled !== undefined) {
    watch(
      () => unref(options.enabled),
      (newVal) => {
        if (newVal) {
          refreshActiveTabUrl();
        } else {
          activeTabUrl.value = "";
          isActiveTabUrlLoading.value = false;
        }
      },
    );
  }

  return {
    activeTabUrl,
    isActiveTabUrlLoading,
    refreshActiveTabUrl,
  };
}
