import { checkPlan, parseMilestones, parsePlan } from 'jg-plans';

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
  return {
    ...example,
    documents,
    plan: plan === undefined ? null : parsePlan(plan),
    milestones: milestones === undefined ? null : parseMilestones(milestones),
    check: checkPlan(documents),
    sources: [
      ...('plan' in example ? [example.plan] : []),
      ...('milestones' in example ? [example.milestones] : []),
    ],
  };
};
