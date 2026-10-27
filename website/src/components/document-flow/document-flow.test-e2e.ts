import { expectNoHorizontalOverflow, waitForPageAssets } from 'jg-playwright';

import { expect, test } from '../../../testing/index.ts';

const expectSourceFirst = async (
  scope: import('@playwright/test').Locator,
  width: number,
): Promise<void> => {
  await expect(
    scope.getByRole('region', { name: 'Structured observation source', exact: true }),
  ).toBeVisible();
  const positions = await scope.evaluate((element) => {
    const source = element.querySelector('[aria-label$=".md source"]')!;
    const observation = element.querySelector('[aria-label="Structured observation source"]')!;
    const sourceBox = source.getBoundingClientRect();
    const resultBox = observation.getBoundingClientRect();
    return {
      sourceFirst: Boolean(
        source.compareDocumentPosition(observation) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      sourceBottom: sourceBox.bottom,
      sourceRight: sourceBox.right,
      resultTop: resultBox.top,
      resultLeft: resultBox.left,
    };
  });
  expect(positions.sourceFirst).toBe(true);
  if (width < 1024) {
    expect(positions.sourceBottom).toBeLessThanOrEqual(positions.resultTop);
  } else {
    expect(positions.sourceRight).toBeLessThanOrEqual(positions.resultLeft);
  }
};

for (const javaScriptEnabled of [true, false]) {
  test.describe(`document order with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, () => {
    test.use({ javaScriptEnabled });

    for (const colorScheme of ['light', 'dark'] as const) {
      for (const width of [320, 768, 1024, 1440]) {
        test(`${colorScheme} ${width}px: Markdown precedes its observation across every document flow`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
          const panelRole = javaScriptEnabled ? 'tabpanel' : 'region';

          for (const route of ['/', '/examples/']) {
            await page.goto(route);
            if (javaScriptEnabled) await waitForPageAssets(page);
            const scene = page.getByRole('region', { name: 'A plan through its lifecycle' });
            for (const stage of ['Create', 'Inspect', 'Update']) {
              if (javaScriptEnabled)
                await scene.getByRole('tab', { name: stage, exact: true }).click();
              await expectSourceFirst(
                scene.getByRole(panelRole, { name: stage, exact: true }),
                width,
              );
            }
            if (route === '/examples/') {
              for (const [label, filenames] of [
                ['Small plan', ['plan.md']],
                ['With milestones', ['plan.md', 'milestones.md']],
                ['Project extensions', ['plan.md']],
                ['Partly deleted', ['plan.md']],
                ['Plan removed', ['milestones.md']],
                ['Acceptance criteria', ['plan.md', 'milestones.md']],
              ] as const) {
                if (javaScriptEnabled)
                  await page.getByRole('tab', { name: label, exact: true }).click();
                const example = page.getByRole(panelRole, { name: label, exact: true });
                for (const filename of filenames) {
                  if (javaScriptEnabled)
                    await example.getByRole('tab', { name: filename, exact: true }).click();
                  await expectSourceFirst(
                    example.getByRole(panelRole, { name: filename, exact: true }),
                    width,
                  );
                }
              }
            }
            await expectNoHorizontalOverflow(page);
          }
          await page.goto('/docs/api/');
          if (javaScriptEnabled) await waitForPageAssets(page);
          await expectSourceFirst(page.getByRole('main'), width);
          await expectNoHorizontalOverflow(page);
        });
      }
    }
  });
}

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
