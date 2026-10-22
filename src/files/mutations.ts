import { lstat, mkdir, rmdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getErrorCode } from 'jg-exception';
import { readBoundedFile } from 'jg-fs';
import { hashValue } from 'jg-crypto';
import { stringify } from 'yaml';

import { parseMilestones, parsePlan } from '../documents/index.ts';
import { decodeSource, encodeSource, preparePlanUpdate } from '../edits/index.ts';
import { planErrors } from '../errors/index.ts';
import {
  CreatePlanOptionsSchema,
  PlanUpdateSchema,
  type ICreatePlanOptions,
  type IPlanUpdate,
  type IReadOptions,
} from '../protocol/index.ts';

import type { IPlanCreation, IPlanUpdateResult } from './types.ts';

import {
  persistPrepared,
  readMutationSource,
  validateMutationOptions,
  writeExclusive,
  type IOwnedFile,
} from './documents.ts';
import { withPlanDocumentLocks } from './locks.ts';
type IOwnedDirectory = { dev: bigint; ino: bigint };

const validateNewText = (value: unknown): void => {
  if (typeof value === 'string') encodeSource(value);
  else if (Array.isArray(value)) for (const item of value) validateNewText(item);
  else if (value !== null && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      encodeSource(key);
      validateNewText(item);
    }
};

/** Remove only files this call created and still recognizes, followed by the empty owned directory. */
const cleanupCreation = async (
  directory: string,
  identity: IOwnedDirectory,
  owned: IOwnedFile[],
): Promise<string[]> => {
  try {
    const current = await lstat(directory, { bigint: true });
    if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino)
      return [directory];
  } catch (cause) {
    return getErrorCode(cause) === 'ENOENT' ? [] : [directory];
  }
  const failed: string[] = [];
  for (const file of [...owned].reverse()) {
    try {
      const current = await lstat(file.path, { bigint: true });
      if (!current.isFile() || current.dev !== file.dev || current.ino !== file.ino) {
        failed.push(file.path);
        continue;
      }
      const bytes = await readBoundedFile(file.path, Math.max(1, file.bytes.length));
      if (!bytes.equals(file.bytes.subarray(0, bytes.length))) {
        failed.push(file.path);
        continue;
      }
      await unlink(file.path);
    } catch (cause) {
      if (getErrorCode(cause) !== 'ENOENT' && getErrorCode(cause) !== 'NON_EXISTENT_FILE')
        failed.push(file.path);
    }
  }
  try {
    await rmdir(directory);
  } catch (cause) {
    if (getErrorCode(cause) !== 'ENOENT') failed.push(directory);
  }
  return failed;
};

/**
 * Create one exclusive plan directory. Caller-supplied milestones stay verbatim.
 * Missing metadata defaults use one captured creation time; supplied values are
 * preserved and receive diagnostics when nonconforming. The selected storage root
 * may remain empty after a failed creation; existing destinations are never reused.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 * - JG_PLANS_UNSUPPORTED_ENCODING: Document text is not valid UTF-8
 * - JG_PLANS_DESTINATION_EXISTS: The plan destination already exists
 * - JG_PLANS_LOCK_BUSY: The plan document is locked
 * - JG_PLANS_LOCK_FAILED: The plan document lock operation failed
 * - JG_PLANS_WRITE_FAILED: The plan document could not be written
 */
export const createPlan = async (options: ICreatePlanOptions): Promise<IPlanCreation> => {
  let validated: ReturnType<typeof CreatePlanOptionsSchema.safeParse>;
  try {
    validated = CreatePlanOptionsSchema.safeParse(options);
  } catch {
    throw planErrors.create('invalidInput');
  }
  if (!validated.success) throw planErrors.create('invalidInput');
  const input = validated.data;
  const now = new Date();
  const name = `${Math.floor(now.getTime() / 1000)}_${input.slug}`;
  if (name.length > 64) throw planErrors.create('invalidInput');
  const root = resolve(input.root ?? './jg-plans');
  const directory = join(root, name);
  const timestamp = now.toISOString();
  const metadata = {
    id: name,
    created_at: timestamp,
    updated_at: timestamp,
    revision: 1,
    status: 'pending',
    ...input.metadata,
  };
  validateNewText(metadata);
  let yaml: string;
  try {
    yaml = stringify(metadata, { lineWidth: 0 });
  } catch {
    throw planErrors.create('invalidInput');
  }
  const planSource = `---\n${yaml}---\n${input.body}`;
  const planBytes = encodeSource(planSource);
  const milestoneBytes = input.milestones === undefined ? null : encodeSource(input.milestones);
  try {
    await mkdir(root, { recursive: true });
  } catch (cause) {
    throw planErrors.create('writeFailed', { cause });
  }
  try {
    await mkdir(directory);
  } catch (cause) {
    if (getErrorCode(cause) === 'EEXIST') throw planErrors.create('destinationExists', { cause });
    throw planErrors.create('writeFailed', { cause });
  }
  let identity: IOwnedDirectory;
  try {
    const stat = await lstat(directory, { bigint: true });
    if (!stat.isDirectory())
      throw planErrors.create('writeFailed', { data: { reason: 'replaced-creation-directory' } });
    identity = { dev: stat.dev, ino: stat.ino };
  } catch (cause) {
    throw planErrors.create('writeFailed', { cause, data: { cleanupFailedPaths: [directory] } });
  }
  const owned: IOwnedFile[] = [];
  try {
    await withPlanDocumentLocks(
      directory,
      milestoneBytes === null ? ['plan'] : ['plan', 'milestones'],
      async (selected) => {
        await writeExclusive(selected, join(selected, 'plan.md'), planBytes, owned);
        if (milestoneBytes !== null)
          await writeExclusive(selected, join(selected, 'milestones.md'), milestoneBytes, owned);
      },
    );
  } catch (cause) {
    // Release failure can follow a durable write. Preserve its files and uncertainty.
    if (
      getErrorCode(cause) === 'JG_PLANS_LOCK_FAILED' ||
      getErrorCode(cause) === 'JG_PLANS_LOCK_BUSY'
    )
      throw cause;
    const cleanupFailedPaths = await cleanupCreation(directory, identity, owned);
    throw planErrors.create('writeFailed', {
      cause,
      ...(cleanupFailedPaths.length ? { data: { cleanupFailedPaths } } : {}),
    });
  }
  const plan = parsePlan(planSource);
  const milestones = input.milestones === undefined ? null : parseMilestones(input.milestones);
  return {
    directory,
    plan: { ...plan, sha256: hashValue(planBytes) },
    milestones: milestones === null ? null : { ...milestones, sha256: hashValue(milestoneBytes!) },
    diagnostics: [...plan.diagnostics, ...(milestones?.diagnostics ?? [])],
  };
};

/**
 * Apply an explicit narrow patch under the shared selected-document lock.
 * Guard optional observed bytes before preparation; unchanged output is never replaced.
 * Nonparticipating editors retain a final comparison-to-rename race.
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
export const updatePlan = async (
  directory: string,
  patch: IPlanUpdate,
  options: IReadOptions = {},
): Promise<IPlanUpdateResult> => {
  validateMutationOptions(directory, options);
  const validated = PlanUpdateSchema.safeParse(patch);
  if (!validated.success) throw planErrors.create('invalidInput');
  const request = validated.data;
  return withPlanDocumentLocks(directory, [request.document], async (selected) => {
    const before = await readMutationSource(
      selected,
      request.document,
      options,
      request.expectedSha256,
    );
    const prepared = preparePlanUpdate(decodeSource(before!), request);
    return persistPrepared(selected, request.document, before, prepared);
  });
};
