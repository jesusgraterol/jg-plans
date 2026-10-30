import { z } from 'zod';

import { planErrors } from '../errors/index.ts';

import {
  OverlapPlanSchema,
  type IErrorCodeOverlap,
  type IOverlapDeclaration,
  type IOverlapPlan,
} from './types.ts';

// the statuses whose declarations can still collide
const ACTIVE_STATUSES = new Set(['pending', 'in progress']);

const compareDeclarations = (a: IOverlapDeclaration, b: IOverlapDeclaration): number =>
  a.entry.first - b.entry.first ||
  a.entry.last - b.entry.last ||
  a.directory.localeCompare(b.directory, 'en') ||
  (a.id ?? '').localeCompare(b.id ?? '', 'en');

/**
 * Close a run of chained declarations into an overlap group when it spans at least two plans.
 * @param run The declarations, sorted by their first code.
 * @param last The highest last code of the run.
 * @returns The group, or undefined for a run within one plan.
 */
const toOverlap = (run: IOverlapDeclaration[], last: number): IErrorCodeOverlap | undefined => {
  const [head] = run;
  if (!head || new Set(run.map((item) => item.directory)).size < 2) return undefined;
  return {
    repository: head.entry.repository,
    registry: head.entry.registry,
    first: head.entry.first,
    last,
    plans: run,
  };
};

/**
 * Find the error code ranges that active 0.2 plans declare over each other. Only plans whose
 * status is pending or in progress count. Declarations naming the same repository, compared
 * without regard to case, and the same registry are sorted by their first code and swept once, so
 * the work grows as n log n and each declaration appears in at most one group.
 * @param plans Each plan's directory, id, protocol, status, and error code declarations.
 * @returns The overlap groups, sorted by repository, registry, and first code.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 */
export const findErrorCodeOverlaps = (plans: IOverlapPlan[]): IErrorCodeOverlap[] => {
  const validated = z.array(OverlapPlanSchema).safeParse(plans);
  if (!validated.success) throw planErrors.create('invalidInput');
  const groups = new Map<string, IOverlapDeclaration[]>();
  for (const plan of validated.data) {
    if (plan.protocol !== '0.2' || !ACTIVE_STATUSES.has(plan.status ?? '')) continue;
    for (const entry of plan.errorCodes) {
      const key = `${entry.repository.toLowerCase()}\n${entry.registry}`;
      const group = groups.get(key) ?? [];
      group.push({ directory: plan.directory, id: plan.id, entry });
      groups.set(key, group);
    }
  }
  const overlaps: IErrorCodeOverlap[] = [];
  for (const key of [...groups.keys()].sort()) {
    const declarations = groups.get(key)!.sort(compareDeclarations);
    let run: IOverlapDeclaration[] = [];
    let last = Number.NEGATIVE_INFINITY;
    for (const declaration of declarations) {
      if (run.length && declaration.entry.first > last) {
        const overlap = toOverlap(run, last);
        if (overlap) overlaps.push(overlap);
        run = [];
      }
      last = run.length ? Math.max(last, declaration.entry.last) : declaration.entry.last;
      run.push(declaration);
    }
    const overlap = toOverlap(run, last);
    if (overlap) overlaps.push(overlap);
  }
  return overlaps;
};
