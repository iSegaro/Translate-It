// src/managers/NotificationManager.js
import { CONFIG } from '../config.js';
import { fadeOut } from '../utils/helpers.js';

export default class NotificationManager {
  constructor() {
    this.container = this.createContainer();
  }

  createContainer() {
    let container = document.getElementById('translation-notifications');
    if (!container) {
      container = document.createElement('div');
      container.id = 'translation-notifications';
      Object.assign(container.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '10000000000',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      });
      document.body.appendChild(container);
    }
    return container;
  }

  show(message, type = 'info', autoDismiss = true, duration = 3000, onClick) {
    const notification = document.createElement('div');
    const icon = CONFIG[`ICON_${type.toUpperCase()}`] || '💠';

    notification.innerHTML = `
      <span class="notification-icon">${icon}</span>
      <span class="notification-text">${message}</span>
    `;

    Object.assign(notification.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: this.getBackgroundColor(type),
      color: '#fff',
      padding: '8px 12px',
      borderRadius: '4px',
      fontSize: '14px',
      cursor: 'pointer',
      opacity: '1'
    });

    if (onClick) {
      notification.addEventListener('click', onClick);
    } else {
      notification.addEventListener('click', () => this.dismiss(notification));
    }

    this.container.appendChild(notification);

    if (autoDismiss) {
      setTimeout(() => this.dismiss(notification), duration);
    }

    return notification;
  }

  dismiss(notification) {
    fadeOut(notification);
  }

  getBackgroundColor(type) {
    const colors = {
      error: 'rgba(255,0,0,0.8)',
      success: 'rgba(0,128,0,0.8)',
      status: 'rgba(0,0,0,0.7)',
      warning: 'rgba(255,165,0,0.8)',
      info: 'rgba(30,144,255,0.8)'
    };
    return colors[type] || 'rgba(0,0,0,0.7)';
  }
}