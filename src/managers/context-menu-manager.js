import browser from 'webextension-polyfill';
import { getSettingsAsync } from '../config.js';

export async function createContextMenu() {
  await browser.contextMenus.removeAll();

  const config = await getSettingsAsync();

  // 1. Text Selection Context Menu
  if (config.TRANSLATE_ON_TEXT_SELECTION) {
    browser.contextMenus.create({
      id: 'translate-selection',
      title: browser.i18n.getMessage('context_menu_translate_with_selection'),
      contexts: ['selection'],
    });
  }

  // 2. Action Menu (Right-click on toolbar icon)
  browser.contextMenus.create({
    id: 'open-options',
    title: browser.i18n.getMessage('context_menu_options'),
    contexts: ['action'],
  });

  if (config.ENABLE_SCREEN_CAPTURE) {
    browser.contextMenus.create({
      id: 'translate-screen',
      title: browser.i18n.getMessage('context_menu_translate_screen'),
      contexts: ['action'],
    });
  }

  browser.contextMenus.create({
    id: 'open-help',
    title: browser.i18n.getMessage('context_menu_help'),
    contexts: ['action'],
  });

  // Separator
  browser.contextMenus.create({
    id: 'separator-1',
    type: 'separator',
    contexts: ['action'],
  });

  // Debug menu (only in development)
  if (process.env.NODE_ENV === 'development') {
    browser.contextMenus.create({
      id: 'reload-extension',
      title: browser.i18n.getMessage('context_menu_reload_extension'),
      contexts: ['action'],
    });
  }
}
