import { fileURLToPath } from 'node:url';
import { readBoundedFile } from 'jg-fs';
import { expect, it } from 'vitest';

it('ships the real canonical protocol and original example in the production artifact', async () => {
  const homepage = (
    await readBoundedFile(
      fileURLToPath(new URL('../dist/index.html', import.meta.url)),
      1024 * 1024,
    )
  ).toString('utf8');
  const specification = (
    await readBoundedFile(
      fileURLToPath(new URL('../dist/protocol/0.1/index.html', import.meta.url)),
      1024 * 1024,
    )
  ).toString('utf8');
  expect(homepage).toContain('1792612800_search-feedback');
  expect(homepage).toContain('Explain an empty search result');
  expect(homepage).toContain('5a148c73-7d38-4a2f-9c0f-903d93b9b764');
  expect(specification).toContain('Consumers serialize the whole read/edit/write operation');
  expect(specification).toContain('id="revisions-history-and-deletion"');
  expect(specification).toContain(
    'https://github.com/jesusgraterol/jg-plans/blob/development/docs/integrations.md',
  );
  expect(specification).not.toContain('href="../../docs/integrations.md"');
});
