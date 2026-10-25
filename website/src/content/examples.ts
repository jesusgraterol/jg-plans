import { checkPlan, observeCriteria, parseMilestones, parsePlan } from 'jg-plans';

import { buildLifecycle, type ILifecycle } from '../../scripts/lifecycle/index.ts';

import { CHECK_EXAMPLE, EXAMPLES, readPublicBytes } from './sources.ts';

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

/**
 * Checks the registered nonconforming example through the public library.
 * @returns A promise that resolves to its documents and the actual check result.
 */
export const loadCheckExample = async () => {
  const documents = {
    plan: (await readPublicBytes(CHECK_EXAMPLE.plan)).toString('utf8'),
    milestones: (await readPublicBytes(CHECK_EXAMPLE.milestones)).toString('utf8'),
  };
  return { documents, check: checkPlan(documents) };
};

// one lifecycle run per build; the homepage and the examples page show the same observations
let lifecycle: Promise<ILifecycle> | undefined;

/**
 * Runs the public lifecycle demonstration on the criteria example once per build.
 * @returns A promise that resolves to the shared lifecycle observations.
 */
export const loadLifecycle = (): Promise<ILifecycle> => {
  lifecycle ??= (async () => {
    const sample = await loadExample('criteria');
    return buildLifecycle(sample.documents.plan!, sample.documents.milestones!);
  })();
  return lifecycle;
};
