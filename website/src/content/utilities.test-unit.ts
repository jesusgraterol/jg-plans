import { describe, expect, it } from 'vitest';

import { resolveSourceLink, sourceLinksPlugin } from './utilities.ts';

describe('canonical Markdown links', () => {
  it('routes canonical documentation locally and examples to their original downloads', () => {
    expect(resolveSourceLink('0.1/README.md')).toBe('/protocol/0.1/');
    expect(resolveSourceLink('../../docs/integrations.md')).toBe('/docs/integrations/');
    expect(resolveSourceLink('../api/README.md#targeted-updates')).toBe(
      '/docs/api/#targeted-updates',
    );
    expect(resolveSourceLink('../examples/small/plan.md')).toBe(
      '/downloads/examples/small/plan.md',
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
