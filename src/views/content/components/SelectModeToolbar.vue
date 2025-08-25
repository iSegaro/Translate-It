<template>
  <div class="select-mode-toolbar-wrapper">
    <div class="toolbar-content">
      <p class="toolbar-text">Select Element Mode is Active</p>
      <button class="toolbar-button" @click="deactivate">Cancel</button>
    </div>
  </div>
</template>

<script setup>
import { pageEventBus } from '@/utils/core/PageEventBus.js';

const deactivate = () => {
  // This will eventually communicate with the SelectElementManager
  // For now, it can just hide itself.
  console.log('Deactivate button clicked in SelectModeToolbar');
};
</script>

<style scoped>
.select-mode-toolbar-wrapper {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(30, 30, 30, 0.9);
  color: white;
  padding: 10px 20px;
  border-radius: 8px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 15px;
  backdrop-filter: blur(5px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  font-family: sans-serif;
}

.toolbar-text {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}

.toolbar-button {
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 5px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s;
}

.toolbar-button:hover {
  background-color: rgba(255, 255, 255, 0.2);
}
</style>
