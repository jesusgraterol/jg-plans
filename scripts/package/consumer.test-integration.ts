import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { verifyPackedConsumer } from './consumer.ts';
import { packPackage } from './utilities.ts';

// A cold isolated install, compiler, and native CLI processes need their own bounded budget.
it('installs and exercises the exact packed public package', { timeout: 180_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jg-plans-pack-test-'));
  try {
    const archive = await packPackage(directory);
    const files = await verifyPackedConsumer(archive);
    expect(files).toContain('examples/orphan/milestones.md');
    expect(files.some((file) => file.startsWith('website/'))).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
