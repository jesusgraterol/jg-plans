import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, inspectMotion, waitForPageAssets } from 'jg-playwright';
import { expectNoAxeViolations } from 'jg-playwright/axe';

import { PAGES, SITE } from '../site.config.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 768, 1440]) {
    test(`${colorScheme} at ${width}px: readable, accessible production pages`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      for (const route of PAGES) {
        await page.goto(route.path);
        await waitForPageAssets(page);
        await expect(page.locator('h1')).toHaveCount(1);
        expect(
          await page
            .locator('h1')
            .evaluate((heading) => parseFloat(getComputedStyle(heading).fontSize)),
        ).toBeGreaterThan(32);
        const brand = page
          .getByRole('link', { name: 'jg-plans home' })
          .getByText('jg-plans', { exact: true });
        expect(await brand.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        await expect(page.getByText('Development preview', { exact: true })).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await expectNoAxeViolations(page);
        expect((await inspectMotion(page)).movingAnimations).toEqual([]);
        const localLinks = await page
          .locator('a[href^="#"]')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
        for (const href of localLinks) {
          expect(
            await page.locator(`[id="${href?.slice(1)}"]`).count(),
            `${route.path}${href}`,
          ).toBe(1);
        }
        if (route.path === '/') {
          await page.screenshot({
            path: testInfo.outputPath(`home-${colorScheme}-${width}.png`),
            fullPage: true,
          });
        }
      }
    });
  }
}

test('keyboard navigation, theme persistence, copy, and mobile menu', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const initial = await page.locator('html').getAttribute('data-resolved-theme');
  await page.locator('[data-theme-control]:visible').click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-resolved-theme',
    initial === 'dark' ? 'light' : 'dark',
  );
  await page.getByRole('link', { name: 'Read the protocol' }).click();
  await expect(page).toHaveURL('/protocol/0.1/');
  await expect(page.locator('html')).toHaveAttribute(
    'data-resolved-theme',
    initial === 'dark' ? 'light' : 'dark',
  );
  await page.goto('/');
  await page.locator('[data-copy-button]').first().click();
  await expect(page.locator('[data-copy-button]').first()).toHaveAttribute(
    'data-copy-state',
    'success',
  );
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('1792612800_search-feedback');
  expect(copied).toContain('# Search feedback');
  await page.setViewportSize({ width: 320, height: 800 });
  const menu = page.locator('[data-site-menu] summary');
  await menu.click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(page.locator('[data-site-menu]')).not.toHaveAttribute('open');
  expect(await page.evaluate((key) => localStorage.getItem(key), SITE.themeKey)).toBe(
    initial === 'dark' ? 'light' : 'dark',
  );
});

test('clipboard denial provides manual-copy feedback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
      },
    });
  });
  await page.goto('/');
  await page.locator('[data-copy-button]').first().click();
  await expect(page.locator('[data-copy-button]').first()).toHaveAttribute(
    'data-copy-state',
    'error',
  );
  await expect(page.locator('[data-copy-hint]:visible')).toContainText(/select|manually|copy/i);
});

test('documents and narrow navigation work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 900 },
    colorScheme: 'dark',
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4322/protocol/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'The jg-plans protocol' }),
    ).toBeVisible();
    await page.locator('[data-site-menu] summary').click();
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
    await page.locator('article').getByRole('link', { name: 'Protocol 0.1' }).click();
    await expect(page.locator('h1')).toHaveText('jg-plans protocol 0.1');
    await expectNoHorizontalOverflow(page);
  } finally {
    await context.close();
  }
});

test('documents remain readable at the 200-percent desktop equivalent', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 500 });
  await page.goto('/protocol/0.1/');
  await waitForPageAssets(page);
  await expectNoHorizontalOverflow(page);
  await expect(page.locator('article')).toBeVisible();
});
