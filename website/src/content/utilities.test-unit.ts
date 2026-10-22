import { describe, expect, it } from 'vitest';

import { resolveSourceLink, sourceLinksPlugin } from './utilities.ts';

describe('canonical Markdown links', () => {
  it('routes the published specification locally and pending guides to the actual source', () => {
    expect(resolveSourceLink('0.1/README.md')).toBe('/protocol/0.1/');
    expect(resolveSourceLink('../../docs/integrations.md')).toBe(
      'https://github.com/jesusgraterol/jg-plans/blob/development/docs/integrations.md',
    );
  });

  it('preserves fragments, absolute links, and unrelated document content', () => {
    for (const href of ['#plan-metadata', 'https://example.com/a', 'other.md']) {
      expect(resolveSourceLink(href)).toBe(href);
    }
    const node = {
      type: 'element' as const,
      tagName: 'a',
      properties: { href: '0.1/README.md', title: 'Draft' },
    };
    sourceLinksPlugin.element.visit(node, {
      setProperty: (target, key, value) => {
        expect(target).toBe(node);
        expect(key).toBe('href');
        expect(value).toBe('/protocol/0.1/');
      },
    });
    expect(node.properties.title).toBe('Draft');
  });
});
