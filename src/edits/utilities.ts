import { isMap, isScalar, parseDocument, Scalar, stringify } from 'yaml';

import { parseMilestones, parsePlan, sourceLines } from '../documents/index.ts';
import { planErrors } from '../errors/index.ts';
import type { IPlanUpdate } from '../protocol/index.ts';

import type { ITextEdit } from './types.ts';

/** Decode strictly while retaining an existing BOM character. */
export const decodeSource = (bytes: Uint8Array): string =>
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

/**
 * Reject unpaired surrogates rather than letting UTF-8 encoding replace them.
 * @throws
 * - JG_PLANS_UNSUPPORTED_ENCODING: Document text is not valid UTF-8
 */
export const encodeSource = (source: string): Buffer => {
  if (/[\uD800-\uDFFF]/u.test(source)) throw planErrors.create('unsupportedEncoding');
  return Buffer.from(source, 'utf8');
};

const lineEnding = (source: string): string => /\r\n|\n|\r/.exec(source)?.[0] ?? '\n';

const scalarText = (value: string | number, style?: string): string => {
  if (typeof value === 'number') return String(value);
  encodeSource(value);
  const scalar = new Scalar(value);
  scalar.type =
    style === 'QUOTE_SINGLE' && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)
      ? Scalar.QUOTE_SINGLE
      : Scalar.QUOTE_DOUBLE;
  return stringify(scalar, { lineWidth: 0, doubleQuotedAsJSON: true }).replace(/\n$/, '');
};

/**
 * Prepare supported metadata edits without changing unrelated YAML or Markdown.
 * @throws
 * - JG_PLANS_UNSAFE_EDIT: The requested edit is unsupported or ambiguous
 * - JG_PLANS_UNSUPPORTED_ENCODING: Document text is not valid UTF-8
 */
export const planEdits = (
  source: string,
  patch: Extract<IPlanUpdate, { document: 'plan' }>,
): ITextEdit[] => {
  const observation = parsePlan(source);
  const frontmatter = observation.frontmatter;
  const eol = lineEnding(source);
  if (!frontmatter) {
    const text = Object.entries(patch.set)
      .map(([key, value]) => `${key}: ${scalarText(value)}`)
      .join(eol);
    const offset = source.startsWith('\uFEFF') ? 1 : 0;
    return [
      {
        start: offset,
        end: offset,
        replacement: `---${eol}${text}${eol}---${source.length > offset ? eol : ''}`,
      },
    ];
  }
  if (!frontmatter.closed)
    throw planErrors.create('unsafeEdit', { data: { reason: 'unterminated-frontmatter' } });
  const yamlSource = source.slice(frontmatter.contentStart, frontmatter.contentEnd);
  const document = parseDocument(yamlSource, { keepSourceTokens: true, logLevel: 'silent' });
  if (document.errors.length)
    throw planErrors.create('unsafeEdit', { data: { reason: 'malformed-frontmatter' } });
  const map = document.contents;
  if (map !== null && (!isMap(map) || map.srcToken?.type !== 'block-map' || map.anchor || map.tag))
    throw planErrors.create('unsafeEdit', { data: { reason: 'unsupported-frontmatter-map' } });
  if (
    isMap(map) &&
    map.items.some(
      (pair) =>
        !isScalar(pair.key) ||
        typeof pair.key.value !== 'string' ||
        pair.key.value === '<<' ||
        pair.key.anchor ||
        pair.key.tag,
    )
  )
    throw planErrors.create('unsafeEdit', { data: { reason: 'ambiguous-metadata-keys' } });
  const edits: ITextEdit[] = [];
  const insertions: string[] = [];
  for (const [key, value] of Object.entries(patch.set)) {
    const pairs = isMap(map)
      ? map.items.filter((pair) => isScalar(pair.key) && pair.key.value === key)
      : [];
    if (pairs.length > 1)
      throw planErrors.create('unsafeEdit', {
        data: { reason: 'duplicate-metadata-key', field: key },
      });
    if (!pairs.length) {
      insertions.push(`${key}: ${scalarText(value)}${eol}`);
      continue;
    }
    const node = pairs[0]!.value;
    if (
      !isScalar(node) ||
      !node.range ||
      node.anchor ||
      node.tag ||
      !['PLAIN', 'QUOTE_SINGLE', 'QUOTE_DOUBLE'].includes(node.type ?? '')
    )
      throw planErrors.create('unsafeEdit', {
        data: { reason: 'unsupported-metadata-value', field: key },
      });
    const [start, end] = node.range;
    if (start === end || /[\r\n]/.test(yamlSource.slice(start, end)))
      throw planErrors.create('unsafeEdit', {
        data: { reason: 'unsupported-metadata-value-span', field: key },
      });
    if (Object.is(node.value, value)) continue;
    edits.push({
      start: frontmatter.contentStart + start,
      end: frontmatter.contentStart + end,
      replacement: scalarText(value, node.type),
    });
  }
  if (insertions.length)
    edits.push({
      start: frontmatter.contentEnd,
      end: frontmatter.contentEnd,
      replacement: insertions.join(''),
    });
  return edits;
};

/**
 * Prepare marker edits for unambiguous selectors. Existing misplaced markers stay put.
 * @throws
 * - JG_PLANS_UNSAFE_EDIT: The requested edit is unsupported or ambiguous
 * - JG_PLANS_UNSUPPORTED_ENCODING: Document text is not valid UTF-8
 */
export const milestoneEdits = (
  source: string,
  patch: Extract<IPlanUpdate, { document: 'milestones' }>,
): ITextEdit[] => {
  const parsed = parseMilestones(source);
  const lines = sourceLines(source);
  const eol = lineEnding(source);
  const edits: ITextEdit[] = [];
  const selected = new Set<number>();
  for (const change of patch.changes) {
    const selector = change.select;
    const matches = parsed.milestones.filter((entry) =>
      'id' in selector
        ? entry.idMarkers.some((marker) => marker.value.toLowerCase() === selector.id.toLowerCase())
        : entry.ordinal === selector.ordinal,
    );
    if (matches.length !== 1)
      throw planErrors.create('unsafeEdit', { data: { reason: 'ambiguous-or-missing-milestone' } });
    const entry = matches[0]!;
    if (selected.has(entry.location.offset) || ('id' in selector && entry.idMarkers.length !== 1))
      throw planErrors.create('unsafeEdit', { data: { reason: 'ambiguous-milestone-selector' } });
    selected.add(entry.location.offset);
    const heading = lines[entry.location.line - 1];
    if (!heading)
      throw planErrors.create('unsafeEdit', { data: { reason: 'unavailable-milestone-heading' } });
    const status = entry.statusMarkers[0];
    const identity = entry.idMarkers[0];
    const set = change.set;
    for (const value of Object.values(set)) encodeSource(value);
    if ('status' in set) {
      if (entry.statusMarkers.length > 1)
        throw planErrors.create('unsafeEdit', { data: { reason: 'duplicate-status-markers' } });
      if (status) {
        if (status.value !== set.status)
          edits.push({ start: status.valueStart, end: status.valueEnd, replacement: set.status });
      } else {
        // A new marker belongs immediately after the heading. Fenced/prose content is preserved.
        const leading = heading.fullEnd === heading.end ? eol : '';
        const trailing = heading.fullEnd === source.length && !/[\r\n]$/.test(source) ? '' : eol;
        const idText = 'id' in set && !identity ? `${eol}**Milestone ID:** ${set.id}` : '';
        edits.push({
          start: heading.fullEnd,
          end: heading.fullEnd,
          replacement: `${leading}**Status:** ${set.status}${idText}${trailing}`,
        });
      }
    }
    if ('id' in set) {
      if (entry.idMarkers.length > 1)
        throw planErrors.create('unsafeEdit', { data: { reason: 'duplicate-id-markers' } });
      if (identity) {
        if (identity.value !== set.id)
          edits.push({ start: identity.valueStart, end: identity.valueEnd, replacement: set.id });
      } else if (!('status' in set && !status)) {
        if (!status || entry.statusMarkers.length !== 1)
          throw planErrors.create('unsafeEdit', { data: { reason: 'missing-unambiguous-status' } });
        const firstNonblank = lines
          .slice(heading.number, status.location.line)
          .find((line) => line.text.trim());
        if (firstNonblank?.start !== status.lineStart)
          throw planErrors.create('unsafeEdit', { data: { reason: 'noncanonical-id-insertion' } });
        const leading = status.lineEnd === source.length && !/[\r\n]$/.test(source) ? eol : '';
        const trailing = status.lineEnd === source.length && !/[\r\n]$/.test(source) ? '' : eol;
        const replacement = `${leading}**Milestone ID:** ${set.id}${trailing}`;
        const coincident = edits.find(
          (edit) => edit.start === status.lineEnd && edit.end === status.lineEnd,
        );
        if (coincident) coincident.replacement += replacement;
        else edits.push({ start: status.lineEnd, end: status.lineEnd, replacement });
      }
    }
  }
  return edits;
};

/**
 * Apply nonoverlapping character spans to original bytes, including BOM and supplementary Unicode.
 * @throws
 * - JG_PLANS_UNSAFE_EDIT: The requested edit is unsupported or ambiguous
 * - JG_PLANS_UNSUPPORTED_ENCODING: Document text is not valid UTF-8
 */
export const applyEdits = (before: Buffer, source: string, edits: ITextEdit[]): Buffer => {
  const ordered = [...edits].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  let previousEnd = -1;
  let previousStart = -1;
  const needed = new Set<number>([0, source.length]);
  for (const edit of ordered) {
    if (
      !Number.isSafeInteger(edit.start) ||
      !Number.isSafeInteger(edit.end) ||
      edit.start < 0 ||
      edit.end < edit.start ||
      edit.end > source.length ||
      edit.start < previousEnd ||
      edit.start === previousStart
    )
      throw planErrors.create('unsafeEdit', { data: { reason: 'overlapping-or-invalid-spans' } });
    previousStart = edit.start;
    previousEnd = edit.end;
    needed.add(edit.start);
    needed.add(edit.end);
  }
  const offsets = new Map<number, number>();
  let bytes = 0;
  for (let offset = 0; offset <= source.length; ) {
    if (needed.has(offset)) offsets.set(offset, bytes);
    if (offset === source.length) break;
    const point = source.codePointAt(offset)!;
    if (point >= 0xd800 && point <= 0xdfff) throw planErrors.create('unsupportedEncoding');
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    offset += point > 0xffff ? 2 : 1;
  }
  if (bytes !== before.length)
    throw planErrors.create('unsafeEdit', { data: { reason: 'source-byte-mismatch' } });
  const parts: Buffer[] = [];
  let cursor = 0;
  for (const edit of ordered) {
    const start = offsets.get(edit.start);
    const end = offsets.get(edit.end);
    if (start === undefined || end === undefined)
      throw planErrors.create('unsafeEdit', { data: { reason: 'split-unicode-character' } });
    parts.push(before.subarray(cursor, start), encodeSource(edit.replacement));
    cursor = end;
  }
  parts.push(before.subarray(cursor));
  return Buffer.concat(parts);
};
