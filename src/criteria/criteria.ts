import { z } from 'zod';

import type {
  IMarker,
  IMilestone,
  IParsedMilestones,
  IParsedPlan,
  ISourceLine,
} from '../documents/index.ts';
// the documents entry imports this module, so the shared helpers come from their owning file
import { diagnostic, sourceLocation } from '../documents/utilities.ts';
import { planErrors } from '../errors/index.ts';
import {
  CriterionIdSchema,
  ProgressSchema,
  ProtocolVersionSchema,
  type IDiagnostic,
  type IProgress,
} from '../protocol/index.ts';

import { DEFINITION_PATTERN, HEADING_PATTERN, LIST_ITEM_PATTERN } from './constants.ts';
import type { ICriteriaObservation, ICriterion, ICriterionCoverage } from './types.ts';

// the parsed fields cross-document observation relies on; other fields stay unchecked
const ObservedPlanSchema = z.looseObject({
  protocol: ProtocolVersionSchema,
  metadata: z.looseObject({}),
  criteria: z.array(z.looseObject({ id: z.string().nullable(), text: z.string() })),
});

const ObservedMilestonesSchema = z.looseObject({
  milestones: z.array(
    z.looseObject({
      status: z.string().nullable(),
      criteria: z.array(z.string()).nullable(),
      statusMarkers: z.array(z.looseObject({})),
      idMarkers: z.array(z.looseObject({})),
      criteriaMarkers: z.array(z.looseObject({})),
    }),
  ),
});

const isProgress = (value: unknown): value is IProgress => ProgressSchema.safeParse(value).success;

const isCriterionId = (value: string): boolean => CriterionIdSchema.safeParse(value).success;

/** Count leading indentation columns, with tabs advancing to the next multiple of four. */
const indentation = (text: string): number => {
  let width = 0;
  for (const character of text) {
    if (character === ' ') width++;
    else if (character === '\t') width += 4 - (width % 4);
    else break;
  }
  return width;
};

const coverageTokens = (marker: IMarker): string[] =>
  marker.value.split(',').map((token) => token.trim());

/**
 * Observe criterion definitions in plan lines that are outside fenced code and frontmatter.
 * @param lines Source lines with fence and frontmatter observations.
 * @returns Every attempted definition in source order, including invalid IDs.
 */
export const readCriteria = (lines: ISourceLine[]): ICriterion[] => {
  const criteria: ICriterion[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.fenced) continue;
    const bom = line.start === 0 && line.text.startsWith('\uFEFF') ? 1 : 0;
    const text = line.text.slice(bom);
    const match = DEFINITION_PATTERN.exec(text);
    if (!match) continue;
    const indent = match[1]!.length;
    const idText = match[2]!;
    const parts = [match[3]!.trim()];
    let end = line.end;
    // index-based so each continuation scan stops early instead of copying the remaining lines
    for (let position = index + 1; position < lines.length; position++) {
      const next = lines[position]!;
      if (
        next.fenced ||
        !next.text.trim() ||
        HEADING_PATTERN.test(next.text) ||
        LIST_ITEM_PATTERN.test(next.text) ||
        indentation(next.text) <= indent
      )
        break;
      parts.push(next.text.trim());
      end = next.end;
    }
    criteria.push({
      id: isCriterionId(idText) ? idText : null,
      idText,
      text: parts.filter(Boolean).join(' '),
      location: sourceLocation(lines, line.start + bom + text.indexOf(idText)),
      range: { start: line.start + bom, end },
    });
  }
  return criteria;
};

/**
 * Report protocol 0.2 definition rules: required criteria, valid and unique IDs, and text.
 * @param criteria Definitions in source order.
 * @returns Plan diagnostics in source order.
 */
export const checkDefinitions = (criteria: ICriterion[]): IDiagnostic[] => {
  const diagnostics: IDiagnostic[] = [];
  const seen = new Set<string>();
  for (const criterion of criteria) {
    if (criterion.id === null)
      diagnostics.push(
        diagnostic(
          'plan',
          'INVALID_CRITERION_ID',
          'The criterion ID is not a valid AC-NN identifier.',
          criterion.location,
        ),
      );
    else if (seen.has(criterion.id))
      diagnostics.push(
        diagnostic(
          'plan',
          'DUPLICATE_CRITERION',
          'The criterion ID is already defined earlier in the plan.',
          criterion.location,
        ),
      );
    else seen.add(criterion.id);
    if (!criterion.text)
      diagnostics.push(
        diagnostic('plan', 'EMPTY_CRITERION', 'The criterion has no text.', criterion.location),
      );
  }
  if (!seen.size)
    diagnostics.unshift(
      diagnostic('plan', 'NO_CRITERIA', 'A protocol 0.2 plan defines no acceptance criterion.'),
    );
  return diagnostics;
};

/**
 * Read the valid, distinct criterion IDs a coverage line lists, in written order.
 * @param marker A coverage line observation.
 * @returns The IDs; invalid entries and repeats are left for diagnostics.
 */
export const coverageIds = (marker: IMarker): string[] => [
  ...new Set(coverageTokens(marker).filter(isCriterionId)),
];

/**
 * Derive progress from the statuses it depends on.
 * @returns The shared progress value, or null when it cannot be derived.
 */
const progressOf = (statuses: (string | null)[]): IProgress | null => {
  if (!statuses.length || !statuses.every(isProgress)) return null;
  if (statuses.every((status) => status === 'done')) return 'done';
  return statuses.some((status) => status !== 'pending') ? 'in progress' : 'pending';
};

/** Coverage-line diagnostics for one milestone of a 0.2 plan. */
const checkCoverage = (milestone: IMilestone, defined: Set<string>): IDiagnostic[] => {
  const diagnostics: IDiagnostic[] = [];
  const add = (code: string, message: string, marker: IMarker): void => {
    diagnostics.push(diagnostic('milestones', code, message, marker.location));
  };
  milestone.criteriaMarkers.forEach((marker, index) => {
    const tokens = coverageTokens(marker);
    if (index > 0)
      add('DUPLICATE_CRITERIA_MARKER', 'The milestone has multiple coverage lines.', marker);
    if (!tokens.every(isCriterionId) || new Set(tokens).size !== tokens.length)
      add(
        'INVALID_CRITERIA_MARKER',
        'The coverage line must list valid criterion IDs without repeats.',
        marker,
      );
    for (const id of new Set(tokens.filter(isCriterionId)))
      if (!defined.has(id))
        add(
          'UNKNOWN_CRITERION',
          'The coverage line names a criterion the plan does not define.',
          marker,
        );
  });
  const first = milestone.criteriaMarkers[0];
  const anchor = milestone.idMarkers[0] ?? milestone.statusMarkers[0];
  if (first && first.lineStart !== anchor?.lineEnd)
    add(
      'MISPLACED_CRITERIA_MARKER',
      'The coverage line does not directly follow the ID or status line.',
      first,
    );
  return diagnostics;
};

/**
 * Observe criteria across a plan and its optional milestones: coverage, derived progress, and,
 * for protocol 0.2 plans, cross-document diagnostics. Progress describes work, not proof.
 * @param plan A parsed plan.
 * @param milestones Parsed milestones; omit when milestones.md is absent.
 * @returns Valid criteria in definition order, with coverage, progress, and diagnostics.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 */
export const observeCriteria = (
  plan: IParsedPlan,
  milestones?: IParsedMilestones,
): ICriteriaObservation => {
  if (
    !ObservedPlanSchema.safeParse(plan).success ||
    (milestones !== undefined && !ObservedMilestonesSchema.safeParse(milestones).success)
  )
    throw planErrors.create('invalidInput');
  const current = plan.protocol === '0.2';
  const diagnostics: IDiagnostic[] = [];
  const definitions = new Map<string, ICriterion>();
  for (const criterion of plan.criteria)
    if (criterion.id !== null && !definitions.has(criterion.id))
      definitions.set(criterion.id, criterion);
  const defined = new Set(definitions.keys());
  const covering = new Map<string, IMilestone[]>([...defined].map((id) => [id, []]));
  for (const milestone of milestones?.milestones ?? []) {
    if (current && milestone.status !== null && !isProgress(milestone.status))
      diagnostics.push(
        diagnostic(
          'milestones',
          'INVALID_STATUS',
          'The milestone status is not pending, in progress, or done.',
          milestone.statusMarkers[0]?.location ?? milestone.location,
        ),
      );
    if (current) for (const item of checkCoverage(milestone, defined)) diagnostics.push(item);
    for (const id of milestone.criteria ?? []) covering.get(id)?.push(milestone);
  }
  const criteria = [...definitions.values()].map((criterion): ICriterionCoverage => {
    const covered = covering.get(criterion.id!)!;
    if (current && milestones !== undefined && !covered.length)
      diagnostics.push(
        diagnostic(
          'plan',
          'UNASSIGNED_CRITERION',
          'No milestone covers this criterion.',
          criterion.location,
        ),
      );
    return {
      id: criterion.id!,
      text: criterion.text,
      location: criterion.location,
      milestones: covered.map((milestone) => ({ ordinal: milestone.ordinal, id: milestone.id })),
      progress:
        milestones === undefined
          ? progressOf([plan.metadata.status ?? null])
          : progressOf(covered.map((milestone) => milestone.status)),
    };
  });
  return { protocol: plan.protocol, criteria, diagnostics };
};
