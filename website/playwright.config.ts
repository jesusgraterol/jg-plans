import { defineConfig, devices } from '@playwright/test';
import { reservePort } from 'jg-process';
import { z } from 'zod';

// Workers reload this config, so inherit the parent's single preview port.
let previewPort = z.coerce
  .number()
  .int()
  .min(1)
  .max(65_535)
  .optional()
  .parse(process.env.JG_PLANS_TEST_PREVIEW_PORT);
if (previewPort === undefined) {
  const reservation = await reservePort();
  previewPort = reservation.port;
  await reservation.release();
  process.env.JG_PLANS_TEST_PREVIEW_PORT = String(previewPort);
}

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.test-e2e.ts',
  testIgnore: ['**/_archive/**', '**/_archives/**', '**/_backup/**', '**/_backups/**'],
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  reporter: 'list',
  outputDir: './test-results',
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `pnpm preview --port ${previewPort} --ignore-lock`,
    url: `http://127.0.0.1:${previewPort}`,
    reuseExistingServer: false,
  },
});
