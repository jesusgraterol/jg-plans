import { expectToThrowCode } from 'jg-exception/testing';
import { ERRORS, findErrorCodeOverlaps, type IErrorCode, type IOverlapPlan } from 'jg-plans';
import { describe, expect, it } from 'vitest';

const plan = (
  directory: string,
  codes: IErrorCode[],
  overrides: Partial<IOverlapPlan> = {},
): IOverlapPlan => ({
  directory,
  id: directory,
  protocol: '0.2',
  status: 'pending',
  errorCodes: [{ repository: 'acme/app', registry: 'errors/README.md', codes }],
  ...overrides,
});

const memberships = (plans: IOverlapPlan[]) =>
  findErrorCodeOverlaps(plans).map(({ code, plans: references }) => ({
    code,
    directories: references.map(({ directory }) => directory),
  }));

describe('findErrorCodeOverlaps', () => {
  it('matches numeric and string claims with a canonical string result', () => {
    const plans = [plan('b', ['100']), plan('a', [100])];
    const before = structuredClone(plans);
    expect(findErrorCodeOverlaps(plans)).toStrictEqual([
      {
        repository: 'acme/app',
        registry: 'errors/README.md',
        code: '100',
        plans: [
          { directory: 'a', id: 'a' },
          { directory: 'b', id: 'b' },
        ],
      },
    ]);
    expect(plans).toStrictEqual(before);
  });

  it.each([
    [[1, 5], [3], []],
    [[1, 5], [5, 9], ['5']],
    [[1, 4], [5, 9], []],
    [['FAILURE'], ['FAILURE'], ['FAILURE']],
    [[100], ['0100'], []],
    [[1000], ['1e3'], []],
    [[1.5], ['1.5'], ['1.5']],
    [[-0], ['0'], ['0']],
    [['100'], [' 100'], []],
    [['FAILURE'], ['failure'], []],
    [['é'], ['e\u0301'], []],
  ] satisfies [IErrorCode[], IErrorCode[], string[]][])(
    'compares explicit %j and %j as %j',
    (first, second, expected) => {
      expect(
        memberships([plan('a', first), plan('b', second)]).map(({ code }) => code),
      ).toStrictEqual(expected);
    },
  );

  it('returns no collisions for empty inputs, empty claims, or one plan', () => {
    expect(findErrorCodeOverlaps([])).toStrictEqual([]);
    expect(findErrorCodeOverlaps([plan('a', []), plan('b', [])])).toStrictEqual([]);
    expect(findErrorCodeOverlaps([plan('a', [100, '100', 'OTHER'])])).toStrictEqual([]);
  });

  it('compares repositories without regard to case and registries exactly', () => {
    const upper = plan('b', [], {
      errorCodes: [{ repository: 'ACME/App', registry: 'errors/README.md', codes: ['X'] }],
    });
    const otherRegistry = plan('c', [], {
      errorCodes: [{ repository: 'acme/app', registry: 'errors/readme.md', codes: ['X'] }],
    });
    expect(findErrorCodeOverlaps([upper, plan('a', ['X']), otherRegistry])).toStrictEqual([
      {
        repository: 'acme/app',
        registry: 'errors/README.md',
        code: 'X',
        plans: [
          { directory: 'a', id: 'a' },
          { directory: 'b', id: 'b' },
        ],
      },
    ]);
  });

  it('counts pending and in-progress plans while retaining null identities', () => {
    expect(
      findErrorCodeOverlaps([
        plan('a', ['X']),
        plan('b', ['X'], { status: 'in progress', id: null }),
        plan('c', ['X'], { status: 'done' }),
        plan('d', ['X'], { status: 'waiting' }),
        plan('e', ['X'], { status: null }),
      ]),
    ).toStrictEqual([
      {
        repository: 'acme/app',
        registry: 'errors/README.md',
        code: 'X',
        plans: [
          { directory: 'a', id: 'a' },
          { directory: 'b', id: null },
        ],
      },
    ]);
  });

  it('deduplicates equivalent claims and repeated declarations inside a plan', () => {
    const repeated = plan('a', [100, '100', 100]);
    repeated.errorCodes.push({
      repository: 'ACME/App',
      registry: 'errors/README.md',
      codes: ['100'],
    });
    expect(memberships([repeated, plan('a', ['100']), plan('b', ['100', 100])])).toStrictEqual([
      { code: '100', directories: ['a', 'b'] },
    ]);
  });

  it('reports each actual shared code rather than chaining different claims together', () => {
    expect(
      memberships([plan('c', ['B', 'C']), plan('b', ['A', 'C']), plan('a', ['A', 'B'])]),
    ).toStrictEqual([
      { code: 'A', directories: ['a', 'b'] },
      { code: 'B', directories: ['a', 'c'] },
      { code: 'C', directories: ['b', 'c'] },
    ]);
  });

  it('sorts canonical code strings lexically regardless of their original types', () => {
    expect(memberships([plan('b', [2, '10', 'A']), plan('a', ['2', 10, 'A'])])).toStrictEqual([
      { code: '10', directories: ['a', 'b'] },
      { code: '2', directories: ['a', 'b'] },
      { code: 'A', directories: ['a', 'b'] },
    ]);
  });

  it('keeps registry and code boundaries distinct when strings contain newlines', () => {
    const one = plan('a', [], {
      errorCodes: [{ repository: 'acme/app', registry: 'errors\nX', codes: ['Y'] }],
    });
    const two = plan('b', [], {
      errorCodes: [{ repository: 'acme/app', registry: 'errors', codes: ['X\nY'] }],
    });
    expect(findErrorCodeOverlaps([one, two])).toStrictEqual([]);
  });

  it('reports 1024 plans once each for a single shared code', () => {
    const plans = Array.from({ length: 1024 }, (_, index) => plan(`p${index}`, [1, '1', 1]));
    const overlaps = findErrorCodeOverlaps(plans);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.plans).toHaveLength(1024);
  });

  it('indexes 10,000 plans without multiplying unrelated declaration payloads', () => {
    const plans = Array.from({ length: 10_000 }, (_, index) =>
      plan(`p${index}`, [`shared-${Math.floor(index / 2)}`, `unique-${index}`]),
    );
    const overlaps = findErrorCodeOverlaps(plans);
    expect(overlaps).toHaveLength(5000);
    expect(overlaps.every(({ plans }) => plans.length === 2)).toBe(true);
    expect(
      new Set(overlaps.flatMap(({ plans }) => plans.map(({ directory }) => directory))).size,
    ).toBe(10_000);
  });

  it.each([
    [{}],
    [plan('a', [NaN])],
    [plan('a', [Infinity])],
    [plan('a', [Number.MAX_SAFE_INTEGER + 1])],
    [plan('a', [''])],
    [plan('a', ['   '])],
    [{ ...plan('a', []), protocol: '0.1' }],
    [
      {
        ...plan('a', []),
        errorCodes: [{ repository: 'acme/app', registry: 'errors.md', first: 1, last: 2 }],
      },
    ],
    [
      {
        ...plan('a', []),
        errorCodes: [{ repository: 'acme/app', registry: 'errors.md', codes: [true] }],
      },
    ],
  ])('rejects unsupported input %j with the documented code', (input) => {
    expectToThrowCode(
      () => findErrorCodeOverlaps([input] as unknown as IOverlapPlan[]),
      ERRORS.INVALID_INPUT,
      'Invalid jg-plans input',
    );
  });
});
