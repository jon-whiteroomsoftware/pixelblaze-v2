import { defineConfig, devices } from '@playwright/test'

// E2E config. Specs live in e2e/ (kept out of the Vitest unit suite — see vite.config.ts).
// The dev server is reused if already running on 5174; otherwise Playwright starts it.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174/pixelblaze-v2/',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174/pixelblaze-v2/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
