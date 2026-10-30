import { observeCriteria } from '../criteria/index.ts';
import { planErrors } from '../errors/index.ts';
import { PlanDocumentsSchema, type IPlanDocuments } from '../protocol/index.ts';

import { parseMilestones } from './milestones.ts';
import { parsePlan } from './plan.ts';
import type { ICheckResult } from './types.ts';
import { diagnostic } from './utilities.ts';

/**
 * Explicitly check preferred writer conformance. Inspection never requires this operation.
 * Current criteria, coverage, and status rules apply; supplying only the
 * plan checks the plan rules, and the milestone and coverage rules need both documents.
 * @param documents Selected document sources; omit deleted or absent files.
 * @returns Conformance and diagnostics. No source is changed or restored.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 */
export const checkPlan = (documents: IPlanDocuments): ICheckResult => {
  const parsed = PlanDocumentsSchema.safeParse(documents);
  if (!parsed.success) throw planErrors.create('invalidInput');
  const plan = parsed.data.plan === undefined ? undefined : parsePlan(parsed.data.plan);
  const milestones =
    parsed.data.milestones === undefined ? undefined : parseMilestones(parsed.data.milestones);
  const diagnostics = plan
    ? [...plan.diagnostics]
    : [diagnostic('plan', 'MISSING_PLAN', 'The plan file is absent.')];
  if (milestones) {
    diagnostics.push(...milestones.diagnostics);
    if (!plan)
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
  if (plan)
    for (const item of observeCriteria(plan, milestones).diagnostics) diagnostics.push(item);
  return { conforms: !diagnostics.some((item) => item.severity === 'error'), diagnostics };
};
