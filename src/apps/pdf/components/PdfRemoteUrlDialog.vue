<template>
  <Transition name="dialog-fade">
    <div v-if="visible" class="pdf-remote-url-overlay" @click.self="handleClose">
      <div class="pdf-remote-url-dialog">
        <h2 class="pdf-remote-url-dialog__title">Open Remote PDF</h2>

        <form @submit.prevent="handleSubmit">
          <input
            ref="inputRef"
            v-model="urlInput"
            type="url"
            class="pdf-remote-url-dialog__input"
            placeholder="https://example.com/document.pdf"
            autofocus
          >
          <p v-if="validationError" class="pdf-remote-url-dialog__error">{{ validationError }}</p>

          <div class="pdf-remote-url-dialog__actions">
            <button
              type="button"
              class="pdf-remote-url-dialog__cancel"
              @click="handleClose"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="pdf-remote-url-dialog__submit"
              :disabled="!canSubmit || loading"
            >
              {{ loading ? 'Opening...' : 'Open' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'submit']);

const urlInput = ref('');
const inputRef = ref(null);
const validationError = ref('');

const canSubmit = computed(() => {
  const url = urlInput.value.trim();
  if (!url) return false;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
});

function validateInput() {
  const url = urlInput.value.trim();
  if (!url) {
    validationError.value = 'Please enter a URL.';
    return false;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      validationError.value = 'Only HTTP and HTTPS protocols are supported.';
      return false;
    }
    validationError.value = '';
    return true;
  } catch {
    validationError.value = 'Please enter a valid URL.';
    return false;
  }
}

function handleSubmit() {
  if (!validateInput()) return;
  emit('submit', urlInput.value.trim());
}

function handleClose() {
  emit('close');
}

function resetState() {
  urlInput.value = '';
  validationError.value = '';
}

watch(() => props.visible, (val) => {
  if (val) {
    nextTick(() => inputRef.value?.focus());
  } else {
    resetState();
  }
});
</script>

<style scoped>
.pdf-remote-url-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: calc(var(--pdf-layer-overlay, 50) + 10);
}

.pdf-remote-url-dialog {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 24px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.pdf-remote-url-dialog__title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text);
}

.pdf-remote-url-dialog__input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-input-bg, var(--color-surface));
  outline: none;
  transition: border-color 0.15s;
}

.pdf-remote-url-dialog__input:focus {
  border-color: var(--color-primary);
}

.pdf-remote-url-dialog__error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-danger, #e53e3e);
}

.pdf-remote-url-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.pdf-remote-url-dialog__cancel {
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
}

.pdf-remote-url-dialog__submit {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
}

.pdf-remote-url-dialog__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
</style>
