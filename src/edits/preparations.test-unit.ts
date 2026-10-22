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
