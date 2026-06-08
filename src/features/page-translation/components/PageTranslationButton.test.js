import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import PageTranslationButton from "./PageTranslationButton.vue";

// Mock components
vi.mock("@/components/base/BaseButton.vue", () => ({
  default: {
    name: "BaseButton",
    template: "<button><slot /></button>",
    props: ["variant", "disabled", "title"],
  },
}));

vi.mock("@/components/base/LoadingSpinner.vue", () => ({
  default: {
    name: "LoadingSpinner",
    template: '<div class="spinner"></div>',
  },
}));

vi.mock("@iconify/vue", () => ({
  Icon: {
    name: "Icon",
    template: '<i class="icon"></i>',
  },
}));

vi.mock("@/components/shared/PageTranslationStatus.vue", () => ({
  default: {
    name: "PageTranslationStatus",
    template: '<div class="status-badge"></div>',
  },
}));

// Mock Composables
const mockUsePageTranslation = {
  isTranslating: ref(false),
  isTranslated: ref(false),
  isAutoTranslating: ref(false),
  progress: ref(0),
  message: ref(""),
  canTranslate: ref(true),
  canRestore: ref(false),
  hasError: ref(false),
  translatePage: vi.fn(),
  restorePage: vi.fn(),
  stopAutoTranslation: vi.fn(),
  cancelTranslation: vi.fn(),
};

vi.mock("../composables/usePageTranslation.js", () => ({
  usePageTranslation: () => mockUsePageTranslation,
}));

vi.mock("@/composables/shared/useUnifiedI18n.js", () => ({
  useUnifiedI18n: () => ({
    t: vi.fn((key) => key),
  }),
}));

vi.mock("@/core/extensionContext.js", () => ({
  default: {
    safeGetURL: vi.fn((path) => path),
  },
}));

const mockUseAutoTranslateRules = {
  isAutoTranslateToggleVisible: ref(false),
  isAutoTranslateToggleActive: ref(false),
  isAutoTranslateToggleDisabled: ref(false),
  autoTranslateToggleTitle: ref("Add to auto-translate rules"),
  toggleAutoTranslateForCurrentPage: vi.fn(),
};

vi.mock("../composables/useAutoTranslateRules.js", () => ({
  useAutoTranslateRules: () => mockUseAutoTranslateRules,
}));

const mockUseActiveTabUrl = {
  activeTabUrl: ref("https://example.com/page"),
  isActiveTabUrlLoading: ref(false),
  refreshActiveTabUrl: vi.fn(),
};

vi.mock("@/composables/core/useActiveTabUrl.js", () => ({
  useActiveTabUrl: () => mockUseActiveTabUrl,
}));

describe("PageTranslationButton.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePageTranslation.isTranslating.value = false;
    mockUsePageTranslation.isTranslated.value = false;
    mockUsePageTranslation.isAutoTranslating.value = false;
    mockUsePageTranslation.progress.value = 0;
    mockUsePageTranslation.canTranslate.value = true;
    mockUsePageTranslation.canRestore.value = false;
    mockUsePageTranslation.hasError.value = false;
  });

  it("should render translate button when idle", () => {
    const wrapper = mount(PageTranslationButton);
    expect(wrapper.text()).toContain("page_translation_btn_translate");
    expect(wrapper.findComponent({ name: "BaseButton" }).exists()).toBe(true);
  });

  it("should call translatePage when button is clicked", async () => {
    const wrapper = mount(PageTranslationButton);
    await wrapper.find("button").trigger("click");
    expect(mockUsePageTranslation.translatePage).toHaveBeenCalled();
  });

  it("should render loading state when translating", async () => {
    mockUsePageTranslation.isTranslating.value = true;
    const wrapper = mount(PageTranslationButton);
    expect(wrapper.findComponent({ name: "LoadingSpinner" }).exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain("popup_string_during_translate");
  });

  it("should render restore button when translated", async () => {
    mockUsePageTranslation.isTranslated.value = true;
    mockUsePageTranslation.canRestore.value = true;
    const wrapper = mount(PageTranslationButton);
    expect(wrapper.text()).toContain("page_translation_btn_restore");
  });

  it("should show progress bar when translating with progress > 0", async () => {
    mockUsePageTranslation.isTranslating.value = true;
    mockUsePageTranslation.progress.value = 45;
    const wrapper = mount(PageTranslationButton);
    const progressFill = wrapper.find(".progress-fill");
    expect(progressFill.exists()).toBe(true);
    expect(progressFill.attributes("style")).toContain("width: 45%");
  });

  it("should render text-only mode correctly", () => {
    const wrapper = mount(PageTranslationButton, {
      props: { textOnly: true },
    });
    expect(wrapper.find("a.toolbar-link").exists()).toBe(true);
    expect(wrapper.findComponent({ name: "BaseButton" }).exists()).toBe(false);
  });

  it("should handle cancel/stop correctly", async () => {
    mockUsePageTranslation.isAutoTranslating.value = true;
    const wrapper = mount(PageTranslationButton);
    await wrapper.find("button").trigger("click");
    expect(mockUsePageTranslation.stopAutoTranslation).toHaveBeenCalled();

    mockUsePageTranslation.isAutoTranslating.value = false;
    mockUsePageTranslation.isTranslating.value = true;
    await wrapper.find("button").trigger("click");
    expect(mockUsePageTranslation.cancelTranslation).toHaveBeenCalled();
  });

  it("should show error badge when hasError is true", () => {
    mockUsePageTranslation.hasError.value = true;
    const wrapper = mount(PageTranslationButton);
    expect(
      wrapper.findComponent({ name: "PageTranslationStatus" }).exists(),
    ).toBe(true);
  });

  describe("Auto-Translate Star Toggle", () => {
    beforeEach(() => {
      mockUseAutoTranslateRules.isAutoTranslateToggleVisible.value = false;
      mockUseAutoTranslateRules.isAutoTranslateToggleActive.value = false;
      mockUseAutoTranslateRules.isAutoTranslateToggleDisabled.value = false;
      mockUseAutoTranslateRules.autoTranslateToggleTitle.value =
        "Add to auto-translate rules";
      mockUseAutoTranslateRules.toggleAutoTranslateForCurrentPage.mockClear();
    });

    it("should not show star button if showAutoTranslateToggle is false", () => {
      mockUseAutoTranslateRules.isAutoTranslateToggleVisible.value = true;
      const wrapper = mount(PageTranslationButton, {
        props: { showAutoTranslateToggle: false },
      });
      expect(wrapper.find(".page-translate-star-btn").exists()).toBe(false);
    });

    it("should not show star button if isAutoTranslateToggleVisible is false", () => {
      mockUseAutoTranslateRules.isAutoTranslateToggleVisible.value = false;
      const wrapper = mount(PageTranslationButton, {
        props: { showAutoTranslateToggle: true },
      });
      expect(wrapper.find(".page-translate-star-btn").exists()).toBe(false);
    });

    it("should show star button if showAutoTranslateToggle and isAutoTranslateToggleVisible are true", () => {
      mockUseAutoTranslateRules.isAutoTranslateToggleVisible.value = true;
      const wrapper = mount(PageTranslationButton, {
        props: { showAutoTranslateToggle: true },
      });
      expect(wrapper.find(".page-translate-star-btn").exists()).toBe(true);
    });

    it("should bind classes and attributes correctly", () => {
      mockUseAutoTranslateRules.isAutoTranslateToggleVisible.value = true;
      mockUseAutoTranslateRules.isAutoTranslateToggleActive.value = true;
      mockUseAutoTranslateRules.isAutoTranslateToggleDisabled.value = true;
      mockUseAutoTranslateRules.autoTranslateToggleTitle.value =
        "Broader rule match";

      const wrapper = mount(PageTranslationButton, {
        props: { showAutoTranslateToggle: true },
      });

      const btn = wrapper.find(".page-translate-star-btn");
      expect(btn.classes()).toContain("is-active");
      expect(btn.classes()).toContain("is-disabled");
      expect(btn.attributes("disabled")).toBeDefined();
      expect(btn.attributes("title")).toBe("Broader rule match");
    });

    it("should invoke toggleAutoTranslateForCurrentPage on click if not disabled", async () => {
      mockUseAutoTranslateRules.isAutoTranslateToggleVisible.value = true;
      mockUseAutoTranslateRules.isAutoTranslateToggleDisabled.value = false;

      const wrapper = mount(PageTranslationButton, {
        props: { showAutoTranslateToggle: true },
      });

      await wrapper.find(".page-translate-star-btn").trigger("click");
      expect(
        mockUseAutoTranslateRules.toggleAutoTranslateForCurrentPage,
      ).toHaveBeenCalled();
    });

    it("should not invoke toggleAutoTranslateForCurrentPage on click if disabled", async () => {
      mockUseAutoTranslateRules.isAutoTranslateToggleVisible.value = true;
      mockUseAutoTranslateRules.isAutoTranslateToggleDisabled.value = true;

      const wrapper = mount(PageTranslationButton, {
        props: { showAutoTranslateToggle: true },
      });

      await wrapper.find(".page-translate-star-btn").trigger("click");
      expect(
        mockUseAutoTranslateRules.toggleAutoTranslateForCurrentPage,
      ).not.toHaveBeenCalled();
    });

    it("should not trigger page translation when star button is clicked", async () => {
      mockUseAutoTranslateRules.isAutoTranslateToggleVisible.value = true;
      mockUseAutoTranslateRules.isAutoTranslateToggleDisabled.value = false;

      const wrapper = mount(PageTranslationButton, {
        props: { showAutoTranslateToggle: true },
      });

      await wrapper.find(".page-translate-star-btn").trigger("click");
      expect(mockUsePageTranslation.translatePage).not.toHaveBeenCalled();
    });
  });
});
