<template>
  <div class="about-page">
    <h2 class="page-title">About Translate It</h2>
    
    <div class="about-card">
      <div class="app-info">
        <div class="app-icon">🌐</div>
        <div class="app-details">
          <h3 class="app-name">Translate It</h3>
          <p class="app-version">Version 0.9.1</p>
          <p class="app-description">
            Smart Translation Assistant for your browser
          </p>
        </div>
      </div>
      
      <div class="features-list">
        <h4 class="features-title">Features</h4>
        <ul class="features">
          <li>Multiple translation providers</li>
          <li>Screen capture translation</li>
          <li>Text to speech</li>
          <li>Subtitle translation</li>
          <li>Cross-browser support</li>
        </ul>
      </div>
      
      <div class="links-section">
        <h4 class="links-title">Links</h4>
        <div class="links">
          <a href="#" class="link">GitHub Repository</a>
          <a href="#" class="link">Privacy Policy</a>
          <a href="#" class="link">Support</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Component implementation
</script>

<style scoped>
.about-page {
  max-width: 600px;
}

.page-title {
  font-size: var(--font-size-xxl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin: 0 0 24px 0;
}

.about-card {
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background-color: var(--color-background);
}

.app-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.app-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--border-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  background-color: var(--color-primary);
  color: white;
}

.app-details h3 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin: 0 0 4px 0;
}

.app-version {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin: 0 0 8px 0;
}

.app-description {
  font-size: var(--font-size-base);
  color: var(--color-text);
  margin: 0;
}

.features-title,
.links-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin: 0 0 12px 0;
}

.features {
  list-style: none;
  padding: 0;
  margin: 0 0 24px 0;
}

.features li {
  font-size: var(--font-size-base);
  color: var(--color-text);
  margin-bottom: 4px;
  
  &:before {
    content: '✓';
    color: var(--color-success);
    font-weight: bold;
    margin-right: 8px;
  }
}

.links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.link {
  font-size: var(--font-size-base);
  color: var(--color-primary);
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
}
</style>