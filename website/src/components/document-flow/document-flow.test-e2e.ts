import { expectNoHorizontalOverflow, waitForPageAssets } from 'jg-playwright';

import { expect, test } from '../../../testing/index.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 1440]) {
    test(`${colorScheme} ${width}px: source keeps its 23rem body, wrapping, exact copy and keyboard scrolling`, async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/examples/');
      await waitForPageAssets(page);
      const example = page.getByRole('tabpanel', { name: 'Small plan', exact: true });
      const source = example.getByRole('region', { name: 'plan.md source', exact: true });
      const observation = example.getByRole('region', {
        name: 'Structured observation source',
        exact: true,
      });
      for (const body of [source, observation]) {
        await expect(body).toHaveCSS('height', '368px');
        await expect(body).toHaveCSS('white-space', 'pre-wrap');
      }
      const codeWindow = example
        .getByRole('figure')
        .filter({ has: page.getByRole('region', { name: 'plan.md source', exact: true }) });
      const copy = codeWindow.getByRole('button');
      await expect(copy).toHaveAccessibleName('Copy code');
      await expect(copy).toHaveAttribute('data-copy-display', 'icon');
      await copy.press('Enter');
      await expect(copy).toHaveAttribute('data-copy-state', 'success');
      const response = await page.request.get('/downloads/examples/small/plan.md');
      expect(response.status()).toBe(200);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await response.text());
      await source.focus();
      await expect(source).toHaveCSS('outline-style', 'solid');
      await page.keyboard.press('End');
      await expect.poll(() => source.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await expectNoHorizontalOverflow(page);
    });
  }
}
