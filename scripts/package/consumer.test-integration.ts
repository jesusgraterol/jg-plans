import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

import { verifyPackedConsumer } from './consumer.ts';
import { packPackage } from './utilities.ts';

vi.mock('node:os', async (original) => {
  const actual = await original<typeof import('node:os')>();
  return { ...actual, tmpdir: vi.fn(actual.tmpdir) };
});

// A cold isolated install, compiler, and native CLI processes need their own bounded budget.
it('installs and exercises the exact packed public package', { timeout: 180_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jg-plans-pack-test-'));
  try {
    const archive = await packPackage(directory);
    if (process.platform !== 'win32') {
      const canonical = join(directory, 'canonical-temp'),
        alias = join(directory, 'linked-temp');
      await mkdir(canonical);
      await symlink(canonical, alias, 'dir');
      vi.mocked(tmpdir).mockReturnValue(alias);
    }
    const files = await verifyPackedConsumer(archive);
    expect(files).toContain('examples/orphan/milestones.md');
    expect(files.some((file) => file.startsWith('website/'))).toBe(false);
  } finally {
    vi.mocked(tmpdir).mockImplementation(
      (await vi.importActual<typeof import('node:os')>('node:os')).tmpdir,
    );
    await rm(directory, { recursive: true, force: true });
  }
});
