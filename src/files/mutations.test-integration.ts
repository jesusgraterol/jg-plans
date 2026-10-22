import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Exception } from 'jg-exception';
import { expectToRejectCode } from 'jg-exception/testing';
import { writeFileAtomicIfUnchanged } from 'jg-fs';
import {
  createPlan,
  ERRORS,
  inspectPlan,
  parsePlan,
  updatePlan,
  writePlanDocument,
} from 'jg-plans';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Only external I/O boundaries are controlled in failure tests; the owned pipeline stays real.
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});
vi.mock('jg-fs', async (original) => {
  const actual = await original<typeof import('jg-fs')>();
  return { ...actual, writeFileAtomicIfUnchanged: vi.fn(actual.writeFileAtomicIfUnchanged) };
});

const roots: string[] = [];
const fixture = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'jg-plans-mutate-'));
  roots.push(root);
  return root;
};
const put = async (source: string | Buffer, name = 'plan.md'): Promise<string> => {
  const root = await fixture();
  await writeFile(join(root, name), source);
  return root;
};
const id = '5a148c73-7d38-4a2f-9c0f-903d93b9b764';

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(open).mockImplementation(
    (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).open,
  );
  vi.mocked(writeFileAtomicIfUnchanged).mockImplementation(
    (await vi.importActual<typeof import('jg-fs')>('jg-fs')).writeFileAtomicIfUnchanged,
  );
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('exclusive creation through the built public API', () => {
  it.each([false, true])(
    'cleans only recognizable partial milestone creation when user changed bytes: %j',
    async (intervening) => {
      const root = await fixture();
      const path = join(root, 'milestones.md');
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
      vi.mocked(open).mockImplementation(async (target, flags, mode) => {
        const handle = await actual.open(target, flags, mode);
        if (String(target) !== path || flags !== 'wx') return handle;
        vi.spyOn(handle, 'writeFile').mockImplementationOnce(async () => {
          await actual.writeFile(path, intervening ? '# User edit' : '##');
          throw new Exception('Injected partial failure', { code: 'EIO' });
        });
        return handle;
      });
      const operation = writePlanDocument(root, {
        document: 'milestones',
        expectedSha256: null,
        source: '## Milestone 1: Work\n**Status:** pending',
      });
      await expectToRejectCode(operation, ERRORS.WRITE_FAILED);
      if (intervening) {
        await expect(operation).rejects.toMatchObject({ data: { cleanupFailedPaths: [path] } });
        expect(await readFile(path, 'utf8')).toBe('# User edit');
      } else expect(await readdir(root)).toEqual([]);
      expect((await readdir(root)).filter((name) => name.endsWith('.lock'))).toEqual([]);
    },
  );

  it('captures one creation time and preserves supplied body, metadata, and milestone bytes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T20:00:00Z'));
    const root = await fixture();
    const body = '\r\n# Café 😀\r\n\r\nOwn prose, without a final newline.';
    const milestones = `\uFEFF## Milestone 1: Work\r\n**Status:** custom\r\n**Milestone ID:** ${id}`;
    const result = await createPlan({
      root,
      slug: 'small-task',
      body,
      metadata: { id: '../../opaque-document-id', project: { labels: ['invented'] } },
      milestones,
    });
    expect(basename(result.directory)).toBe('1792612800_small-task');
    expect(result.plan.metadata).toMatchObject({
      id: '../../opaque-document-id',
      created_at: '2026-10-21T20:00:00.000Z',
      updated_at: '2026-10-21T20:00:00.000Z',
      revision: 1,
      status: 'pending',
    });
    expect(result.plan.rawMetadata).toMatchObject({ project: { labels: ['invented'] } });
    expect(result.plan.body).toBe(body);
    expect(await readFile(join(result.directory, 'milestones.md'))).toEqual(
      Buffer.from(milestones),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it('does not overwrite existing destinations or require conforming supplied metadata', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T20:00:00Z'));
    const root = await fixture();
    const original = await createPlan({
      root,
      slug: 'same',
      body: '# Keep me',
      metadata: { status: false, revision: 'unknown' },
    });
    expect(
      original.diagnostics.filter((item) => item.code === 'INVALID_METADATA_FIELD'),
    ).toHaveLength(2);
    const bytes = await readFile(join(original.directory, 'plan.md'));
    await expectToRejectCode(
      createPlan({ root, slug: 'same', body: '# Replacement' }),
      ERRORS.DESTINATION_EXISTS,
      'The plan destination already exists',
    );
    expect(await readFile(join(original.directory, 'plan.md'))).toEqual(bytes);
    expect(await readdir(original.directory)).toEqual(['plan.md']);
  });

  it('rejects traversal, overlong generated components, and unencodable text before creating files', async () => {
    const root = await fixture();
    for (const slug of ['../escape', 'UPPER', 'a/b', 'a'.repeat(64)])
      await expectToRejectCode(
        createPlan({ root, slug, body: '# Work' }),
        ERRORS.INVALID_INPUT,
        'Invalid jg-plans input',
      );
    await expectToRejectCode(
      createPlan({ root, slug: 'valid', body: '\uD800' }),
      ERRORS.UNSUPPORTED_ENCODING,
      'Document text is not valid UTF-8',
    );
    expect(await readdir(root)).toEqual([]);
  });

  it('cleans an owned partial file after a real prefix write followed by I/O failure', async () => {
    const root = await fixture();
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(open).mockImplementation(async (path, flags, mode) => {
      const handle = await actual.open(path, flags, mode);
      if (basename(String(path)) !== 'plan.md' || flags !== 'wx') return handle;
      const write = handle.writeFile.bind(handle);
      vi.spyOn(handle, 'writeFile').mockImplementationOnce(async () => {
        await write(Buffer.from('---\n'));
        throw new Exception('Injected failure', { code: 'EIO' });
      });
      return handle;
    });
    await expectToRejectCode(
      createPlan({ root, slug: 'partial', body: '# Work' }),
      ERRORS.WRITE_FAILED,
      'The plan document could not be written',
    );
    expect(await readdir(root)).toEqual([]);
  });

  it('preserves intervening user content and reports incomplete cleanup', async () => {
    const root = await fixture();
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    let planPath = '';
    vi.mocked(open).mockImplementation(async (path, flags, mode) => {
      if (basename(String(path)) === 'plan.md' && flags === 'wx') planPath = String(path);
      if (basename(String(path)) === 'milestones.md' && flags === 'wx') {
        await writeFile(planPath, '# New user content');
        throw new Exception('Injected failure', { code: 'EIO' });
      }
      return actual.open(path, flags, mode);
    });
    const operation = createPlan({
      root,
      slug: 'preserve-user',
      body: '# Original',
      milestones: '# Explicit milestones',
    });
    await expectToRejectCode(operation, ERRORS.WRITE_FAILED);
    await expect(operation).rejects.toMatchObject({
      data: { cleanupFailedPaths: expect.arrayContaining([planPath]) },
    });
    expect(await readFile(planPath, 'utf8')).toBe('# New user content');
  });

  it('preserves a replacement directory when creation fails after the owned directory was moved', async () => {
    const root = await fixture();
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    let createdDirectory = '';
    vi.mocked(open).mockImplementation(async (path, flags, mode) => {
      if (basename(String(path)) === 'plan.md' && flags === 'wx')
        createdDirectory = String(path).slice(0, -'/plan.md'.length);
      if (basename(String(path)) === 'milestones.md' && flags === 'wx') {
        await rename(createdDirectory, `${createdDirectory}-moved`);
        await mkdir(createdDirectory);
        throw new Exception('Injected disk failure', { code: 'EIO' });
      }
      return actual.open(path, flags, mode);
    });
    const operation = createPlan({ root, slug: 'moved', body: '# Keep', milestones: '# Explicit' });
    await expectToRejectCode(operation, ERRORS.LOCK_FAILED);
    await expect(operation).rejects.toMatchObject({
      data: { phase: 'release', mutationOutcome: 'uncertain', operationCompleted: false },
    });
    expect(await readdir(createdDirectory)).toEqual([]);
    expect(await readFile(join(`${createdDirectory}-moved`, 'plan.md'), 'utf8')).toContain(
      '# Keep',
    );
  });
});

describe('targeted updates through the built public API', () => {
  it.each(['\n', '\r\n'])('preserves every other byte for %j metadata edits', async (eol) => {
    const source = [
      '\uFEFF---',
      '# Café 😀 before target',
      "id: 'opaque' # keep ID",
      "status: 'pending'  # retain comment",
      'revision: 4',
      'project:',
      '  flags: [one, two]',
      '  note: "é 😀"',
      '---',
      '',
      '# Body',
      'Keep **everything** exactly.',
    ].join(eol);
    const root = await put(source);
    const result = await updatePlan(root, {
      document: 'plan',
      set: { status: "reviewer's choice" },
    });
    expect(result.changed).toBe(true);
    const expected = source.replace("status: 'pending'", "status: 'reviewer''s choice'");
    expect(await readFile(join(root, 'plan.md'))).toEqual(Buffer.from(expected));
    expect(parsePlan(expected).metadata.revision).toBe(4);
    const noOp = await updatePlan(root, { document: 'plan', set: { status: "reviewer's choice" } });
    expect(noOp.changed).toBe(false);
    expect(await readFile(join(root, 'plan.md'))).toEqual(Buffer.from(expected));
  });

  it('inserts only requested metadata without inventing historical fields or changing the body', async () => {
    const root = await put('\uFEFF# Existing 😀');
    await updatePlan(root, { document: 'plan', set: { status: 'done' } });
    expect(await readFile(join(root, 'plan.md'), 'utf8')).toBe(
      '\uFEFF---\nstatus: "done"\n---\n# Existing 😀',
    );
    const after = await inspectPlan(root);
    if (after.plan.state === 'readable')
      expect(after.plan.value.metadata.created_at).toBeUndefined();
    const empty = await put('');
    await updatePlan(empty, { document: 'plan', set: { id: 'new' } });
    expect(await readFile(join(empty, 'plan.md'), 'utf8')).toBe('---\nid: "new"\n---');
  });

  it('appends missing fields before the closing delimiter while preserving unknown YAML and EOF state', async () => {
    const source = '---\r\n# comment\r\nproject: { nested: true }\r\n---';
    const root = await put(source);
    await updatePlan(root, { document: 'plan', set: { revision: 2 } });
    expect(await readFile(join(root, 'plan.md'), 'utf8')).toBe(
      '---\r\n# comment\r\nproject: { nested: true }\r\nrevision: 2\r\n---',
    );
  });

  it('round-trips control characters in an explicit scalar and rejects unpaired text before writing', async () => {
    const source = "---\nid: 'old' # keep\n---\nCafé 😀";
    const root = await put(source);
    const value = 'new\nline\twith\u0000controls';
    await updatePlan(root, { document: 'plan', set: { id: value } });
    const after = await readFile(join(root, 'plan.md'), 'utf8');
    expect(after).toBe(`---\nid: ${JSON.stringify(value)} # keep\n---\nCafé 😀`);
    expect(parsePlan(after).metadata.id).toBe(value);
    await expectToRejectCode(
      updatePlan(root, { document: 'plan', set: { id: '\uD800' } }),
      ERRORS.UNSUPPORTED_ENCODING,
    );
    expect(await readFile(join(root, 'plan.md'), 'utf8')).toBe(after);
  });

  it.each([
    '---\nid: &shared old\nother: *shared\n---\nBody',
    '---\n{id: old}\n---\nBody',
    '---\nid: |\n  old\n---\nBody',
    '---\nid: # implicit null\n---\nBody',
    '---\nid: first\nid: duplicate\n---\nBody',
    '---\nid: old\nmissing closing',
  ])('leaves unsupported affected YAML untouched: %j', async (source) => {
    const root = await put(source);
    const operation = updatePlan(root, { document: 'plan', set: { id: 'new' } });
    await expectToRejectCode(
      operation,
      ERRORS.UNSAFE_EDIT,
      'The requested edit is unsupported or ambiguous',
    );
    await expect(operation).rejects.toMatchObject({ data: { reason: expect.any(String) } });
    expect(await readFile(join(root, 'plan.md'))).toEqual(Buffer.from(source));
  });

  it('preserves overview/prose and updates an existing misplaced marker independently of a malformed plan', async () => {
    const source = `# Café 😀\r\n## Overview\r\n| Milestone | Name | Status |\r\n| --- | --- | --- |\r\n| 1 | Work | pending |\r\n\r\n## Milestone 1: Work\r\nProse first.\r\n**Status:** pending  \r\n**Milestone ID:** ${id}\r\n\r\nEvidence without final newline.`;
    const root = await put(source, 'milestones.md');
    await writeFile(join(root, 'plan.md'), Buffer.from([0xff]));
    const result = await updatePlan(root, {
      document: 'milestones',
      changes: [{ select: { id }, set: { status: 'done' } }],
    });
    expect(await readFile(join(root, 'milestones.md'))).toEqual(
      Buffer.from(source.replace('**Status:** pending', '**Status:** done')),
    );
    expect(await readFile(join(root, 'plan.md'))).toEqual(Buffer.from([0xff]));
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['MISPLACED_STATUS', 'OVERVIEW_MISMATCH']),
    );
  });

  it('inserts canonical markers while preserving both final-newline variants', async () => {
    for (const final of ['', '\n']) {
      const root = await put(`## Milestone 1: Work${final}`, 'milestones.md');
      await updatePlan(root, {
        document: 'milestones',
        changes: [{ select: { ordinal: 1 }, set: { status: 'pending', id } }],
      });
      expect(await readFile(join(root, 'milestones.md'), 'utf8')).toBe(
        `## Milestone 1: Work\n**Status:** pending\n**Milestone ID:** ${id}${final}`,
      );
    }
  });

  it('rejects ambiguous selectors, repeated targets, duplicate markers, and unsafe new values', async () => {
    const source = `## Milestone 1: One\n**Status:** pending\n**Milestone ID:** ${id}\n## Milestone 1: Two\n**Status:** pending\n**Milestone ID:** ${id}`;
    const root = await put(source, 'milestones.md');
    for (const select of [{ ordinal: 1 }, { id }])
      await expectToRejectCode(
        updatePlan(root, {
          document: 'milestones',
          changes: [{ select, set: { status: 'done' } }],
        }),
        ERRORS.UNSAFE_EDIT,
      );
    const duplicates = await put(
      '## Milestone 1: One\n**Status:** pending\n**Status:** done',
      'milestones.md',
    );
    await expectToRejectCode(
      updatePlan(duplicates, {
        document: 'milestones',
        changes: [{ select: { ordinal: 1 }, set: { status: 'custom' } }],
      }),
      ERRORS.UNSAFE_EDIT,
    );
    await expectToRejectCode(
      updatePlan(duplicates, {
        document: 'milestones',
        changes: [{ select: { ordinal: 1 }, set: { status: 'line\nbreak' } }],
      }),
      ERRORS.INVALID_INPUT,
    );
    expect(await readFile(join(root, 'milestones.md'), 'utf8')).toBe(source);
    const singleSource = `## Milestone 1: One\n**Status:** pending\n**Milestone ID:** ${id}`;
    const single = await put(singleSource, 'milestones.md');
    const operation = updatePlan(single, {
      document: 'milestones',
      changes: [
        { select: { ordinal: 1 }, set: { status: 'done' } },
        { select: { id }, set: { status: 'custom' } },
      ],
    });
    await expectToRejectCode(operation, ERRORS.UNSAFE_EDIT);
    await expect(operation).rejects.toMatchObject({
      data: { reason: 'ambiguous-milestone-selector' },
    });
    expect(await readFile(join(single, 'milestones.md'), 'utf8')).toBe(singleSource);
  });

  it('inserts an ID after a canonical empty status at EOF without overlapping the value edit', async () => {
    const source = '## Milestone 1: One\n**Status:** ';
    const root = await put(source, 'milestones.md');
    await updatePlan(root, {
      document: 'milestones',
      changes: [{ select: { ordinal: 1 }, set: { status: 'done', id } }],
    });
    expect(await readFile(join(root, 'milestones.md'), 'utf8')).toBe(
      `${source}done\n**Milestone ID:** ${id}`,
    );
    const misplaced = '## Milestone 1: One\nProse.\n**Status:** pending';
    const other = await put(misplaced, 'milestones.md');
    const operation = updatePlan(other, {
      document: 'milestones',
      changes: [{ select: { ordinal: 1 }, set: { id } }],
    });
    await expectToRejectCode(operation, ERRORS.UNSAFE_EDIT);
    await expect(operation).rejects.toMatchObject({
      data: { reason: 'noncanonical-id-insertion' },
    });
    expect(await readFile(join(other, 'milestones.md'), 'utf8')).toBe(misplaced);
  });

  it('rejects invalid encoding and deleted targets without creating replacements', async () => {
    const root = await put(Buffer.from([0xff, 0xfe, 0x41, 0]));
    await expectToRejectCode(
      updatePlan(root, { document: 'plan', set: { status: 'done' } }),
      ERRORS.UNSUPPORTED_ENCODING,
    );
    expect(await readFile(join(root, 'plan.md'))).toEqual(Buffer.from([0xff, 0xfe, 0x41, 0]));
    await rm(join(root, 'plan.md'));
    await expectToRejectCode(
      updatePlan(root, { document: 'plan', set: { status: 'done' } }),
      ERRORS.READ_FAILED,
      'The selected document could not be read',
    );
    expect(await readdir(root)).toEqual([]);
  });

  it('detects an intervening writer through the real atomic helper and never retries over it', async () => {
    const root = await put('---\nstatus: pending\n---\n# Body');
    const path = join(root, 'plan.md');
    const newer = '---\nstatus: user-newer\n---\n# Keep user edits';
    const actual = await vi.importActual<typeof import('jg-fs')>('jg-fs');
    vi.mocked(writeFileAtomicIfUnchanged).mockImplementationOnce(async (target, data, expected) => {
      await writeFile(path, newer);
      await actual.writeFileAtomicIfUnchanged(target, data, expected);
    });
    await expectToRejectCode(
      updatePlan(root, { document: 'plan', set: { status: 'done' } }),
      ERRORS.SOURCE_CHANGED,
      'The document changed before replacement',
    );
    expect(await readFile(path, 'utf8')).toBe(newer);
    expect(writeFileAtomicIfUnchanged).toHaveBeenCalledTimes(1);
  });

  it('preserves permissions, skips writes for no-ops, and reports write failures', async () => {
    const source = '---\nstatus: "pending"\n---\n# Body';
    const root = await put(source);
    const path = join(root, 'plan.md');
    await chmod(path, 0o600);
    expect((await updatePlan(root, { document: 'plan', set: { status: 'pending' } })).changed).toBe(
      false,
    );
    expect(writeFileAtomicIfUnchanged).not.toHaveBeenCalled();
    await updatePlan(root, { document: 'plan', set: { status: 'done' } });
    if (process.platform !== 'win32') expect((await lstat(path)).mode & 0o777).toBe(0o600);
    const before = await readFile(path);
    vi.mocked(writeFileAtomicIfUnchanged).mockRejectedValueOnce(
      new Exception('Injected disk failure', { code: 'EIO' }),
    );
    await expectToRejectCode(
      updatePlan(root, { document: 'plan', set: { status: 'custom' } }),
      ERRORS.WRITE_FAILED,
    );
    expect(await readFile(path)).toEqual(before);
  });

  it('rejects linked target files and existing linked destinations', async () => {
    const root = await fixture();
    const target = join(root, 'outside.md');
    await writeFile(target, '# Outside');
    if (process.platform !== 'win32') {
      await symlink(target, join(root, 'plan.md'));
      await expectToRejectCode(
        updatePlan(root, { document: 'plan', set: { status: 'done' } }),
        ERRORS.READ_FAILED,
      );
      expect(await readFile(target, 'utf8')).toBe('# Outside');
    }
    const fileRoot = join(root, 'not-a-directory');
    await writeFile(fileRoot, '# Existing');
    await expectToRejectCode(
      createPlan({ root: fileRoot, slug: 'valid', body: '# Work' }),
      ERRORS.WRITE_FAILED,
    );
  });
});
