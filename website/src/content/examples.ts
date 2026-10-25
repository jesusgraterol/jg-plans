import { checkPlan, observeCriteria, parseMilestones, parsePlan } from 'jg-plans';

import { EXAMPLES, readPublicBytes } from './sources.ts';

/** Build observations through the public library. This module never runs in a browser. */
export const loadExample = async (id: (typeof EXAMPLES)[number]['id']) => {
  const example = EXAMPLES.find((entry) => entry.id === id)!;
  const plan =
    'plan' in example ? (await readPublicBytes(example.plan)).toString('utf8') : undefined;
  const milestones =
    'milestones' in example
      ? (await readPublicBytes(example.milestones)).toString('utf8')
      : undefined;
  const documents = {
    ...(plan === undefined ? {} : { plan }),
    ...(milestones === undefined ? {} : { milestones }),
  };
  const parsedPlan = plan === undefined ? null : parsePlan(plan);
  const parsedMilestones = milestones === undefined ? null : parseMilestones(milestones);
  return {
    ...example,
    documents,
    plan: parsedPlan,
    milestones: parsedMilestones,
    criteria: parsedPlan ? observeCriteria(parsedPlan, parsedMilestones ?? undefined) : null,
    check: checkPlan(documents),
    sources: [
      ...('plan' in example ? [example.plan] : []),
      ...('milestones' in example ? [example.milestones] : []),
    ],
  };
};
