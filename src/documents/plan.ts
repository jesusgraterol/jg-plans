import { isMap, isNode, isScalar, parseDocument } from 'yaml';
import { z } from 'zod';

import { planErrors } from '../errors/index.ts';
import { PlanMetadataSchema } from '../protocol/index.ts';

import type { IParsedPlan } from './types.ts';
import { diagnostic, sourceLines, sourceLocation } from './utilities.ts';

/**
 * Observe a plan without requiring valid metadata. Source and body remain unchanged.
 * Unsupported YAML expansion retains source and a diagnostic, not a fabricated value.
 * @param source Original Markdown, optionally beginning with a UTF-8 BOM character.
 * @returns Useful metadata, raw YAML observations, original text, and diagnostics.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 */
export const parsePlan = (source: string): IParsedPlan => {
  if (!z.string().safeParse(source).success) throw planErrors.create('invalidInput');
  const result: IParsedPlan = {
    source,
    body: source,
    frontmatter: null,
    rawMetadata: null,
    metadata: {},
    diagnostics: [],
  };
  const lines = sourceLines(source);
  const first = lines[0];
  const bom = source.startsWith('\uFEFF') ? 1 : 0;
  if (!first || !/^---[ \t]*$/.test(first.text.slice(bom))) {
    result.diagnostics.push(
      diagnostic('plan', 'MISSING_FRONTMATTER', 'Preferred plan metadata is absent.'),
    );
  } else {
    const closing = lines.slice(1).find((line) => /^---[ \t]*$/.test(line.text));
    result.frontmatter = {
      start: bom,
      contentStart: first.fullEnd,
      contentEnd: closing?.start ?? source.length,
      end: closing?.fullEnd ?? source.length,
      closed: Boolean(closing),
    };
    if (!closing)
      result.diagnostics.push(
        diagnostic(
          'plan',
          'UNTERMINATED_FRONTMATTER',
          'The opening frontmatter has no closing delimiter.',
          sourceLocation(lines, bom),
        ),
      );
    else result.body = source.slice(closing.fullEnd);
    const yamlSource = source.slice(first.fullEnd, closing?.start ?? source.length);
    const document = parseDocument(yamlSource, { keepSourceTokens: true, logLevel: 'silent' });
    for (const issue of document.errors)
      result.diagnostics.push(
        diagnostic(
          'plan',
          'INVALID_YAML',
          `YAML could not be fully parsed (${issue.code}).`,
          sourceLocation(lines, first.fullEnd + issue.pos[0]),
        ),
      );
    for (const issue of document.warnings)
      result.diagnostics.push(
        diagnostic(
          'plan',
          'YAML_WARNING',
          `YAML reader warning (${issue.code}).`,
          sourceLocation(lines, first.fullEnd + issue.pos[0]),
          'warning',
        ),
      );
    try {
      const raw: unknown = document.toJS({ maxAliasCount: 100 });
      // JSON automation cannot represent recursive aliases, BigInt or nonfinite numbers.
      // Keep their original YAML and report unavailable expansion instead of changing values.
      JSON.stringify(raw, (_key, value: unknown) => {
        if (
          typeof value === 'number' &&
          (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
        )
          throw planErrors.create('invalidInput');
        return value;
      });
      result.rawMetadata = raw;
    } catch {
      result.diagnostics.push(
        diagnostic(
          'plan',
          'YAML_VALUE_UNAVAILABLE',
          'Some YAML values cannot be expanded into JSON-safe observations; the original source is retained.',
          sourceLocation(lines, first.fullEnd),
          'warning',
        ),
      );
    }
    if (!isMap(document.contents)) {
      result.diagnostics.push(
        diagnostic(
          'plan',
          'METADATA_NOT_MAPPING',
          'Preferred frontmatter is a mapping of metadata fields.',
          sourceLocation(lines, first.fullEnd),
        ),
      );
    } else {
      for (const key of Object.keys(
        PlanMetadataSchema.shape,
      ) as (keyof typeof PlanMetadataSchema.shape)[]) {
        const node = document.get(key, true);
        if (node === undefined) continue;
        const raw = result.rawMetadata;
        const value: unknown =
          raw !== null && typeof raw === 'object' && Object.hasOwn(raw, key)
            ? Reflect.get(raw, key)
            : isScalar(node)
              ? node.value
              : node;
        const parsed = PlanMetadataSchema.shape[key].safeParse(value);
        if (parsed.success) Object.assign(result.metadata, { [key]: parsed.data });
        else
          result.diagnostics.push(
            diagnostic(
              'plan',
              'INVALID_METADATA_FIELD',
              `Metadata field '${key}' has an incompatible value.`,
              sourceLocation(lines, first.fullEnd + (isNode(node) ? (node.range?.[0] ?? 0) : 0)),
            ),
          );
      }
    }
  }
  for (const key of Object.keys(PlanMetadataSchema.shape)) {
    const isObserved = result.diagnostics.some(
      (item) =>
        item.code === 'INVALID_METADATA_FIELD' &&
        item.message.startsWith(`Metadata field '${key}'`),
    );
    if (!(key in result.metadata) && !isObserved)
      result.diagnostics.push(
        diagnostic(
          'plan',
          'MISSING_METADATA_FIELD',
          `Preferred metadata field '${key}' is absent.`,
        ),
      );
  }
  return result;
};
