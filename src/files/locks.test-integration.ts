import { once } from 'node:events';
import { mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runProcess, startProcess, stopProcessTree } from 'jg-process';
import { ERRORS, updatePlan, withPlanDocumentLocks, writePlanDocument } from 'jg-plans';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const fixture = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'jg-plans-locks-'));
  roots.push(root);
  return realpath(root);
};
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('shared local document locks', () => {
  it('serializes canonical directory aliases and releases on callback failure', async () => {
    const root = await fixture();
    const directory = process.platform === 'win32' ? root : join(root, 'alias');
    if (directory !== root) await symlink(root, directory);
    await writeFile(join(root, 'plan.md'), '# Work');
    await withPlanDocumentLocks(directory, ['plan'], async (canonical) => {
      expect(canonical).toBe(root);
      await expect(
        updatePlan(root, { document: 'plan', set: { status: 'done' } }),
      ).rejects.toMatchObject({
        code: ERRORS.LOCK_BUSY,
        data: { phase: 'acquire', mutationOutcome: 'not-applied' },
      });
      await expect(withPlanDocumentLocks(root, ['plan'], () => undefined)).rejects.toMatchObject({
        code: ERRORS.LOCK_BUSY,
      });
      await writePlanDocument(root, {
        document: 'milestones',
        expectedSha256: null,
        source: '# Independent selected file',
      });
    });
    const failure = new Error('Callback failed');
    await expect(
      withPlanDocumentLocks(root, ['milestones', 'plan'], () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect((await readdir(root)).filter((name) => name.endsWith('.lock'))).toEqual([]);
    expect(await withPlanDocumentLocks(root, ['plan', 'milestones'], () => 42)).toBe(42);
  });

  it('releases the first lock when the second is busy', async () => {
    const root = await fixture();
    await withPlanDocumentLocks(root, ['milestones'], async () => {
      await expect(
        withPlanDocumentLocks(root, ['milestones', 'plan'], () => {
          throw new Error('Must not run');
        }),
      ).rejects.toMatchObject({
        code: ERRORS.LOCK_BUSY,
        data: { document: 'milestones', mutationOutcome: 'not-applied' },
      });
      await expect(withPlanDocumentLocks(root, ['plan'], () => true)).resolves.toBe(true);
    });
    expect(await readdir(root)).toEqual([]);
  });

  it(
    'contends with real child library and CLI operations using explicit pipe barriers',
    { timeout: 20_000 },
    async ({ signal }) => {
      const root = await fixture();
      await writeFile(join(root, 'plan.md'), '# Work');
      const child = startProcess(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
      import { withPlanDocumentLocks } from 'jg-plans';
      await withPlanDocumentLocks(process.argv[1], ['plan'], async () => {
        process.stdout.write('locked\\n');
        await new Promise(resolve => { process.stdin.once('data', resolve); process.stdin.resume(); });
        process.stdin.pause();
      });
    `,
          root,
        ],
        { cwd: resolve(import.meta.dirname, '../..'), stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const closed = once(child, 'close');
      try {
        const ready = await once(child.stdout!, 'data', { signal });
        expect(String(ready[0])).toBe('locked\n');
        await expect(
          updatePlan(root, { document: 'plan', set: { status: 'done' } }),
        ).rejects.toMatchObject({ code: ERRORS.LOCK_BUSY });
        const cli = await runProcess({
          command: process.execPath,
          args: [
            resolve(import.meta.dirname, '../../dist/cli/cli.js'),
            'update',
            '--directory',
            root,
            '--input',
            '-',
            '--json',
          ],
          input: JSON.stringify({ document: 'plan', set: { status: 'done' } }),
          signal,
          timeoutSeconds: 10,
          maxOutputBytes: 1024 * 1024,
        });
        expect(cli.exitCode).toBe(2);
        expect(cli.stderr).toBe('');
        expect(JSON.parse(cli.stdout).error).toMatchObject({
          code: ERRORS.LOCK_BUSY,
          data: { mutationOutcome: 'not-applied' },
        });
        child.stdin!.end('release\n');
        expect((await closed)[0]).toBe(0);
        expect(await readFile(join(root, 'plan.md'), 'utf8')).toBe('# Work');
        await expect(
          updatePlan(root, { document: 'plan', set: { status: 'done' } }),
        ).resolves.toMatchObject({ changed: true });
      } finally {
        await stopProcessTree(child);
        await closed;
      }
    },
  );

  it(
    'keeps a dead owner busy instead of automatically recovering its documents',
    { timeout: 20_000 },
    async ({ signal }) => {
      const root = await fixture();
      const child = await runProcess({
        command: process.execPath,
        args: [
          '--input-type=module',
          '-e',
          `
      import { acquireLock } from 'jg-fs';
      await acquireLock(process.argv[1] + '/.plan.md.jg-plans.lock');
    `,
          root,
        ],
        cwd: resolve(import.meta.dirname, '../..'),
        signal,
        timeoutSeconds: 10,
        maxOutputBytes: 1024,
      });
      expect(child.exitCode).toBe(0);
      const ownerBefore = await readFile(join(root, '.plan.md.jg-plans.lock/owner.json'));
      await expect(withPlanDocumentLocks(root, ['plan'], () => true)).rejects.toMatchObject({
        code: ERRORS.LOCK_BUSY,
        data: { reason: 'owner-gone', mutationOutcome: 'not-applied' },
      });
      expect(await readFile(join(root, '.plan.md.jg-plans.lock/owner.json'))).toEqual(ownerBefore);
    },
  );
});
