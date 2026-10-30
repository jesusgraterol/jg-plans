import { expectToThrowCode } from 'jg-exception/testing';
import { ERRORS, findErrorCodeOverlaps, type IOverlapPlan } from 'jg-plans';
import { describe, expect, it } from 'vitest';

const plan = (
  directory: string,
  ranges: [number, number][],
  overrides: Partial<IOverlapPlan> = {},
): IOverlapPlan => ({
  directory,
  id: directory,
  protocol: '0.2',
  status: 'pending',
  errorCodes: ranges.map(([first, last]) => ({
    repository: 'acme/app',
    registry: 'errors/README.md',
    first,
    last,
  })),
  ...overrides,
});

const spans = (plans: IOverlapPlan[]) =>
  findErrorCodeOverlaps(plans).map((overlap) => ({
    first: overlap.first,
    last: overlap.last,
    plans: overlap.plans.map((item) => `${item.directory}:${item.entry.first}-${item.entry.last}`),
  }));

describe('findErrorCodeOverlaps', () => {
  it.each([
    [[1, 5], [5, 9], true],
    [[1, 4], [5, 9], false],
    [[7, 7], [7, 7], true],
    [[7, 7], [8, 8], false],
    [[1, 100], [40, 41], true],
  ] as const)('%j and %j overlap: %s', (a, b, overlaps) => {
    expect(spans([plan('a', [[...a]]), plan('b', [[...b]])]).length).toBe(overlaps ? 1 : 0);
  });

  it('compares repositories without regard to case, and registries exactly', () => {
    const upper = plan('b', [[3, 3]], {
      errorCodes: [{ repository: 'ACME/App', registry: 'errors/README.md', first: 3, last: 3 }],
    });
    const otherRegistry = plan('c', [[3, 3]], {
      errorCodes: [{ repository: 'acme/app', registry: 'errors/readme.md', first: 3, last: 3 }],
    });
    expect(spans([plan('a', [[1, 5]]), upper, otherRegistry])).toEqual([
      { first: 1, last: 5, plans: ['a:1-5', 'b:3-3'] },
    ]);
  });

  it('ignores done plans, plans with custom or no status, and 0.1 plans', () => {
    expect(
      spans([
        plan('a', [[1, 5]]),
        plan('b', [[1, 5]], { status: 'done' }),
        plan('c', [[1, 5]], { status: 'waiting' }),
        plan('d', [[1, 5]], { status: null }),
        plan('e', [[1, 5]], { protocol: '0.1' }),
      ]),
    ).toEqual([]);
    expect(spans([plan('a', [[1, 5]]), plan('b', [[1, 5]], { status: 'in progress' })])).toEqual([
      { first: 1, last: 5, plans: ['a:1-5', 'b:1-5'] },
    ]);
  });

  it('chains a three-way overlap into one group, and keeps separate runs apart', () => {
    expect(
      spans([
        plan('a', [[1, 4]]),
        plan('b', [[4, 8]]),
        plan('c', [[8, 12]]),
        plan('d', [[20, 30]]),
      ]),
    ).toEqual([{ first: 1, last: 12, plans: ['a:1-4', 'b:4-8', 'c:8-12'] }]);
  });

  it('reports no overlap within one plan, and every declaration of a run with another plan', () => {
    expect(
      spans([
        plan('a', [
          [1, 5],
          [3, 7],
        ]),
        plan('b', [[9, 9]]),
      ]),
    ).toEqual([]);
    expect(
      spans([
        plan('a', [
          [1, 5],
          [3, 7],
        ]),
        plan('b', [[7, 9]]),
      ]),
    ).toEqual([{ first: 1, last: 9, plans: ['a:1-5', 'a:3-7', 'b:7-9'] }]);
  });

  it('returns one group for 1024 identical ranges, never more entries than it was given', () => {
    const plans = Array.from({ length: 1024 }, (_, index) => plan(`p${index}`, [[1, 1]]));
    const overlaps = findErrorCodeOverlaps(plans);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.plans).toHaveLength(1024);
  });

  it('sweeps 10,000 declarations into groups that hold each one at most once', () => {
    const plans = Array.from({ length: 10_000 }, (_, index) =>
      plan(`p${index}`, [[index * 2, index * 2 + (index % 3 === 0 ? 2 : 0)]]),
    );
    const overlaps = findErrorCodeOverlaps(plans);
    const declarations = overlaps.flatMap((overlap) => overlap.plans);
    expect(new Set(declarations.map((item) => item.directory)).size).toBe(declarations.length);
    expect(declarations.length).toBeLessThanOrEqual(10_000);
    expect(overlaps.length).toBeGreaterThan(0);
  });

  it('throws JG_PLANS_INVALID_INPUT for input that is not a list of plans', () => {
    expectToThrowCode(
      () => findErrorCodeOverlaps([{ directory: 'a' }] as unknown as IOverlapPlan[]),
      ERRORS.INVALID_INPUT,
    );
    expectToThrowCode(() => findErrorCodeOverlaps([plan('a', [[5, 1]])]), ERRORS.INVALID_INPUT);
  });
});
