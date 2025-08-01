import { ref, onMounted } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";

const isWarmedUp = ref(false);
const warmupInProgress = ref(false);
let warmupPromise = null;

export function useBackgroundWarmup() {
  const { messenger } = useBrowserAPI('background-warmup');

  const warmupBackground = () => {
    if (warmupPromise) return warmupPromise;

    warmupInProgress.value = true;
    warmupPromise = new Promise(async (resolveOuter) => {
      for (let i = 0; i < 5; i++) {
        try {
          const response = await messenger.sendMessage({ action: "ping", warmup: true });
          if (response && response.success) {
            isWarmedUp.value = true;
            warmupInProgress.value = false;
            resolveOuter(true);
            return;
          }
        } catch (error) {
          // Ignore errors and retry
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
      }
      isWarmedUp.value = true; // Assume ready after all attempts
      warmupInProgress.value = false;
      resolveOuter(false);
    });

    return warmupPromise;
  };

  const ensureWarmedUp = async () => {
    if (!isWarmedUp.value) {
      await warmupBackground();
    }
    return isWarmedUp.value;
  };

  const resetWarmup = () => {
    isWarmedUp.value = false;
    warmupInProgress.value = false;
    warmupPromise = null;
  };

  onMounted(() => {
    setTimeout(() => warmupBackground().catch(() => {}), 100);
  });

  return { isWarmedUp, warmupInProgress, warmupBackground, ensureWarmedUp, resetWarmup };
}
