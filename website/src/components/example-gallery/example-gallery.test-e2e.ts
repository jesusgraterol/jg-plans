import AxeBuilder from '@axe-core/playwright';
import { expectNoHorizontalOverflow, waitForPageAssets } from 'jg-playwright';

import { expect, test } from '../../../testing/index.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1440]) {
    test(`${colorScheme} ${width}px: switch examples with keyboard and preserve focus`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/examples/');
      await waitForPageAssets(page);
      const tabs = page.getByRole('tablist', { name: 'Planning examples' });
      const first = tabs.getByRole('tab', { name: 'Small plan', exact: true });
      await first.focus();
      await page.keyboard.press('ArrowRight');
      const milestones = tabs.getByRole('tab', { name: 'With milestones', exact: true });
      await expect(milestones).toBeFocused();
      await expect(milestones).toHaveAttribute('aria-selected', 'true');
      await expect(milestones).toHaveCSS('outline-style', 'solid');
      const progress = page.getByRole('tabpanel', { name: 'With milestones', exact: true });
      await expect(
        progress.getByRole('list', { name: 'Observed milestone progress' }),
      ).toContainText('Status: done');
      await expect(
        progress.getByRole('list', { name: 'Observed milestone progress' }),
      ).toContainText('Status: pending');
      const documents = progress.getByRole('tablist', {
        name: 'With milestones documents',
        exact: true,
      });
      await documents.getByRole('tab', { name: 'plan.md', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(
        documents.getByRole('tab', { name: 'milestones.md', exact: true }),
      ).toBeFocused();
      const milestonesSource = progress.getByRole('tabpanel', {
        name: 'milestones.md',
        exact: true,
      });
      await expect(milestonesSource).toContainText('5a148c73-7d38-4a2f-9c0f-903d93b9b764');
      await expect(progress.getByRole('tabpanel', { name: 'plan.md', exact: true })).toBeHidden();
      await milestones.focus();

      await page.keyboard.press('ArrowRight');
      const extensions = page.getByRole('tabpanel', { name: 'Project extensions', exact: true });
      await expect(
        extensions.getByRole('definition').filter({ hasText: 'waiting-for-feedback' }),
      ).toBeVisible();
      await extensions.getByText('All observed metadata', { exact: true }).click();
      await expect(
        extensions.locator('details').getByText('"example-team"', { exact: true }),
      ).toBeVisible();
      await tabs.getByRole('tab', { name: 'Partly deleted', exact: true }).click();
      const incomplete = page.getByRole('tabpanel', { name: 'Partly deleted', exact: true });
      await expect(
        incomplete.getByText('Useful observations, with findings', { exact: true }),
      ).toBeVisible();
      await expect(incomplete.getByText('MISSING_FRONTMATTER', { exact: true })).toBeVisible();
      await tabs.getByRole('tab', { name: 'Plan removed', exact: true }).click();
      const orphan = page.getByRole('tabpanel', { name: 'Plan removed', exact: true });
      await expect(
        orphan.getByText('plan.md is deliberately absent. No file is restored.', { exact: true }),
      ).toBeVisible();
      await expect(orphan.getByRole('list', { name: 'Observed milestone progress' })).toContainText(
        '3. Check the remaining action',
      );
      await expectNoHorizontalOverflow(page);
      expect(
        (
          await new AxeBuilder({ page })
            .include('[data-example-gallery]')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await tabs.getByRole('tab', { name: 'Plan removed', exact: true }).focus();
      await page.keyboard.press('Home');
      await expect(first).toBeFocused();
      const box = await first.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      if (testInfo.repeatEachIndex === 0) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await page.screenshot({
          path: testInfo.outputPath(`examples-${colorScheme}-${width}.png`),
          fullPage: true,
        });
      }
    });
  }
}

test('examples offer readable source and JSON without download controls', async ({ page }) => {
  await page.goto('/examples/');
  await waitForPageAssets(page);
  await page.evaluate(async () => {
    await document.activeViewTransition?.finished;
  });
  const panel = page.getByRole('tabpanel', { name: 'Small plan', exact: true });
  await expect(panel.getByText('JSON · selected result fields', { exact: true })).toBeVisible();
  await expect(page.locator('a[download], a[href^="/downloads/"]')).toHaveCount(0);
  await page.getByText('About these examples and their expected results', { exact: true }).click();
  const source = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Small plan', exact: true }) })
    .getByRole('link', { name: 'plan.md', exact: true });
  await expect(source).toHaveAttribute('href', '/raw/examples/small/plan.md');
  await source.click();
  await expect(page.locator('body')).toContainText('# Search feedback');
  // Settle the navigation to plain Markdown before the browser context is torn down.
  await waitForPageAssets(page);
  await page.evaluate(async () => {
    await document.activeViewTransition?.finished;
  });
});

test.describe('without JavaScript', () => {
  test.use({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 900 },
  });
  for (const colorScheme of ['light', 'dark'] as const) {
    test(
      colorScheme + ' all five documents and their observations remain readable',
      async ({ page }, testInfo) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.goto('/examples/');
        for (const name of [
          'Small plan',
          'With milestones',
          'Project extensions',
          'Partly deleted',
          'Plan removed',
        ])
          await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
        await expect(
          page.getByText('plan.md is deliberately absent. No file is restored.', { exact: true }),
        ).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await expect(page.getByRole('button', { name: 'Copy code', exact: true })).toHaveCount(0);
        if (testInfo.repeatEachIndex === 0) {
          await page
            .getByRole('heading', { level: 2, name: 'Small plan', exact: true })
            .scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath('examples-no-js-dark-320.png') });
        }
      },
    );
  }
});
