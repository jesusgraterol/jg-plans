import { planErrors } from '../errors/index.ts';
import { PlanDocumentsSchema, type IPlanDocuments } from '../protocol/index.ts';

import { parseMilestones } from './milestones.ts';
import { parsePlan } from './plan.ts';
import type { ICheckResult } from './types.ts';
import { diagnostic } from './utilities.ts';

/**
 * Explicitly check preferred writer conformance. Inspection never requires this operation.
 * @param documents Selected document sources; omit deleted or absent files.
 * @returns Conformance and diagnostics. No source is changed or restored.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 */
export const checkPlan = (documents: IPlanDocuments): ICheckResult => {
  const parsed = PlanDocumentsSchema.safeParse(documents);
  if (!parsed.success) throw planErrors.create('invalidInput');
  const diagnostics =
    parsed.data.plan === undefined
      ? [diagnostic('plan', 'MISSING_PLAN', 'The plan file is absent.')]
      : parsePlan(parsed.data.plan).diagnostics;
  if (parsed.data.milestones !== undefined) {
    diagnostics.push(...parseMilestones(parsed.data.milestones).diagnostics);
    if (parsed.data.plan === undefined)
      diagnostics.push(
        diagnostic(
          'milestones',
          'ORPHAN_MILESTONES',
          'Milestones remain without a plan; no plan is restored.',
          undefined,
          'warning',
        ),
      );
  }
  return { conforms: !diagnostics.some((item) => item.severity === 'error'), diagnostics };
};
