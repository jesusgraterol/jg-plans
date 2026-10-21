import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runProcess } from 'jg-process';
import { afterEach, describe, expect, it } from 'vitest';

import manifest from '../../package.json' with { type: 'json' };

const executable = resolve(import.meta.dirname, '../../dist/cli/cli.js');
const roots: string[] = [];
const fixture = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'jg-plans-cli-test-'));
  roots.push(directory);
  return directory;
};
const run = (args: string[]) =>
  runProcess({
    command: process.execPath,
    args: [executable, ...args],
    timeoutSeconds: 10,
    maxOutputBytes: 1024 * 1024,
  });
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('compiled CLI read contract', () => {
  it('has JSON-only stdout, retains partial observations, and includes bodies only by request', async () => {
    const root = await fixture();
    await writeFile(join(root, 'plan.md'), '# SECRET_BODY_MARKER\nUseful legacy prose.');
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

  it('distinguishes passing checks, absence, format observations, and operational failures', async () => {
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

  it('validates flags strictly and supports help/version without reading selected documents', async () => {
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

  it('honors exact byte limits and a larger explicit override', async () => {
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
