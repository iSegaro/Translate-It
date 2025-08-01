<template>
  <footer class="options-footer">
    <div class="footer-content">
      <div class="footer-links">
        <a
          href="#"
          class="footer-link"
        >Privacy Policy</a>
        <span class="separator">•</span>
        <a
          href="#"
          class="footer-link"
        >Support</a>
        <span class="separator">•</span>
        <a
          href="#"
          class="footer-link"
        >GitHub</a>
      </div>
      
      <div class="footer-info">
        <span class="copyright">© 2024 Translate It Extension</span>
      </div>
    </div>
  </footer>
</template>

<script setup>
// Component implementation
</script>

<style scoped>
.options-footer {
  background-color: var(--color-surface);
  border-top: 1px solid var(--color-border);
  padding: 16px 24px;
  flex-shrink: 0;
  margin-top: auto;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1200px;
  margin: 0 auto;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-link {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: color var(--transition-base);
  
  &:hover {
    color: var(--color-primary);
  }
}

.separator {
  color: var(--color-text-disabled);
  font-size: var(--font-size-sm);
}

.footer-info {
  font-size: var(--font-size-xs);
  color: var(--color-text-disabled);
}

@media (max-width: 768px) {
  .footer-content {
    flex-direction: column;
    gap: 8px;
    text-align: center;
  }
}
</style>