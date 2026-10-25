import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expectNoHorizontalOverflow } from 'jg-playwright';

import { expect, test } from '../../../testing/index.ts';

// the hand-written expected observation that ships with the public criteria example
const expected = JSON.parse(
  await readFile(new URL('../../../../examples/criteria/expected.json', import.meta.url), 'utf8'),
) as {
  criteria: { id: string; text: string; milestones: { ordinal: number }[]; progress: string }[];
};

for (const colorScheme of ['light', 'dark'] as const)
  for (const width of [320, 768, 1440]) {
    test(`${colorScheme} ${width}px: the dashboard shows each criterion's milestones and progress`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const dashboard = page.getByRole('region', { name: 'Search feedback', exact: true });
      await expect(dashboard).toBeVisible();
      await expect(dashboard).toContainText('in progress');
      const milestones = dashboard.getByRole('list').first().getByRole('listitem');
      await expect(milestones).toHaveCount(2);
      await expect(milestones.nth(0)).toHaveText(/1\s*Explain empty results\s*done/u);
      await expect(milestones.nth(1)).toHaveText(/2\s*Offer a next action\s*in progress/u);
      const criteria = dashboard.getByRole('list').nth(1).getByRole('listitem');
      await expect(criteria).toHaveCount(expected.criteria.length);
      for (const [index, criterion] of expected.criteria.entries()) {
        const item = criteria.nth(index);
        await expect(item).toContainText(criterion.id);
        await expect(item).toContainText(criterion.progress);
        await expect(item).toContainText(criterion.text);
        await expect(item).toContainText(
          `Delivered by milestone ${criterion.milestones.map(({ ordinal }) => ordinal).join(', ')}`,
        );
      }
      await expectNoHorizontalOverflow(page);
      expect(
        (
          await new AxeBuilder({ page })
            .include('.criteria-dashboard')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      if (testInfo.repeatEachIndex === 0)
        await dashboard.screenshot({
          path: testInfo.outputPath(`criteria-dashboard-${colorScheme}-${width}.png`),
        });
    });
  }

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  test('the dashboard stays readable without scripting', async ({ page }) => {
    await page.goto('/');
    const dashboard = page.getByRole('region', { name: 'Search feedback', exact: true });
    await expect(dashboard).toBeVisible();
    for (const { text } of expected.criteria) await expect(dashboard).toContainText(text);
    await expectNoHorizontalOverflow(page);
  });
});
