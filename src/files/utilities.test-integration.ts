import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expectToRejectCode } from 'jg-exception/testing';
import { ERRORS, inspectPlan, fingerprintPlan } from 'jg-plans';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const fixture = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'jg-plans-read-test-'));
  roots.push(root);
  return root;
};

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('built selected-directory inspection', () => {
  it('returns exact byte hashes and an optional fingerprint while retaining milestone metadata', async () => {
    const root = await fixture();
    const plan =
      '\uFEFF---\r\nid: observation\r\nrevision: 2\r\nstatus: custom\r\nproject: {owner: example}\r\n---\r\n# Work 😀\r\n';
    const milestones =
      '---\njg_skills: {plan_revision: 2}\n---\n## Milestone 1: Work\n**Status:** custom\n';
    await writeFile(join(root, 'plan.md'), plan);
    await writeFile(join(root, 'milestones.md'), milestones);
    const result = await inspectPlan(root, {
      fingerprint: { excludeMetadataKeys: ['revision', 'status'] },
    });
    expect(result.plan).toMatchObject({
      state: 'readable',
      sha256: createHash('sha256').update(Buffer.from(plan)).digest('hex'),
    });
    expect(result.milestones).toMatchObject({
      state: 'readable',
      sha256: createHash('sha256').update(Buffer.from(milestones)).digest('hex'),
      value: { rawMetadata: { jg_skills: { plan_revision: 2 } } },
    });
    expect(result.fingerprint).toEqual(
      fingerprintPlan(plan, { excludeMetadataKeys: ['revision', 'status'] }),
    );
    expect((await inspectPlan(root)).fingerprint).toBeUndefined();
    expect(await readFile(join(root, 'plan.md'), 'utf8')).toBe(plan);
    expect(await readFile(join(root, 'milestones.md'), 'utf8')).toBe(milestones);
  });

  it('reports an unavailable requested fingerprint without losing partial observations', async () => {
    const root = await fixture();
    const missing = await inspectPlan(root, { fingerprint: {} });
    expect(missing.plan.state).toBe('missing');
    expect(missing.fingerprint).toMatchObject({ sha256: null, excludeMetadataKeys: [] });
    await writeFile(join(root, 'plan.md'), '---\nid: readable\nextension: .inf\n---\n# Work');
    const partial = await inspectPlan(root, { fingerprint: {} });
    expect(partial.plan).toMatchObject({
      state: 'readable',
      value: { metadata: { id: 'readable' }, body: '# Work' },
    });
    expect(partial.fingerprint?.sha256).toBeNull();
    expect(
      partial.diagnostics.filter((item) => item.code === 'YAML_VALUE_UNAVAILABLE'),
    ).toHaveLength(1);
    await writeFile(join(root, 'plan.md'), Buffer.from([0xff]));
    expect((await inspectPlan(root, { fingerprint: {} })).fingerprint?.sha256).toBeNull();
    await expectToRejectCode(
      inspectPlan(root, { fingerprint: { excludeMetadataKeys: [4] } } as never),
      ERRORS.INVALID_INPUT,
    );
  });

  it('matches independent public-example observations', { tags: ['full'] }, async () => {
    const root = resolve(import.meta.dirname, '../../examples');
    const small = await inspectPlan(join(root, 'small'));
    expect(small.plan.state).toBe('readable');
    expect(small.milestones.state).toBe('missing');
    if (small.plan.state === 'readable')
      expect(small.plan.value.metadata).toMatchObject({
        id: '1792612800_search-feedback',
        revision: 1,
        status: 'pending',
      });
    const extended = await inspectPlan(join(root, 'extensions'));
    if (extended.plan.state !== 'readable') throw new Error('Public extension fixture unreadable');
    expect(extended.plan.value.metadata.status).toBe('waiting-for-feedback');
    expect(extended.plan.value.rawMetadata).toHaveProperty('project');
    const complete = await inspectPlan(join(root, 'with-milestones'));
    if (complete.milestones.state !== 'readable')
      throw new Error('Public milestone fixture unreadable');
    expect(complete.milestones.value.milestones.map((entry) => entry.status)).toEqual([
      'done',
      'pending',
    ]);
    expect(complete.diagnostics).toEqual([]);
    const incomplete = await inspectPlan(join(root, 'incomplete'));
    expect(
      incomplete.diagnostics.filter((item) => item.code === 'MISSING_METADATA_FIELD'),
    ).toHaveLength(5);
    const orphan = await inspectPlan(join(root, 'orphan'));
    expect(orphan.plan.state).toBe('missing');
    expect(orphan.milestones.state).toBe('readable');
    expect(orphan.diagnostics.map((item) => item.code)).toContain('ORPHAN_MILESTONES');
  });

  it('reports deletion, custom paths, and empty documents without traversing history', async () => {
    const root = await fixture();
    for (const name of ['custom', 'coding-agent-planning']) {
      const path = join(root, name);
      await mkdir(path);
      await writeFile(join(path, 'plan.md'), '');
      await mkdir(join(path, 'history'));
      await writeFile(join(path, 'history', 'plan.md'), '# Must not be loaded');
      const before = await inspectPlan(path);
      expect(before.plan.state).toBe('readable');
      await rm(join(path, 'plan.md'));
      const after = await inspectPlan(path);
      expect(after.plan.state).toBe('missing');
      expect(await readFile(join(path, 'history', 'plan.md'), 'utf8')).toBe('# Must not be loaded');
    }
  });

  it('bounds each file, rejects invalid UTF-8, and preserves readable independent milestones', async () => {
    const root = await fixture();
    await writeFile(join(root, 'plan.md'), Buffer.from([0xff, 0xfe, 0x41, 0x00]));
    await writeFile(join(root, 'milestones.md'), '## Milestone 1: Work\n**Status:** pending');
    const invalid = await inspectPlan(root);
    expect(invalid.plan.state).toBe('unreadable');
    expect(invalid.milestones.state).toBe('readable');
    expect(invalid.diagnostics.map((item) => item.code)).toContain('INVALID_ENCODING');
    await writeFile(join(root, 'plan.md'), '\uFEFF# 😀');
    const bytes = Buffer.byteLength('\uFEFF# 😀');
    const exact = await inspectPlan(root, { maxBytes: bytes });
    expect(exact.plan.state).toBe('readable');
    if (exact.plan.state === 'readable') expect(exact.plan.value.source).toBe('\uFEFF# 😀');
    const tooSmall = await inspectPlan(root, { maxBytes: bytes - 1 });
    expect(tooSmall.plan.state).toBe('unreadable');
    expect(tooSmall.diagnostics.map((item) => item.code)).toContain('FILE_TOO_LARGE');
  });

  it('reports nonregular targets and refuses linked plan files', async () => {
    const root = await fixture();
    await mkdir(join(root, 'plan.md'));
    const result = await inspectPlan(root);
    expect(result.plan.state).toBe('unreadable');
    await rm(join(root, 'plan.md'), { recursive: true });
    await writeFile(join(root, 'outside.md'), '# Outside');
    // Windows developer accounts may lack file-symlink privileges; nonregular targets
    // above are covered on every host. The link behavior is exercised on POSIX.
    if (process.platform !== 'win32') {
      await symlink(join(root, 'outside.md'), join(root, 'plan.md'));
      expect((await inspectPlan(root)).plan.state).toBe('unreadable');
    }
  });

  it('rejects invalid request bounds rather than treating them as missing documents', async () => {
    const root = await fixture();
    await expectToRejectCode(inspectPlan(root, { maxBytes: 0 }), ERRORS.INVALID_INPUT);
    await expectToRejectCode(inspectPlan(''), ERRORS.INVALID_INPUT);
    await expectToRejectCode(
      inspectPlan(root, { maxBytes: Number.MAX_SAFE_INTEGER + 1 }),
      ERRORS.INVALID_INPUT,
    );
  });
});
