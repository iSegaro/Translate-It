<!-- src/components/shared/PageTranslationStatus.vue -->
<script setup>
import { computed } from 'vue';
import { useMobileStore } from '@/store/modules/mobile.js';
import { TRANSLATION_STATUS } from '@/shared/config/constants.js';

const props = defineProps({
  // برای استفاده در Popup/Sidepanel که داده‌ها را دستی پاس می‌دهیم
  statusData: {
    type: Object,
    default: null
  },
  // حالت نمایش: 'desktop-fab' | 'mobile-header' | 'menu-item' | 'compact'
  mode: {
    type: String,
    default: 'desktop-fab'
  },
  // اجبار به نمایش (حتی اگر وضعیتی فعال نباشد)
  forceShow: {
    type: Boolean,
    default: false
  }
});

const mobileStore = useMobileStore();

// انتخاب منبع داده (Prop یا Store)
const status = computed(() => {
  const data = props.statusData || mobileStore.pageTranslationData;
  if (!data) return { isActive: false };

  // منطق تشخیص وضعیت (با در نظر گرفتن هر دو ساختار داده در Content و Popup)
  const isTranslating = !!(data.status === TRANSLATION_STATUS.TRANSLATING || data.isTranslating);
  const isAuto = !!(data.isAutoTranslating);
  const isError = !!(data.status === 'error' || data.hasError);
  
  // وضعیت تکمیل شده
  const isCompleted = !isError && !isTranslating && !isAuto && 
                     (data.status === TRANSLATION_STATUS.COMPLETED || data.isTranslated || (data.totalCount > 0 && data.translatedCount >= data.totalCount));

  const isActive = isTranslating || isAuto || isCompleted || isError;
  
  let type = '';
  if (isError) type = 'error';
  else if (isTranslating) type = 'translating';
  else if (isAuto) type = 'auto';
  else if (isCompleted) type = 'completed';

  return {
    isActive,
    type,
    isPulse: isTranslating || isAuto
  };
});
</script>

<template>
  <div
    v-if="status.isActive || forceShow"
    class="ti-page-status-indicator"
    :class="[
      status.type,
      `mode-${mode}`,
      { 'has-pulse': status.isPulse }
    ]"
  >
    <div v-if="status.isPulse" class="status-pulse-glow"></div>
    <div class="status-inner-dot"></div>
  </div>
</template>
