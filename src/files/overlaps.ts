import type { Dirent } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getErrorCode } from 'jg-exception';

import { parsePlan } from '../documents/index.ts';
import { decodeSource } from '../edits/index.ts';
import { ERRORS, planErrors } from '../errors/index.ts';
import type { IOverlapPlan } from '../overlaps/index.ts';

import type { IOverlapRead, IUnreadablePlan } from './types.ts';

// the most plan folders one overlaps read lists, across all its roots
export const OVERLAP_MAX_FOLDERS = 1024;

// the most bytes read from the start of each plan.md, which must hold its whole frontmatter
export const OVERLAP_READ_BYTES = 65_536;

// diagnostics that leave a plan's protocol, status, or declarations unknown
const UNREADABLE_FRONTMATTER = new Set([
  'UNTERMINATED_FRONTMATTER',
  'INVALID_YAML',
  'YAML_VALUE_UNAVAILABLE',
  'METADATA_NOT_MAPPING',
]);

// a frontmatter delimiter line, as the plan reader accepts it
const DELIMITER = /^---[ \t]*$/;

/**
 * Read the start of a plan.md, at most OVERLAP_READ_BYTES.
 * @returns The bytes read and whether the file holds more.
 */
const readHead = async (path: string): Promise<{ bytes: Buffer; isPartial: boolean }> => {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const bytes = Buffer.alloc(Math.min(size, OVERLAP_READ_BYTES));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    return { bytes: bytes.subarray(0, bytesRead), isPartial: size > bytesRead };
  } finally {
    await handle.close();
  }
};

/**
 * Cut a partly read plan.md after its closing frontmatter delimiter. Delimiters are ASCII, so
 * the bytes are scanned one to one, and only the frontmatter is decoded.
 * @returns The frontmatter bytes, or undefined when the frontmatter doesn't close in them.
 */
const cutFrontmatter = (bytes: Buffer): Buffer | undefined => {
  const text = bytes.toString('latin1');
  const lineBreak = /\r\n|\n|\r/g;
  let start = text.startsWith('ï»¿') ? 3 : 0;
  let isFirst = true;
  for (let match = lineBreak.exec(text); match; match = lineBreak.exec(text)) {
    const line = text.slice(start, match.index);
    if (isFirst && !DELIMITER.test(line)) return undefined;
    if (!isFirst && DELIMITER.test(line)) return bytes.subarray(0, lineBreak.lastIndex);
    isFirst = false;
    start = lineBreak.lastIndex;
  }
  return undefined;
};

/**
 * Read one plan folder's identity, protocol, status, and error code declarations from its
 * frontmatter only.
 * @returns The plan, the reason it can't be read, or null when the folder holds no plan.md.
 */
const readPlanHead = async (directory: string): Promise<IOverlapPlan | IUnreadablePlan | null> => {
  const path = join(directory, 'plan.md');
  try {
    if (!(await lstat(path)).isFile()) return { directory, reason: 'not-a-file' };
    const { bytes, isPartial } = await readHead(path);
    const head = isPartial ? cutFrontmatter(bytes) : bytes;
    if (!head) return { directory, reason: 'frontmatter-too-large' };
    const parsed = parsePlan(decodeSource(head));
    const codes = new Set(parsed.diagnostics.map((item) => item.code));
    if ([...UNREADABLE_FRONTMATTER].some((code) => codes.has(code)))
      return { directory, reason: 'invalid-frontmatter' };
    if (codes.has('INVALID_ERROR_CODES')) return { directory, reason: 'invalid-error-codes' };
    return {
      directory,
      id: parsed.metadata.id ?? null,
      protocol: parsed.protocol,
      status: parsed.metadata.status ?? null,
      errorCodes: parsed.metadata.error_codes ?? [],
    };
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') return null;
    if (getErrorCode(error) === ERRORS.UNSUPPORTED_ENCODING)
      return { directory, reason: 'invalid-encoding' };
    return { directory, reason: 'read-failed' };
  }
};

/**
 * Read the plans in the immediate child folders of each root, for an error code overlap check.
 * Links are never followed, only the first 64 KiB of each plan.md is read, and at most 1024
 * folders are read per call. A plan that can't be read, or stopping at the folder limit, makes the
 * result incomplete, so an incomplete check never reads as clean.
 * @param roots The planning roots, such as each repository's jg-plans folder.
 * @returns The plans read, the ones that couldn't be, and whether every folder was covered.
 * @throws
 * - JG_PLANS_READ_FAILED: The selected document could not be read
 */
export const readOverlapPlans = async (roots: string[]): Promise<IOverlapRead> => {
  const folders: string[] = [];
  for (const root of new Set(roots.map((item) => resolve(item)))) {
    let entries: Dirent[];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (cause) {
      const reason = getErrorCode(cause);
      throw planErrors.create('readFailed', { cause, ...(reason ? { data: { reason } } : {}) });
    }
    for (const entry of entries
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort())
      folders.push(join(root, entry));
  }
  const plans: IOverlapPlan[] = [];
  const unreadable: IUnreadablePlan[] = [];
  for (const directory of folders.slice(0, OVERLAP_MAX_FOLDERS)) {
    const read = await readPlanHead(directory);
    if (read === null) continue;
    if ('reason' in read) unreadable.push(read);
    else plans.push(read);
  }
  return {
    plans,
    unreadable,
    isComplete: folders.length <= OVERLAP_MAX_FOLDERS && unreadable.length === 0,
  };
};
