import { expectToThrowCode } from 'jg-exception/testing';
import {
  ERRORS,
  checkPlan,
  observeCriteria,
  parseMilestones,
  parsePlan,
  type IParsedMilestones,
  type IParsedPlan,
} from 'jg-plans';
import { describe, expect, it } from 'vitest';

const frontmatter = (status = 'pending', protocol = '"0.2"'): string =>
  `---\nid: invented\ncreated_at: 2026-10-21T20:00:00Z\nupdated_at: 2026-10-21T20:00:00Z\nrevision: 1\nstatus: ${status}\nprotocol: ${protocol}\n---\n`;

const plan02 = (body: string, status?: string): string => `${frontmatter(status)}\n${body}`;

const ids = (source: string): (string | null)[] =>
  parsePlan(source).criteria.map((criterion) => criterion.id);

const codes = (diagnostics: { code: string }[]): string[] => diagnostics.map((item) => item.code);

const milestone = (
  ordinal: number,
  status: string,
  coverage?: string,
  id = `5a148c73-7d38-4a2f-9c0f-90${ordinal}e938290229`.slice(0, 36),
): string =>
  `## Milestone ${ordinal}: Work ${ordinal}\n**Status:** ${status}\n**Milestone ID:** ${id}\n${coverage === undefined ? '' : `**Acceptance criteria:** ${coverage}\n`}\nDo the work.\n\n`;

describe('corrected plan contracts', () => {
  it.each([
    { metadata: { status: 4 } },
    { criteria: [{ id: 4, text: 'Work', location: { offset: 0, line: 1, column: 1 } }] },
    { criteria: [{ id: 'AC-01', text: null, location: { offset: 0, line: 1, column: 1 } }] },
    { criteria: [{ id: 'AC-01', text: 'Work', location: { offset: -1, line: 1, column: 1 } }] },
  ])('rejects malformed consumed plan fields: %o', (fields) => {
    const parsed = parsePlan(plan02('- AC-01: Work.'));
    expectToThrowCode(
      () => observeCriteria({ ...parsed, ...fields } as unknown as IParsedPlan),
      ERRORS.INVALID_INPUT,
    );
  });

  it.each([
    { ordinal: '1' },
    { id: 4 },
    { status: {} },
    { criteria: [4] },
    { location: null },
    { statusMarkers: [{ value: 'pending', location: null, lineStart: 0, lineEnd: 1 }] },
    {
      idMarkers: [
        {
          value: 'custom',
          location: { offset: 0, line: 1, column: 1 },
          lineStart: '0',
          lineEnd: 1,
        },
      ],
    },
    {
      criteriaMarkers: [
        {
          value: 'AC-01',
          location: { offset: 0, line: 1, column: 1 },
          lineStart: 0,
          lineEnd: null,
        },
      ],
    },
  ])('rejects malformed consumed milestone fields: %o', (fields) => {
    const plan = parsePlan(plan02('- AC-01: Work.'));
    const parsed = parseMilestones(milestone(1, 'pending', 'AC-01'));
    const malformed = {
      ...parsed,
      milestones: [{ ...parsed.milestones[0], ...fields }],
    } as unknown as IParsedMilestones;
    expectToThrowCode(() => observeCriteria(plan, malformed), ERRORS.INVALID_INPUT);
  });

  it('rejects a malformed coverage marker through the documented input error', () => {
    const plan = parsePlan(plan02('- AC-01: A requirement.\n'));
    const parsed = parseMilestones(milestone(1, 'pending', 'AC-01'));
    const malformed = {
      ...parsed,
      milestones: parsed.milestones.map((entry) => ({
        ...entry,
        criteriaMarkers: [{ ...entry.criteriaMarkers[0], value: 4 }],
      })),
    } as unknown as IParsedMilestones;
    expectToThrowCode(
      () => observeCriteria(plan, malformed),
      ERRORS.INVALID_INPUT,
      'Invalid jg-plans input',
    );
  });
});

describe('criterion definitions', () => {
  it(
    'recognizes every list marker form with up to three spaces of indentation',
    { tags: ['full'] },
    () => {
      expect(
        ids(
          plan02(
            '- AC-01: Dash.\n* AC-02: Star.\n+ AC-03: Plus.\n1. AC-04: Dot.\n2) AC-05: Paren.\n   - AC-06: Three spaces.\n123456789. AC-07: Nine digits.\n',
          ),
        ),
      ).toStrictEqual(['AC-01', 'AC-02', 'AC-03', 'AC-04', 'AC-05', 'AC-06', 'AC-07']);
    },
  );

  it('ignores fences, frontmatter, quotes, deep indentation, prose, lowercase, and spaced colons', () => {
    const source = plan02(
      [
        'Milestone 1 delivers AC-01: see below.',
        '> - AC-02: Quoted.',
        '    - AC-03: Indented code.',
        '\t- AC-04: Tab indentation.',
        '- ac-05: Lowercase.',
        '- AC-06 : Spaced colon.',
        '1234567890. AC-07: Ten digits.',
        '```markdown',
        '- AC-08: Fenced.',
        '```',
        '- AC-09: Real.',
      ].join('\n'),
    );
    expect(ids(source)).toStrictEqual(['AC-09']);
    expect(
      ids(`---\nnote: |\n  - AC-10: In YAML.\nprotocol: "0.2"\n---\n- AC-11: Real.\n`),
    ).toStrictEqual(['AC-11']);
  });

  it.each([
    ['AC-01', 'AC-01'],
    ['AC-09', 'AC-09'],
    ['AC-10', 'AC-10'],
    ['AC-99', 'AC-99'],
    ['AC-100', 'AC-100'],
    ['AC-1000', 'AC-1000'],
    ['AC-1', null],
    ['AC-001', null],
    ['AC-00', null],
    ['AC-', null],
    ['AC-01x', null],
  ])('parsePlan(%s) -> id %s', (idText, expected) => {
    const [criterion] = parsePlan(plan02(`- ${idText}: Text.\n`)).criteria;
    expect(criterion?.idText).toBe(idText);
    expect(criterion?.id).toBe(expected);
  });

  it(
    'joins indented continuation lines until a blank line, list item, heading, or outdent',
    { tags: ['full'] },
    () => {
      const source = plan02(
        [
          '- AC-01: First line,',
          '  second line,',
          '\tthird line.',
          '- AC-02: Stops at a nested item.',
          '  - A nested detail.',
          '- AC-03: Stops at a heading.',
          '  ## Not part of it',
          '- AC-04: Stops at an outdent.',
          'Unindented prose.',
          '- AC-05: Stops at a blank line.',
          '',
          '  Indented after blank.',
        ].join('\n'),
      );
      expect(parsePlan(source).criteria.map((criterion) => criterion.text)).toStrictEqual([
        'First line, second line, third line.',
        'Stops at a nested item.',
        'Stops at a heading.',
        'Stops at an outdent.',
        'Stops at a blank line.',
      ]);
    },
  );

  it('keeps exact offsets and ranges with a BOM and CRLF line endings', { tags: ['full'] }, () => {
    const source = '\uFEFF- AC-01: Starts the file,\r\n  then continues.\r\n';
    const [criterion] = parsePlan(source).criteria;
    expect(criterion).toMatchObject({
      id: 'AC-01',
      text: 'Starts the file, then continues.',
      location: { offset: 3, line: 1, column: 4 },
    });
    expect(source.slice(criterion!.range.start, criterion!.range.end)).toBe(
      '- AC-01: Starts the file,\r\n  then continues.',
    );
  });
});

describe('protocol 0.2 plan rules', () => {
  it('uses current interpretation while diagnosing unsupported or non-string declarations', () => {
    expect(parsePlan(plan02('- AC-01: Text.\n')).protocol).toBe('0.2');
    const legacy = parsePlan(`${frontmatter('pending', '"0.1"')}\n- AC-01: Text.\n`);
    expect(legacy.protocol).toBe('0.2');
    expect(codes(legacy.diagnostics)).toStrictEqual(['UNSUPPORTED_PROTOCOL']);
    const unquoted = parsePlan(`${frontmatter('pending', '0.2')}\n- AC-01: Text.\n`);
    expect(unquoted.protocol).toBe('0.2');
    expect(codes(unquoted.diagnostics)).toStrictEqual(['INVALID_METADATA_FIELD']);
    const absent = parsePlan(
      '---\nid: invented\ncreated_at: 2026-10-21T20:00:00Z\nupdated_at: 2026-10-21T20:00:00Z\nrevision: 1\nstatus: pending\n---\n',
    );
    expect(absent.protocol).toBe('0.2');
    expect(codes(absent.diagnostics)).toStrictEqual(['NO_CRITERIA']);
  });

  it('reports missing, invalid, duplicate, and empty criteria at their lines', () => {
    expect(codes(parsePlan(plan02('No criteria here.\n')).diagnostics)).toStrictEqual([
      'NO_CRITERIA',
    ]);
    expect(codes(parsePlan(plan02('- AC-1: Invalid only.\n')).diagnostics)).toStrictEqual([
      'NO_CRITERIA',
      'INVALID_CRITERION_ID',
    ]);
    const parsed = parsePlan(plan02('- AC-01: One.\n- AC-01: Again.\n- AC-02:\n- AC-x:\n'));
    expect(parsed.diagnostics.map((item) => [item.code, item.location?.line])).toStrictEqual([
      ['DUPLICATE_CRITERION', 11],
      ['EMPTY_CRITERION', 12],
      ['INVALID_CRITERION_ID', 13],
      ['EMPTY_CRITERION', 13],
    ]);
  });

  it('requires a shared progress status on the plan', () => {
    const parsed = parsePlan(plan02('- AC-01: Text.\n', 'waiting'));
    expect(parsed.diagnostics.map((item) => [item.code, item.location?.line])).toStrictEqual([
      ['INVALID_STATUS', 6],
    ]);
  });
});

describe('milestone coverage', () => {
  const plan = plan02('- AC-01: One.\n- AC-02: Two.\n');

  it('accepts a coverage line after the ID line, or after the status line without an ID', () => {
    const milestones = `${milestone(1, 'done', 'AC-01')}## Milestone 2: Two\n**Status:** pending\n**Acceptance criteria:** AC-02\n`;
    expect(checkPlan({ plan, milestones })).toStrictEqual({ conforms: true, diagnostics: [] });
    expect(parseMilestones(milestones).milestones.map((entry) => entry.criteria)).toStrictEqual([
      ['AC-01'],
      ['AC-02'],
    ]);
  });

  it('reports malformed, repeated, misplaced, and unknown coverage lines', () => {
    const milestones = [
      milestone(1, 'pending', ''),
      milestone(2, 'pending', 'AC-01, AC-01'),
      milestone(3, 'pending', 'AC-1, AC-02'),
      '## Milestone 4: Four\n**Status:** pending\n\n**Acceptance criteria:** AC-01\n\n',
      `${milestone(5, 'pending', 'AC-02')}**Acceptance criteria:** AC-01\n`,
      milestone(6, 'pending', 'AC-07'),
    ].join('');
    const result = checkPlan({ plan, milestones });
    expect(result.conforms).toBe(false);
    expect(result.diagnostics.map((item) => [item.code, item.location?.line])).toStrictEqual([
      ['INVALID_CRITERIA_MARKER', 4],
      ['INVALID_CRITERIA_MARKER', 11],
      ['INVALID_CRITERIA_MARKER', 18],
      ['MISPLACED_CRITERIA_MARKER', 25],
      ['DUPLICATE_CRITERIA_MARKER', 34],
      ['UNKNOWN_CRITERION', 38],
    ]);
  });

  it('ignores fenced coverage lines and reports criteria no milestone covers', () => {
    const milestones = `${milestone(1, 'pending', 'AC-01')}\`\`\`markdown\n**Acceptance criteria:** AC-02\n\`\`\`\n`;
    const result = checkPlan({ plan, milestones });
    expect(
      result.diagnostics.map((item) => [item.code, item.document, item.location?.line]),
    ).toStrictEqual([['UNASSIGNED_CRITERION', 'plan', 11]]);
  });

  it('requires shared progress statuses on milestones', () => {
    const result = checkPlan({
      plan,
      milestones: milestone(1, 'blocked', 'AC-01, AC-02'),
    });
    expect(result.diagnostics.map((item) => [item.code, item.location?.line])).toStrictEqual([
      ['INVALID_STATUS', 2],
    ]);
  });

  it('checks only the plan rules when milestones are not supplied', () => {
    expect(checkPlan({ plan })).toStrictEqual({ conforms: true, diagnostics: [] });
    expect(codes(checkPlan({ plan: plan02('Nothing.\n') }).diagnostics)).toStrictEqual([
      'NO_CRITERIA',
    ]);
  });
});

describe('criterion progress', () => {
  it.each([
    [['done', 'done'], 'done'],
    [['done', 'pending'], 'in progress'],
    [['in progress'], 'in progress'],
    [['pending', 'pending'], 'pending'],
    [['done', 'waiting-for-review'], null],
  ])('observeCriteria(milestone statuses %o) -> %s', (statuses, expected) => {
    const milestones = parseMilestones(
      statuses.map((status, index) => milestone(index + 1, status, 'AC-01')).join(''),
    );
    expect(
      observeCriteria(parsePlan(plan02('- AC-01: One.\n')), milestones).criteria,
    ).toMatchObject([{ id: 'AC-01', progress: expected }]);
  });

  it('is null for an uncovered criterion and follows the plan status without milestones', () => {
    const plan = parsePlan(plan02('- AC-01: One.\n- AC-02: Two.\n', 'in progress'));
    const observed = observeCriteria(plan, parseMilestones(milestone(1, 'done', 'AC-01')));
    expect(observed.criteria.map((criterion) => [criterion.id, criterion.progress])).toStrictEqual([
      ['AC-01', 'done'],
      ['AC-02', null],
    ]);
    expect(observeCriteria(plan).criteria.map((criterion) => criterion.progress)).toStrictEqual([
      'in progress',
      'in progress',
    ]);
    expect(
      observeCriteria(parsePlan(plan02('- AC-01: One.\n', 'waiting'))).criteria[0]?.progress,
    ).toBeNull();
  });

  it('lists covering milestones and counts only the first definition of an ID', () => {
    const plan = parsePlan(plan02('- AC-01: First.\n- AC-01: Second.\n'));
    const observed = observeCriteria(
      plan,
      parseMilestones(`${milestone(1, 'done', 'AC-01')}${milestone(2, 'pending', 'AC-01')}`),
    );
    expect(observed.criteria).toStrictEqual([
      {
        id: 'AC-01',
        text: 'First.',
        location: { offset: 134, line: 10, column: 3 },
        milestones: [
          { ordinal: 1, id: '5a148c73-7d38-4a2f-9c0f-901e93829022' },
          { ordinal: 2, id: '5a148c73-7d38-4a2f-9c0f-902e93829022' },
        ],
        progress: 'in progress',
      },
    ]);
  });

  it('rejects inputs that are not parsed documents', () => {
    expectToThrowCode(() => observeCriteria({} as IParsedPlan), ERRORS.INVALID_INPUT);
    expectToThrowCode(
      () => observeCriteria(parsePlan(plan02('- AC-01: One.\n')), {} as never),
      ERRORS.INVALID_INPUT,
    );
  });
});

describe('unsupported protocol observations', () => {
  it('retains useful criteria while reporting current conformance failures', () => {
    const plan = `${frontmatter('waiting-for-feedback', '"0.1"')}\n- AC-1: Invalid but unchecked.\n- AC-01: Kept.\n- AC-01: Duplicate.\n`;
    const milestones =
      '## Milestone 1: Work\n**Status:** custom\n\n**Acceptance criteria:**\n- The page loads.\n';
    const result = checkPlan({ plan, milestones });
    expect(result.conforms).toBe(false);
    expect(codes(result.diagnostics)).toStrictEqual([
      'UNSUPPORTED_PROTOCOL',
      'INVALID_STATUS',
      'INVALID_CRITERION_ID',
      'DUPLICATE_CRITERION',
      'INVALID_STATUS',
      'INVALID_CRITERIA_MARKER',
      'MISPLACED_CRITERIA_MARKER',
      'UNASSIGNED_CRITERION',
    ]);
    const observed = observeCriteria(parsePlan(plan), parseMilestones(milestones));
    expect(observed.protocol).toBe('0.2');
    expect(observed.criteria.map((criterion) => [criterion.id, criterion.progress])).toStrictEqual([
      ['AC-01', null],
    ]);
    expect(codes(observed.diagnostics)).toStrictEqual([
      'INVALID_STATUS',
      'INVALID_CRITERIA_MARKER',
      'MISPLACED_CRITERIA_MARKER',
      'UNASSIGNED_CRITERION',
    ]);
  });
});

describe('large plans near the 1 MiB inspection bound', { tags: ['full'] }, () => {
  it('reads tens of thousands of criteria without quadratic work', () => {
    const count = 40_000;
    const body = Array.from(
      { length: count },
      (_, index) => `- AC-${String(index + 1).padStart(2, '0')}: Criterion ${index + 1}.`,
    ).join('\n');
    const plan = parsePlan(plan02(body));
    expect(plan.criteria).toHaveLength(count);
    expect(plan.diagnostics).toStrictEqual([]);
    const observed = observeCriteria(plan);
    expect(observed.criteria).toHaveLength(count);
    expect(observed.criteria.at(-1)).toMatchObject({ id: 'AC-40000', progress: 'pending' });
  });

  it('reports every finding of a pathological plan without exhausting the call stack', () => {
    const count = 120_000;
    const source = plan02('- AC-1:\n'.repeat(count));
    const result = checkPlan({ plan: source });
    expect(result.conforms).toBe(false);
    expect(result.diagnostics).toHaveLength(2 * count + 1);
  });
});
