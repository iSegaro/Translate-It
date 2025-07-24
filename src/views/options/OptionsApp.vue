<template>
  <div class="extension-options">
    <div v-if="isLoading" class="loading-container">
      <LoadingSpinner size="xl" />
      <span class="loading-text">Loading Settings...</span>
    </div>
    
    <template v-else>
      <!-- Header -->
      <OptionsHeader />
      
      <!-- Main Content -->
      <div class="options-content">
        <!-- Navigation Sidebar -->
        <OptionsNavigation 
          :current-route="$route.name"
          @navigate="handleNavigate"
        />
        
        <!-- Settings Content -->
        <div class="settings-content">
          <router-view />
        </div>
      </div>
      
      <!-- Footer -->
      <OptionsFooter />
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/store/core/settings'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import OptionsHeader from '@/components/layout/OptionsHeader.vue'
import OptionsNavigation from '@/components/layout/OptionsNavigation.vue'
import OptionsFooter from '@/components/layout/OptionsFooter.vue'

// Router & Stores
const router = useRouter()
const settingsStore = useSettingsStore()

// State
const isLoading = ref(true)

// Methods
const handleNavigate = (routeName) => {
  router.push({ name: routeName })
}

// Lifecycle
onMounted(async () => {
  try {
    // Wait for settings to load
    await settingsStore.loadSettings()
    
    // Initialize options-specific features
    await initializeOptions()
  } catch (error) {
    console.error('Failed to initialize options:', error)
  } finally {
    isLoading.value = false
  }
})

const initializeOptions = async () => {
  try {
    // Load settings modules
    const { loadSettingsModules } = await import('@/app/main/options.js')
    await loadSettingsModules()
  } catch (error) {
    console.warn('Failed to load settings modules:', error)
  }
}
</script>

<style scoped>
.extension-options {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-background);
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 1.5rem;
  padding: 3rem;
}

.loading-text {
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
}

.options-content {
  display: flex;
  flex: 1;
  min-height: 0;
}

.settings-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .options-content {
    flex-direction: column;
  }
  
  .settings-content {
    padding: 1rem;
  }
}
</style>