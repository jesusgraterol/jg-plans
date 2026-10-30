import { createHash } from 'node:crypto';
import {
  ERRORS,
  parseMilestones,
  parsePlan,
  preparePlanDocumentWrite,
  preparePlanUpdate,
} from 'jg-plans';
import { describe, expect, it } from 'vitest';

const digest = (source: string): string => createHash('sha256').update(source).digest('hex');
const id = '5a148c73-7d38-4a2f-9c0f-903d93b9b764';

describe('pure public edit preparation', () => {
  it.each(['\n', '\r\n'])(
    'preserves framing and metadata outside one body/core patch with %j',
    (eol) => {
      const source = [
        '\uFEFF---',
        '# Café 😀',
        'id: sample # keep',
        'revision: 1',
        'extension: {scope: [one, two]}',
        '---',
        '# Old body',
      ].join(eol);
      const result = preparePlanDocumentWrite(source, {
        document: 'plan',
        expectedSha256: digest(source),
        body: `# New 😀${eol}`,
        set: { revision: 2 },
      });
      expect(result.source).toBe(
        source.replace('revision: 1', 'revision: 2').replace('# Old body', `# New 😀${eol}`),
      );
      expect(result).toMatchObject({
        changed: true,
        sha256: digest(result.source),
        assignedMilestoneIds: [],
      });
      expect(parsePlan(result.source).rawMetadata).toMatchObject({
        extension: { scope: ['one', 'two'] },
      });
      expect(
        preparePlanDocumentWrite(result.source, {
          document: 'plan',
          expectedSha256: result.sha256,
          body: parsePlan(result.source).body,
        }).changed,
      ).toBe(false);
    },
  );

  it('guards before unsafe preparation and never invents metadata policy', () => {
    const source = '---\nid: |\n  old\n---\nBody';
    expect(() =>
      preparePlanUpdate(source, {
        document: 'plan',
        expectedSha256: '0'.repeat(64),
        set: { id: 'new' },
      }),
    ).toThrowError(expect.objectContaining({ code: ERRORS.SOURCE_CHANGED }));
    const result = preparePlanUpdate('---\nstatus: pending\n---\nBody', {
      document: 'plan',
      set: { status: 'custom' },
    });
    expect(parsePlan(result.source).metadata).toEqual({ status: 'custom' });
    expect(() =>
      preparePlanDocumentWrite(null, {
        document: 'milestones',
        expectedSha256: '0'.repeat(64),
        source: '## Milestone 1: Work\n**Status:** pending',
        assignMissingIds: true,
      }),
    ).toThrowError(expect.objectContaining({ code: ERRORS.SOURCE_CHANGED }));
  });

  it('allows body-only edits with closed malformed YAML and rejects unterminated framing', () => {
    const source = '---\nextension: [broken\n---\nOld';
    expect(
      preparePlanDocumentWrite(source, {
        document: 'plan',
        expectedSha256: digest(source),
        body: 'New',
      }).source,
    ).toBe(source.replace('Old', 'New'));
    expect(() =>
      preparePlanDocumentWrite('---\nid: sample', {
        document: 'plan',
        expectedSha256: digest('---\nid: sample'),
        body: 'New',
      }),
    ).toThrowError(expect.objectContaining({ code: ERRORS.UNSAFE_EDIT }));
  });

  it('handles BOM, metadata-free insertion, EOF delimiters and strict encoding', () => {
    for (const source of ['', '# Body', '\uFEFF# Body']) {
      const body = source;
      expect(
        preparePlanDocumentWrite(source, { document: 'plan', expectedSha256: digest(source), body })
          .source,
      ).toBe(source);
      const result = preparePlanDocumentWrite(source, {
        document: 'plan',
        expectedSha256: digest(source),
        body: '# New',
        set: { revision: 2 },
      });
      expect(parsePlan(result.source).metadata.revision).toBe(2);
      expect(parsePlan(result.source).body).toBe('# New');
      expect(result.source.startsWith('\uFEFF')).toBe(source.startsWith('\uFEFF'));
    }
    const eof = '---\r\nid: sample\r\n---';
    expect(
      preparePlanDocumentWrite(eof, { document: 'plan', expectedSha256: digest(eof), body: 'Body' })
        .source,
    ).toBe(`${eof}\r\nBody`);
    expect(() =>
      preparePlanDocumentWrite('Body', {
        document: 'plan',
        expectedSha256: digest('Body'),
        body: '---\nid: unexpected\n---\nBody',
      }),
    ).toThrowError(expect.objectContaining({ code: ERRORS.UNSAFE_EDIT }));
    expect(() =>
      preparePlanDocumentWrite(null, {
        document: 'milestones',
        expectedSha256: null,
        source: '\uD800',
      }),
    ).toThrowError(expect.objectContaining({ code: ERRORS.UNSUPPORTED_ENCODING }));
  });

  it('assigns missing IDs only explicitly and persists a replayable exact source', () => {
    const source = `---\nbinding: {revision: 2}\n---\n## Shared requirements\nKeep 😀\n## Milestone 1: Old\n**Status:** done\n**Milestone ID:** ${id}\n\nEvidence.\n## Milestone 2: New\n**Status:** custom\n\nNew scope.`;
    expect(
      preparePlanDocumentWrite(null, { document: 'milestones', expectedSha256: null, source })
        .source,
    ).toBe(source);
    const result = preparePlanDocumentWrite(null, {
      document: 'milestones',
      expectedSha256: null,
      source,
      assignMissingIds: true,
    });
    expect(result.assignedMilestoneIds).toEqual([
      { ordinal: 2, id: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    ]);
    expect(parseMilestones(result.source).milestones.map((entry) => entry.id)).toEqual([
      id,
      result.assignedMilestoneIds[0]!.id,
    ]);
    expect(result.source).toBe(
      source.replace(
        '**Status:** custom',
        `**Status:** custom\n**Milestone ID:** ${result.assignedMilestoneIds[0]!.id}`,
      ),
    );
    const replay = preparePlanDocumentWrite(result.source, {
      document: 'milestones',
      expectedSha256: result.sha256,
      source: result.source,
      assignMissingIds: true,
    });
    expect(replay).toMatchObject({
      changed: false,
      source: result.source,
      sha256: result.sha256,
      assignedMilestoneIds: [],
    });
  });

  it.each([
    '## Milestone 1: Work\nProse\n**Status:** pending',
    '## Milestone 1: Work\n**Status:** pending\n**Status:** custom',
    '## Milestone 1: Work\n**Status:** pending\n**Milestone ID:** invalid',
    '## Milestone 1: Work\n**Status:** pending\n## Milestone 1: Duplicate\n**Status:** pending',
    `## Milestone 1: Work\n**Status:** pending\n**Milestone ID:** ${id}\n## Milestone 2: Duplicate\n**Status:** pending\n**Milestone ID:** ${id}`,
  ])('rejects ambiguous explicit ID assignment: %j', (source) => {
    expect(() =>
      preparePlanDocumentWrite(null, {
        document: 'milestones',
        expectedSha256: null,
        source,
        assignMissingIds: true,
      }),
    ).toThrowError(expect.objectContaining({ code: ERRORS.UNSAFE_EDIT }));
  });
});

describe('scope field edits', () => {
  const plan = (fields: string, eol = '\n'): string =>
    [
      '---',
      'id: scoped # keep',
      'revision: 2',
      "protocol: '0.2'",
      ...fields.split('\n').filter(Boolean),
      'extension: {scope: [one, two]}',
      '---',
      '# Body 😀',
      '',
    ].join(eol);
  const update = (source: string, set: Record<string, unknown>) =>
    preparePlanUpdate(source, {
      document: 'plan',
      expectedSha256: digest(source),
      set,
    } as Parameters<typeof preparePlanUpdate>[1]);

  it('inserts missing fields as single-line values before the closing delimiter', () => {
    const source = plan('');
    const result = update(source, {
      priority: 'high',
      repositories: ['acme/app', 'acme/api'],
      error_codes: [
        { repository: 'acme/app', registry: 'errors/README.md', first: 100, last: 149 },
      ],
    });
    expect(result.source).toBe(
      source.replace(
        '---\n# Body',
        'priority: "high"\nrepositories: [ acme/app, acme/api ]\nerror_codes: [ { repository: acme/app, registry: errors/README.md, first: 100, last: 149 } ]\n---\n# Body',
      ),
    );
    expect(parsePlan(result.source).metadata).toMatchObject({
      priority: 'high',
      repositories: ['acme/app', 'acme/api'],
      error_codes: [
        { repository: 'acme/app', registry: 'errors/README.md', first: 100, last: 149 },
      ],
    });
  });

  it.each(['\n', '\r\n'])(
    'replaces a block-style value with one line and leaves every other byte with %j',
    (eol) => {
      const source = plan(
        'priority: low # triaged\nrepositories:\n  - acme/app # main\n  - acme/api\nerror_codes:\n  - repository: acme/app\n    registry: errors.md\n    first: 1\n    last: 2\n',
        eol,
      );
      const result = update(source, {
        priority: 'hotfix',
        repositories: ['acme/web'],
        error_codes: [{ repository: 'acme/web', registry: 'errors.md', first: 7, last: 9 }],
      });
      expect(result.source).toBe(
        plan(
          'priority: "hotfix" # triaged\nrepositories: [ acme/web ]\nerror_codes: [ { repository: acme/web, registry: errors.md, first: 7, last: 9 } ]\n',
          eol,
        ),
      );
      expect(result.diagnostics).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ code: 'INVALID_REPOSITORIES' })]),
      );
    },
  );

  it('removes a field, a block-style one included, when it is set to null', () => {
    const source = plan(
      'priority: high\nrepositories:\n  - acme/app\n  - acme/api\nerror_codes: [{ repository: acme/app, registry: e.md, first: 1, last: 1 }]\n',
    );
    const result = update(source, { priority: null, repositories: null, error_codes: null });
    expect(result.source).toBe(plan(''));
    expect(update(plan(''), { priority: null }).changed).toBe(false);
  });

  it('skips the write when the requested value deep-equals the current one', () => {
    const source = plan(
      'repositories:\n  - acme/app\nerror_codes: [{ repository: acme/app, registry: e.md, first: 1, last: 1 }]\n',
    );
    const result = update(source, {
      repositories: ['acme/app'],
      error_codes: [{ repository: 'acme/app', registry: 'e.md', first: 1, last: 1 }],
    });
    expect(result.changed).toBe(false);
    expect(result.source).toBe(source);
  });

  it('writes the fields into a plan without frontmatter, and ignores null there', () => {
    const result = preparePlanDocumentWrite('# Body\n', {
      document: 'plan',
      expectedSha256: digest('# Body\n'),
      body: '# Body\n',
      set: { priority: 'medium', repositories: ['acme/app'], error_codes: null },
    });
    expect(result.source).toBe(
      '---\npriority: "medium"\nrepositories: [ acme/app ]\n---\n# Body\n',
    );
  });

  it('refuses invalid values, and an aliased or tagged current value', () => {
    for (const set of [
      { priority: 'urgent' },
      { repositories: [] },
      { repositories: ['acme/app', 'ACME/APP'] },
      { error_codes: [{ repository: 'acme/app', registry: '/e.md', first: 1, last: 1 }] },
    ])
      expect(() => update(plan(''), set)).toThrow(
        expect.objectContaining({ code: ERRORS.INVALID_INPUT }),
      );
    for (const fields of [
      'shared: &list [acme/app]\nrepositories: *list\n',
      'repositories: !!seq [acme/app]\n',
    ])
      expect(() => update(plan(fields), { repositories: ['acme/api'] })).toThrow(
        expect.objectContaining({ code: ERRORS.UNSAFE_EDIT }),
      );
  });
});
