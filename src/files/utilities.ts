import { join, resolve } from 'node:path';
import { getErrorCode } from 'jg-exception';
import { hashValue } from 'jg-crypto';
import { readBoundedFile } from 'jg-fs';
import { z } from 'zod';

import { parseMilestones, parsePlan } from '../documents/index.ts';
import { fingerprintObservation } from '../documents/fingerprints.ts';
import { decodeSource } from '../edits/index.ts';
import { planErrors } from '../errors/index.ts';
import {
  DEFAULT_MAX_BYTES,
  InspectPlanOptionsSchema,
  type IDiagnostic,
  type IInspectPlanOptions,
} from '../protocol/index.ts';

import type { IDocumentRead, IPlanInspection } from './types.ts';

const observeFile = async <TDocument>(
  directory: string,
  name: IDiagnostic['document'],
  maxBytes: number,
  parse: (source: string) => TDocument,
): Promise<IDocumentRead<TDocument>> => {
  const path = join(directory, `${name}.md`);
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedFile(path, maxBytes);
  } catch (error) {
    const code = getErrorCode(error);
    if (code === 'NON_EXISTENT_FILE') return { state: 'missing', path };
    return {
      state: 'unreadable',
      path,
      diagnostics: [
        {
          document: name,
          code: code === 'FILE_TOO_LARGE' ? 'FILE_TOO_LARGE' : 'UNREADABLE_DOCUMENT',
          severity: 'error',
          message:
            code === 'FILE_TOO_LARGE'
              ? 'The document exceeds the selected byte limit.'
              : 'The selected document could not be read as a regular file.',
        },
      ],
    };
  }
  let source: string;
  try {
    source = decodeSource(bytes);
  } catch {
    return {
      state: 'unreadable',
      path,
      diagnostics: [
        {
          document: name,
          code: 'INVALID_ENCODING',
          severity: 'error',
          message: 'The document is not supported UTF-8; no transcoding was attempted.',
        },
      ],
    };
  }
  return { state: 'readable', path, sha256: hashValue(bytes), value: parse(source) };
};

/**
 * Read only plan.md and milestones.md beneath the explicitly selected directory.
 * Missing, oversized, unreadable, and undecodable files are observations; other
 * readable documents remain available. No history is discovered or restored.
 * @param directory Caller-selected path, including custom locations.
 * @param options Per-file byte bound, defaulting to 1 MiB, and optional fingerprint exclusions.
 * @returns Per-document availability, partial parsed data, and diagnostics.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 */
export const inspectPlan = async (
  directory: string,
  options: IInspectPlanOptions = {},
): Promise<IPlanInspection> => {
  const parsed = InspectPlanOptionsSchema.safeParse(options);
  if (
    !z
      .string()
      .min(1)
      .refine((value) => !value.includes('\0'))
      .safeParse(directory).success ||
    !parsed.success
  )
    throw planErrors.create('invalidInput');
  const selected = resolve(directory);
  const input = parsed.data;
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const [plan, milestones] = await Promise.all([
    observeFile(selected, 'plan', maxBytes, parsePlan),
    observeFile(selected, 'milestones', maxBytes, parseMilestones),
  ]);
  const diagnostics: IDiagnostic[] = [];
  for (const [name, document] of [
    ['plan', plan],
    ['milestones', milestones],
  ] as const) {
    if (document.state === 'readable') diagnostics.push(...document.value.diagnostics);
    else if (document.state === 'unreadable') diagnostics.push(...document.diagnostics);
    else
      diagnostics.push({
        document: name,
        code: name === 'plan' ? 'MISSING_PLAN' : 'MISSING_MILESTONES',
        severity: name === 'plan' ? 'error' : 'info',
        message:
          name === 'plan' ? 'The plan file is absent.' : 'The optional milestone file is absent.',
      });
  }
  if (plan.state === 'missing' && milestones.state === 'readable')
    diagnostics.push({
      document: 'milestones',
      code: 'ORPHAN_MILESTONES',
      severity: 'warning',
      message: 'Milestones remain without a plan; no plan is restored.',
    });
  const fingerprint =
    input.fingerprint === undefined
      ? undefined
      : fingerprintObservation(plan.state === 'readable' ? plan.value : null, input.fingerprint);
  if (fingerprint) {
    const known = new Set(diagnostics);
    diagnostics.push(...fingerprint.diagnostics.filter((item) => !known.has(item)));
  }
  return {
    directory: selected,
    plan,
    milestones,
    diagnostics,
    ...(fingerprint ? { fingerprint } : {}),
  };
};
