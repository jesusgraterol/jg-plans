import { expectToThrowCode } from 'jg-exception/testing';
import { ERRORS, checkPlan, parsePlan } from 'jg-plans';
import { describe, expect, it } from 'vitest';

const metadata =
  'id: invented\ncreated_at: 2026-10-21T20:00:00Z\nupdated_at: 2026-10-21T16:00:00-04:00\nrevision: 1\nstatus: waiting-for-feedback';

describe('built plan parser', () => {
  it('partitions the complete source into a preamble and unfenced heading/body spans', () => {
    const source =
      '\uFEFF---\r\nid: sample\r\nexample: |\r\n  ```\r\n  ## Not a section\r\n---\r\n# Intent 😀\r\n\r\n## Constraints\r\nKeep this.\r\n```md\r\n## Also not a section\r\n```\r\n## Requirements ##\r\nRetain the trailing text.\r\n';
    const parsed = parsePlan(source);
    expect(parsed.sections.map((section) => section.title)).toEqual([
      'Constraints',
      'Requirements',
    ]);
    expect(source.slice(parsed.preamble.start, parsed.preamble.end)).toBe(
      '\uFEFF---\r\nid: sample\r\nexample: |\r\n  ```\r\n  ## Not a section\r\n---\r\n# Intent 😀\r\n\r\n',
    );
    expect(
      parsed.sections.map((section) => source.slice(section.heading.start, section.heading.end)),
    ).toEqual(['## Constraints\r\n', '## Requirements ##\r\n']);
    expect(
      parsed.sections.map((section) => source.slice(section.body.start, section.body.end)),
    ).toEqual([
      'Keep this.\r\n```md\r\n## Also not a section\r\n```\r\n',
      'Retain the trailing text.\r\n',
    ]);
    const spans = [
      parsed.preamble,
      ...parsed.sections.flatMap((section) => [section.heading, section.body]),
    ];
    expect(spans.map((span) => source.slice(span.start, span.end)).join('')).toBe(source);
    expect(spans.every((span, index) => index === 0 || spans[index - 1]!.end === span.start)).toBe(
      true,
    );
  });

  it('retains BOM, CRLF, Unicode, unknown nested values, and exact body text', () => {
    const source = `\uFEFF---\r\n${metadata.replaceAll('\n', '\r\n')}\r\nproject:\r\n  label: café 😀\r\n  flags: [true, null, 3]\r\n---\r\n\r\n# A useful plan 😀`;
    const result = parsePlan(source);
    expect(result.source).toBe(source);
    expect(result.body).toBe('\r\n# A useful plan 😀');
    expect(result.metadata).toEqual({
      id: 'invented',
      created_at: '2026-10-21T20:00:00Z',
      updated_at: '2026-10-21T16:00:00-04:00',
      revision: 1,
      status: 'waiting-for-feedback',
    });
    expect(result.rawMetadata).toMatchObject({
      project: { label: 'café 😀', flags: [true, null, 3] },
    });
    expect(result.diagnostics).toEqual([]);
    expect(checkPlan({ plan: source }).conforms).toBe(true);
  });

  it('keeps invalid raw values independently of valid fields', () => {
    const result = parsePlan(
      '---\nid: keep-me\nrevision: zero\nstatus: false\ncreated_at: yesterday\nunknown: { nested: yes }\n---\n# Work',
    );
    expect(result.metadata).toEqual({ id: 'keep-me' });
    expect(result.rawMetadata).toMatchObject({
      revision: 'zero',
      status: false,
      unknown: { nested: 'yes' },
    });
    const invalid = result.diagnostics.filter((item) => item.code === 'INVALID_METADATA_FIELD');
    expect(invalid).toHaveLength(3);
    expect(invalid[0]?.location).toEqual({ offset: 57, line: 5, column: 13 });
    expect(result.body).toBe('# Work');
  });

  it.each(['', '# Metadata-free plan\n\nUseful prose.', '---\nstatus: [broken\n'])(
    'retains useful incomplete source: %j',
    (source) => {
      const result = parsePlan(source);
      expect(result.source).toBe(source);
      expect(result.body).toBe(source);
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(checkPlan({ plan: source }).conforms).toBe(false);
    },
  );

  it('handles malformed, duplicate, scalar, aliased, and non-JSON YAML without dumping input', () => {
    for (const yaml of [
      'id: one\nid: two',
      'a: [',
      '- one\n- two',
      'id: &id stable\nstatus: *id',
      'extension: &cycle [*cycle]',
      'extension: .inf',
    ]) {
      const result = parsePlan(`---\n${yaml}\n---\n# Body`);
      expect(result.source).toContain(yaml);
      expect(result.body).toBe('# Body');
      expect(() => JSON.stringify(result)).not.toThrow();
      expect(result.diagnostics.map((item) => item.message).join(' ')).not.toContain(yaml);
    }
  });

  it('reports absence rather than restoring a plan or inferring completion', () => {
    const result = checkPlan({ milestones: '## Milestone 4: Remaining\n**Status:** custom' });
    expect(result.conforms).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain('MISSING_PLAN');
    expect(result.diagnostics.map((item) => item.code)).toContain('ORPHAN_MILESTONES');
  });

  it('reads ordinary YAML aliases while retaining their original source', () => {
    const result = parsePlan('---\nid: &identity shared-value\nstatus: *identity\n---\n# Work');
    expect(result.metadata).toMatchObject({ id: 'shared-value', status: 'shared-value' });
    expect(result.source).toContain('status: *identity');
  });

  it('does not present an unsafe extension integer as a rounded raw observation', () => {
    const source = '---\nid: safe-identity\nexternal_number: 9007199254740993\n---\n# Work';
    const result = parsePlan(source);
    expect(result.rawMetadata).toBeNull();
    expect(result.source).toBe(source);
    expect(result.metadata.id).toBe('safe-identity');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'YAML_VALUE_UNAVAILABLE', severity: 'warning' }),
    );
  });

  it('does not fabricate string mapping keys from YAML collections, numbers, or aliases', () => {
    for (const keys of [
      '? [a, b]\n: value',
      'project: {true: value}',
      'project: {1: value}',
      'base: &key name\n? *key\n: value',
    ]) {
      const source = `---\nid: retained\n${keys}\n---\n# Work`;
      const result = parsePlan(source);
      expect(result.rawMetadata).toBeNull();
      expect(result.metadata.id).toBe('retained');
      expect(result.source).toBe(source);
      expect(result.body).toBe('# Work');
      expect(result.diagnostics.map((item) => item.code)).toContain('YAML_VALUE_UNAVAILABLE');
    }
  });

  it('rejects invalid operation arguments with the documented code', () => {
    expectToThrowCode(() => parsePlan(null as unknown as string), ERRORS.INVALID_INPUT);
    expectToThrowCode(
      () => checkPlan({ plan: 4 } as unknown as { plan: string }),
      ERRORS.INVALID_INPUT,
    );
  });
});

describe('0.2 plan scope fields', () => {
  const plan = (fields: string, protocol = "'0.2'"): string =>
    `---\nid: scoped\ncreated_at: 2026-10-21T20:00:00Z\nupdated_at: 2026-10-21T20:00:00Z\nrevision: 1\nstatus: pending\nprotocol: ${protocol}\n${fields}---\n# Plan\n\n## Acceptance criteria\n\n- AC-01: It works.\n`;
  const codes = (source: string): string[] =>
    parsePlan(source).diagnostics.map((item) => item.code);

  it('returns valid priority, repositories, and error codes in metadata', () => {
    const parsed = parsePlan(
      plan(
        'priority: hotfix\nrepositories:\n  - acme/app\n  - Acme/api.v2\nerror_codes: [{ repository: acme/app, registry: errors/README.md, first: 100, last: 100 }]\n',
      ),
    );
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.metadata).toMatchObject({
      priority: 'hotfix',
      repositories: ['acme/app', 'Acme/api.v2'],
      error_codes: [
        { repository: 'acme/app', registry: 'errors/README.md', first: 100, last: 100 },
      ],
    });
  });

  it.each([
    ['priority: urgent\n', 'INVALID_PRIORITY'],
    ['priority: [high]\n', 'INVALID_PRIORITY'],
    ['repositories: []\n', 'INVALID_REPOSITORIES'],
    ['repositories: [acme/app, ACME/App]\n', 'INVALID_REPOSITORIES'],
    ['repositories: [acme]\n', 'INVALID_REPOSITORIES'],
    ['repositories: [acme/..]\n', 'INVALID_REPOSITORIES'],
    ['repositories: acme/app\n', 'INVALID_REPOSITORIES'],
    ['repositories:\n', 'INVALID_REPOSITORIES'],
    [
      'error_codes: [{ repository: acme/app, registry: errors.md, first: 5, last: 4 }]\n',
      'INVALID_ERROR_CODES',
    ],
    [
      'error_codes: [{ repository: acme/app, registry: /errors.md, first: 1, last: 2 }]\n',
      'INVALID_ERROR_CODES',
    ],
    [
      'error_codes: [{ repository: acme/app, registry: docs/../errors.md, first: 1, last: 2 }]\n',
      'INVALID_ERROR_CODES',
    ],
    [
      'error_codes: [{ repository: acme/app, registry: "docs\\\\errors.md", first: 1, last: 2 }]\n',
      'INVALID_ERROR_CODES',
    ],
    [
      'error_codes: [{ repository: acme/app, registry: errors.md, first: 1.5, last: 2 }]\n',
      'INVALID_ERROR_CODES',
    ],
    [
      'error_codes: [{ repository: acme/app, registry: errors.md, first: 1, last: 2, owner: me }]\n',
      'INVALID_ERROR_CODES',
    ],
  ])('parsePlan(%j) -> %s', (fields, code) => {
    expect(codes(plan(fields))).toEqual([code]);
    expect(parsePlan(plan(fields)).metadata).not.toHaveProperty(fields.split(':')[0]!);
  });

  it('reports each invalid field at its value', () => {
    const source = plan('priority: urgent\nerror_codes: oops\n');
    const diagnostics = parsePlan(source).diagnostics;
    expect(diagnostics.map((item) => [item.code, item.location?.line])).toEqual([
      ['INVALID_PRIORITY', 8],
      ['INVALID_ERROR_CODES', 9],
    ]);
    expect(source.slice(diagnostics[0]!.location!.offset).startsWith('urgent')).toBe(true);
    expect(diagnostics.every((item) => item.severity === 'error')).toBe(true);
  });

  it('accepts an empty error code list', () => {
    expect(parsePlan(plan('error_codes: []\n')).metadata.error_codes).toEqual([]);
  });

  it('keeps a 0.1 plan unchanged: no findings and no scope metadata', () => {
    for (const protocol of ["'0.1'", 'null']) {
      const source = plan(
        'priority: urgent\nrepositories: []\nerror_codes: [{ first: 9, last: 1 }]\n',
        protocol,
      ).replace('protocol: null\n', '');
      const parsed = parsePlan(source);
      expect(parsed.protocol).toBe('0.1');
      expect(parsed.diagnostics.map((item) => item.code)).not.toEqual(
        expect.arrayContaining(['INVALID_PRIORITY', 'INVALID_REPOSITORIES', 'INVALID_ERROR_CODES']),
      );
      expect(parsed.metadata).not.toHaveProperty('priority');
      expect(checkPlan({ plan: source }).diagnostics).toEqual(
        checkPlan({ plan: source.replace(/priority[\s\S]*?(?=---)/, '') }).diagnostics.map(
          (item) => ({ ...item }),
        ),
      );
    }
  });

  it('reports nothing new when the metadata cannot be read as JSON', () => {
    const source = plan(
      'priority: urgent\nerror_codes: [{ repository: acme/app, registry: errors.md, first: 1, last: 9007199254740993 }]\n',
    );
    expect(parsePlan(source).rawMetadata).toBeNull();
    expect(codes(source)).toEqual(['YAML_VALUE_UNAVAILABLE']);
  });
});
