import { defineConfig, devices } from '@playwright/test';

const webPort = process.env.E2E_WEB_PORT ?? '3117';
const webUrl = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'master-token-drag.spec.ts',
    'public-character-share.spec.ts',
    'random-map-wizard.spec.ts',
    'reference-search.spec.ts',
    'responsive-battle-layout.spec.ts',
  ],
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: webUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node scripts/start-standalone-web.mjs',
    url: webUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      PORT: webPort,
    },
  },
});
