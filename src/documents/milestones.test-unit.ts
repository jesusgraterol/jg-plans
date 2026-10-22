import { parseMilestones } from 'jg-plans';
import { describe, expect, it } from 'vitest';

const id = '5a148c73-7d38-4a2f-9c0f-903d93b9b764';

describe('built milestone parser', () => {
  it('keeps Unicode line-separator characters inside headings and fenced info strings', () => {
    const source =
      '```markdown\u2028example\n## Milestone 9: Fenced\n**Status:** done\n```\n## Milestone 1: Work\u2028details\n**Status:** pending';
    const parsed = parseMilestones(source);
    expect(parsed.milestones.map((entry) => entry.title)).toEqual(['Work\u2028details']);
    expect(parsed.sections.map((section) => section.title)).toEqual([
      'Milestone 1: Work\u2028details',
    ]);
    expect(parsed.diagnostics).toEqual([]);
  });

  it('retains long heading whitespace and nonclosing hash suffixes without ambiguous boundaries', () => {
    const padding = ' '.repeat(20_000);
    const title = `Work${padding}x###`;
    const source = `## Milestone 1: ${title}\n**Status:** pending\n## Requirements\nKeep this.`;
    const parsed = parseMilestones(source);
    expect(parsed.milestones[0]!.title).toBe(title);
    expect(parsed.sections.map((section) => section.title)).toEqual([
      `Milestone 1: ${title}`,
      'Requirements',
    ]);
    expect(parsed.diagnostics).toEqual([]);
  });

  it('observes optional frontmatter once without scanning its Markdown-looking values or requiring plan fields', () => {
    const source =
      '\uFEFF---\r\njg_skills: {plan_id: example, plan_revision: 2}\r\nexample: |\r\n  ```\r\n  ## Milestone 9: Not work\r\n  **Status:** done\r\n---\r\n# Sequence 😀\r\n\r\n## Shared requirements\r\nKeep shared requirements.\r\n## Milestone 1: Implement\r\n**Status:** custom\r\nImplementation prose.\r\n## Approval required\r\nKeep this final requirement.\r\n';
    const parsed = parseMilestones(source);
    expect(parsed.rawMetadata).toMatchObject({
      jg_skills: { plan_id: 'example', plan_revision: 2 },
    });
    expect(parsed.body).toBe(
      '# Sequence 😀\r\n\r\n## Shared requirements\r\nKeep shared requirements.\r\n## Milestone 1: Implement\r\n**Status:** custom\r\nImplementation prose.\r\n## Approval required\r\nKeep this final requirement.\r\n',
    );
    expect(parsed.milestones).toHaveLength(1);
    expect(parsed.sections.map((section) => section.title)).toEqual([
      'Shared requirements',
      'Milestone 1: Implement',
      'Approval required',
    ]);
    expect(parsed.milestones[0]!.body).toBe('**Status:** custom\r\nImplementation prose.\r\n');
    expect(
      source.slice(parsed.milestones[0]!.location.offset, parsed.milestones[0]!.headingEnd),
    ).toBe('## Milestone 1: Implement\r\n');
    const spans = [
      parsed.preamble,
      ...parsed.sections.flatMap((section) => [section.heading, section.body]),
    ];
    expect(spans.map((span) => source.slice(span.start, span.end)).join('')).toBe(source);
    expect(spans.every((span, index) => index === 0 || spans[index - 1]!.end === span.start)).toBe(
      true,
    );
    expect(parsed.diagnostics).toEqual([]);
  });

  it('returns exact overview table ranges without adjacent prose or fenced tables', () => {
    const table = '| Milestone | Name | Status |\n| --- | --- | --- |\n| 1 | Work | pending |\n';
    const source =
      '## Overview\nProse before.\n' +
      table +
      'Prose after.\n```md\n' +
      table +
      '```\n## Milestone 1: Work\n**Status:** pending\n';
    const parsed = parseMilestones(source);
    expect(parsed.overviewTables.map((span) => source.slice(span.start, span.end))).toEqual([
      table,
    ]);
    expect(parsed.overview).toHaveLength(1);
    expect(parsed.diagnostics).toEqual([]);
  });

  it('retains malformed milestone metadata and suppresses scanning inside unterminated frontmatter', () => {
    const malformed = parseMilestones(
      '---\ncustom: [broken\n---\n## Milestone 1: Work\n**Status:** custom',
    );
    expect(malformed.milestones).toHaveLength(1);
    expect(malformed.diagnostics.map((item) => item.code)).toContain('INVALID_YAML');
    const unterminated = '---\ncustom: value\n## Milestone 9: Ambiguous\n**Status:** done';
    const parsed = parseMilestones(unterminated);
    expect(parsed.source).toBe(unterminated);
    expect(parsed.body).toBe(unterminated);
    expect(parsed.milestones).toEqual([]);
    expect(parsed.sections).toEqual([]);
    expect(parsed.diagnostics.map((item) => item.code)).toContain('UNTERMINATED_FRONTMATTER');
  });

  it('retains optional IDs and custom statuses without an overview', () => {
    const source = `# Work\r\n\r\n## Milestone 1: Café 😀\r\n\r\n**Status:** waiting-for-feedback\r\n**Milestone ID:** ${id}\r\n\r\nEvidence.\r\n## Milestone 2: Review\r\n**Status:** pending`;
    const result = parseMilestones(source);
    expect(result.source).toBe(source);
    expect(
      result.milestones.map(({ ordinal, title, status, id }) => ({ ordinal, title, status, id })),
    ).toEqual([
      { ordinal: 1, title: 'Café 😀', status: 'waiting-for-feedback', id },
      { ordinal: 2, title: 'Review', status: 'pending', id: null },
    ]);
    expect(result.diagnostics).toEqual([]);
    for (const entry of result.milestones) {
      const marker = entry.statusMarkers[0]!;
      expect(source.slice(marker.valueStart, marker.valueEnd)).toBe(entry.status);
    }
  });

  it('ignores backtick and tilde fences, including longer closing fences', () => {
    const source = [
      '```markdown',
      '## Milestone 8: fake',
      '**Status:** done',
      '````',
      '~~~',
      '## Milestone 9: fake',
      '~~~',
      '## Milestone 1: Real',
      '**Status:** pending',
      '```',
      '**Milestone ID:** not-a-real-marker',
      '```',
    ].join('\n');
    const result = parseMilestones(source);
    expect(result.milestones).toHaveLength(1);
    expect(result.milestones[0]?.id).toBeNull();
    expect(result.diagnostics).toEqual([]);
  });

  it('diagnoses duplicate and misplaced markers without discarding entries', () => {
    const source = `## Milestone 1: First\nProse before status.\n**Status:** done\n\n**Milestone ID:** ${id}\n**Status:** pending\n## Milestone 1: Second\n**Status:** pending\n**Milestone ID:** ${id.toUpperCase()}`;
    const result = parseMilestones(source);
    expect(result.milestones).toHaveLength(2);
    expect(result.milestones[0]?.status).toBe('done');
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'DUPLICATE_ORDINAL',
        'DUPLICATE_ID',
        'DUPLICATE_STATUS',
        'MISPLACED_STATUS',
        'MISPLACED_ID',
      ]),
    );
    expect(result.diagnostics.find((item) => item.code === 'MISPLACED_STATUS')?.location).toEqual({
      offset: 43,
      line: 3,
      column: 1,
    });
  });

  it('recognizes an optional overview as derived, with discrepancies', () => {
    const source =
      '## Overview\n\n| Milestone | Name | Status |\n| --- | --- | --- |\n| 1 | [First](#first) | done |\n\n## Milestone 1: First\n**Status:** pending';
    const result = parseMilestones(source);
    expect(result.overview).toHaveLength(1);
    expect(result.milestones[0]?.status).toBe('pending');
    expect(result.diagnostics.map((item) => item.code)).toContain('OVERVIEW_MISMATCH');
  });

  it('reports empty/missing/invalid markers and preserves partly deleted sequences', () => {
    const result = parseMilestones(
      '## Milestone 0: \n**Milestone ID:** bad\n## Milestone 4: Remaining\n**Status:** \n## Approval required\n**Status:** not-a-milestone',
    );
    expect(result.milestones.map((entry) => entry.ordinal)).toEqual([null, 4]);
    expect(result.milestones[0]?.ordinalText).toBe('0');
    expect(result.milestones[1]?.status).toBe('');
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'INVALID_ORDINAL',
        'EMPTY_MILESTONE_TITLE',
        'INVALID_MILESTONE_ID',
        'MISSING_STATUS',
        'EMPTY_STATUS',
        'NONSEQUENTIAL_ORDINAL',
      ]),
    );
    expect(parseMilestones('').diagnostics[0]?.code).toBe('NO_MILESTONES');
  });

  it('recognizes a BOM and considers fenced prose when checking canonical marker placement', () => {
    const result = parseMilestones(
      '\uFEFF## Milestone 1: First\n```text\nexample\n```\n**Status:** pending',
    );
    expect(result.milestones).toHaveLength(1);
    expect(result.milestones[0]?.location.offset).toBe(1);
    expect(result.diagnostics.map((item) => item.code)).toContain('MISPLACED_STATUS');
  });

  it('retains oversized ordinal text instead of exposing Infinity or rounded identity', () => {
    for (const text of ['9007199254740993', '9'.repeat(500)]) {
      const result = parseMilestones(`## Milestone ${text}: Still observable\n**Status:** pending`);
      expect(result.milestones[0]).toMatchObject({
        ordinal: null,
        ordinalText: text,
        title: 'Still observable',
        status: 'pending',
      });
      expect(result.diagnostics.map((item) => item.code)).toContain('INVALID_ORDINAL');
      expect(JSON.stringify(result)).toContain(text);
    }
  });

  it('retains all ID markers when one milestone has conflicting identities', () => {
    const result = parseMilestones(
      `## Milestone 1: Work\n**Status:** done\n**Milestone ID:** ${id}\n**Milestone ID:** d7f04e92-61a7-4caf-8ab2-64c2b9f787e1`,
    );
    expect(result.milestones[0]?.id).toBe(id);
    expect(result.milestones[0]?.idMarkers).toHaveLength(2);
    expect(result.diagnostics.map((item) => item.code)).toContain('DUPLICATE_ID_MARKER');
  });

  it('diagnoses an explicitly empty overview instead of treating it as absent', () => {
    const source =
      '## Overview\n| Milestone | Name | Status |\n| --- | --- | --- |\n\n## Milestone 1: First\n**Status:** pending';
    const result = parseMilestones(source);
    expect(result).toMatchObject({ source, overviewPresent: true, overview: [] });
    expect(result.diagnostics.map((item) => item.code)).toContain('OVERVIEW_MISMATCH');
  });

  it('detects duplicate overview rows and rows without a remaining milestone', () => {
    const result = parseMilestones(
      '## Overview\n| Milestone | Name | Status |\n| --- | --- | --- |\n| 1 | First | pending |\n| 1 | Duplicate | done |\n| 7 | Removed | done |\n\n## Milestone 1: First\n**Status:** pending',
    );
    expect(result.overview).toHaveLength(3);
    expect(result.diagnostics.filter((item) => item.code === 'AMBIGUOUS_OVERVIEW')).toHaveLength(2);
  });
});
