import manifest from '../../package.json' with { type: 'json' };

export const SITE = {
  name: 'jg-plans',
  url: 'https://jg-plans.jesusgraterol.dev',
  repository: 'https://github.com/jesusgraterol/jg-plans',
  sourceVersion: manifest.version,
  themeKey: 'jg-plans-theme',
};

// Only existing, rendered pages belong here. Source files are shared with the package.
export const PAGES = [
  {
    path: '/',
    title: 'jg-plans — Good plans. Plain Markdown.',
    description:
      'A compact, open protocol for plans and optional milestones. Built for people, coding agents, and the tools around them.',
  },
  {
    path: '/protocol/',
    title: 'The protocol · jg-plans',
    description:
      'Start with the jg-plans protocol: ordinary Markdown, optional milestones, tolerant readers, and project-owned policies.',
    source: 'protocol/README.md',
  },
  {
    path: '/protocol/0.1/',
    title: 'Protocol 0.1 · jg-plans',
    description:
      'The provisional jg-plans 0.1 specification: metadata, optional milestones, revisions, deletion, and source-preserving edits.',
    source: 'protocol/0.1/README.md',
  },
] as const;

export type IPage = (typeof PAGES)[number];
