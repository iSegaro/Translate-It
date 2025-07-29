/**
 * Provider Handler - Handle provider-related requests
 * Based on OLD implementation pattern for reliability
 */

export async function getAvailableProviders() {
  console.log("[ProviderHandler] Getting available providers");

  try {
    // Import provider registry dynamically
    const { ProviderRegistry } = await import("../providers/index.js");

    // Get available providers based on browser compatibility
    const providers = ProviderRegistry.getAvailableProviders();

    console.log("[ProviderHandler] Available providers:", providers.length);

    return providers;
  } catch (error) {
    console.error("[ProviderHandler] Error getting providers:", error);

    // Return default fallback providers
    return [
      {
        id: "google",
        name: "Google Translate",
        description: "Free Google Translate service",
        type: "free",
        available: true,
      },
    ];
  }
}
