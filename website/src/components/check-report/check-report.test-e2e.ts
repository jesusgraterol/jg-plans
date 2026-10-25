import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expectNoHorizontalOverflow } from 'jg-playwright';

import { expect, test } from '../../../testing/index.ts';

// the hand-written expected findings that ship with the public criteria-invalid example
const expected = JSON.parse(
  await readFile(
    new URL('../../../../examples/criteria-invalid/expected.json', import.meta.url),
    'utf8',
  ),
) as { diagnostics: { code: string; document: 'plan' | 'milestones'; line: number }[] };

for (const colorScheme of ['light', 'dark'] as const)
  for (const width of [320, 768, 1440]) {
    test(`${colorScheme} ${width}px: every check finding marks its own line`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');
      const report = page.getByRole('region', { name: 'Catch mistakes on their line.' });
      await expect(report).toBeVisible();
      for (const document of ['plan', 'milestones'] as const) {
        const findings = expected.diagnostics.filter((entry) => entry.document === document);
        const lines = report.getByRole('list', { name: `${document}.md lines` });
        await expect(lines.locator('[data-flagged]')).toHaveCount(findings.length);
        for (const { code, line } of findings) {
          const item = lines.getByRole('listitem').nth(line - 1);
          await expect(item).toHaveAttribute('data-flagged', '');
          await expect(item).toContainText(String(line));
          await expect(item).toContainText(code);
        }
        await expect(report).toContainText(
          `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}`,
        );
      }
      await expectNoHorizontalOverflow(page);
      expect(
        (
          await new AxeBuilder({ page })
            .include('[data-check-report]')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      if (testInfo.repeatEachIndex === 0)
        await report.screenshot({
          path: testInfo.outputPath(`check-report-${colorScheme}-${width}.png`),
        });
    });
  }

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  test('the findings stay readable without scripting', async ({ page }) => {
    await page.goto('/');
    const report = page.getByRole('region', { name: 'Catch mistakes on their line.' });
    for (const { code } of expected.diagnostics) await expect(report).toContainText(code);
    await expectNoHorizontalOverflow(page);
  });
});
