import { SITE } from '../site.config.ts';
import { readPublicBytes } from './sources.ts';

import type { IHastContext, IHastElement } from './types.ts';

const SOURCES = {
  protocol: 'protocol/README.md',
  specification: 'protocol/0.1/README.md',
  smallPlan: 'examples/small/plan.md',
  milestones: 'examples/with-milestones/milestones.md',
} as const;

/** Load only a named public source, bounded to 1 MiB. No local-plan discovery. */
export const loadSource = async (name: keyof typeof SOURCES): Promise<string> => {
  return (await readPublicBytes(SOURCES[name])).toString('utf8');
};

const SOURCE_LINKS: Record<string, string> = {
  '0.1/README.md': '/protocol/0.1/',
  '../protocol/0.1/README.md': '/protocol/0.1/',
  '../api/README.md': '/docs/api/',
  '../cli/README.md': '/docs/cli/',
  '../docs/integrations.md': '/docs/integrations/',
  '../../docs/integrations.md': '/docs/integrations/',
  'integrations.md': '/docs/integrations/',
  '../examples/README.md': '/examples/',
  '../../examples/README.md': '/examples/',
  '../errors/README.md': `${SITE.repository}/blob/main/errors/README.md`,
  ...Object.fromEntries(
    [
      'small/plan.md',
      'with-milestones/plan.md',
      'with-milestones/milestones.md',
      'extensions/plan.md',
      'incomplete/plan.md',
      'orphan/milestones.md',
      'library.mjs',
    ].flatMap((path) => [
      [
        path,
        path.endsWith('.mjs')
          ? `${SITE.repository}/blob/main/examples/${path}`
          : `/raw/examples/${path}`,
      ],
      [
        `../examples/${path}`,
        path.endsWith('.mjs')
          ? `${SITE.repository}/blob/main/examples/${path}`
          : `/raw/examples/${path}`,
      ],
    ]),
  ),
};

/** Route canonical document links without changing the shared Markdown source. */
export const resolveSourceLink = (href: string): string => {
  const separator = href.indexOf('#');
  const path = separator < 0 ? href : href.slice(0, separator);
  return SOURCE_LINKS[path] === undefined
    ? href
    : `${SOURCE_LINKS[path]}${separator < 0 ? '' : href.slice(separator)}`;
};

// Page layouts own h1; canonical references keep their original title as h2.
export const documentTitlePlugin = {
  name: 'jg-plans-document-title',
  element: {
    filter: ['h1', 'h2'],
    visit: <TNode extends IHastElement>(
      node: TNode,
      context: IHastContext<NoInfer<TNode>>,
    ): TNode | void => {
      if (context.fileURL?.pathname.endsWith('/examples/README.md'))
        return { ...node, tagName: node.tagName === 'h1' ? 'h2' : 'h3' };
      if (node.tagName === 'h1') return { ...node, tagName: 'h2' };
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
