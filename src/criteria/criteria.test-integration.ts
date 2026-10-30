import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runProcess } from 'jg-process';
import { describe, expect, it as baseIt } from 'vitest';

const executable = resolve(import.meta.dirname, '../../dist/cli/cli.js');
const examples = resolve(import.meta.dirname, '../../examples');

type IDiagnosticLine = { code: string; document: string; line: number | undefined };

const byDocumentAndLine = (left: IDiagnosticLine, right: IDiagnosticLine): number =>
  left.document.localeCompare(right.document) || (left.line ?? 0) - (right.line ?? 0);

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
    const directory = await mkdtemp(join(tmpdir(), 'jg-plans-criteria-test-'));
    if (cancellation.aborted) {
      await rm(directory, { recursive: true, force: true });
      cancellation.throwIfAborted();
    }
    roots.push(directory);
    return directory;
  };
  const run = async (args: string[], input?: string, cwd?: string) => {
    const result = runProcess({
      command: process.execPath,
      args: [executable, ...args, '--json'],
      signal: cancellation,
      timeoutSeconds: 10,
      maxOutputBytes: 1024 * 1024,
      ...(input === undefined ? {} : { input }),
      ...(cwd === undefined ? {} : { cwd }),
    });
    active.push(result);
    const completed = await result;
    return { exitCode: completed.exitCode, envelope: JSON.parse(completed.stdout) };
  };
  return { fixture, run };
});

// every shipped example that states machine-readable expected results
const directories: string[] = [];
for (const entry of await readdir(examples, { withFileTypes: true }))
  if (entry.isDirectory() && (await readdir(join(examples, entry.name))).includes('expected.json'))
    directories.push(entry.name);

describe('shipped criteria examples', () => {
  it('include both criteria examples', () => {
    expect(directories.sort()).toStrictEqual(['criteria', 'criteria-invalid']);
  });

  for (const name of directories)
    it(`check and inspect ${name} match its hand-written expected.json`, async ({
      cli: { run },
    }) => {
      const expected = JSON.parse(await readFile(join(examples, name, 'expected.json'), 'utf8'));
      const directory = join(examples, name);
      const check = await run(['check', '--directory', directory]);
      const inspect = await run(['inspect', '--directory', directory]);
      const observed = (envelope: {
        diagnostics: { code: string; document: string; location?: { line: number } }[];
        data: {
          plan: { metadata: Record<string, unknown> };
          criteria: { protocol: string; criteria: Record<string, unknown>[] };
        };
      }) => ({
        protocol: envelope.data.criteria.protocol,
        // the optional scope fields the example declares
        metadata: Object.fromEntries(
          ['priority', 'repositories', 'error_codes']
            .filter((key) => key in envelope.data.plan.metadata)
            .map((key) => [key, envelope.data.plan.metadata[key]]),
        ),
        criteria: envelope.data.criteria.criteria.map(({ id, text, milestones, progress }) => ({
          id,
          text,
          milestones,
          progress,
        })),
        diagnostics: envelope.diagnostics
          .map(({ code, document, location }) => ({ code, document, line: location?.line }))
          .sort(byDocumentAndLine),
      });
      const want = {
        protocol: expected.protocol,
        metadata: expected.metadata ?? {},
        criteria: expected.criteria,
        diagnostics: [...expected.diagnostics].sort(byDocumentAndLine),
      };
      expect(check.exitCode).toBe(expected.conforms ? 0 : 1);
      expect(check.envelope.data.conforms).toBe(expected.conforms);
      expect(observed(check.envelope)).toStrictEqual(want);
      expect(inspect.exitCode).toBe(0);
      expect(observed(inspect.envelope)).toStrictEqual(want);
    });
});

describe('writing protocol 0.2 documents', () => {
  it('creates a plan whose protocol marker reads back as the string "0.2"', async ({
    cli: { fixture, run },
  }) => {
    const root = await fixture();
    const created = await run(
      ['create', '--slug', 'criteria', '--root', root, '--input', '-'],
      JSON.stringify({
        body: '# Work\n\n## Acceptance criteria\n\n- AC-01: The work is done.\n',
        metadata: { protocol: '0.2' },
      }),
    );
    expect(created.exitCode).toBe(0);
    const directory = created.envelope.data.directory;
    const source = await readFile(join(directory, 'plan.md'), 'utf8');
    expect(source).toContain('protocol: "0.2"\n');
    const inspected = await run(['check', '--directory', directory]);
    expect(inspected.exitCode).toBe(0);
    expect(inspected.envelope.data.plan.protocol).toBe('0.2');
    expect(inspected.envelope.data.criteria.criteria).toMatchObject([
      { id: 'AC-01', milestones: [], progress: 'pending' },
    ]);
  });

  it('keeps coverage lines in place when missing milestone IDs are assigned', async ({
    cli: { fixture, run },
  }) => {
    const root = await fixture();
    const created = await run(
      ['create', '--slug', 'covered', '--root', root, '--input', '-'],
      JSON.stringify({
        body: '# Work\n\n- AC-01: First.\n- AC-02: Second.\n',
        metadata: { protocol: '0.2' },
      }),
    );
    const directory = created.envelope.data.directory;
    const written = await run(
      ['write', '--directory', directory, '--input', '-'],
      JSON.stringify({
        document: 'milestones',
        expectedSha256: null,
        assignMissingIds: true,
        source:
          '## Milestone 1: First\n**Status:** pending\n**Acceptance criteria:** AC-01\n\n## Milestone 2: Second\n**Status:** pending\n**Acceptance criteria:** AC-02\n',
      }),
    );
    expect(written.exitCode).toBe(0);
    expect(written.envelope.data.assignedMilestoneIds).toHaveLength(2);
    const source = await readFile(join(directory, 'milestones.md'), 'utf8');
    expect(source).toMatch(
      /\*\*Status:\*\* pending\n\*\*Milestone ID:\*\* [0-9a-f-]{36}\n\*\*Acceptance criteria:\*\* AC-01\n/,
    );
    const checked = await run(['check', '--directory', directory]);
    expect(checked.exitCode).toBe(0);
    expect(checked.envelope.diagnostics).toStrictEqual([]);
    expect(
      checked.envelope.data.criteria.criteria.map(
        (criterion: { id: string; milestones: { ordinal: number }[] }) => [
          criterion.id,
          criterion.milestones.map((milestone) => milestone.ordinal),
        ],
      ),
    ).toStrictEqual([
      ['AC-01', [1]],
      ['AC-02', [2]],
    ]);
  });
});
