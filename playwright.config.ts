import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const webPort = process.env.E2E_WEB_PORT ?? '3117';
const webUrl = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: './e2e',
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
  webServer: [
    {
      command: 'node apps/api/dist/main.js',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        API_PORT: '4000',
        COOKIE_SECURE: 'false',
        DATABASE_URL: databaseUrl ?? '',
        FILE_STORAGE_PATH: './data/e2e',
        LOGIN_RATE_LIMIT_ATTEMPTS: '20',
        LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
        NODE_ENV: 'test',
        SESSION_TTL_DAYS: '1',
        WEB_ORIGIN: webUrl,
      },
    },
    {
      command: `node node_modules/next/dist/bin/next start --port ${webPort}`,
      cwd: './apps/web',
      url: webUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
});
