import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000
  },
  
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  reporter: 'html',
  
  use: {
    actionTimeout: 0,
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox', 
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'extension-chrome',
      use: {
        channel: 'chrome',
        launchOptions: {
          args: [
            '--disable-extensions-except=./dist',
            '--load-extension=./dist'
          ]
        }
      }
    }
  ],

  webServer: {
    command: 'pnpm run dev:vue',
    port: 3000,
    reuseExistingServer: !process.env.CI
  }
})