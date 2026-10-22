import type { IDiagnostic, ISourceLocation } from '../protocol/index.ts';

import type { ISourceLine } from './types.ts';

/** Preserve original offsets and line endings. Fence recognition derives from public jg-agent-hq. */
export const sourceLines = (source: string): ISourceLine[] => {
  const lines: ISourceLine[] = [];
  let fence: { character: string; length: number } | null = null;
  for (const match of source.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)) {
    if (!match[0]) continue;
    const text = match[1]!;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(
      match.index === 0 ? text.replace(/^\uFEFF/, '') : text,
    );
    const line = {
      text,
      start: match.index,
      end: match.index + text.length,
      fullEnd: match.index + match[0].length,
      number: lines.length + 1,
      fenced: fence !== null,
    };
    if (fence) {
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
