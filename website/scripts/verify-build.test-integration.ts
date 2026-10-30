import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readBoundedFile } from 'jg-fs';
import { expect, it } from 'vitest';
import { verifyBuild } from './verify-build.ts';

it('ships the real canonical protocol and original example in the production artifact', async () => {
  const homepage = (
    await readBoundedFile(
      fileURLToPath(new URL('../dist/index.html', import.meta.url)),
      1024 * 1024,
    )
  ).toString('utf8');
  const specification = (
    await readBoundedFile(
      fileURLToPath(new URL('../dist/protocol/0.2/index.html', import.meta.url)),
      1024 * 1024,
    )
  ).toString('utf8');
  expect(homepage).toContain('1792612920_search-feedback-criteria');
  expect(homepage).toContain('Explain empty search results and give people a useful next action.');
  expect(homepage).toContain('Skills binding · stale after revision');
  expect(homepage).toContain('AC-04: Search suggests spelling corrections.');
  expect(homepage).toContain('UNASSIGNED_CRITERION');
  expect(homepage).toContain('JG_PLANS_SOURCE_CHANGED');
  expect(homepage).toContain('3c7a2f1e-9b4d-4e8a-a6f2-1d5c7e9b0a34');
  expect(specification).toContain(
    'Library and CLI filesystem mutations share short local document locks',
  );
  expect(specification).toContain('href="/docs/api/#shared-document-locks"');
  expect(specification).not.toContain('href="../../api/README.md#shared-document-locks"');
  expect(specification).toContain('id="revisions-history-and-deletion"');
  expect(specification).toContain('href="/docs/integrations/"');
  expect(specification).not.toContain('href="../../docs/integrations.md"');
});

it('rejects altered source downloads and private paths in an otherwise complete artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jg-plans-site-verification-'));
  const artifact = join(root, 'site');
  try {
    await cp(resolve(import.meta.dirname, '../dist'), artifact, { recursive: true });
    await verifyBuild(artifact);
    const source = join(artifact, 'downloads/examples/small/plan.md');
    const original = await readBoundedFile(source, 1024 * 1024);
    await writeFile(source, Buffer.concat([original, Buffer.from('Changed download')]));
    await expect(verifyBuild(artifact)).rejects.toThrow('download bytes differ');
    await writeFile(source, original);
    const homepage = join(artifact, 'index.html');
    const html = await readBoundedFile(homepage, 1024 * 1024);
    await writeFile(
      homepage,
      Buffer.concat([html, Buffer.from('<p>/home/example/private/path</p>')]),
    );
    await expect(verifyBuild(artifact)).rejects.toThrow('nonpublic source leaked');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
