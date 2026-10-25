import { expectNoHorizontalOverflow } from 'jg-playwright';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../../../testing/index.ts';

for (const colorScheme of ['light', 'dark'] as const)
  for (const width of [320, 1440]) {
    test(`${colorScheme} ${width}px: follow real plan operations, copy observations and inspect a retained revision`, async ({
      page,
      context,
    }, testInfo) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const scene = page.getByRole('region', { name: 'A plan through its lifecycle' });
      const tabs = scene.getByRole('tablist', { name: 'Plan lifecycle' });
      for (const tab of await tabs.getByRole('tab').all()) {
        const box = await tab.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      const create = scene.getByRole('tabpanel', { name: 'Create', exact: true });
      const json = create.getByRole('figure').filter({ hasText: 'JSON · selected result fields' });
      const copy = json.getByRole('button');
      await expect(copy).toHaveAccessibleName('Copy code');
      await expect(copy).toHaveAttribute('data-copy-display', 'icon');
      await copy.press('Enter');
      await expect(copy).toHaveAttribute('data-copy-state', 'success');
      await expect(copy).toHaveCSS('outline-style', 'solid');
      expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual({
        plan: 'readable',
        milestones: 'missing',
        revision: 1,
        status: 'pending',
      });
      await tabs.getByRole('tab', { name: 'Create', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(tabs.getByRole('tab', { name: 'Inspect', exact: true })).toBeFocused();
      await expect(scene.getByRole('tabpanel', { name: 'Inspect', exact: true })).toContainText(
        '1792612860_example-gallery',
      );
      await page.keyboard.press('ArrowRight');
      await expect(tabs.getByRole('tab', { name: 'Update', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const update = scene.getByRole('tabpanel', { name: 'Update', exact: true });
      await expect(update).toContainText('"current"');
      await page.keyboard.press('ArrowRight');
      const revise = scene.getByRole('tabpanel', { name: 'Revise', exact: true });
      await expect(tabs.getByRole('tab', { name: 'Revise', exact: true })).toBeFocused();
      await expect(revise).toContainText('Skills binding · stale after revision');
      await expect(revise).toContainText('Document cards');
      await expect(revise).toContainText('5a148c73-7d38-4a2f-9c0f-903d93b9b764');
      const diff = revise.getByRole('figure').filter({ hasText: 'Before · revision 1' });
      await expect(diff).toContainText('Removed line: revision: 1');
      await expect(diff).toContainText('Added line: revision: 2');
      await expect(diff).toContainText('Added line: Group the examples by workflow.');
      const diffPane = diff.getByRole('group').first();
      await diffPane.focus();
      await expect(diffPane).toHaveCSS('outline-style', 'solid');
      await revise.getByText('Actual revision observation', { exact: true }).click();
      const result = revise
        .getByRole('figure')
        .filter({ hasText: 'JSON · selected result fields' });
      await result.getByRole('button').press('Enter');
      const revised = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
      expect(revised).toMatchObject({
        revision: 2,
        status: 'in progress',
        binding: 'stale',
        milestones: [
          { id: '5a148c73-7d38-4a2f-9c0f-903d93b9b764', status: 'done' },
          { id: 'd7f04e92-61a7-4caf-8ab2-64c2b9f787e1', status: 'pending' },
        ],
      });
      const revisedSource = revise
        .getByRole('figure')
        .filter({ hasText: 'Complete revised plan.md' });
      await revisedSource.getByRole('button').press('Enter');
      const markdown = await page.evaluate(() => navigator.clipboard.readText());
      expect(markdown).toContain('revision: 2');
      expect(markdown).toContain('Group the examples by workflow.');
      await expectNoHorizontalOverflow(page);
      expect(
        (
          await new AxeBuilder({ page })
            .include('#lifecycle')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      if (testInfo.repeatEachIndex === 0)
        await scene.screenshot({
          path: testInfo.outputPath(`lifecycle-revision-${colorScheme}-${width}.png`),
        });
    });
  }

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  test('all four operations remain readable without scripting', async ({ page }) => {
    await page.goto('/');
    for (const name of ['Create', 'Inspect', 'Update', 'Revise'])
      await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
    await expect(
      page.getByText('Skills binding · stale after revision', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy code', exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
