<template>
  <div 
    class="subtitle-dropzone"
    :class="{ 'is-dragging': isDragging, 'has-file': modelValue }"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="handleDrop"
    @click="$refs.fileInput.click()"
  >
    <input 
      ref="fileInput" 
      type="file" 
      class="hidden-input" 
      accept=".srt,.vtt,.ass"
      @change="handleFileSelect"
    >
    
    <div class="dropzone-content">
      <div class="icon-wrapper">
        <v-icon :icon="modelValue ? 'mdi:file-check-outline' : 'mdi:cloud-upload-outline'" />
      </div>
      
      <div
        v-if="!modelValue"
        class="text-content"
      >
        <h3>{{ t('subtitle_drop_title', 'Drop your subtitle file here') }}</h3>
        <p>{{ t('subtitle_drop_hint', 'Supports .srt, .vtt, .ass') }}</p>
      </div>
      
      <div
        v-else
        class="file-info"
      >
        <h3>{{ modelValue.name }}</h3>
        <p>{{ formatSize(modelValue.size) }}</p>

        <div class="encoding-wrapper" @click.stop>
          <label for="encoding-select">{{ t('subtitle_encoding_label', 'Encoding') }}</label>
          <select 
            id="encoding-select" 
            v-model="selectedEncoding"
            @change="reprocessFile"
          >
            <option v-for="enc in encodings" :key="enc.value" :value="enc.value">
              {{ enc.label }}
            </option>
          </select>
        </div>
      </div>
      
      <button class="select-button">
        {{ modelValue ? t('subtitle_change_file', 'Change File') : t('subtitle_select_file', 'Select File') }}
      </button>
    </div>

    <!-- Animated background element -->
    <div class="dropzone-glow" />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Icon as VIcon } from '@iconify/vue';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';

const { t } = useUnifiedI18n();

const props = defineProps({
  modelValue: { type: [File, null], default: null }
});

const emit = defineEmits(['update:modelValue', 'file-loaded']);

const isDragging = ref(false);
const selectedEncoding = ref('UTF-8');

const encodings = [
  { label: 'UTF-8', value: 'UTF-8' },
  { label: 'Windows-1256 (Persian/Arabic)', value: 'windows-1256' },
  { label: 'ISO-8859-1 (Western)', value: 'iso-8859-1' },
  { label: 'Windows-1252 (Western)', value: 'windows-1252' },
  { label: 'UTF-16LE', value: 'utf-16le' },
  { label: 'UTF-16BE', value: 'utf-16be' }
];

const handleDrop = (e) => {
  isDragging.value = false;
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
};

const handleFileSelect = (e) => {
  const file = e.target.files[0];
  if (file) processFile(file);
};

const processFile = (file) => {
  emit('update:modelValue', file);
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const buffer = e.target.result;
    try {
      const decoder = new TextDecoder(selectedEncoding.value);
      const text = decoder.decode(buffer);
      emit('file-loaded', text);
    } catch (err) {
      console.error('Decoding failed:', err);
      // Fallback or notify user
    }
  };
  reader.readAsArrayBuffer(file);
};

const reprocessFile = () => {
  if (props.modelValue) {
    processFile(props.modelValue);
  }
};

const formatSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
</script>

<style lang="scss" scoped>
.subtitle-dropzone {
  position: relative;
  width: 100%;
  min-height: 240px;
  border: 2px dashed var(--border-color, rgba(255, 255, 255, 0.1));
  border-radius: 20px;
  background: var(--bg-glass, rgba(255, 255, 255, 0.03));
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  margin-bottom: 2rem;

  &:hover, &.is-dragging {
    border-color: var(--primary-color, #6366f1);
    background: var(--bg-glass-hover, rgba(255, 255, 255, 0.05));
    transform: translateY(-2px);
    
    .icon-wrapper {
      transform: scale(1.1) rotate(5deg);
      color: var(--primary-color, #6366f1);
    }

    .dropzone-glow {
      opacity: 1;
    }
  }

  &.has-file {
    border-style: solid;
    border-color: var(--success-color, #10b981);
    
    .icon-wrapper {
      color: var(--success-color, #10b981);
    }
  }

  .hidden-input {
    display: none;
  }

  .dropzone-content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 2rem;

    .icon-wrapper {
      font-size: 4rem;
      margin-bottom: 1rem;
      transition: all 0.4s ease;
      color: var(--text-secondary, rgba(255, 255, 255, 0.6));
    }

    .file-info {
      h3 {
        font-size: 1.25rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: var(--text-primary, #fff);
      }

      p {
        font-size: 0.9rem;
        color: var(--text-secondary, rgba(255, 255, 255, 0.6));
        margin-bottom: 1rem;
      }

      .encoding-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        background: rgba(0, 0, 0, 0.1);
        padding: 0.75rem;
        border-radius: 10px;
        border: 1px solid var(--border-color);

        label {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
        }

        select {
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          padding: 0.4rem 0.8rem;
          border-radius: 6px;
          font-size: 0.85rem;
          cursor: pointer;
          outline: none;
          width: 100%;
          max-width: 240px;

          &:focus {
            border-color: var(--primary-color);
          }
        }
      }
    }

    .select-button {
      margin-top: 1rem;
      padding: 0.75rem 1.5rem;
      border-radius: 12px;
      background: var(--primary-color, #6366f1);
      color: #fff;
      border: none;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        filter: brightness(1.1);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
      }
    }
  }

  .dropzone-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, var(--primary-glow, rgba(99, 102, 241, 0.15)) 0%, transparent 70%);
    opacity: 0;
    transition: opacity 0.5s ease;
    pointer-events: none;
    z-index: 1;
  }
}
</style>
