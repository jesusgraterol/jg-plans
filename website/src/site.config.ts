import manifest from '../../package.json' with { type: 'json' };

export const SITE = {
  name: 'jg-plans',
  url: 'https://jg-plans.jesusgraterol.dev',
  repository: 'https://github.com/jesusgraterol/jg-plans',
  sourceVersion: manifest.version,
  themeKey: 'jg-plans-theme',
  image: '/social.png',
  imageAlt:
    'jg-plans. Good plans. Plain Markdown. An open protocol for plans and optional milestones.',
};

export interface IPage {
  path: string;
  label: string;
  title: string;
  description: string;
  source?: string;
  navigationLabel?: string;
}

// One registry owns rendered pages, navigation, canonical URLs, and discovery output.
export const PAGES = [
  {
    path: '/',
    label: 'Home',
    title: 'jg-plans — Markdown plans, structured JSON',
    description:
      'An open Markdown planning protocol with a TypeScript library and CLI. Turn plans and optional milestones into JSON for your own tools.',
  },
  {
    path: '/protocol/',
    navigationLabel: 'Protocol',
    label: 'Protocol overview',
    title: 'The protocol · jg-plans',
    description:
      'A shared Markdown format for plans and optional milestones. Readable by people, useful to tools, and flexible enough for your project.',
    source: 'protocol/README.md',
  },
  {
    path: '/protocol/0.1/',
    label: 'Specification 0.1',
    title: 'Protocol 0.1 · jg-plans',
    description:
      'The provisional jg-plans 0.1 specification: metadata, optional milestones, revisions, deletion, and source-preserving edits.',
    source: 'protocol/0.1/README.md',
  },
  {
    path: '/docs/',
    navigationLabel: 'Docs',
    label: 'Getting started',
    title: 'Getting started · jg-plans',
    description:
      'Go from a Markdown plan to structured data. Start with one file, then choose the library or CLI to build it into your workflow.',
    source: 'docs/getting-started.md',
  },
  {
    path: '/docs/cli/',
    label: 'CLI reference',
    title: 'CLI reference · jg-plans',
    description:
      'Inspect, check, create, and update planning documents with explicit paths, bounded inputs, and structured JSON output.',
    source: 'cli/README.md',
  },
  {
    path: '/docs/api/',
    label: 'Library API',
    title: 'Library API · jg-plans',
    description:
      'Build on tolerant parsing, optional conformance checks, selected-directory reads, and source-preserving metadata edits.',
    source: 'api/README.md',
  },
  {
    path: '/docs/integrations/',
    label: 'Integrations',
    title: 'Consumer integrations · jg-plans',
    description:
      'Integrate the shared protocol with skills and applications while keeping authorization, coordination, and retention in your project.',
    source: 'docs/integrations.md',
  },
  {
    path: '/examples/',
    navigationLabel: 'Examples',
    label: 'Examples',
    title: 'Examples · jg-plans',
    description:
      'Explore real Markdown sources beside library observations: small plans, optional milestones, extensions, and partly deleted documents.',
    source: 'examples/README.md',
  },
] as const satisfies readonly IPage[];

export const pageFor = (path: string): IPage => {
  const page = PAGES.find((entry) => entry.path === path);
  if (!page) throw new Error('Unregistered page');
  return page;
};
