import { stringifyJsonDeterministically } from 'jg-utilities';
import { isMap, isScalar, parseDocument, visit } from 'yaml';

import { planErrors } from '../errors/index.ts';
import type { IDiagnostic, ISourceLocation } from '../protocol/index.ts';

import type { IFrontmatter, IHeadingSection, ISourceLine } from './types.ts';

/** Preserve original offsets and line endings. Fence recognition derives from public jg-agent-hq. */
export const sourceLines = (source: string, frontmatterEnd = 0): ISourceLine[] => {
  const lines: ISourceLine[] = [];
  let fence: { character: string; length: number } | null = null;
  for (const match of source.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)) {
    if (!match[0]) continue;
    const text = match[1]!;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/s.exec(
      match.index === 0 ? text.replace(/^\uFEFF/, '') : text,
    );
    const line = {
      text,
      start: match.index,
      end: match.index + text.length,
      fullEnd: match.index + match[0].length,
      number: lines.length + 1,
      fenced: match.index < frontmatterEnd || fence !== null,
    };
    if (match.index < frontmatterEnd) {
      // YAML text never opens a Markdown fence that could hide later body sections.
    } else if (fence) {
      if (
        marker &&
        marker[1]![0] === fence.character &&
        marker[1]!.length >= fence.length &&
        !marker[2]!.trim()
      )
        fence = null;
    } else if (marker && !(marker[1]![0] === '`' && marker[2]!.includes('`'))) {
      line.fenced = true;
      fence = { character: marker[1]![0]!, length: marker[1]!.length };
    }
    lines.push(line);
  }
  return lines;
};

/** Binary lookup avoids rescanning the source for each diagnostic. */
export const sourceLocation = (lines: ISourceLine[], offset: number): ISourceLocation => {
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle]!.start <= offset) low = middle + 1;
    else high = middle;
  }
  const line = lines[Math.max(0, low - 1)];
  return { offset, line: line?.number ?? 1, column: offset - (line?.start ?? 0) + 1 };
};

export const diagnostic = (
  document: IDiagnostic['document'],
  code: string,
  message: string,
  location?: ISourceLocation,
  severity: IDiagnostic['severity'] = 'error',
): IDiagnostic => ({
  document,
  code,
  message,
  severity,
  ...(location ? { location } : {}),
});

type IFrontmatterRead = {
  body: string;
  frontmatter: IFrontmatter | null;
  rawMetadata: unknown;
  yaml: ReturnType<typeof parseDocument> | null;
  lines: ISourceLine[];
  diagnostics: IDiagnostic[];
};

/** Shared framing/YAML reader; preferred plan fields are validated by the plan parser alone. */
export const readFrontmatter = (
  source: string,
  name: IDiagnostic['document'],
): IFrontmatterRead => {
  const lines = sourceLines(source);
  const result: IFrontmatterRead = {
    body: source,
    frontmatter: null,
    rawMetadata: null,
    yaml: null,
    lines,
    diagnostics: [],
  };
  const first = lines[0];
  const bom = source.startsWith('\uFEFF') ? 1 : 0;
  if (!first || !/^---[ \t]*$/.test(first.text.slice(bom))) return result;
  const closing = lines.slice(1).find((line) => /^---[ \t]*$/.test(line.text));
  result.frontmatter = {
    start: bom,
    contentStart: first.fullEnd,
    contentEnd: closing?.start ?? source.length,
    end: closing?.fullEnd ?? source.length,
    closed: Boolean(closing),
  };
  result.lines = sourceLines(source, result.frontmatter.end);
  if (closing) result.body = source.slice(closing.fullEnd);
  else
    result.diagnostics.push(
      diagnostic(
        name,
        'UNTERMINATED_FRONTMATTER',
        'The opening frontmatter has no closing delimiter.',
        sourceLocation(lines, bom),
      ),
    );
  const document = parseDocument(source.slice(first.fullEnd, closing?.start ?? source.length), {
    keepSourceTokens: true,
    logLevel: 'silent',
  });
  result.yaml = document;
  for (const issue of document.errors)
    result.diagnostics.push(
      diagnostic(
        name,
        'INVALID_YAML',
        `YAML could not be fully parsed (${issue.code}).`,
        sourceLocation(lines, first.fullEnd + issue.pos[0]),
      ),
    );
  for (const issue of document.warnings)
    result.diagnostics.push(
      diagnostic(
        name,
        'YAML_WARNING',
        `YAML reader warning (${issue.code}).`,
        sourceLocation(lines, first.fullEnd + issue.pos[0]),
        'warning',
      ),
    );
  try {
    // YAML coerces non-string mapping keys during toJS; that would lose structural identity.
    visit(document, {
      Pair(_key, pair) {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string')
          throw planErrors.create('invalidInput');
      },
    });
    const raw: unknown = document.toJS({ maxAliasCount: 100 });
    JSON.stringify(raw, (_key, value: unknown) => {
      if (
        typeof value === 'number' &&
        (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
      )
        throw planErrors.create('invalidInput');
      return value;
    });
    // Wrapping permits observable scalar/array YAML while rejecting lossy JSON expansion.
    stringifyJsonDeterministically({ metadata: raw }, { strict: true });
    result.rawMetadata = raw;
  } catch {
    result.diagnostics.push(
      diagnostic(
        name,
        'YAML_VALUE_UNAVAILABLE',
        'Some YAML values cannot be expanded into JSON-safe observations; the original source is retained.',
        sourceLocation(lines, first.fullEnd),
        'warning',
      ),
    );
  }
  if (!isMap(document.contents))
    result.diagnostics.push(
      diagnostic(
        name,
        'METADATA_NOT_MAPPING',
        'Preferred frontmatter is a mapping of metadata fields.',
        sourceLocation(lines, first.fullEnd),
      ),
    );
  return result;
};

/** Complete, ordered section spans; the prefix before the first heading is the preamble. */
export const headingSections = (source: string, lines: ISourceLine[]): IHeadingSection[] => {
  const headings = lines.flatMap((line) => {
    if (line.fenced) return [];
    const bom = line.start === 0 && line.text.startsWith('\uFEFF') ? 1 : 0;
    const text = line.text.slice(bom);
    const prefix = /^ {0,3}##[ \t]+/.exec(text);
    if (!prefix) return [];
    // Linear scans avoid backtracking over long whitespace runs before a nonclosing suffix.
    const start = prefix[0].length;
    let end = text.length;
    while (end > start && (text[end - 1] === ' ' || text[end - 1] === '\t')) end--;
    let hashes = end;
    while (hashes > start && text[hashes - 1] === '#') hashes--;
    if (
      hashes < end &&
      (hashes === start || text[hashes - 1] === ' ' || text[hashes - 1] === '\t')
    ) {
      end = hashes;
      while (end > start && (text[end - 1] === ' ' || text[end - 1] === '\t')) end--;
    }
    return [{ line, bom, title: text.slice(start, end) }];
  });
  return headings.map(({ line, bom, title }, index) => ({
    title,
    heading: { start: line.start + bom, end: line.fullEnd },
    body: { start: line.fullEnd, end: headings[index + 1]?.line.start ?? source.length },
  }));
};
