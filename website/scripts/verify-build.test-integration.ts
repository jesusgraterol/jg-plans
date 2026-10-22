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
      fileURLToPath(new URL('../dist/protocol/0.1/index.html', import.meta.url)),
      1024 * 1024,
    )
  ).toString('utf8');
  expect(homepage).toContain('1792612860_example-gallery');
  expect(homepage).toContain('Make public examples easy to explore.');
  expect(homepage).toContain('Skills binding · stale after revision');
  expect(homepage).toContain('Group the examples by workflow.');
  expect(homepage).toContain('5a148c73-7d38-4a2f-9c0f-903d93b9b764');
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
