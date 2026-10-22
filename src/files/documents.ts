import { lstat, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { getErrorCode } from 'jg-exception';
import { assertNoLinksBelow, readBoundedFile, writeFileAtomicIfUnchanged } from 'jg-fs';
import { z } from 'zod';

import {
  decodeSource,
  encodeSource,
  preparePlanDocumentWrite,
  type IPreparedPlanEdit,
} from '../edits/index.ts';
import { assertSourceExpectation } from '../edits/preparations.ts';
import { planErrors } from '../errors/index.ts';
import {
  DEFAULT_MAX_BYTES,
  PlanDocumentWriteSchema,
  ReadOptionsSchema,
  RemoveMilestonesSchema,
  type IPlanDocumentWrite,
  type IReadOptions,
  type IRemoveMilestones,
} from '../protocol/index.ts';

import { withPlanDocumentLocks } from './locks.ts';
import type { IPlanDocumentWriteResult, IRemoveMilestonesResult } from './types.ts';

export type IOwnedFile = { path: string; dev: bigint; ino: bigint; bytes: Buffer };

/** Exclusive creation shared with createPlan; ownership is recorded before any write. */
export const writeExclusive = async (
  root: string,
  path: string,
  bytes: Buffer,
  owned: IOwnedFile[],
): Promise<void> => {
  await assertNoLinksBelow(root, path);
  const handle = await open(path, 'wx');
  try {
    const stat = await handle.stat({ bigint: true });
    owned.push({ path, dev: stat.dev, ino: stat.ino, bytes });
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

/** Package-private validation shared by all existing-directory mutations. */
export const validateMutationOptions = (directory: string, options: IReadOptions): void => {
  if (
    !z
      .string()
      .min(1)
      .refine((value) => !value.includes('\0'))
      .safeParse(directory).success ||
    !ReadOptionsSchema.safeParse(options).success
  )
    throw planErrors.create('invalidInput');
};

/** Read exact bytes and guard them before decoding or preparing any new content. */
export const readMutationSource = async (
  directory: string,
  document: 'plan' | 'milestones',
  options: IReadOptions,
  expected: string | null | undefined,
): Promise<Buffer | null> => {
  const path = join(directory, `${document}.md`);
  let before: Buffer | null;
  try {
    await assertNoLinksBelow(directory, path);
    before = await readBoundedFile(path, options.maxBytes ?? DEFAULT_MAX_BYTES);
  } catch (cause) {
    const reason = getErrorCode(cause);
    if (expected !== undefined && (reason === 'NON_EXISTENT_FILE' || reason === 'ENOENT'))
      before = null;
    else throw planErrors.create('readFailed', { cause, ...(reason ? { data: { reason } } : {}) });
  }
  assertSourceExpectation(before, expected);
  return before;
};

/** Persist one prepared result once; null expectations use exclusive creation. */
export const persistPrepared = async (
  directory: string,
  document: 'plan' | 'milestones',
  before: Buffer | null,
  prepared: IPreparedPlanEdit,
): Promise<IPlanDocumentWriteResult> => {
  if (prepared.changed) {
    try {
      const path = join(directory, `${document}.md`);
      await assertNoLinksBelow(directory, path);
      if (before === null) {
        const owned: IOwnedFile[] = [];
        try {
          await writeExclusive(directory, path, encodeSource(prepared.source), owned);
        } catch (cause) {
          const cleanupFailedPaths: string[] = [];
          for (const file of owned) {
            try {
              const stat = await lstat(file.path, { bigint: true });
              const bytes = await readBoundedFile(file.path, Math.max(1, file.bytes.length));
              if (
                !stat.isFile() ||
                stat.dev !== file.dev ||
                stat.ino !== file.ino ||
                !bytes.equals(file.bytes.subarray(0, bytes.length))
              )
                cleanupFailedPaths.push(file.path);
              else await unlink(file.path);
            } catch (cleanupCause) {
              if (
                getErrorCode(cleanupCause) !== 'ENOENT' &&
                getErrorCode(cleanupCause) !== 'NON_EXISTENT_FILE'
              )
                cleanupFailedPaths.push(file.path);
            }
          }
          if (getErrorCode(cause) === 'EEXIST') throw planErrors.create('sourceChanged', { cause });
          throw planErrors.create('writeFailed', {
            cause,
            ...(cleanupFailedPaths.length ? { data: { cleanupFailedPaths } } : {}),
          });
        }
      } else await writeFileAtomicIfUnchanged(path, encodeSource(prepared.source), before);
    } catch (cause) {
      if (getErrorCode(cause)?.startsWith('JG_PLANS_')) throw cause;
      if (getErrorCode(cause) === 'FILE_CHANGED')
        throw planErrors.create('sourceChanged', { cause });
      throw planErrors.create('writeFailed', { cause });
    }
  }
  return {
    directory,
    document,
    changed: prepared.changed,
    sha256: prepared.sha256,
    diagnostics: prepared.diagnostics,
    assignedMilestoneIds: prepared.assignedMilestoneIds,
  };
};

/**
 * Guard and replace a plan body/core metadata or complete milestone document under its shared lock.
 * Only the selected document is read; unrelated malformed documents do not block an operation.
 * Expected null means absent milestones, never overwriting an existing file. No policy is inferred.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 * - JG_PLANS_READ_FAILED: The selected document could not be read
 * - JG_PLANS_UNSUPPORTED_ENCODING: Document text is not valid UTF-8
 * - JG_PLANS_UNSAFE_EDIT: The requested edit is unsupported or ambiguous
 * - JG_PLANS_SOURCE_CHANGED: The document changed before replacement
 * - JG_PLANS_WRITE_FAILED: The plan document could not be written
 * - JG_PLANS_LOCK_BUSY: The plan document is locked
 * - JG_PLANS_LOCK_FAILED: The plan document lock operation failed
 */
export const writePlanDocument = async (
  directory: string,
  input: IPlanDocumentWrite,
  options: IReadOptions = {},
): Promise<IPlanDocumentWriteResult> => {
  validateMutationOptions(directory, options);
  const parsed = PlanDocumentWriteSchema.safeParse(input);
  if (!parsed.success) throw planErrors.create('invalidInput');
  const request = parsed.data;
  return withPlanDocumentLocks(directory, [request.document], async (selected) => {
    const before = await readMutationSource(
      selected,
      request.document,
      options,
      request.expectedSha256,
    );
    const prepared = preparePlanDocumentWrite(
      before === null ? null : decodeSource(before),
      request,
    );
    return persistPrepared(selected, request.document, before, prepared);
  });
};

/**
 * Remove only milestones.md with an explicit exact-byte expectation under its shared lock.
 * Missing or changed files fail. No plan, directory, or history is removed. A final check detects
 * observed external edits; nonparticipating writers still have a check-to-unlink race.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 * - JG_PLANS_READ_FAILED: The selected document could not be read
 * - JG_PLANS_UNSUPPORTED_ENCODING: Document text is not valid UTF-8
 * - JG_PLANS_SOURCE_CHANGED: The document changed before replacement
 * - JG_PLANS_WRITE_FAILED: The plan document could not be written
 * - JG_PLANS_LOCK_BUSY: The plan document is locked
 * - JG_PLANS_LOCK_FAILED: The plan document lock operation failed
 */
export const removeMilestones = async (
  directory: string,
  input: IRemoveMilestones,
  options: IReadOptions = {},
): Promise<IRemoveMilestonesResult> => {
  validateMutationOptions(directory, options);
  const parsed = RemoveMilestonesSchema.safeParse(input);
  if (!parsed.success) throw planErrors.create('invalidInput');
  return withPlanDocumentLocks(directory, ['milestones'], async (selected) => {
    const before = await readMutationSource(
      selected,
      'milestones',
      options,
      parsed.data.expectedSha256,
    );
    decodeSource(before!);
    await readMutationSource(selected, 'milestones', options, parsed.data.expectedSha256);
    try {
      await unlink(join(selected, 'milestones.md'));
    } catch (cause) {
      throw planErrors.create(getErrorCode(cause) === 'ENOENT' ? 'sourceChanged' : 'writeFailed', {
        cause,
      });
    }
    return {
      directory: selected,
      document: 'milestones',
      changed: true,
      sha256: null,
      diagnostics: [],
    };
  });
};
