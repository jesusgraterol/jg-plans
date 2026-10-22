import { realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getErrorCode } from 'jg-exception';
import { acquireLock, type IFileLock } from 'jg-fs';
import { z } from 'zod';

import { planErrors } from '../errors/index.ts';

const DocumentsSchema = z
  .array(z.enum(['plan', 'milestones']))
  .min(1)
  .refine((values) => new Set(values).size === values.length);
const DirectorySchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('\0'));
const BusyReasonSchema = z.object({
  data: z.object({
    reason: z.enum([
      'held',
      'owner-gone',
      'other-host',
      'ownerless',
      'recovery-in-progress',
      'unexpected-entries',
    ]),
  }),
});

const reason = (cause: unknown): string => {
  const busy = BusyReasonSchema.safeParse(cause);
  return busy.success ? busy.data.data.reason : (getErrorCode(cause) ?? 'unknown');
};

/**
 * Serialize participating local-filesystem writers using canonical document lock directories.
 * Acquire plan before milestones and release in reverse order. Busy/dead owners fail immediately;
 * recovery is an explicit operator decision. Use preparation and your own persistence inside the
 * callback; nesting a filesystem mutation here would attempt to acquire the same lock again.
 * @param directory Existing selected directory; aliases share its canonical lock namespace.
 * @param documents Nonempty unique selection of plan and/or milestones, in any input order.
 * @param operation One bounded operation, receiving the canonical directory. Never hold a lock across agent turns.
 * @returns The callback's result after every lock is released.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 * - JG_PLANS_LOCK_BUSY: The plan document is locked
 * - JG_PLANS_LOCK_FAILED: The plan document lock operation failed
 * - Callback errors propagate after successful lock release.
 */
export const withPlanDocumentLocks = async <T>(
  directory: string,
  documents: readonly ('plan' | 'milestones')[],
  operation: (directory: string) => T | Promise<T>,
): Promise<T> => {
  const selected = DocumentsSchema.safeParse(documents);
  if (
    !DirectorySchema.safeParse(directory).success ||
    !selected.success ||
    typeof operation !== 'function'
  )
    throw planErrors.create('invalidInput');
  let canonical: string;
  try {
    canonical = await realpath(resolve(directory));
  } catch (cause) {
    throw planErrors.create('lockFailed', {
      cause,
      data: {
        phase: 'canonicalize',
        reason: reason(cause),
        mutationOutcome: 'not-applied',
        operationCompleted: false,
      },
    });
  }
  const held: { document: 'plan' | 'milestones'; lock: IFileLock }[] = [];
  let started = false;
  let completed = false;
  let failed = false;
  let failure: unknown;
  let result: T | undefined;
  try {
    for (const document of ['plan', 'milestones'] as const) {
      if (!selected.data.includes(document)) continue;
      try {
        held.push({
          document,
          lock: await acquireLock(join(canonical, `.${document}.md.jg-plans.lock`)),
        });
      } catch (cause) {
        throw planErrors.create(getErrorCode(cause) === 'LOCK_BUSY' ? 'lockBusy' : 'lockFailed', {
          cause,
          data: {
            document,
            phase: 'acquire',
            reason: reason(cause),
            mutationOutcome: 'not-applied',
            operationCompleted: false,
          },
        });
      }
    }
    started = true;
    result = await operation(canonical);
    completed = true;
  } catch (cause) {
    failed = true;
    failure = cause;
  }
  const releases: { document: 'plan' | 'milestones'; cause: unknown }[] = [];
  for (const entry of held.reverse()) {
    try {
      await entry.lock.release();
    } catch (cause) {
      releases.push({ document: entry.document, cause });
    }
  }
  if (releases.length)
    throw planErrors.create('lockFailed', {
      cause: new AggregateError(
        [...(failed ? [failure] : []), ...releases.map((entry) => entry.cause)],
        'The document operation or lock release failed',
      ),
      data: {
        phase: 'release',
        documents: releases.map((entry) => entry.document),
        reason: reason(releases[0]!.cause),
        operationCompleted: completed,
        mutationOutcome: started ? 'uncertain' : 'not-applied',
      },
    });
  if (failed) throw failure;
  return result as T;
};
