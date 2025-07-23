// src/utils/framework-compat/text-insertion/detector.js

/**
 * تشخیص بهترین استراتژی برای المان و سایت
 * @param {HTMLElement} element - المان هدف
 * @returns {string} نوع استراتژی بهینه
 */
export function detectOptimalStrategy(element) {
  const hostname = window.location.hostname;

  // Google Docs - استراتژی ویژه
  if (hostname.includes("docs.google.com")) {
    return "google-docs";
  }

  // سایت‌های spellcheck-based (Discord, Twitch)
  if (
    element.hasAttribute("spellcheck") &&
    element.getAttribute("spellcheck") === "true"
  ) {
    return "paste-first";
  }

  // AI platforms که execCommand بهتر کار می‌کند
  if (
    ["chat.openai.com", "claude.ai", "bard.google.com", "butterflies.ai"].some(
      (site) => hostname.includes(site)
    )
  ) {
    return "exec-first";
  }

  // سایت‌هایی که paste event بهتر عمل می‌کند
  if (["discord.com", "twitch.tv"].some((site) => hostname.includes(site))) {
    return "paste-first";
  }

  return "universal";
}
