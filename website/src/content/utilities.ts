import { resolve } from 'node:path';
import { readBoundedFile } from 'jg-fs';

import { SITE } from '../site.config.ts';

import type { IHastContext, IHastElement } from './types.ts';

const SOURCES = {
  protocol: 'protocol/README.md',
  specification: 'protocol/0.1/README.md',
  smallPlan: 'examples/small/plan.md',
  milestones: 'examples/with-milestones/milestones.md',
} as const;

/** Load only a named public source, bounded to 1 MiB. No local-plan discovery. */
export const loadSource = async (name: keyof typeof SOURCES): Promise<string> => {
  const path = resolve(import.meta.env.JG_PLANS_SOURCE_ROOT, SOURCES[name]);
  return (await readBoundedFile(path, 1024 * 1024)).toString('utf8');
};

const SOURCE_LINKS: Record<string, string> = {
  '0.1/README.md': '/protocol/0.1/',
  '../examples/small/plan.md': `${SITE.repository}/blob/development/examples/small/plan.md`,
  '../examples/with-milestones/milestones.md': `${SITE.repository}/blob/development/examples/with-milestones/milestones.md`,
  '../examples/README.md': `${SITE.repository}/blob/development/examples/README.md`,
  '../../examples/README.md': `${SITE.repository}/blob/development/examples/README.md`,
  '../../docs/integrations.md': `${SITE.repository}/blob/development/docs/integrations.md`,
};

/** Route canonical document links without changing the shared Markdown source. */
export const resolveSourceLink = (href: string): string => SOURCE_LINKS[href] ?? href;

// Shared Prose styles start at h2; canonical Markdown owns its h1, so reuse the title token here.
export const documentTitlePlugin = {
  name: 'jg-plans-document-title',
  element: {
    filter: ['h1'],
    visit: <TNode extends IHastElement>(
      node: TNode,
      context: IHastContext<NoInfer<TNode>>,
    ): void => {
      context.setProperty(node, 'className', 'display-title');
    },
  },
};

export const sourceLinksPlugin = {
  name: 'jg-plans-source-links',
  element: {
    filter: ['a'],
    visit: <TNode extends IHastElement>(
      node: TNode,
      context: IHastContext<NoInfer<TNode>>,
    ): void => {
      const href = node.properties?.href;
      if (typeof href === 'string') context.setProperty(node, 'href', resolveSourceLink(href));
    },
  },
};
