import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runProcess } from 'jg-process';
import { describe, expect, it as baseIt } from 'vitest';

import manifest from '../../package.json' with { type: 'json' };

const executable = resolve(import.meta.dirname, '../../dist/cli/cli.js');
const it = baseIt.extend('cli', ({ signal }, { onCleanup }) => {
  const roots: string[] = [];
  const active: Promise<unknown>[] = [];
  const cleanup = new AbortController();
  const cancellation = AbortSignal.any([signal, cleanup.signal]);
  onCleanup(async () => {
    cleanup.abort();
    await Promise.allSettled(active);
    for (const root of roots) await rm(root, { recursive: true, force: true });
  });
  const fixture = async (): Promise<string> => {
    const directory = await mkdtemp(join(tmpdir(), 'jg-plans-cli-test-'));
    if (cancellation.aborted) {
      await rm(directory, { recursive: true, force: true });
      cancellation.throwIfAborted();
    }
    roots.push(directory);
    return directory;
  };
  const run = (args: string[], input?: string, cwd?: string) => {
    const result = runProcess({
      command: process.execPath,
      args: [executable, ...args],
      signal: cancellation,
      timeoutSeconds: 10,
      maxOutputBytes: 1024 * 1024,
      ...(input === undefined ? {} : { input }),
      ...(cwd === undefined ? {} : { cwd }),
    });
    active.push(result);
    return result;
  };
  return { fixture, run };
});

describe('compiled CLI read contract', () => {
  it('includes exact hashes, ranges, and milestone metadata without bodies, and requests explicit fingerprint exclusions', async ({
    cli: { fixture, run },
  }) => {
    const root = await fixture();
    await writeFile(
      join(root, 'plan.md'),
      '---\nid: sample\nstatus: pending\nrevision: 1\n---\n# PRIVATE_PLAN_BODY',
    );
    await writeFile(
      join(root, 'milestones.md'),
      '---\njg_skills: {plan_id: sample}\n---\n## Shared requirements\nPRIVATE_SHARED_BODY\n## Milestone 1: Work\n**Status:** custom\nPRIVATE_MILESTONE_BODY',
    );
    const args = [
      'inspect',
      '--directory',
      root,
      '--fingerprint-exclude',
      '["revision","status","status"]',
      '--json',
    ];
    const result = await run(args);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const data = JSON.parse(result.stdout).data;
    expect(data.plan.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(data.milestones.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(data.milestones.rawMetadata).toEqual({ jg_skills: { plan_id: 'sample' } });
    expect(data.milestones.sections.map((section: { title: string }) => section.title)).toEqual([
      'Shared requirements',
      'Milestone 1: Work',
    ]);
    expect(data.milestones.milestones[0].headingEnd).toBeGreaterThan(
      data.milestones.milestones[0].location.offset,
    );
    expect(data.fingerprint).toMatchObject({
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      excludeMetadataKeys: ['revision', 'status'],
      diagnostics: [],
    });
    expect(result.stdout).not.toContain('PRIVATE_');
    await writeFile(
      join(root, 'plan.md'),
      '---\nid: sample\nstatus: done\nrevision: 4\n---\n# PRIVATE_PLAN_BODY',
    );
    const changed = JSON.parse((await run(args)).stdout).data;
    expect(changed.plan.sha256).not.toBe(data.plan.sha256);
    expect(changed.fingerprint.sha256).toBe(data.fingerprint.sha256);
    const included = await run([...args, '--include-body']);
    expect(included.stdout).toContain('PRIVATE_PLAN_BODY');
    expect(included.stdout).toContain('PRIVATE_SHARED_BODY');
    expect(included.stdout).toContain('PRIVATE_MILESTONE_BODY');
  });

  it('rejects malformed exclusions and unsupported commands before document reads', async ({
    cli: { fixture, run },
  }) => {
    const root = await fixture();
    await mkdir(join(root, 'plan.md'));
    for (const value of ['broken', 'null', '{}', '[1]']) {
      const result = await run([
        'inspect',
        '--directory',
        root,
        '--fingerprint-exclude',
        value,
        '--json',
      ]);
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stdout).error.code).toBe('JG_PLANS_INVALID_INPUT');
    }
    const rejected = await run([
      'check',
      '--directory',
      root,
      '--fingerprint-exclude',
      '[]',
      '--json',
    ]);
    expect(JSON.parse(rejected.stdout).error.code).toBe('JG_PLANS_INVALID_INPUT');
    await rm(join(root, 'plan.md'), { recursive: true });
    await writeFile(
      join(root, 'plan.md'),
      '---\nid: sample\nextension: [broken\n---\n# PRIVATE_BODY',
    );
    const partial = await run([
      'inspect',
      '--directory',
      root,
      '--fingerprint-exclude',
      '[]',
      '--json',
    ]);
    expect(partial.exitCode).toBe(0);
    expect(JSON.parse(partial.stdout).data.fingerprint.sha256).toBeNull();
    expect(JSON.parse(partial.stdout).data.plan.state).toBe('readable');
    expect(partial.stdout).not.toContain('PRIVATE_BODY');
  });

  it('has JSON-only stdout, retains partial observations, and includes bodies only by request', async ({
    cli: { fixture, run },
  }) => {
    const root = await fixture();
    await writeFile(join(root, 'plan.md'), '# SECRET_BODY_MARKER\nUseful prose.');
    await writeFile(
      join(root, 'milestones.md'),
      '## Milestone 3: Remaining\n**Status:** custom\nSECRET_MILESTONE_BODY',
    );
    const inspection = await run(['inspect', '--directory', root, '--json']);
    expect(inspection.exitCode).toBe(0);
    expect(inspection.stderr).toBe('');
    expect(inspection.stdout).not.toContain('SECRET_BODY_MARKER');
    expect(inspection.stdout).not.toContain('SECRET_MILESTONE_BODY');
    expect(JSON.parse(inspection.stdout)).toMatchObject({
      schemaVersion: 1,
      command: 'inspect',
      error: null,
      data: {
        plan: { state: 'readable' },
        milestones: { milestones: [{ ordinal: 3, status: 'custom' }] },
      },
    });
    const included = await run(['inspect', '--directory', root, '--json', '--include-body']);
    expect(included.stdout).toContain('SECRET_BODY_MARKER');
    expect(included.stdout).toContain('SECRET_MILESTONE_BODY');
    const checked = await run(['check', '--directory', root, '--json']);
    expect(checked.exitCode).toBe(1);
    expect(JSON.parse(checked.stdout)).toMatchObject({ data: { conforms: false }, error: null });
    const human = await run(['inspect', '--directory', root]);
    expect(human.stdout).not.toContain('SECRET_BODY_MARKER');
    expect(human.stderr).toContain('MISSING_FRONTMATTER');
  });

  it('distinguishes passing checks, absence, format observations, and operational failures', async ({
    cli: { fixture, run },
  }) => {
    const root = await fixture();
    expect((await run(['inspect', '--directory', root, '--json'])).exitCode).toBe(0);
    expect((await run(['check', '--directory', root, '--json'])).exitCode).toBe(1);
    const example = resolve(import.meta.dirname, '../../examples/small');
    expect((await run(['check', '--directory', example, '--json'])).exitCode).toBe(0);
    await writeFile(join(root, 'plan.md'), Buffer.from([0xc3, 0x28]));
    expect((await run(['inspect', '--directory', root, '--json'])).exitCode).toBe(0);
    expect((await run(['check', '--directory', root, '--json'])).exitCode).toBe(1);
    await rm(join(root, 'plan.md'));
    await mkdir(join(root, 'plan.md'));
    const failed = await run(['inspect', '--directory', root, '--json']);
    expect(failed.exitCode).toBe(2);
    expect(JSON.parse(failed.stdout)).toMatchObject({
      error: { code: 'JG_PLANS_READ_FAILED' },
      data: { plan: { state: 'unreadable' } },
    });
  });

  it('validates flags strictly and supports help/version without reading selected documents', async ({
    cli: { fixture, run },
  }) => {
    const root = await fixture();
    await mkdir(join(root, 'plan.md'));
    expect((await run(['--help', '--directory', root])).exitCode).toBe(0);
    const version = await run(['--version', '--directory', root, '--json']);
    expect(version.exitCode).toBe(0);
    expect(JSON.parse(version.stdout)).toMatchObject({
      schemaVersion: 1,
      command: 'version',
      data: { version: manifest.version },
      diagnostics: [],
      error: null,
    });
    for (const args of [
      ['inspect'],
      ['bogus'],
      ['inspect', '--directory', root, '--unknown'],
      ['inspect', '--directory', root, '--directory', root],
      ['inspect', '--directory', root, '--max-bytes', '0'],
      ['inspect', '--directory', root, '--max-bytes', '9007199254740992'],
    ]) {
      const result = await run([...args, '--json']);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({
        schemaVersion: 1,
        error: { code: 'JG_PLANS_INVALID_INPUT' },
      });
    }
  });

  it('honors exact byte limits and a larger explicit override', async ({
    cli: { fixture, run },
  }) => {
    const root = await fixture();
    await writeFile(join(root, 'plan.md'), '# Work');
    expect(
      (await run(['inspect', '--directory', root, '--max-bytes', '5', '--json'])).exitCode,
    ).toBe(2);
    expect(
      (await run(['inspect', '--directory', root, '--max-bytes', '6', '--json'])).exitCode,
    ).toBe(0);
  });
});

describe('compiled CLI mutation contract', () => {
  // Four native steps each retain a ten-second deadline, including real fsync work.
  it(
    'creates, inspects, updates, and checks with explicit JSON inputs',
    { timeout: 45_000 },
    async ({ cli: { fixture, run } }) => {
      const root = await fixture();
      const created = await run(
        ['create', '--slug', 'cli-task', '--root', root, '--input', '-', '--json'],
        JSON.stringify({
          body: '# PRIVATE_BODY',
          metadata: { project: { label: 'invented' } },
          milestones: '## Milestone 1: Work\n**Status:** pending',
        }),
      );
      expect(created.exitCode).toBe(0);
      expect(created.stderr).toBe('');
      expect(created.stdout).not.toContain('PRIVATE_BODY');
      const directory: string = JSON.parse(created.stdout).data.directory;
      expect((await run(['inspect', '--directory', directory, '--json'])).exitCode).toBe(0);
      const updated = await run(
        ['update', '--directory', directory, '--input', '-', '--json'],
        JSON.stringify({
          document: 'milestones',
          changes: [{ select: { ordinal: 1 }, set: { status: 'done' } }],
        }),
      );
      expect(updated.exitCode).toBe(0);
      expect(JSON.parse(updated.stdout)).toMatchObject({
        schemaVersion: 1,
        command: 'update',
        data: { changed: true, document: 'milestones' },
        error: null,
      });
      expect((await run(['check', '--directory', directory, '--json'])).exitCode).toBe(0);
    },
  );

  it('uses the invocation directory for the default planning root and accepts input files', async ({
    cli: { fixture, run },
  }) => {
    const root = await fixture();
    const input = join(root, 'input.json');
    await writeFile(input, JSON.stringify({ body: '# Local default' }));
    const result = await run(
      ['create', '--slug', 'default-root', '--input', input, '--json'],
      undefined,
      root,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).data.directory).toContain(join(root, 'jg-plans'));
  });

  it('returns safe JSON errors for bad input, invalid encodings, unsupported patches, and missing targets', async ({
    cli: { fixture, run },
  }) => {
    const root = await fixture();
    for (const [input, code] of [
      ['{ PRIVATE_SECRET_BODY', 'JG_PLANS_INVALID_INPUT'],
      [JSON.stringify({ body: '\uD800' }), 'JG_PLANS_UNSUPPORTED_ENCODING'],
      [JSON.stringify({ body: '# Work', root: 'injected' }), 'JG_PLANS_INVALID_INPUT'],
    ]) {
      const result = await run(
        ['create', '--slug', 'bad', '--root', root, '--input', '-', '--json'],
        input,
      );
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toBe('');
      expect(result.stdout).not.toContain('PRIVATE_SECRET_BODY');
      expect(JSON.parse(result.stdout)).toMatchObject({ data: null, error: { code } });
    }
    const update = await run(
      ['update', '--directory', root, '--input', '-', '--json'],
      JSON.stringify({ document: 'plan', set: { status: 'done' } }),
    );
    expect(update.exitCode).toBe(2);
    expect(JSON.parse(update.stdout).error.code).toBe('JG_PLANS_READ_FAILED');
    const unsupported = await run(
      ['update', '--directory', root, '--input', '-', '--json'],
      JSON.stringify({ document: 'plan', set: { body: '# Forbidden rewrite' } }),
    );
    expect(JSON.parse(unsupported.stdout).error.code).toBe('JG_PLANS_INVALID_INPUT');
    const file = join(root, 'bad.json');
    await writeFile(file, Buffer.from([0xff, 0xfe, 0]));
    const encoding = await run([
      'create',
      '--slug',
      'encoding',
      '--root',
      root,
      '--input',
      file,
      '--json',
    ]);
    expect(JSON.parse(encoding.stdout).error.code).toBe('JG_PLANS_UNSUPPORTED_ENCODING');
  });

  it('applies byte bounds to stdin and target documents, with an explicit larger override', async ({
    cli: { fixture, run },
  }) => {
    const root = await fixture();
    const input = JSON.stringify({ body: 'x'.repeat(1024 * 1024 + 1) });
    const limited = await run(
      ['create', '--slug', 'large', '--root', root, '--input', '-', '--json'],
      input,
    );
    expect(limited.exitCode).toBe(2);
    expect(JSON.parse(limited.stdout).error.code).toBe('JG_PLANS_READ_FAILED');
    const created = await run(
      [
        'create',
        '--slug',
        'large',
        '--root',
        root,
        '--input',
        '-',
        '--max-bytes',
        '2097152',
        '--json',
      ],
      input,
    );
    expect(created.exitCode).toBe(0);
    const directory: string = JSON.parse(created.stdout).data.directory;
    const patch = JSON.stringify({ document: 'plan', set: { status: 'done' } });
    expect(
      (await run(['update', '--directory', directory, '--input', '-', '--json'], patch)).exitCode,
    ).toBe(2);
    const updated = await run(
      ['update', '--directory', directory, '--input', '-', '--max-bytes', '2097152', '--json'],
      patch,
    );
    expect(updated.exitCode).toBe(0);
  });
});
