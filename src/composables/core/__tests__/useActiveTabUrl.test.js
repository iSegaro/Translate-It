import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useActiveTabUrl } from "../useActiveTabUrl.js";
import browser from "webextension-polyfill";

// Mock webextension-polyfill
vi.mock("webextension-polyfill", () => ({
  default: {
    tabs: {
      query: vi.fn(),
    },
  },
}));

describe("useActiveTabUrl", () => {
  let composable;

  function mountTestComponent(options = {}) {
    const TestComponent = defineComponent({
      setup() {
        composable = useActiveTabUrl(options);
        return () => h("div");
      },
    });
    return mount(TestComponent);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    composable = null;
  });

  it("should query active tab url on mount by default", async () => {
    browser.tabs.query.mockResolvedValue([
      { url: "https://example.com/page1" },
    ]);

    const wrapper = mountTestComponent();

    // Wait for the query to resolve
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(browser.tabs.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });
    expect(composable.activeTabUrl.value).toBe("https://example.com/page1");
    expect(composable.isActiveTabUrlLoading.value).toBe(false);

    wrapper.unmount();
  });

  it("should default to empty string if query resolves to empty/invalid", async () => {
    browser.tabs.query.mockResolvedValue([]);

    const wrapper = mountTestComponent();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(composable.activeTabUrl.value).toBe("");
    wrapper.unmount();
  });

  it("should handle errors gracefully and default to empty string", async () => {
    browser.tabs.query.mockRejectedValue(
      new Error("Extension context invalidated"),
    );

    const wrapper = mountTestComponent();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(composable.activeTabUrl.value).toBe("");
    wrapper.unmount();
  });

  it("should not query on mount if options.enabled is false", async () => {
    browser.tabs.query.mockResolvedValue([{ url: "https://example.com/page" }]);

    const wrapper = mountTestComponent({ enabled: false });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(browser.tabs.query).not.toHaveBeenCalled();
    expect(composable.activeTabUrl.value).toBe("");
    wrapper.unmount();
  });

  it("should query when options.enabled becomes true dynamically", async () => {
    browser.tabs.query.mockResolvedValue([
      { url: "https://example.com/page-dynamic" },
    ]);

    const enabledRef = ref(false);
    const wrapper = mountTestComponent({ enabled: enabledRef });

    expect(browser.tabs.query).not.toHaveBeenCalled();

    enabledRef.value = true;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(browser.tabs.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });
    expect(composable.activeTabUrl.value).toBe(
      "https://example.com/page-dynamic",
    );
    wrapper.unmount();
  });

  it("should clear url and loading state when options.enabled becomes false dynamically", async () => {
    browser.tabs.query.mockResolvedValue([
      { url: "https://example.com/page-dynamic" },
    ]);

    const enabledRef = ref(true);
    const wrapper = mountTestComponent({ enabled: enabledRef });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(composable.activeTabUrl.value).toBe(
      "https://example.com/page-dynamic",
    );

    enabledRef.value = false;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(composable.activeTabUrl.value).toBe("");
    expect(composable.isActiveTabUrlLoading.value).toBe(false);
    wrapper.unmount();
  });
});
