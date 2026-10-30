import { describe, expect, it } from 'vitest';

import { resolveSourceLink, sourceLinksPlugin } from './utilities.ts';

describe('canonical Markdown links', () => {
  it('routes canonical documentation locally and examples to readable Markdown', () => {
    expect(resolveSourceLink('0.2/README.md')).toBe('/protocol/0.2/');
    expect(resolveSourceLink('../../api/README.md#shared-document-locks')).toBe(
      '/docs/api/#shared-document-locks',
    );
    expect(resolveSourceLink('../../docs/integrations.md')).toBe('/docs/integrations/');
    expect(resolveSourceLink('../api/README.md#targeted-updates')).toBe(
      '/docs/api/#targeted-updates',
    );
    expect(resolveSourceLink('../examples/small/plan.md')).toBe('/raw/examples/small/plan.md');
  });

  it('routes the current specification and criteria examples', () => {
    expect(resolveSourceLink('0.2/README.md')).toBe('/protocol/0.2/');
    expect(resolveSourceLink('../0.2/README.md')).toBe('/protocol/0.2/');
    expect(resolveSourceLink('../protocol/0.2/README.md')).toBe('/protocol/0.2/');
    expect(resolveSourceLink('criteria/plan.md')).toBe('/raw/examples/criteria/plan.md');
    expect(resolveSourceLink('../examples/criteria-invalid/milestones.md')).toBe(
      '/raw/examples/criteria-invalid/milestones.md',
    );
    expect(resolveSourceLink('criteria/expected.json')).toBe(
      'https://github.com/jesusgraterol/jg-plans/blob/main/examples/criteria/expected.json',
    );
  });

  it('preserves fragments, absolute links, and unrelated document content', () => {
    for (const href of ['#plan-metadata', 'https://example.com/a', 'other.md']) {
      expect(resolveSourceLink(href)).toBe(href);
    }
    const node = {
      type: 'element' as const,
      tagName: 'a',
      properties: { href: '0.2/README.md', title: 'Draft' },
    };
    sourceLinksPlugin.element.visit(node, {
      setProperty: (target, key, value) => {
        expect(target).toBe(node);
        expect(key).toBe('href');
        expect(value).toBe('/protocol/0.2/');
      },
    });
    expect(node.properties.title).toBe('Draft');
  });
});
