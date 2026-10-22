import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ERRORS, inspectPlan, removeMilestones, updatePlan, writePlanDocument } from 'jg-plans';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const fixture = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'jg-plans-documents-'));
  roots.push(root);
  return root;
};
const digest = (source: string | Buffer): string =>
  createHash('sha256').update(source).digest('hex');
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('guarded public document persistence', () => {
  it('writes body and metadata once, preserves modes, and skips a no-op replacement', async () => {
    const root = await fixture();
    const path = join(root, 'plan.md');
    const source =
      '\uFEFF---\r\nid: sample # keep\r\nrevision: 1\r\nextension: [one]\r\n---\r\nOld';
    await writeFile(path, source);
    await chmod(path, 0o640);
    await writeFile(join(root, 'milestones.md'), Buffer.from([0xff]));
    const result = await writePlanDocument(root, {
      document: 'plan',
      expectedSha256: digest(source),
      body: 'New 😀',
      set: { revision: 2 },
    });
    const expected = source.replace('revision: 1', 'revision: 2').replace('Old', 'New 😀');
    expect(await readFile(path, 'utf8')).toBe(expected);
    expect(result.sha256).toBe(digest(expected));
    const stat = await lstat(path);
    if (process.platform !== 'win32') expect(stat.mode & 0o777).toBe(0o640);
    expect(
      (
        await writePlanDocument(root, {
          document: 'plan',
          expectedSha256: result.sha256,
          body: 'New 😀',
        })
      ).changed,
    ).toBe(false);
    expect((await lstat(path)).mtimeMs).toBe(stat.mtimeMs);
    expect(await readFile(join(root, 'milestones.md'))).toEqual(Buffer.from([0xff]));
  });

  it('guards stale and deleted narrow/body targets before any replacement', async () => {
    const root = await fixture();
    const source = '# Original';
    const path = join(root, 'plan.md');
    await writeFile(path, source);
    for (const operation of [
      () =>
        updatePlan(root, {
          document: 'plan',
          expectedSha256: '0'.repeat(64),
          set: { status: 'done' },
        }),
      () =>
        writePlanDocument(root, { document: 'plan', expectedSha256: '0'.repeat(64), body: 'New' }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: ERRORS.SOURCE_CHANGED });
    expect(await readFile(path, 'utf8')).toBe(source);
    await rm(path);
    await expect(
      updatePlan(root, {
        document: 'plan',
        expectedSha256: digest(source),
        set: { status: 'done' },
      }),
    ).rejects.toMatchObject({ code: ERRORS.SOURCE_CHANGED });
    await expect(
      writePlanDocument(root, { document: 'plan', expectedSha256: digest(source), body: 'New' }),
    ).rejects.toMatchObject({ code: ERRORS.SOURCE_CHANGED });
    expect(await readdir(root)).toEqual([]);
  });

  it('creates absent milestones exclusively, assigns IDs explicitly, then replaces and removes guarded bytes', async () => {
    const root = await fixture();
    const source = '## Milestone 1: Work\n**Status:** custom\n\nKeep evidence.';
    await writeFile(join(root, 'plan.md'), Buffer.from([0xff]));
    const result = await writePlanDocument(root, {
      document: 'milestones',
      expectedSha256: null,
      source,
      assignMissingIds: true,
    });
    expect(result.assignedMilestoneIds).toHaveLength(1);
    const path = join(root, 'milestones.md');
    const saved = await readFile(path, 'utf8');
    expect(saved).toContain(result.assignedMilestoneIds[0]!.id);
    await expect(
      writePlanDocument(root, {
        document: 'milestones',
        expectedSha256: null,
        source: 'Overwrite',
      }),
    ).rejects.toMatchObject({ code: ERRORS.SOURCE_CHANGED });
    await expect(removeMilestones(root, { expectedSha256: '0'.repeat(64) })).rejects.toMatchObject({
      code: ERRORS.SOURCE_CHANGED,
    });
    expect(await readFile(path, 'utf8')).toBe(saved);
    const replacement = await writePlanDocument(root, {
      document: 'milestones',
      expectedSha256: result.sha256,
      source: saved + '\nExtra requirement.',
    });
    expect(replacement.sha256).toBe(digest(saved + '\nExtra requirement.'));
    expect(await removeMilestones(root, { expectedSha256: replacement.sha256 })).toMatchObject({
      changed: true,
      sha256: null,
    });
    await expect(
      removeMilestones(root, { expectedSha256: replacement.sha256 }),
    ).rejects.toMatchObject({ code: ERRORS.SOURCE_CHANGED });
    expect(await readdir(root)).toEqual(['plan.md']);
  });

  it('rejects encoding, size, directories and links without changing them', async () => {
    const root = await fixture();
    const path = join(root, 'milestones.md');
    const invalid = Buffer.from([0xff]);
    await writeFile(path, invalid);
    await expect(
      writePlanDocument(root, {
        document: 'milestones',
        expectedSha256: '0'.repeat(64),
        source: '# New',
      }),
    ).rejects.toMatchObject({ code: ERRORS.SOURCE_CHANGED });
    await expect(
      writePlanDocument(root, {
        document: 'milestones',
        expectedSha256: digest(invalid),
        source: '# New',
      }),
    ).rejects.toMatchObject({ code: ERRORS.UNSUPPORTED_ENCODING });
    await expect(removeMilestones(root, { expectedSha256: digest(invalid) })).rejects.toMatchObject(
      { code: ERRORS.UNSUPPORTED_ENCODING },
    );
    await writeFile(path, '# Too large');
    await expect(
      removeMilestones(root, { expectedSha256: digest('# Too large') }, { maxBytes: 2 }),
    ).rejects.toMatchObject({ code: ERRORS.READ_FAILED });
    await rm(path);
    await mkdir(path);
    await expect(
      writePlanDocument(root, { document: 'milestones', expectedSha256: null, source: '# New' }),
    ).rejects.toMatchObject({ code: ERRORS.READ_FAILED });
    await rm(path, { recursive: true });
    if (process.platform !== 'win32') {
      const outside = join(root, 'outside');
      await writeFile(outside, '# Outside');
      await symlink(outside, path);
      await expect(
        removeMilestones(root, { expectedSha256: digest('# Outside') }),
      ).rejects.toMatchObject({ code: ERRORS.READ_FAILED });
      expect(await readFile(outside, 'utf8')).toBe('# Outside');
    }
    expect((await inspectPlan(root)).plan.state).toBe('missing');
  });
});
