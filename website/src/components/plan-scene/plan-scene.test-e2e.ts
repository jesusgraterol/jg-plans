import { expectNoHorizontalOverflow } from 'jg-playwright';
import { expect, test } from '../../../testing/index.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1440]) {
    test(`${colorScheme} ${width}px: Markdown examples produce useful, copyable JSON`, async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const tabs = page.getByRole('tablist', { name: 'Markdown to JSON' });
      const plan = page.getByRole('tabpanel', { name: 'plan.md', exact: true });
      const planJSON = plan
        .getByRole('figure')
        .filter({ hasText: 'JSON · selected result fields' });
      const copy = planJSON.getByRole('button');
      await expect(copy).toHaveAccessibleName('Copy code');
      // Visible controls are icons; the shared label remains available to assistive technology.
      expect(
        await copy.evaluate((button) => {
          const label = button.querySelector('[data-copy-label]')!.parentElement!;
          return getComputedStyle(label).clipPath;
        }),
      ).toBe('inset(50%)');
      await copy.press('Enter');
      await expect(copy).toHaveAttribute('data-copy-state', 'success');
      await expect(copy).toHaveCSS('outline-style', 'solid');
      const parsed = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
      expect(parsed.metadata).toEqual({
        id: '1792612800_search-feedback',
        created_at: '2026-10-21T20:00:00Z',
        updated_at: '2026-10-21T20:00:00Z',
        revision: 1,
        status: 'pending',
      });
      expect(parsed.body).toContain('# Search feedback');
      await tabs.getByRole('tab', { name: 'plan.md', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      const milestoneTab = tabs.getByRole('tab', { name: 'milestones.md · optional', exact: true });
      await expect(milestoneTab).toBeFocused();
      await expect(milestoneTab).toHaveAttribute('aria-selected', 'true');
      const milestoneJSON = page
        .getByRole('tabpanel', { name: 'milestones.md · optional', exact: true })
        .getByRole('figure')
        .filter({ hasText: 'JSON · selected result fields' });
      const milestoneCopy = milestoneJSON.getByRole('button');
      await milestoneCopy.press('Enter');
      await expect(milestoneCopy).toHaveAttribute('data-copy-state', 'success');
      const progress = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
      expect(progress.milestones).toEqual([
        {
          ordinal: 1,
          title: 'Document cards',
          status: 'done',
          id: '5a148c73-7d38-4a2f-9c0f-903d93b9b764',
        },
        {
          ordinal: 2,
          title: 'Copy and download',
          status: 'pending',
          id: 'd7f04e92-61a7-4caf-8ab2-64c2b9f787e1',
        },
      ]);
      await expectNoHorizontalOverflow(page);
    });
  }
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  test('both Markdown to JSON examples remain readable', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tabpanel', { name: 'plan.md', exact: true })).toBeVisible();
    await expect(
      page.getByRole('tabpanel', { name: 'milestones.md · optional', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy code', exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
