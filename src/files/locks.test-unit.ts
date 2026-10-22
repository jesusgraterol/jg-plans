import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Exception } from 'jg-exception';
import { acquireLock, type IFileLock } from 'jg-fs';
import { ERRORS, withPlanDocumentLocks } from 'jg-plans';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('jg-fs', async (original) => {
  const actual = await original<typeof import('jg-fs')>();
  return { ...actual, acquireLock: vi.fn(actual.acquireLock) };
});
const roots: string[] = [];
const held: IFileLock[] = [];
const fixture = async (): Promise<string> => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'jg-plans-lock-failure-')));
  roots.push(root);
  return root;
};
afterEach(async () => {
  for (const lock of held.splice(0)) await lock.release();
  vi.mocked(acquireLock).mockReset();
  vi.mocked(acquireLock).mockImplementation(
    (await vi.importActual<typeof import('jg-fs')>('jg-fs')).acquireLock,
  );
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('lock ownership failure outcomes', () => {
  it('always acquires plan first and releases milestones first', async () => {
    const root = await fixture();
    const events: string[] = [];
    const actual = await vi.importActual<typeof import('jg-fs')>('jg-fs');
    vi.mocked(acquireLock).mockImplementation(async (path) => {
      events.push(`acquire ${basename(path)}`);
      const lock = await actual.acquireLock(path);
      return {
        ...lock,
        release: async () => {
          events.push(`release ${basename(path)}`);
          await lock.release();
        },
      };
    });
    await withPlanDocumentLocks(root, ['milestones', 'plan'], () => {
      events.push('callback');
    });
    expect(events).toEqual([
      'acquire .plan.md.jg-plans.lock',
      'acquire .milestones.md.jg-plans.lock',
      'callback',
      'release .milestones.md.jg-plans.lock',
      'release .plan.md.jg-plans.lock',
    ]);
    expect(await readdir(root)).toEqual([]);
  });

  it.each([false, true])(
    'reports uncertainty after applied bytes even when callback failure is %j',
    async (failCallback) => {
      const root = await fixture();
      const actual = await vi.importActual<typeof import('jg-fs')>('jg-fs');
      vi.mocked(acquireLock).mockImplementation(async (path) => {
        const lock = await actual.acquireLock(path);
        held.push(lock);
        return {
          ...lock,
          release: async () => {
            throw new Exception('Injected release failure', { code: 'EIO' });
          },
        };
      });
      const operation = withPlanDocumentLocks(root, ['plan'], async () => {
        await writeFile(join(root, 'plan.md'), '# Applied');
        if (failCallback) throw new Error('Callback failed after write');
        return 'completed';
      });
      await expect(operation).rejects.toMatchObject({
        code: ERRORS.LOCK_FAILED,
        data: {
          phase: 'release',
          operationCompleted: !failCallback,
          mutationOutcome: 'uncertain',
          documents: ['plan'],
        },
        cause: expect.any(AggregateError),
      });
      expect(await readFile(join(root, 'plan.md'), 'utf8')).toBe('# Applied');
      expect(await readdir(root)).toContain('.plan.md.jg-plans.lock');
    },
  );
});
