import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readBoundedFile } from 'jg-fs';

import { PAGES, SITE } from '../site.config.ts';

export const EXAMPLES = [
  {
    id: 'small',
    label: 'Small plan',
    description: 'Five fields and enough room to explain the work.',
    plan: 'examples/small/plan.md',
  },
  {
    id: 'milestones',
    label: 'With milestones',
    description: 'Separate units when they make the work easier to review.',
    plan: 'examples/with-milestones/plan.md',
    milestones: 'examples/with-milestones/milestones.md',
  },
  {
    id: 'extensions',
    label: 'Project extensions',
    description: 'Your own metadata and workflow vocabulary remain yours.',
    plan: 'examples/extensions/plan.md',
  },
  {
    id: 'incomplete',
    label: 'Partly deleted',
    description: 'Useful Markdown remains useful after metadata is removed.',
    plan: 'examples/incomplete/plan.md',
  },
  {
    id: 'orphan',
    label: 'Plan removed',
    description: 'Observe the milestones that remain without recreating a plan.',
    milestones: 'examples/orphan/milestones.md',
  },
  {
    id: 'criteria',
    label: 'Acceptance criteria',
    description: 'Requirements with stable IDs, the milestones that deliver them, and progress.',
    plan: 'examples/criteria/plan.md',
    milestones: 'examples/criteria/milestones.md',
  },
] as const;

export const PUBLIC_SOURCES: readonly string[] = [
  ...new Set([
    ...PAGES.flatMap((page) => ('source' in page ? [page.source] : [])),
    ...EXAMPLES.flatMap((example) => [
      ...('plan' in example ? [example.plan] : []),
      ...('milestones' in example ? [example.milestones] : []),
    ]),
    // protocol 0.2 conformance examples, including ones the gallery doesn't show
    'examples/criteria/plan.md',
    'examples/criteria/milestones.md',
    'examples/criteria-invalid/plan.md',
    'examples/criteria-invalid/milestones.md',
    'examples/library.mjs',
    'errors/README.md',
  ]),
];

/** Read one explicitly registered public file; never discover local plans. */
export const readPublicBytes = async (source: string): Promise<Buffer> => {
  assert.ok(PUBLIC_SOURCES.includes(source), 'Unregistered public source');
  return readBoundedFile(resolve(import.meta.env.JG_PLANS_SOURCE_ROOT, source), 1024 * 1024);
};

export const homeMarkdown = (): string =>
  `# ${PAGES[0].title}\n\n${PAGES[0].description}\n\n${PAGES.slice(1)
    .map((page) => `- [${page.label}](${new URL(page.path, SITE.url).href}): ${page.description}`)
    .join('\n')}\n`;
