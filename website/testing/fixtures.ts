import { resolve } from 'node:path';
import { expect, test as baseTest } from '@playwright/test';
import { readBoundedFile } from 'jg-fs';

import { SiteReleaseSchema, type IAvailability } from '../src/availability.ts';

export const test = baseTest.extend<{ availability: IAvailability; browserErrors: string[] }>({
  availability: async ({}, use) => {
    const bytes = await readBoundedFile(
      resolve(import.meta.dirname, '../dist/release.json'),
      1024 * 1024,
    );
    await use(SiteReleaseSchema.parse(JSON.parse(bytes.toString('utf8'))));
  },
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      const onPageError = (error: Error): void => {
        errors.push(error.message);
      };
      const onConsole = (message: import('@playwright/test').ConsoleMessage): void => {
        if (message.type() === 'error') errors.push(message.text());
      };
      page.on('pageerror', onPageError);
      page.on('console', onConsole);
      try {
        await use(errors);
      } finally {
        page.off('pageerror', onPageError);
        page.off('console', onConsole);
        expect(errors).toEqual([]);
      }
    },
    { auto: true },
  ],
});
