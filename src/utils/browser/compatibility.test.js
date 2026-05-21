import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectSite, SITE_PLATFORMS } from './compatibility.js';

describe('compatibility - detectSite', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: {
        hostname: ''
      }
    });
  });

  it('should return Default when window is undefined', () => {
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;
    
    expect(detectSite()).toBe(SITE_PLATFORMS.Default);
    
    global.window = originalWindow;
  });

  it('should return Default when hostname is missing', () => {
    vi.stubGlobal('window', { location: {} });
    expect(detectSite()).toBe(SITE_PLATFORMS.Default);
  });

  it('should detect Twitter correctly', () => {
    window.location.hostname = 'twitter.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.Twitter);
    
    window.location.hostname = 'x.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.Twitter);
    
    window.location.hostname = 'subdomain.twitter.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.Twitter);
  });

  it('should detect WhatsApp correctly', () => {
    window.location.hostname = 'web.whatsapp.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.WhatsApp);
  });

  it('should detect Instagram correctly', () => {
    window.location.hostname = 'www.instagram.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.Instagram);
  });

  it('should detect Telegram correctly', () => {
    window.location.hostname = 'web.telegram.org';
    expect(detectSite()).toBe(SITE_PLATFORMS.Telegram);
    
    window.location.hostname = 't.me';
    expect(detectSite()).toBe(SITE_PLATFORMS.Telegram);
  });

  it('should detect Medium correctly', () => {
    window.location.hostname = 'medium.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.Medium);
  });

  it('should detect ChatGPT correctly', () => {
    window.location.hostname = 'chatgpt.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.ChatGPT);
    
    window.location.hostname = 'openai.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.ChatGPT);
  });

  it('should detect Youtube correctly', () => {
    window.location.hostname = 'www.youtube.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.Youtube);
  });

  it('should detect Discord correctly', () => {
    window.location.hostname = 'discord.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.Discord);
  });

  it('should return Default for unknown sites', () => {
    window.location.hostname = 'google.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.Default);
    
    window.location.hostname = 'github.com';
    expect(detectSite()).toBe(SITE_PLATFORMS.Default);
  });

  it('should be case-insensitive', () => {
    window.location.hostname = 'TWITTER.COM';
    expect(detectSite()).toBe(SITE_PLATFORMS.Twitter);
  });
});
