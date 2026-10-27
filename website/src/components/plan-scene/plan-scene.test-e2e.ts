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
        criteria: ['AC-01', 'AC-02', 'AC-03'],
      });
      await tabs.getByRole('tab', { name: 'Create', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(tabs.getByRole('tab', { name: 'Inspect', exact: true })).toBeFocused();
      await expect(scene.getByRole('tabpanel', { name: 'Inspect', exact: true })).toContainText(
        '1792612920_search-feedback-criteria',
      );
      await page.keyboard.press('ArrowRight');
      await expect(tabs.getByRole('tab', { name: 'Update', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const update = scene.getByRole('tabpanel', { name: 'Update', exact: true });
      await expect(update).toContainText('"current"');
      // milestone 1 is done and milestone 2 has started, so only AC-01 is done
      const progress = update
        .getByRole('list', { name: 'Criterion progress' })
        .getByRole('listitem');
      await expect(progress).toHaveCount(3);
      await expect(progress.nth(0)).toHaveText(/AC-01\s*done/u);
      await expect(progress.nth(1)).toHaveText(/AC-02\s*in progress/u);
      await expect(progress.nth(2)).toHaveText(/AC-03\s*in progress/u);
      await page.keyboard.press('ArrowRight');
      const revise = scene.getByRole('tabpanel', { name: 'Revise', exact: true });
      await expect(tabs.getByRole('tab', { name: 'Revise', exact: true })).toBeFocused();
      await expect(revise).toContainText('Skills binding · stale after revision');
      await expect(revise).toContainText('check · plan.md line 18');
      await expect(revise).toContainText('UNASSIGNED_CRITERION');
      await expect(revise).toContainText('Explain empty results');
      await expect(revise).toContainText('3c7a2f1e-9b4d-4e8a-a6f2-1d5c7e9b0a34');
      const diff = revise.getByRole('figure').filter({ hasText: 'Before · revision 1' });
      await expect(diff).toContainText('Removed line: revision: 1');
      await expect(diff).toContainText('Added line: revision: 2');
      await expect(diff).toContainText(
        'Added line: - AC-04: Search suggests spelling corrections.',
      );
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
          { id: '3c7a2f1e-9b4d-4e8a-a6f2-1d5c7e9b0a34', status: 'done' },
          { id: '8e1d6b2a-4f7c-4a3e-b9d1-6c2e8f4a7b15', status: 'in progress' },
        ],
        check: {
          conforms: false,
          findings: [{ code: 'UNASSIGNED_CRITERION', criterion: 'AC-04', line: 18 }],
        },
      });
      const revisedSource = revise
        .getByRole('figure')
        .filter({ hasText: 'Complete revised plan.md' });
      const positions = await revise.evaluate((element) => {
        const figures = [...element.querySelectorAll('figure')];
        const source = figures.find((figure) =>
          figure.textContent?.includes('Complete revised plan.md'),
        )!;
        const result = figures.find((figure) =>
          figure.textContent?.includes('JSON · selected result fields'),
        )!;
        return {
          sourceFirst: Boolean(
            source.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING,
          ),
          sourceBottom: source.getBoundingClientRect().bottom,
          resultTop: result.getBoundingClientRect().top,
        };
      });
      expect(positions.sourceFirst).toBe(true);
      expect(positions.sourceBottom).toBeLessThanOrEqual(positions.resultTop);
      await revisedSource.getByRole('button').press('Enter');
      const markdown = await page.evaluate(() => navigator.clipboard.readText());
      expect(markdown).toContain('revision: 2');
      expect(markdown).toContain('- AC-04: Search suggests spelling corrections.');
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
    await expect(page.getByRole('list', { name: 'Criterion progress' })).toBeVisible();
    await expect(
      page.locator('#lifecycle').getByText('UNASSIGNED_CRITERION', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy code', exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
