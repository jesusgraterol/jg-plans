import { isMap, isNode, isScalar } from 'yaml';
import { z } from 'zod';

import { planErrors } from '../errors/index.ts';
import { PlanMetadataSchema } from '../protocol/index.ts';

import type { IParsedPlan } from './types.ts';
import { diagnostic, headingSections, readFrontmatter, sourceLocation } from './utilities.ts';

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
  const observed = readFrontmatter(source, 'plan');
  const sections = headingSections(source, observed.lines);
  const result: IParsedPlan = {
    source,
    body: observed.body,
    frontmatter: observed.frontmatter,
    rawMetadata: observed.rawMetadata,
    metadata: {},
    preamble: { start: 0, end: sections[0]?.heading.start ?? source.length },
    sections,
    diagnostics: observed.diagnostics,
  };
  const { yaml: document, frontmatter, lines } = observed;
  if (!frontmatter)
    result.diagnostics.push(
      diagnostic('plan', 'MISSING_FRONTMATTER', 'Preferred plan metadata is absent.'),
    );
  if (document && frontmatter && isMap(document.contents)) {
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
            sourceLocation(
              lines,
              frontmatter.contentStart + (isNode(node) ? (node.range?.[0] ?? 0) : 0),
            ),
          ),
        );
    }
  }
  const invalid = new Set(
    result.diagnostics
      .filter((item) => item.code === 'INVALID_METADATA_FIELD')
      .map((item) => item.message),
  );
  for (const key of Object.keys(PlanMetadataSchema.shape)) {
    if (
      !(key in result.metadata) &&
      !invalid.has(`Metadata field '${key}' has an incompatible value.`)
    )
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
