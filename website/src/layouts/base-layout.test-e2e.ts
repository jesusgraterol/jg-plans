import AxeBuilder from '@axe-core/playwright';
import { expectNoHorizontalOverflow, inspectMotion, waitForPageAssets } from 'jg-playwright';
import { expect, test } from '../../testing/index.ts';

import { PAGES, SITE } from '../site.config.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 768, 1440]) {
    test(`${colorScheme} at ${width}px: readable, accessible production pages`, async ({
      page,
      availability,
    }, testInfo) => {
      testInfo.setTimeout(90_000);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      for (const route of [...PAGES, { path: '/404.html', label: 'Not found' }]) {
        await page.goto(route.path);
        await waitForPageAssets(page);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('a[download], a[href^="/downloads/"]')).toHaveCount(0);
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
        await expect(
          page.getByText(
            availability.state === 'published'
              ? `v${availability.version} available`
              : 'Development preview',
            { exact: true },
          ),
        ).toBeVisible();
        await expectNoHorizontalOverflow(page);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
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
        if (route.path === '/' && testInfo.repeatEachIndex === 0) {
          await page.screenshot({
            path: testInfo.outputPath(`home-${colorScheme}-${width}.png`),
            fullPage: true,
          });
        }
        if (route.path !== '/' && width !== 768 && testInfo.repeatEachIndex === 0) {
          await page.screenshot({
            path: testInfo.outputPath(
              `${route.path.replaceAll('/', '-')}-${colorScheme}-${width}.png`,
            ),
          });
        }
      }
    });
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1440]) {
    test(`${colorScheme} at ${width}px: verified installation copies the exact command`, async ({
      page,
      context,
      availability,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const command = page.locator('#install-command');
      if (availability.state !== 'published') {
        await expect(command).toHaveCount(0);
        return;
      }
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await expect(command).toHaveText(`npm install jg-plans@${availability.version}`);
      const copy = page.locator('[data-copy-source="install-command"]');
      await expect(copy).toHaveAccessibleName('Copy install command');
      await copy.press('Enter');
      await expect(copy).toBeFocused();
      await expect(copy).toHaveCSS('outline-style', 'solid');
      await expect(copy).toHaveAttribute('data-copy-state', 'success');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        `npm install jg-plans@${availability.version}`,
      );
      await expectNoHorizontalOverflow(page);
    });
  }
}

test('keyboard navigation, theme persistence, copy, and mobile menu', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toHaveCSS(
    'outline-style',
    'solid',
  );
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toHaveCSS(
    'outline-width',
    '2px',
  );
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
  // Let the native page transition finish before another programmatic navigation can cancel it.
  await waitForPageAssets(page);
  await page.evaluate(async () => {
    await document.activeViewTransition?.finished;
  });
  await expect(page.locator('html')).toHaveAttribute(
    'data-resolved-theme',
    initial === 'dark' ? 'light' : 'dark',
  );
  await page.goto('/');
  // Settle the return transition before the mobile viewport resize below.
  await waitForPageAssets(page);
  await page.evaluate(async () => {
    await document.activeViewTransition?.finished;
  });
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

test.describe('without JavaScript', () => {
  test.use({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 900 },
    colorScheme: 'dark',
  });
  test('documents and narrow navigation remain useful', async ({ page }) => {
    await page.goto('/protocol/');
    await expect(page.getByRole('heading', { level: 1, name: 'Protocol overview' })).toBeVisible();
    const browse = page.getByText('Browse documentation', { exact: true });
    await browse.click();
    const documentation = page.getByRole('navigation', { name: 'Documentation', exact: true });
    await expect(
      documentation.getByRole('link', { name: 'Library API', exact: true }),
    ).toBeVisible();
    await expect(
      documentation.getByRole('link', { name: 'Protocol overview', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await browse.click();
    await expect(documentation).toBeHidden();
    await page.locator('[data-site-menu] summary').click();
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
    await page
      .locator('#reference')
      .getByRole('link', { name: 'Protocol 0.1', exact: true })
      .click();
    await expect(page.locator('h1')).toHaveText('Specification 0.1');
    await expectNoHorizontalOverflow(page);
  });
});

test('documents remain readable at the 200-percent desktop equivalent', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 500 });
  await page.goto('/protocol/0.1/');
  await waitForPageAssets(page);
  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole('article', { name: 'Specification 0.1', exact: true })).toBeVisible();
});
