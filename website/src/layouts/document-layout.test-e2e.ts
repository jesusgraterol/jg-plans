import { expectNoHorizontalOverflow, waitForPageAssets } from 'jg-playwright';

import { expect, test } from '../../testing/index.ts';
import { PAGES } from '../site.config.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1440]) {
    test(`${colorScheme} ${width}px: documentation preserves registered navigation, references and availability`, async ({
      page,
      availability,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      for (const record of PAGES.filter(
        (entry) => entry.path.startsWith('/docs/') || entry.path.startsWith('/protocol/'),
      )) {
        await page.goto(record.path);
        await waitForPageAssets(page);
        await expect(
          page.getByRole('heading', { level: 1, name: record.label, exact: true }),
        ).toHaveAttribute('id', 'document-title');
        const navigation = page.getByRole('navigation', { name: 'Documentation', exact: true });
        if (width === 320) {
          await navigation.locator('summary').focus();
          await page.keyboard.press('Enter');
          await expect(navigation.locator('summary')).toHaveCSS('outline-style', 'solid');
        }
        await expect(navigation.getByRole('link')).toHaveText(
          PAGES.slice(1).map((entry) => entry.label),
        );
        await expect(
          navigation.getByRole('link', { name: record.label, exact: true }),
        ).toHaveAttribute('aria-current', 'page');
        if ('source' in record)
          await expect(
            page.getByRole('link', { name: 'Read as Markdown', exact: true }),
          ).toHaveAttribute('href', '/raw/' + record.source);
        if (record.path.startsWith('/docs/')) {
          if (availability.state === 'published') {
            await expect(
              page.getByRole('link', { name: `npm ${availability.version}`, exact: true }),
            ).toHaveAttribute(
              'href',
              `https://www.npmjs.com/package/jg-plans/v/${availability.version}`,
            );
          } else {
            await expect(
              page.getByText(
                `Package ${availability.version} · ${availability.state === 'unknown' ? 'availability unverified' : 'development preview'}`,
                { exact: true },
              ),
            ).toBeVisible();
          }
        }
        await expect(page.getByText('Protocol 0.1 · provisional', { exact: true })).toBeVisible();
        await page.getByRole('link', { name: 'Jump to reference ↓', exact: true }).click();
        await expect(page).toHaveURL(record.path + '#reference');
        await expect(
          page.getByRole('region', { name: 'Complete reference', exact: true }),
        ).toBeInViewport();
        const next =
          PAGES[(PAGES.findIndex((entry) => entry.path === record.path) + 1) % PAGES.length]!;
        const continuation = page
          .getByRole('navigation', { name: 'Continue reading', exact: true })
          .getByRole('link');
        await expect(continuation).toHaveAttribute('href', next.path);
        await expect(continuation).toHaveAttribute('rel', 'next');
        await expect(continuation).toContainText(next.label);
        await expectNoHorizontalOverflow(page);
      }
    });
  }
}

test.describe('documentation without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${colorScheme}: native page and section navigation work without scripts`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/protocol/0.1/');
      const navigation = page.getByRole('navigation', { name: 'Documentation', exact: true });
      await navigation.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(
        navigation.getByRole('link', { name: 'Specification 0.1', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      const outline = page.getByRole('navigation', { name: 'On this page', exact: true });
      await outline.locator('summary').focus();
      await page.keyboard.press('Space');
      const link = outline.getByRole('link', { name: 'Writers and readers', exact: true });
      await link.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('heading', { name: 'Writers and readers', exact: true }),
      ).toBeInViewport();
      await expect(
        page.getByRole('link', { name: 'Read as Markdown', exact: true }),
      ).toHaveAttribute('href', '/raw/protocol/0.1/README.md');
      await expectNoHorizontalOverflow(page);
    });
  }
});
