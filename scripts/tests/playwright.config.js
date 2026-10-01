import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './visual',
  snapshotDir: './visual/snapshots',
  webServer: {
    command: 'node visual-server.mjs',
    url: 'http://127.0.0.1:8788/en/',
    reuseExistingServer: true,
  },
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:8788',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
  ],
});
