import { randomUUID } from 'node:crypto';
import { hashValue } from 'jg-crypto';

import { parseMilestones, parsePlan, type IParsedPlan } from '../documents/index.ts';
import { planErrors } from '../errors/index.ts';
import {
  PlanDocumentWriteSchema,
  PlanUpdateSchema,
  type IDiagnostic,
  type IPlanDocumentWrite,
  type IPlanUpdate,
} from '../protocol/index.ts';

import type { IAssignedMilestoneId, IPreparedPlanEdit } from './types.ts';
import {
  applyEdits,
  decodeSource,
  encodeSource,
  lineEnding,
  milestoneEdits,
  planEdits,
} from './utilities.ts';

/** Package-private expectation guard, also used on original read bytes by filesystem adapters. */
export const assertSourceExpectation = (
  source: string | Uint8Array | null,
  expected: string | null | undefined,
): void => {
  if (expected === undefined) return;
  const actual =
    source === null ? null : hashValue(typeof source === 'string' ? encodeSource(source) : source);
  if (actual !== expected) throw planErrors.create('sourceChanged');
};

const prepared = (
  before: string | null,
  source: string,
  diagnostics: IDiagnostic[],
  assignedMilestoneIds: IAssignedMilestoneId[] = [],
): IPreparedPlanEdit => ({
  source,
  changed: before !== source,
  sha256: hashValue(encodeSource(source)),
  diagnostics,
  assignedMilestoneIds,
});

const validateSet = (
  observation: IParsedPlan,
  set: Extract<IPlanUpdate, { document: 'plan' }>['set'],
): void => {
  if (
    observation.diagnostics.some(
      (item) => item.code === 'INVALID_YAML' || item.code === 'UNTERMINATED_FRONTMATTER',
    )
  )
    throw planErrors.create('unsafeEdit', { data: { reason: 'invalid-serialized-frontmatter' } });
  for (const [key, value] of Object.entries(set))
    if (!Object.is(observation.metadata[key], value))
      throw planErrors.create('unsafeEdit', {
        data: { reason: 'unsupported-serialized-value', field: key },
      });
};

/**
 * Prepare one guarded metadata/marker patch entirely in memory, without policy updates or I/O.
 * @param source Original selected document text.
 * @param patch Explicit narrow patch and optional observed exact-byte SHA-256.
 * @returns Prepared source, digest, diagnostics, and whether bytes would change.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 * - JG_PLANS_UNSUPPORTED_ENCODING: Document text is not valid UTF-8
 * - JG_PLANS_UNSAFE_EDIT: The requested edit is unsupported or ambiguous
 * - JG_PLANS_SOURCE_CHANGED: The document changed before replacement
 */
export const preparePlanUpdate = (source: string, patch: IPlanUpdate): IPreparedPlanEdit => {
  const validated = PlanUpdateSchema.safeParse(patch);
  if (typeof source !== 'string' || !validated.success) throw planErrors.create('invalidInput');
  const request = validated.data;
  const bytes = encodeSource(source);
  assertSourceExpectation(source, request.expectedSha256);
  const edits =
    request.document === 'plan' ? planEdits(source, request) : milestoneEdits(source, request);
  const after = decodeSource(applyEdits(bytes, source, edits));
  const observation = request.document === 'plan' ? parsePlan(after) : parseMilestones(after);
  if (request.document === 'plan') validateSet(observation as IParsedPlan, request.set);
  return prepared(source, after, observation.diagnostics);
};

const assignMilestoneIds = (
  source: string,
): { source: string; assigned: IAssignedMilestoneId[] } => {
  const observation = parseMilestones(source);
  if (observation.frontmatter && !observation.frontmatter.closed)
    throw planErrors.create('unsafeEdit', { data: { reason: 'unterminated-frontmatter' } });
  const ambiguous = new Set([
    'INVALID_MILESTONE_ID',
    'DUPLICATE_ID_MARKER',
    'DUPLICATE_ID',
    'DUPLICATE_ORDINAL',
    'INVALID_ORDINAL',
  ]);
  if (observation.diagnostics.some((item) => ambiguous.has(item.code)))
    throw planErrors.create('unsafeEdit', { data: { reason: 'ambiguous-milestone-identities' } });
  const ids = new Set(
    observation.milestones.flatMap((entry) => (entry.id ? [entry.id.toLowerCase()] : [])),
  );
  const assigned: IAssignedMilestoneId[] = [];
  const changes: Extract<IPlanUpdate, { document: 'milestones' }>['changes'] = [];
  for (const entry of observation.milestones) {
    if (entry.id !== null) continue;
    const status = entry.statusMarkers[0];
    if (
      !status ||
      !status.value ||
      entry.statusMarkers.length !== 1 ||
      source.slice(entry.headingEnd, status.lineStart).trim()
    )
      throw planErrors.create('unsafeEdit', { data: { reason: 'noncanonical-id-insertion' } });
    let id: string;
    do {
      id = randomUUID();
    } while (ids.has(id.toLowerCase()));
    ids.add(id.toLowerCase());
    assigned.push({ ordinal: entry.ordinal!, id });
    changes.push({ select: { ordinal: entry.ordinal! }, set: { id } });
  }
  if (!changes.length) return { source, assigned };
  const after = decodeSource(
    applyEdits(
      encodeSource(source),
      source,
      milestoneEdits(source, { document: 'milestones', changes }),
    ),
  );
  return { source: after, assigned };
};

/**
 * Prepare guarded body/metadata replacement or explicit milestone source/ID assignment in memory.
 * A null source is accepted only for explicit absent milestone creation. No timestamps, revisions,
 * identities, or completion are inferred; missing IDs are assigned only when requested.
 * @param source Original selected document text, or null for absent milestones.
 * @param input Explicit document replacement and required source expectation.
 * @returns The exact source to persist once, its digest, diagnostics, and generated IDs.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 * - JG_PLANS_UNSUPPORTED_ENCODING: Document text is not valid UTF-8
 * - JG_PLANS_UNSAFE_EDIT: The requested edit is unsupported or ambiguous
 * - JG_PLANS_SOURCE_CHANGED: The document changed before replacement
 */
export const preparePlanDocumentWrite = (
  source: string | null,
  input: IPlanDocumentWrite,
): IPreparedPlanEdit => {
  const validated = PlanDocumentWriteSchema.safeParse(input);
  if ((source !== null && typeof source !== 'string') || !validated.success)
    throw planErrors.create('invalidInput');
  const request = validated.data;
  if (request.document === 'plan' && source === null) throw planErrors.create('invalidInput');
  if (source !== null) encodeSource(source);
  assertSourceExpectation(source, request.expectedSha256);
  if (request.document === 'milestones') {
    encodeSource(request.source);
    const assigned = request.assignMissingIds
      ? assignMilestoneIds(request.source)
      : { source: request.source, assigned: [] };
    return prepared(
      source,
      assigned.source,
      parseMilestones(assigned.source).diagnostics,
      assigned.assigned,
    );
  }
  const before = source!;
  const observation = parsePlan(before);
  if (observation.frontmatter && !observation.frontmatter.closed)
    throw planErrors.create('unsafeEdit', { data: { reason: 'unterminated-frontmatter' } });
  encodeSource(request.body);
  const bom = before.startsWith('\uFEFF') ? 1 : 0;
  const bodyStart = observation.frontmatter?.end ?? bom;
  // A metadata-free reader includes the encoding marker in body; never duplicate that marker.
  const body =
    !observation.frontmatter && bom && request.body.startsWith('\uFEFF')
      ? request.body.slice(1)
      : request.body;
  const eol = lineEnding(before);
  const edits = request.set ? planEdits(before, { document: 'plan', set: request.set }) : [];
  const insertion = !observation.frontmatter
    ? edits.findIndex((edit) => edit.start === bodyStart && edit.end === bodyStart)
    : -1;
  let replacement = body;
  if (insertion >= 0) {
    const prefix = edits.splice(insertion, 1)[0]!.replacement;
    replacement = prefix + (body && !/[\r\n]$/.test(prefix) ? eol : '') + body;
  } else if (
    observation.frontmatter &&
    body &&
    bodyStart === before.length &&
    !/[\r\n]$/.test(before)
  ) {
    replacement = eol + body;
  }
  edits.push({ start: bodyStart, end: before.length, replacement });
  const after = decodeSource(applyEdits(encodeSource(before), before, edits));
  const result = parsePlan(after);
  if (!observation.frontmatter && !request.set && result.frontmatter)
    throw planErrors.create('unsafeEdit', { data: { reason: 'body-would-create-frontmatter' } });
  if (request.set) validateSet(result, request.set);
  return prepared(before, after, result.diagnostics);
};
