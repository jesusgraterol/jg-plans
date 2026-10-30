import { z } from 'zod';

import { planErrors } from '../errors/index.ts';

import {
  OverlapPlanSchema,
  type IErrorCodeOverlap,
  type IOverlapPlan,
  type IOverlapPlanReference,
} from './types.ts';

// the statuses whose declarations can still collide
const ACTIVE_STATUSES = new Set(['pending', 'in progress']);

// one registry's canonical codes and distinct participating directories
type IRegistryClaims = {
  repository: string;
  registry: string;
  codes: Map<string, Map<string, IOverlapPlanReference>>;
};

const compareText = (first: string, second: string): number =>
  first < second ? -1 : first > second ? 1 : 0;

/**
 * Find codes claimed by distinct active plans in the same repository and registry.
 * Declaration types are retained by callers; membership uses String(code). Repository IDs
 * compare without regard to case and are lowercase in results. Registry and code strings
 * compare exactly. Membership storage grows with input claims rather than repeated declarations.
 * @param plans Each plan's directory, id, protocol, status, and error code declarations.
 * @returns Canonical string collisions sorted by repository, registry, code, and plan reference.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 */
export const findErrorCodeOverlaps = (plans: IOverlapPlan[]): IErrorCodeOverlap[] => {
  const validated = z.array(OverlapPlanSchema).safeParse(plans);
  if (!validated.success) throw planErrors.create('invalidInput');
  const groups = new Map<string, IRegistryClaims>();
  for (const plan of validated.data) {
    if (!ACTIVE_STATUSES.has(plan.status ?? '')) continue;
    for (const entry of plan.errorCodes) {
      if (!entry.codes.length) continue;
      const repository = entry.repository.toLowerCase();
      // repository IDs cannot contain a newline; registry strings remain exact
      const key = `${repository}\n${entry.registry}`;
      const group = groups.get(key) ?? {
        repository,
        registry: entry.registry,
        codes: new Map<string, Map<string, IOverlapPlanReference>>(),
      };
      for (const declared of entry.codes) {
        const code = String(declared);
        const references = group.codes.get(code) ?? new Map<string, IOverlapPlanReference>();
        if (!references.has(plan.directory))
          references.set(plan.directory, { directory: plan.directory, id: plan.id });
        group.codes.set(code, references);
      }
      groups.set(key, group);
    }
  }
  const overlaps: IErrorCodeOverlap[] = [];
  const registries = [...groups.values()].sort(
    (first, second) =>
      compareText(first.repository, second.repository) ||
      compareText(first.registry, second.registry),
  );
  for (const group of registries)
    for (const code of [...group.codes.keys()].sort()) {
      const references = group.codes.get(code)!;
      if (references.size < 2) continue;
      overlaps.push({
        repository: group.repository,
        registry: group.registry,
        code,
        plans: [...references.values()].sort(
          (first, second) =>
            compareText(first.directory, second.directory) ||
            compareText(first.id ?? '', second.id ?? ''),
        ),
      });
    }
  return overlaps;
};
