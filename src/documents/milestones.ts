import { z } from 'zod';

import { COVERAGE_MARKER, coverageIds } from '../criteria/index.ts';
import { planErrors } from '../errors/index.ts';

import type {
  IMilestone,
  IMarker,
  IOverviewRow,
  IParsedMilestones,
  ISourceLine,
  ISourceSpan,
  IHeadingSection,
} from './types.ts';
import { diagnostic, headingSections, readFrontmatter, sourceLocation } from './utilities.ts';

const markerFrom = (line: ISourceLine, prefix: string): IMarker | null => {
  const leading = line.text.length - line.text.trimStart().length;
  if (!line.text.slice(leading).startsWith(prefix)) return null;
  const tail = line.text.slice(leading + prefix.length);
  const start = line.start + leading + prefix.length + tail.length - tail.trimStart().length;
  const end = Math.max(start, line.end - (tail.length - tail.trimEnd().length));
  return {
    value: tail.trim(),
    location: { offset: line.start + leading, line: line.number, column: leading + 1 },
    valueStart: start,
    valueEnd: end,
    lineStart: line.start,
    lineEnd: line.fullEnd,
  };
};

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

const readOverview = (
  lines: ISourceLine[],
  sections: IHeadingSection[],
): { present: boolean; rows: IOverviewRow[]; tables: ISourceSpan[] } => {
  const rows: IOverviewRow[] = [];
  const tables: ISourceSpan[] = [];
  let present = false;
  let inOverview = false;
  const headings = new Map(sections.map((section) => [section.heading.start, section.title]));
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.fenced) continue;
    const start = line.start + (line.start === 0 && line.text.startsWith('\uFEFF') ? 1 : 0);
    if (headings.has(start)) inOverview = headings.get(start) === 'Overview';
    if (!inOverview) continue;
    const columns = cells(line.text);
    if (columns.join('|') === 'Milestone|Name|Status') {
      const separator = cells(lines[index + 1]?.text ?? '');
      if (
        !lines[index + 1]?.fenced &&
        separator.length === 3 &&
        separator.every((cell) => /^:?-{3,}:?$/.test(cell))
      ) {
        present = true;
        const start = line.start;
        let end = lines[++index]!.fullEnd;
        while (index + 1 < lines.length) {
          const row = lines[index + 1]!;
          const values = cells(row.text);
          if (row.fenced || values.length !== 3 || !/^\d+$/.test(values[0]!)) break;
          index++;
          end = row.fullEnd;
          const ordinal = Number(values[0]);
          rows.push({
            ordinal: Number.isSafeInteger(ordinal) && ordinal > 0 ? ordinal : null,
            ordinalText: values[0]!,
            name: values[1]!,
            status: values[2]!,
            location: { offset: row.start, line: row.number, column: 1 },
          });
        }
        tables.push({ start, end });
      }
    }
  }
  return { present, rows, tables };
};

/**
 * Observe numbered milestones and their markers, ignoring fenced examples.
 * Duplicate or misplaced structures receive diagnostics while useful entries survive.
 * @param source Original milestone Markdown.
 * @returns Original source, partial entries, optional overview rows, and diagnostics.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 */
export const parseMilestones = (source: string): IParsedMilestones => {
  if (!z.string().safeParse(source).success) throw planErrors.create('invalidInput');
  const observed = readFrontmatter(source, 'milestones');
  const { lines } = observed;
  const sections = headingSections(source, lines);
  const overview = readOverview(lines, sections);
  const result: IParsedMilestones = {
    source,
    body: observed.body,
    frontmatter: observed.frontmatter,
    rawMetadata: observed.rawMetadata,
    preamble: { start: 0, end: sections[0]?.heading.start ?? source.length },
    sections,
    overviewTables: overview.tables,
    milestones: [],
    overview: overview.rows,
    overviewPresent: overview.present,
    diagnostics: observed.diagnostics,
  };
  const headings = sections.map(
    (section) => lines[sourceLocation(lines, section.heading.start).line - 1]!,
  );
  const ordinals = new Set<number>();
  const ids = new Set<string>();
  let previous = 0;
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]!;
    const match = /^Milestone (-?\d+):[ \t]*(.*)$/s.exec(sections[index]!.title);
    if (!match) continue;
    const end = headings[index + 1]?.start ?? source.length;
    const number = Number(match[1]);
    const ordinal = Number.isSafeInteger(number) && number > 0 ? number : null;
    const location = sourceLocation(
      lines,
      heading.start + (heading.start === 0 && heading.text.startsWith('\uFEFF') ? 1 : 0),
    );
    const blockLines = lines.slice(
      heading.number,
      (headings[index + 1]?.number ?? lines.length + 1) - 1,
    );
    const observedLines = blockLines.filter((line) => !line.fenced);
    const statuses = observedLines
      .map((line) => markerFrom(line, '**Status:**'))
      .filter((marker): marker is IMarker => marker !== null);
    const identities = observedLines
      .map((line) => markerFrom(line, '**Milestone ID:**'))
      .filter((marker): marker is IMarker => marker !== null);
    // coverage lines are only observed here; their rules depend on the plan's protocol
    const coverage = observedLines
      .map((line) => markerFrom(line, COVERAGE_MARKER))
      .filter((marker): marker is IMarker => marker !== null);
    const entry: IMilestone = {
      ordinal,
      ordinalText: match[1]!,
      title: match[2]!.trim(),
      status: statuses[0]?.value ?? null,
      id: identities[0]?.value ?? null,
      location,
      headingEnd: heading.fullEnd,
      end,
      body: source.slice(heading.fullEnd, end),
      statusMarkers: statuses,
      idMarkers: identities,
      criteria: coverage[0] ? coverageIds(coverage[0]) : null,
      criteriaMarkers: coverage,
    };
    result.milestones.push(entry);
    const add = (code: string, message: string, marker?: IMarker): void => {
      result.diagnostics.push(
        diagnostic('milestones', code, message, marker?.location ?? location),
      );
    };
    if (ordinal === null)
      add('INVALID_ORDINAL', 'Milestone ordinals must be positive safe integers.');
    else {
      if (ordinals.has(ordinal))
        add('DUPLICATE_ORDINAL', 'More than one milestone has this ordinal.');
      if (ordinal <= previous)
        add(
          'NONSEQUENTIAL_ORDINAL',
          'The observed sequence is out of order; no missing entries are inferred.',
        );
      else if (ordinal !== previous + 1)
        result.diagnostics.push(
          diagnostic(
            'milestones',
            'NONSEQUENTIAL_ORDINAL',
            'The observed sequence has a gap; no missing entries are inferred.',
            location,
            'warning',
          ),
        );
      ordinals.add(ordinal);
      previous = ordinal;
    }
    if (!entry.title) add('EMPTY_MILESTONE_TITLE', 'The milestone has no title.');
    if (!statuses.length) add('MISSING_STATUS', 'The milestone has no status marker.');
    if (statuses.length > 1) add('DUPLICATE_STATUS', 'The milestone has multiple status markers.');
    if (statuses[0]) {
      if (!statuses[0].value) add('EMPTY_STATUS', 'The milestone status is empty.', statuses[0]);
      const firstNonblank = blockLines.find((line) => line.text.trim());
      if (statuses[0].lineStart !== firstNonblank?.start)
        add(
          'MISPLACED_STATUS',
          'The status marker is not the first nonblank line after the heading.',
          statuses[0],
        );
    }
    if (identities.length > 1) add('DUPLICATE_ID_MARKER', 'The milestone has multiple ID markers.');
    for (const identity of identities) {
      if (!z.uuid().safeParse(identity.value).success)
        add('INVALID_MILESTONE_ID', 'The milestone ID is not a UUID.', identity);
      const normalized = identity.value.toLowerCase();
      if (ids.has(normalized))
        add('DUPLICATE_ID', 'More than one milestone has this ID.', identity);
      ids.add(normalized);
      if (identity.lineStart !== statuses[0]?.lineEnd)
        add('MISPLACED_ID', 'The ID marker does not immediately follow the status line.', identity);
    }
  }
  if (!result.milestones.length)
    result.diagnostics.push(
      diagnostic('milestones', 'NO_MILESTONES', 'No numbered milestone headings were observed.'),
    );
  const byOrdinal = new Map<number, IMilestone[]>();
  for (const entry of result.milestones) {
    if (entry.ordinal === null) continue;
    const group = byOrdinal.get(entry.ordinal) ?? [];
    group.push(entry);
    byOrdinal.set(entry.ordinal, group);
  }
  const rowOrdinals = new Set<number>();
  for (const row of result.overview) {
    const entries = row.ordinal === null ? [] : (byOrdinal.get(row.ordinal) ?? []);
    if (row.ordinal === null || entries.length !== 1 || rowOrdinals.has(row.ordinal))
      result.diagnostics.push(
        diagnostic(
          'milestones',
          'AMBIGUOUS_OVERVIEW',
          'The overview row cannot be matched to one milestone.',
          row.location,
        ),
      );
    else if (entries[0]!.status !== row.status)
      result.diagnostics.push(
        diagnostic(
          'milestones',
          'OVERVIEW_MISMATCH',
          'The derived overview status differs from the status marker.',
          row.location,
        ),
      );
    if (row.ordinal !== null) rowOrdinals.add(row.ordinal);
  }
  if (result.overviewPresent)
    for (const entry of result.milestones) {
      if (entry.ordinal !== null && !rowOrdinals.has(entry.ordinal))
        result.diagnostics.push(
          diagnostic(
            'milestones',
            'OVERVIEW_MISMATCH',
            'The derived overview omits an observed milestone.',
            entry.location,
          ),
        );
    }
  return result;
};
